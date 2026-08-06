import { prisma } from "@/lib/db";
import { dayKey } from "@/lib/period";
import { VERDICT_DAILY_LIMIT } from "@/lib/env";
import type { AiProvider, StructuredRequest, Usage } from "./provider";
import { OpenAiProvider } from "./providers/openai";

/**
 * The one call path, and the contract every model call goes through:
 * 25s abort, one retry on 429/5xx with 1s backoff, token usage recorded on the
 * row that triggered it, and a UsageCounter increment.
 *
 * On total failure the caller gets a typed error. It never gets a fabricated
 * result — /ask falls back to arithmetic it computes itself and says so.
 *
 * The policy lives here rather than in a provider so swapping vendors cannot
 * quietly change the timeout, the backoff, or the accounting.
 */

const TIMEOUT_MS = 25_000;
const RETRY_BACKOFF_MS = 1_000;

let provider: AiProvider | null = null;

/** The active provider. Swapping vendors is a change to this one function. */
export function aiProvider(): AiProvider {
  if (!provider) provider = new OpenAiProvider();
  return provider;
}

/** Test seam: replace the provider, or pass null to restore the default. */
export function setAiProvider(next: AiProvider | null): void {
  provider = next;
}

export const MODEL_LABEL = (): string => `${aiProvider().vendor}/${aiProvider().model}`;

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

export type { Usage } from "./provider";

export type StructuredCall<T> = { output: T; usage: Usage };

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
 * Ask the model for one structured answer and return it with its usage.
 *
 * The schema is enforced by the provider, so a well-formed response always
 * parses. A response that does not is a failure, not something to salvage.
 */
export async function callStructured(
  request: StructuredRequest,
): Promise<StructuredCall<unknown>> {
  const active = aiProvider();
  const started = Date.now();

  const once = async (): Promise<Awaited<ReturnType<AiProvider["attempt"]>>> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      return await active.attempt(request, controller.signal);
    } finally {
      clearTimeout(timer);
    }
  };

  let response: Awaited<ReturnType<AiProvider["attempt"]>>;
  try {
    response = await once();
  } catch (error) {
    if (!active.isRetryable(error)) throw toTypedError(active, error);
    await new Promise((resolve) => setTimeout(resolve, RETRY_BACKOFF_MS));
    try {
      response = await once();
    } catch (retryError) {
      throw toTypedError(active, retryError);
    }
  }

  return {
    output: response.output,
    usage: {
      inputTokens: response.usage.inputTokens,
      outputTokens: response.usage.outputTokens,
      latencyMs: Date.now() - started,
    },
  };
}

function toTypedError(active: AiProvider, error: unknown): Error {
  if (error instanceof AiUnavailableError || error instanceof RateLimitedError) return error;
  const described = active.describeError(error);
  return described.kind === "rate_limit"
    ? new RateLimitedError(described.message)
    : new AiUnavailableError(described.message);
}
