import { z } from "zod";
import { prisma } from "@/lib/db";
import { ApiFailure, ok, parseBody, toResponse } from "@/lib/api";
import { requireCurrentUser } from "@/lib/user";
import { invalidateBudgetState } from "@/lib/budget-state";
import { normalizeMerchant } from "@/lib/merchant";
import { toTransactionDTO, transactionSelect } from "@/lib/serialize";

export const dynamic = "force-dynamic";

const PatchSchema = z
  .strictObject({
    amountFils: z.number().int().min(0).max(1_000_000_000).optional(),
    merchant: z.string().min(1).max(160).optional(),
    categoryId: z.string().min(1).nullable().optional(),
    occurredAt: z.iso.datetime().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Send at least one field to change.",
  });

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const patch = await parseBody(request, PatchSchema);
    const user = await requireCurrentUser();

    const existing = await prisma.transaction.findFirst({
      where: { id, userId: user.id },
      select: { id: true, sourceText: true, amount: true, merchant: true, categoryId: true },
    });
    if (!existing) throw new ApiFailure("NOT_FOUND", "That transaction is not here.");

    if (patch.categoryId) {
      const category = await prisma.category.findFirst({
        where: { id: patch.categoryId, userId: user.id },
        select: { id: true },
      });
      if (!category) throw new ApiFailure("VALIDATION", "Unknown category.", "categoryId");
    }

    const updated = await prisma.transaction.update({
      where: { id: existing.id },
      data: {
        ...(patch.amountFils !== undefined ? { amount: patch.amountFils } : {}),
        ...(patch.merchant !== undefined
          ? { merchant: normalizeMerchant(patch.merchant) }
          : {}),
        ...(patch.categoryId !== undefined ? { categoryId: patch.categoryId } : {}),
        ...(patch.occurredAt !== undefined ? { occurredAt: new Date(patch.occurredAt) } : {}),
        corrected: true,
      },
      select: transactionSelect,
    });

    // §7.3: store the correction pair so the next parse call can learn from it.
    // Only rows that came from a parse have a sourceText to learn against.
    if (existing.sourceText) {
      await prisma.correction.create({
        data: {
          userId: user.id,
          sourceText: existing.sourceText,
          corrected: {
            amount_fils: updated.amount,
            merchant: updated.merchant,
            category_slug: updated.category?.slug ?? null,
            occurred_at: updated.occurredAt.toISOString(),
          },
        },
      });
    }

    invalidateBudgetState(user.id);
    return ok({ transaction: toTransactionDTO(updated) });
  } catch (error) {
    return toResponse(error);
  }
}
