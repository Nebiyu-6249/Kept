import { z } from "zod";
import { prisma } from "@/lib/db";
import { ApiFailure, ok, parseBody, toResponse } from "@/lib/api";
import { requireCurrentUser } from "@/lib/user";
import { invalidateBudgetState } from "@/lib/budget-state";
import { applyAction, holdUntilFrom, type IntentAction } from "@/lib/intent-machine";
import { normalizeMerchant } from "@/lib/merchant";
import { intentSelect, toIntentDTO } from "@/lib/serialize";

export const dynamic = "force-dynamic";

const PatchSchema = z.strictObject({
  action: z.enum(["hold", "purchase", "release"]),
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const { action } = await parseBody(request, PatchSchema);
    const user = await requireCurrentUser();

    const intent = await prisma.intent.findFirst({
      where: { id, userId: user.id },
      select: {
        id: true,
        state: true,
        amount: true,
        note: true,
        categoryId: true,
        category: { select: { name: true } },
      },
    });
    if (!intent) throw new ApiFailure("NOT_FOUND", "That intent is not here.");

    const transition = applyAction(intent.state, action as IntentAction);
    if (!transition.ok) throw new ApiFailure("CONFLICT", transition.reason);

    const now = new Date();

    const updated = await prisma.$transaction(async (tx) => {
      const next = await tx.intent.update({
        where: { id: intent.id },
        data: {
          state: transition.next,
          ...(action === "hold" ? { holdUntil: holdUntilFrom(now) } : {}),
          ...(action === "purchase" || action === "release" ? { resolvedAt: now } : {}),
        },
        select: intentSelect,
      });

      if (action === "purchase") {
        const label = intent.note?.trim() || `${intent.category?.name ?? "Purchase"} from a verdict`;
        // reference is the intent id, so the composite unique on Transaction
        // makes a repeated purchase call impossible to double-write.
        await tx.transaction.create({
          data: {
            userId: user.id,
            categoryId: intent.categoryId,
            amount: intent.amount,
            merchantRaw: label,
            merchant: normalizeMerchant(label),
            occurredAt: now,
            source: "INTENT",
            reference: intent.id,
            intentId: intent.id,
          },
        });
      }

      return next;
    });

    invalidateBudgetState(user.id);

    return ok({ intent: toIntentDTO(updated, now) });
  } catch (error) {
    return toResponse(error);
  }
}
