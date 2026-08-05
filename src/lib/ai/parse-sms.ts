import type Anthropic from "@anthropic-ai/sdk";
import { callTool, type Usage } from "./client";
import { ParseOutputSchema, type ParsedRow } from "./schemas";
import { PARSE_CHUNK_SIZE } from "@/lib/env";

/** §7.3, verbatim. */
export const PARSE_SYSTEM_PROMPT = `You extract structured transactions from bank alert messages. Messages come
from UAE and East African banks in inconsistent formats, in English, Arabic,
or both, often truncated, sometimes with the balance and sometimes not.

For each input message return one object. Rules:
- amount_fils is an integer in the smallest currency unit. 45.50 AED is 4550.
- If the message is a credit, a balance enquiry, an OTP, a promotion, or
  anything that is not a completed outgoing payment, set is_transaction false
  and leave the other fields null.
- merchant_raw is the merchant string exactly as it appears.
- merchant is that string normalised: title case, no store numbers, no city or
  country suffixes, no payment processor prefixes. CARREF 4471 DUBAI AE and
  MAF CARREFOUR MALL become Carrefour.
- occurred_at is ISO 8601. If the message has no date, use null; the caller
  supplies a fallback.
- reference is the bank's own reference if present, otherwise null.
- confidence is your honest 0 to 1 estimate that every field is right.

Never guess an amount. If the amount is unreadable, set is_transaction true,
amount_fils null, and confidence below 0.3 so a human reviews it.`;

export const PARSE_TOOL: Anthropic.Tool = {
  name: "extract_transactions",
  description: "Return one extraction per input message, in the order they were given.",
  input_schema: {
    type: "object",
    properties: {
      results: {
        type: "array",
        items: {
          type: "object",
          properties: {
            index: { type: "integer", description: "The index of the input message" },
            is_transaction: { type: "boolean" },
            amount_fils: { type: ["integer", "null"] },
            merchant_raw: { type: ["string", "null"] },
            merchant: { type: ["string", "null"] },
            occurred_at: { type: ["string", "null"] },
            reference: { type: ["string", "null"] },
            category_guess: { type: ["string", "null"] },
            confidence: { type: "number" },
          },
          required: [
            "index",
            "is_transaction",
            "amount_fils",
            "merchant_raw",
            "merchant",
            "occurred_at",
            "reference",
            "category_guess",
            "confidence",
          ],
        },
      },
    },
    required: ["results"],
  } as Anthropic.Tool.InputSchema,
};

export type Correction = {
  sourceText: string;
  corrected: Record<string, unknown>;
};

export type ParseResult = { rows: ParsedRow[]; usage: Usage };

/**
 * §7.3: up to five recent corrections are prepended as example pairs. This is
 * the cheapest accuracy win in the project — the user has already told us what
 * the right answer looks like for messages in this exact format.
 */
export function buildParseUserMessage(
  messages: readonly string[],
  corrections: readonly Correction[] = [],
): string {
  const parts: string[] = [];

  if (corrections.length > 0) {
    const examples = corrections
      .slice(0, 5)
      .map(
        (correction) =>
          `<example>\n<message>${correction.sourceText}</message>\n<correct>${JSON.stringify(
            correction.corrected,
          )}</correct>\n</example>`,
      )
      .join("\n");
    parts.push(
      `<corrections>\nThese are messages this user corrected by hand. Match this reading.\n${examples}\n</corrections>`,
    );
  }

  parts.push(
    JSON.stringify({
      messages: messages.map((text, index) => ({ index, text })),
    }),
  );

  return parts.join("\n\n");
}

export function chunkMessages(
  messages: readonly string[],
  size: number = PARSE_CHUNK_SIZE,
): string[][] {
  const chunks: string[][] = [];
  for (let i = 0; i < messages.length; i += size) {
    chunks.push(messages.slice(i, i + size));
  }
  return chunks;
}

/** Parses one chunk. Callers chunk by PARSE_CHUNK_SIZE (20) first. */
export async function parseMessages(
  messages: readonly string[],
  corrections: readonly Correction[] = [],
): Promise<ParseResult> {
  const { input, usage } = await callTool({
    system: PARSE_SYSTEM_PROMPT,
    userMessage: buildParseUserMessage(messages, corrections),
    tool: PARSE_TOOL,
    maxTokens: 2000,
  });

  const parsed = ParseOutputSchema.parse(input);

  // Results are indexed so a partial failure maps back to its input. Anything
  // the model dropped becomes a low-confidence row rather than vanishing.
  const byIndex = new Map(parsed.results.map((row) => [row.index, row]));

  return {
    rows: messages.map((_, index) => {
      const row = byIndex.get(index);
      if (row) return row;
      return {
        index,
        is_transaction: true,
        amount_fils: null,
        merchant_raw: null,
        merchant: null,
        occurred_at: null,
        reference: null,
        category_guess: null,
        confidence: 0,
      } satisfies ParsedRow;
    }),
    usage,
  };
}
