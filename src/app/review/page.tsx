import { AppFrame } from "@/components/frame/AppFrame";
import { ReviewDeck } from "@/components/review/ReviewDeck";
import { Reveal } from "@/components/primitives/Reveal";
import { prisma } from "@/lib/db";
import { requireCurrentUser } from "@/lib/user";
import { APP_TIMEZONE } from "@/lib/env";
import type { PendingReview } from "@/app/api/review/route";

export const dynamic = "force-dynamic";

export const metadata = { title: "Review — KEPT" };

export default async function ReviewPage() {
  const user = await requireCurrentUser();

  const review = await prisma.review.findFirst({
    where: { answeredAt: null, transaction: { userId: user.id } },
    orderBy: { askedAt: "asc" },
    select: {
      id: true,
      transaction: {
        select: {
          id: true,
          amount: true,
          merchant: true,
          occurredAt: true,
          category: { select: { id: true, name: true, slug: true } },
        },
      },
    },
  });

  const initial: PendingReview | null = review
    ? {
        reviewId: review.id,
        transactionId: review.transaction.id,
        amount: review.transaction.amount,
        merchant: review.transaction.merchant,
        occurredAt: review.transaction.occurredAt.toISOString(),
        category: review.transaction.category,
      }
    : null;

  return (
    <AppFrame>
      {/* One card, centred, nothing else on screen. */}
      <div className="mx-auto flex min-h-[60dvh] w-full max-w-[440px] flex-col justify-center">
        <Reveal immediate>
          <ReviewDeck initial={initial} currency={user.currency} timeZone={APP_TIMEZONE} />
        </Reveal>
      </div>
    </AppFrame>
  );
}
