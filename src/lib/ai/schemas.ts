import { z } from "zod";

/**
 * Zod mirrors of the tool schemas.
 *
 * The model's output is validated here before anything is persisted or shown.
 * A tool schema is a request, not a guarantee.
 */

export const VerdictOutputSchema = z.object({
  decision: z.enum(["allow", "hold", "decline"]),
  rule_ref: z.string().nullable(),
  reasoning: z.string().min(1).max(1_200),
  affordable_now: z.boolean(),
  figure_cited: z.number().int(),
});

export type VerdictOutput = z.infer<typeof VerdictOutputSchema>;

export const ParsedRowSchema = z.object({
  index: z.number().int().min(0),
  is_transaction: z.boolean(),
  amount_fils: z.number().int().min(0).nullable(),
  merchant_raw: z.string().nullable(),
  merchant: z.string().nullable(),
  occurred_at: z.string().nullable(),
  reference: z.string().nullable(),
  category_guess: z.string().nullable(),
  confidence: z.number().min(0).max(1),
});

export type ParsedRow = z.infer<typeof ParsedRowSchema>;

export const ParseOutputSchema = z.object({
  results: z.array(ParsedRowSchema),
});

export type ParseOutput = z.infer<typeof ParseOutputSchema>;

/** The budget state shape sent to the model, in fils. */
export const BudgetStateForPromptSchema = z.object({
  period: z.object({
    start: z.string(),
    end: z.string(),
    daysRemaining: z.number(),
    daysTotal: z.number(),
  }),
  income: z.number(),
  committedBills: z.number(),
  spentTotal: z.number(),
  spentByCategory: z.record(
    z.string(),
    z.object({
      spent: z.number(),
      limit: z.number().nullable(),
      remaining: z.number().nullable(),
    }),
  ),
  heldTotal: z.number(),
  kept: z.number(),
  dailyBurn: z.number(),
  projectedEndSpend: z.number(),
  safeToSpend: z.number(),
});

export const CategoryHistorySchema = z.object({
  purchases_last_90d: z.number().int().min(0),
  reviewed: z.number().int().min(0),
  not_worth_it: z.number().int().min(0),
  median_amount_fils: z.number().int().min(0),
});

export type CategoryHistory = z.infer<typeof CategoryHistorySchema>;

export const PromptRuleSchema = z.object({
  ref: z.string(),
  kind: z.enum(["LIMIT", "NONNEGOTIABLE", "LEAK", "HARD_RULE"]),
  text: z.string(),
});

export type PromptRule = z.infer<typeof PromptRuleSchema>;
