import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AiUnavailableError,
  RateLimitedError,
  callStructured,
  setAiProvider,
} from "@/lib/ai/client";
import type { AiProvider, StructuredRequest, StructuredResponse } from "@/lib/ai/provider";
import { VERDICT_SCHEMA } from "@/lib/ai/verdict";
import { PARSE_SCHEMA } from "@/lib/ai/parse-sms";

/**
 * The provider seam exists so the call policy can be tested without a network.
 * §7.1 fixes that policy — 25s abort, one retry on 429/5xx with 1s backoff,
 * usage recorded, a typed error on failure and never a fabricated result — and
 * it must survive a change of vendor, so it is tested against a fake rather
 * than against whoever is behind the interface today.
 */

const request: StructuredRequest = {
  system: "system",
  userMessage: "{}",
  schema: VERDICT_SCHEMA,
  maxTokens: 700,
};

class FakeProvider implements AiProvider {
  readonly vendor = "fake";
  readonly model = "fake-1";
  attempts = 0;

  constructor(
    private readonly behaviour: (attempt: number) => StructuredResponse | never,
    private readonly retryable: (error: unknown) => boolean = () => false,
  ) {}

  async attempt(_request: StructuredRequest, signal: AbortSignal): Promise<StructuredResponse> {
    this.attempts += 1;
    if (signal.aborted) throw new Error("aborted before start");
    return this.behaviour(this.attempts);
  }

  isRetryable(error: unknown): boolean {
    return this.retryable(error);
  }

  describeError(error: unknown): { kind: "rate_limit" | "unavailable"; message: string } {
    return error instanceof RateLimitedError
      ? { kind: "rate_limit", message: error.message }
      : { kind: "unavailable", message: "unavailable" };
  }
}

const answer = (): StructuredResponse => ({
  output: { decision: "hold" },
  usage: { inputTokens: 11, outputTokens: 22 },
});

afterEach(() => {
  setAiProvider(null);
  vi.useRealTimers();
});

describe("call policy", () => {
  it("returns the provider's output and its token usage", async () => {
    setAiProvider(new FakeProvider(answer));
    const result = await callStructured(request);

    expect(result.output).toEqual({ decision: "hold" });
    expect(result.usage.inputTokens).toBe(11);
    expect(result.usage.outputTokens).toBe(22);
    expect(result.usage.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("retries exactly once on a retryable failure, then succeeds", async () => {
    const provider = new FakeProvider(
      (attempt) => {
        if (attempt === 1) throw new Error("503");
        return answer();
      },
      () => true,
    );
    setAiProvider(provider);

    const result = await callStructured(request);
    expect(provider.attempts).toBe(2);
    expect(result.output).toEqual({ decision: "hold" });
  });

  it("gives up after the single retry rather than looping", async () => {
    const provider = new FakeProvider(
      () => {
        throw new Error("always down");
      },
      () => true,
    );
    setAiProvider(provider);

    await expect(callStructured(request)).rejects.toBeInstanceOf(AiUnavailableError);
    expect(provider.attempts).toBe(2);
  });

  it("does not retry a failure the provider calls permanent", async () => {
    const provider = new FakeProvider(
      () => {
        throw new Error("bad request");
      },
      () => false,
    );
    setAiProvider(provider);

    await expect(callStructured(request)).rejects.toBeInstanceOf(AiUnavailableError);
    expect(provider.attempts).toBe(1);
  });

  it("surfaces a rate limit as its own type, so the route can answer 429", async () => {
    const provider = new FakeProvider(
      () => {
        throw new RateLimitedError("slow down");
      },
      () => false,
    );
    setAiProvider(provider);

    await expect(callStructured(request)).rejects.toBeInstanceOf(RateLimitedError);
  });

  it("hands the provider an abort signal", async () => {
    let seen: AbortSignal | null = null;
    setAiProvider(
      new FakeProvider(() => {
        return answer();
      }),
    );
    const provider = new (class extends FakeProvider {
      override async attempt(
        req: StructuredRequest,
        signal: AbortSignal,
      ): Promise<StructuredResponse> {
        seen = signal;
        return super.attempt(req, signal);
      }
    })(answer);
    setAiProvider(provider);

    await callStructured(request);
    expect(seen).toBeInstanceOf(AbortSignal);
  });

  it("never returns a result when the provider fails — no fabrication", async () => {
    setAiProvider(
      new FakeProvider(() => {
        throw new Error("down");
      }),
    );

    const result = await callStructured(request).catch((error: unknown) => error);
    expect(result).toBeInstanceOf(Error);
    expect(result).not.toHaveProperty("output");
  });
});

/**
 * OpenAI rejects a strict schema with a 400 before the model ever runs, so
 * these rules are worth checking here rather than discovering on a live call.
 */
describe("strict structured-output conformance", () => {
  type Node = { type?: unknown; properties?: Record<string, Node>; items?: Node; required?: unknown };

  function walkObjects(node: Node, path: string, visit: (node: Node, path: string) => void): void {
    if (!node || typeof node !== "object") return;
    const type = Array.isArray(node.type) ? node.type : [node.type];
    if (type.includes("object")) visit(node, path);
    if (node.properties) {
      for (const [key, child] of Object.entries(node.properties)) {
        walkObjects(child, `${path}.${key}`, visit);
      }
    }
    if (node.items) walkObjects(node.items, `${path}[]`, visit);
  }

  for (const [label, schema] of [
    ["verdict", VERDICT_SCHEMA],
    ["extract_transactions", PARSE_SCHEMA],
  ] as const) {
    it(`${label}: every object sets additionalProperties false`, () => {
      const offenders: string[] = [];
      walkObjects(schema.schema as Node, label, (node, path) => {
        if ((node as Record<string, unknown>).additionalProperties !== false) offenders.push(path);
      });
      expect(offenders).toEqual([]);
    });

    it(`${label}: every property is listed as required`, () => {
      const offenders: string[] = [];
      walkObjects(schema.schema as Node, label, (node, path) => {
        const properties = Object.keys(node.properties ?? {});
        const required = new Set((node.required as string[] | undefined) ?? []);
        for (const key of properties) if (!required.has(key)) offenders.push(`${path}.${key}`);
      });
      expect(offenders).toEqual([]);
    });

    it(`${label}: the root is an object`, () => {
      expect((schema.schema as Node).type).toBe("object");
    });
  }

  it("keeps the field set §7.2 specifies for a verdict", () => {
    expect(VERDICT_SCHEMA.schema.required).toEqual([
      "decision",
      "rule_ref",
      "reasoning",
      "affordable_now",
      "figure_cited",
    ]);
    const properties = (VERDICT_SCHEMA.schema as { properties: Record<string, unknown> }).properties;
    expect((properties.decision as { enum: string[] }).enum).toEqual(["allow", "hold", "decline"]);
    expect((properties.rule_ref as { type: string[] }).type).toEqual(["string", "null"]);
    expect((properties.figure_cited as { type: string }).type).toBe("integer");
  });

  it("keeps the field set §7.3 specifies for an extraction", () => {
    const items = (
      (PARSE_SCHEMA.schema as { properties: { results: { items: { required: string[] } } } })
        .properties.results.items
    ).required;
    expect(items).toEqual([
      "index",
      "is_transaction",
      "amount_fils",
      "merchant_raw",
      "merchant",
      "occurred_at",
      "reference",
      "category_guess",
      "confidence",
    ]);
  });
});
