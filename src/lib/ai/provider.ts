/**
 * The provider seam.
 *
 * `verdict.ts` and `parse-sms.ts` describe what they want — a system prompt, a
 * user message, a JSON schema, a token budget — and never learn which vendor
 * answers. Everything vendor-specific lives behind this interface.
 *
 * The shared policy (25s abort, one retry on 429/5xx with 1s backoff, usage
 * accounting) deliberately does NOT live here. It belongs to every provider
 * equally, so it sits in client.ts and a provider only has to make one attempt
 * and classify its own errors.
 */

/** A JSON Schema object. Kept loose: the shape is the vendor's contract, not ours. */
export type JsonSchema = Record<string, unknown>;

export type StructuredSchema = {
  /** Schema name. Was the tool name under a tool-calling provider. */
  name: string;
  description: string;
  schema: JsonSchema;
};

export type StructuredRequest = {
  system: string;
  userMessage: string;
  schema: StructuredSchema;
  maxTokens: number;
};

export type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
};

export type Usage = TokenUsage & {
  /** Wall clock for the whole call, retries included. Measured by client.ts. */
  latencyMs: number;
};

export type StructuredResponse = {
  /** The parsed JSON the model produced. Validated by the caller's Zod schema. */
  output: unknown;
  usage: TokenUsage;
};

/** How client.ts should surface a provider failure, without knowing the vendor. */
export type ErrorKind = "rate_limit" | "unavailable";

export interface AiProvider {
  readonly vendor: string;
  readonly model: string;

  /**
   * Exactly one attempt. No retry, no timeout, no counter — the caller owns all
   * three, so every provider gets identical behaviour for free.
   *
   * Must throw rather than return a partial or invented result. A truncated
   * response, a refusal, or unparseable output are all failures.
   */
  attempt(request: StructuredRequest, signal: AbortSignal): Promise<StructuredResponse>;

  /** True for the transient failures worth one retry: 429 and 5xx. */
  isRetryable(error: unknown): boolean;

  /** Map a vendor error onto the two kinds the app distinguishes. */
  describeError(error: unknown): { kind: ErrorKind; message: string };
}
