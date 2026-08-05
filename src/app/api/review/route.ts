import { z } from "zod";
import { prisma } from "@/lib/db";
import { ApiFailure, ok, parseBody, toResponse } from "@/lib/api";
import { requireCurrentUser } from "@/lib/user";

export const dynamic = "force-dynamic";

const ReviewSchema = z.strictObject({
  transactionId: z.string().min(1),
  worthIt: z.boolean(),
});

const pendingSelect = {
  id: true,
  worthIt: true,
  transaction: {
    select: {
      id: true,
      amount: true,
      merchant: true,
      occurredAt: true,
      category: { select: { id: true, name: true, slug: true } },
    },
  },
} as const;

export type PendingReview = {
  reviewId: string;
  transactionId: string;
  amount: number;
  merchant: string;
  occurredAt: string;
  category: { id: string; name: string; slug: string } | null;
};

export async function POST(request: Request) {
  try {
    const input = await parseBody(request, ReviewSchema);
    const user = await requireCurrentUser();

    const review = await prisma.review.findFirst({
      where: { transactionId: input.transactionId, transaction: { userId: user.id } },
      select: { id: true, answeredAt: true },
    });
    if (!review) throw new ApiFailure("NOT_FOUND", "There is no review waiting on that purchase.");
    if (review.answeredAt) {
      throw new ApiFailure("CONFLICT", "You already answered that one.");
    }

    await prisma.review.update({
      where: { id: review.id },
      data: { worthIt: input.worthIt, answeredAt: new Date() },
    });

    return ok({ next: await nextPending(user.id) });
  } catch (error) {
    return toResponse(error);
  }
}

export async function GET() {
  try {
    const user = await requireCurrentUser();
    return ok({ next: await nextPending(user.id) });
  } catch (error) {
    return toResponse(error);
  }
}

/** The next unanswered review, oldest first, or null when the queue empties. */
async function nextPending(userId: string): Promise<PendingReview | null> {
  const review = await prisma.review.findFirst({
    where: { answeredAt: null, transaction: { userId } },
    orderBy: { askedAt: "asc" },
    select: pendingSelect,
  });

  if (!review) return null;

  return {
    reviewId: review.id,
    transactionId: review.transaction.id,
    amount: review.transaction.amount,
    merchant: review.transaction.merchant,
    occurredAt: review.transaction.occurredAt.toISOString(),
    category: review.transaction.category,
  };
}
