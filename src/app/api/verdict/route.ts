import { z } from "zod";
import { prisma } from "@/lib/db";
import { ApiFailure, ok, parseBody, toResponse } from "@/lib/api";
import { requireCurrentUser } from "@/lib/user";
import { getBudgetState, invalidateBudgetState } from "@/lib/budget-state";
import { categoryHistory } from "@/lib/history";
import {
  AiUnavailableError,
  assertUnderDailyLimit,
  incrementUsage,
  RateLimitedError,
} from "@/lib/ai/client";
import { runVerdict, type Verdict } from "@/lib/ai/verdict";
import type { PromptRule } from "@/lib/ai/schemas";

export const dynamic = "force-dynamic";

const VerdictRequestSchema = z.strictObject({
  amountFils: z.number().int().min(1).max(1_000_000_000),
  categoryId: z.string().min(1),
  note: z.string().max(280).optional(),
});

const DECISION_TO_ENUM = { allow: "ALLOW", hold: "HOLD", decline: "DECLINE" } as const;

export async function POST(request: Request) {
  try {
    const input = await parseBody(request, VerdictRequestSchema);
    const user = await requireCurrentUser();

    const [policy, category] = await Promise.all([
      prisma.policy.findUnique({
        where: { userId: user.id },
        select: { body: true, rules: { orderBy: { order: "asc" } } },
      }),
      prisma.category.findFirst({
        where: { id: input.categoryId, userId: user.id },
        select: { id: true, slug: true, name: true },
      }),
    ]);

    if (!policy) {
      throw new ApiFailure(
        "VALIDATION",
        "Write your policy first — there is nothing to check this against yet.",
      );
    }
    if (!category) {
      throw new ApiFailure("VALIDATION", "Pick a category that exists.", "categoryId");
    }

    const budgetState = await getBudgetState(user.id, new Date(), { fresh: true });
    const rules: PromptRule[] = policy.rules.map((rule) => ({
      ref: rule.ref,
      kind: rule.kind,
      text: rule.text,
    }));

    let verdict: Verdict;
    let usage: { inputTokens: number; outputTokens: number; latencyMs: number };

    try {
      await assertUnderDailyLimit(user.id, "verdict");
      const history = await categoryHistory(user.id, category.id);
      const result = await runVerdict({
        request: {
          amount_fils: input.amountFils,
          category: category.slug,
          ...(input.note ? { note: input.note } : {}),
        },
        budget_state: budgetState,
        category_history: history,
        rules,
        policy: policy.body,
      });
      verdict = result.verdict;
      usage = result.usage;
      await incrementUsage(user.id, "verdict");
    } catch (error) {
      // A rate limit is the user's own cap and is worth saying plainly.
      if (error instanceof RateLimitedError) {
        throw new ApiFailure("RATE_LIMIT", error.message);
      }
      if (!(error instanceof AiUnavailableError)) throw error;

      // §8: 503, and no Intent. The engine did not produce a verdict, so there
      // is nothing here to record. /ask computes the arithmetic itself from the
      // BudgetState it already has and labels it as arithmetic only.
      throw new ApiFailure("AI_UNAVAILABLE", error.message);
    }

    const ruleText = verdict.ruleRef
      ? (policy.rules.find((rule) => rule.ref === verdict.ruleRef)?.text ?? null)
      : null;

    const intent = await prisma.intent.create({
      data: {
        userId: user.id,
        categoryId: category.id,
        amount: input.amountFils,
        note: input.note ?? null,
        decision: DECISION_TO_ENUM[verdict.decision],
        ruleRef: verdict.ruleRef,
        reasoning: verdict.reasoning,
        affordable: verdict.affordableNow,
        state: "OPEN",
        latencyMs: usage.latencyMs,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
      },
      select: { id: true },
    });

    invalidateBudgetState(user.id);

    return ok({
      intentId: intent.id,
      decision: verdict.decision,
      ruleRef: verdict.ruleRef,
      ruleText,
      reasoning: verdict.reasoning,
      affordableNow: verdict.affordableNow,
      figureCited: verdict.figureCited,
      budgetState,
      category: { id: category.id, name: category.name, slug: category.slug },
    });
  } catch (error) {
    if (error instanceof AiUnavailableError) {
      return toResponse(new ApiFailure("AI_UNAVAILABLE", error.message));
    }
    return toResponse(error);
  }
}
