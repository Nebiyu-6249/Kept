import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/db";
import { dayKey } from "@/lib/period";
import { VERDICT_DAILY_LIMIT } from "@/lib/env";

/**
 * The single Anthropic client and the contract every model call goes through:
 * 25s abort, one retry on 429/5xx with 1s backoff, token usage recorded, and a
 * UsageCounter increment.
 *
 * On total failure the caller gets a typed error. It never gets a fabricated
 * result — /ask falls back to arithmetic it computed itself and says so.
 */

export const MODEL = "claude-sonnet-4-6";
const TIMEOUT_MS = 25_000;
const RETRY_BACKOFF_MS = 1_000;

let client: Anthropic | null = null;

export function anthropic(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new AiUnavailableError("The policy check is not configured.");
    // Retries are handled here so the counter and the timeout stay in one place.
    client = new Anthropic({ apiKey, maxRetries: 0 });
  }
  return client;
}

export class AiUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiUnavailableError";
  }
}

export class RateLimitedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RateLimitedError";
  }
}

export type Usage = { inputTokens: number; outputTokens: number; latencyMs: number };

export type ToolCall<T> = { input: T; usage: Usage };

function isRetryable(error: unknown): boolean {
  if (error instanceof Anthropic.APIError) {
    const status = error.status ?? 0;
    return status === 429 || status >= 500;
  }
  // A network blip or an abort that was not ours.
  return error instanceof Error && error.name === "APIConnectionError";
}

/**
 * Today's usage for a kind, in the app timezone. Checked before every call so
 * a runaway loop costs one row read rather than a hundred model calls.
 */
export async function assertUnderDailyLimit(
  userId: string,
  kind: "verdict" | "parse",
  limit: number = VERDICT_DAILY_LIMIT,
): Promise<void> {
  const day = dayKey(new Date());
  const counter = await prisma.usageCounter.findUnique({
    where: { userId_day_kind: { userId, day, kind } },
    select: { count: true },
  });
  if ((counter?.count ?? 0) >= limit) {
    throw new RateLimitedError(
      `That is ${limit} policy checks today, which is the daily cap. It resets at midnight.`,
    );
  }
}

export async function incrementUsage(
  userId: string,
  kind: "verdict" | "parse",
  by = 1,
): Promise<void> {
  const day = dayKey(new Date());
  await prisma.usageCounter.upsert({
    where: { userId_day_kind: { userId, day, kind } },
    create: { userId, day, kind, count: by },
    update: { count: { increment: by } },
  });
}

/**
 * Call the model with a forced tool and return the tool input plus usage.
 *
 * The tool is forced, so a well-formed response always carries exactly one
 * tool_use block. A response without one is a failure, not something to parse
 * out of the prose.
 */
export async function callTool(options: {
  system: string;
  userMessage: string;
  tool: Anthropic.Tool;
  maxTokens: number;
}): Promise<ToolCall<unknown>> {
  const started = Date.now();

  const attempt = async (): Promise<Anthropic.Message> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      return await anthropic().messages.create(
        {
          model: MODEL,
          max_tokens: options.maxTokens,
          temperature: 0,
          system: options.system,
          tools: [options.tool],
          tool_choice: { type: "tool", name: options.tool.name },
          messages: [{ role: "user", content: options.userMessage }],
        },
        { signal: controller.signal },
      );
    } finally {
      clearTimeout(timer);
    }
  };

  let message: Anthropic.Message;
  try {
    message = await attempt();
  } catch (error) {
    if (!isRetryable(error)) throw toAiError(error);
    await new Promise((resolve) => setTimeout(resolve, RETRY_BACKOFF_MS));
    try {
      message = await attempt();
    } catch (retryError) {
      throw toAiError(retryError);
    }
  }

  const block = message.content.find(
    (part): part is Anthropic.ToolUseBlock =>
      part.type === "tool_use" && part.name === options.tool.name,
  );
  if (!block) {
    throw new AiUnavailableError("The policy check came back in a shape we could not read.");
  }

  return {
    input: block.input,
    usage: {
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
      latencyMs: Date.now() - started,
    },
  };
}

function toAiError(error: unknown): Error {
  if (error instanceof Anthropic.APIError && error.status === 429) {
    return new RateLimitedError("The policy check is rate limited right now. Try again shortly.");
  }
  if (error instanceof Error && error.name === "AbortError") {
    return new AiUnavailableError("The policy check took too long to answer.");
  }
  if (error instanceof AiUnavailableError || error instanceof RateLimitedError) return error;
  return new AiUnavailableError("The policy check could not be reached.");
}
