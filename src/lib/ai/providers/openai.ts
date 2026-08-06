import OpenAI from "openai";
import type {
  AiProvider,
  ErrorKind,
  StructuredRequest,
  StructuredResponse,
} from "../provider";

/**
 * The OpenAI provider.
 *
 * Structured outputs (`response_format: json_schema`, `strict: true`) replace
 * the forced tool call. Both give the same guarantee — a response that either
 * matches the schema or is a failure — so nothing downstream changes: the Zod
 * mirrors in schemas.ts still validate, and a response that cannot be used is
 * still an error rather than a guess.
 *
 * gpt-4.1 rather than a reasoning model, because §7.2 and §7.3 fix
 * `temperature: 0` and the o-series and gpt-5 reasoning models do not accept a
 * temperature. Overridable with OPENAI_MODEL.
 */

const DEFAULT_MODEL = "gpt-4.1";

export class OpenAiProvider implements AiProvider {
  readonly vendor = "openai";
  readonly model: string;
  private client: OpenAI | null = null;

  constructor(model: string = process.env.OPENAI_MODEL ?? DEFAULT_MODEL) {
    this.model = model;
  }

  private sdk(): OpenAI {
    if (!this.client) {
      const apiKey = process.env.OPENAI_API_KEY;
      // Neutral wording: this provider serves both the verdict engine and the
      // parser, and each caller phrases the failure for its own screen.
      if (!apiKey) throw new MissingKeyError("No model is configured on the server.");
      // Retries are handled by client.ts so the timeout, the backoff and the
      // usage counter all stay in one place.
      this.client = new OpenAI({ apiKey, maxRetries: 0 });
    }
    return this.client;
  }

  async attempt(request: StructuredRequest, signal: AbortSignal): Promise<StructuredResponse> {
    const completion = await this.sdk().chat.completions.create(
      {
        model: this.model,
        temperature: 0,
        max_completion_tokens: request.maxTokens,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: request.schema.name,
            description: request.schema.description,
            schema: request.schema.schema,
            strict: true,
          },
        },
        messages: [
          { role: "system", content: request.system },
          { role: "user", content: request.userMessage },
        ],
      },
      { signal },
    );

    const choice = completion.choices[0];
    if (!choice) throw new EmptyResponseError("The model returned no answer.");

    // Structured outputs can refuse. A refusal is not a verdict, and inventing
    // one from it would be exactly the thing this app must never do.
    if (choice.message.refusal) {
      throw new EmptyResponseError(`The model declined to answer: ${choice.message.refusal}`);
    }

    /*
     * A response cut off by the token budget is still valid JSON's worth of
     * prefix, and JSON.parse would simply fail — but saying so plainly beats a
     * generic parse error, because the fix is a bigger max_completion_tokens
     * rather than a retry.
     */
    if (choice.finish_reason === "length") {
      throw new EmptyResponseError(
        `The answer was cut off at ${request.maxTokens} tokens before it was complete.`,
      );
    }

    const content = choice.message.content;
    if (!content) throw new EmptyResponseError("The model returned an empty answer.");

    let output: unknown;
    try {
      output = JSON.parse(content);
    } catch {
      throw new EmptyResponseError("The answer came back in a shape we could not read.");
    }

    return {
      output,
      usage: {
        inputTokens: completion.usage?.prompt_tokens ?? 0,
        outputTokens: completion.usage?.completion_tokens ?? 0,
      },
    };
  }

  isRetryable(error: unknown): boolean {
    if (error instanceof OpenAI.APIConnectionError) return true;
    if (error instanceof OpenAI.RateLimitError) return true;
    if (error instanceof OpenAI.InternalServerError) return true;
    if (error instanceof OpenAI.APIError) {
      const status = error.status ?? 0;
      return status === 429 || status >= 500;
    }
    return false;
  }

  describeError(error: unknown): { kind: ErrorKind; message: string } {
    if (error instanceof MissingKeyError || error instanceof EmptyResponseError) {
      return { kind: "unavailable", message: error.message };
    }
    if (error instanceof OpenAI.RateLimitError || (error instanceof OpenAI.APIError && error.status === 429)) {
      return {
        kind: "rate_limit",
        message: "The policy check is rate limited right now. Try again shortly.",
      };
    }
    if (error instanceof OpenAI.APIUserAbortError) {
      return { kind: "unavailable", message: "The policy check took too long to answer." };
    }
    if (error instanceof OpenAI.AuthenticationError) {
      return { kind: "unavailable", message: "The model rejected the configured credentials." };
    }
    return { kind: "unavailable", message: "The policy check could not be reached." };
  }
}

/** Thrown before any network call, so it is never retried. */
export class MissingKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MissingKeyError";
  }
}

/** A response that arrived but cannot be used. Not retryable — it is not transient. */
export class EmptyResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmptyResponseError";
  }
}
