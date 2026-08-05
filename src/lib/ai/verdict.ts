import type Anthropic from "@anthropic-ai/sdk";
import { callTool, type Usage } from "./client";
import { VerdictOutputSchema, type CategoryHistory, type PromptRule } from "./schemas";
import type { BudgetState } from "@/lib/budget-state";

/** §7.2, verbatim. */
export const VERDICT_SYSTEM_PROMPT = `You are the verdict engine for KEPT, a personal spending advisor. The user
writes their own spending policy; your job is to apply it, not to replace it
with generic financial advice.

You will receive the user's policy, their numbered rules, and their current
budget state. You return exactly one verdict through the provided tool.

How to decide:
- Check the request against the user's own rules first. If a rule applies,
  cite it by its ref and quote the user's wording in your reasoning.
- If no rule applies, decide on the arithmetic: does the amount fit inside
  safe_to_spend after committed bills, and does it fit the category's
  remaining limit.
- Weigh the user's own history for this category when it is supplied. A
  category where the user has repeatedly marked purchases as not worth it is
  evidence, and you should say so plainly.
- Return HOLD rather than DECLINE whenever the purchase is affordable but the
  evidence is against it. A hold is a wait, not a refusal, and it is the
  correct default for discretionary spending under uncertainty.
- Return DECLINE only when the money is not there, or a hard rule forbids it.

How to write the reasoning:
- Two sentences maximum, plain language, second person.
- State the specific figure that drove the decision.
- Never scold, never moralise, never use exclamation marks.
- Do not suggest investments, loans, credit products, or anything beyond this
  single purchase decision.`;

export const VERDICT_TOOL: Anthropic.Tool = {
  name: "verdict",
  description: "Return the spending verdict for this single purchase intent.",
  input_schema: {
    type: "object",
    properties: {
      decision: { type: "string", enum: ["allow", "hold", "decline"] },
      rule_ref: {
        type: ["string", "null"],
        description: "Ref of the cited rule, e.g. R-03, or null if decided on arithmetic alone",
      },
      reasoning: {
        type: "string",
        description: "Two sentences maximum, second person, citing the figure that drove it",
      },
      affordable_now: { type: "boolean" },
      figure_cited: {
        type: "integer",
        description: "The fils figure referenced in the reasoning",
      },
    },
    required: ["decision", "rule_ref", "reasoning", "affordable_now", "figure_cited"],
  } as Anthropic.Tool.InputSchema,
};

export type VerdictRequest = {
  amount_fils: number;
  category: string;
  note?: string;
};

export type VerdictInput = {
  request: VerdictRequest;
  budget_state: BudgetState;
  category_history?: CategoryHistory;
  rules: PromptRule[];
  /** The policy body. Sent so the model can read the user's own framing. */
  policy?: string;
};

export type Verdict = {
  decision: "allow" | "hold" | "decline";
  ruleRef: string | null;
  reasoning: string;
  affordableNow: boolean;
  figureCited: number;
};

export type VerdictResult = { verdict: Verdict; usage: Usage };

/** The user message is a JSON object, nothing else (§7.2). */
export function buildVerdictUserMessage(input: VerdictInput): string {
  return JSON.stringify({
    request: input.request,
    budget_state: input.budget_state,
    ...(input.category_history ? { category_history: input.category_history } : {}),
    rules: input.rules,
    ...(input.policy ? { policy: input.policy } : {}),
  });
}

export async function runVerdict(input: VerdictInput): Promise<VerdictResult> {
  const { input: raw, usage } = await callTool({
    system: VERDICT_SYSTEM_PROMPT,
    userMessage: buildVerdictUserMessage(input),
    tool: VERDICT_TOOL,
    maxTokens: 700,
  });

  const parsed = VerdictOutputSchema.parse(raw);

  // A citation the user cannot find is worse than no citation, so a ref that is
  // not in the supplied rules is dropped rather than displayed (§7.2).
  const known = new Set(input.rules.map((rule) => rule.ref));
  const ruleRef = parsed.rule_ref && known.has(parsed.rule_ref) ? parsed.rule_ref : null;

  return {
    verdict: {
      decision: parsed.decision,
      ruleRef,
      reasoning: parsed.reasoning,
      affordableNow: parsed.affordable_now,
      figureCited: parsed.figure_cited,
    },
    usage,
  };
}

/**
 * The local arithmetic fallback lives in lib/arithmetic-verdict.ts, not here:
 * /ask runs it in the browser, and this module imports the Anthropic SDK.
 */
