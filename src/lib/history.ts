import { prisma } from "./db";
import { medianFils } from "./money";
import type { CategoryHistory } from "./ai/schemas";

/**
 * The user's own history for a category, supplied to the verdict engine as
 * evidence. A category the user has repeatedly marked as not worth it is the
 * strongest signal the model gets, and it is entirely the user's own data.
 */
export async function categoryHistory(
  userId: string,
  categoryId: string,
  now: Date = new Date(),
): Promise<CategoryHistory> {
  const since = new Date(now.getTime() - 90 * 86_400_000);

  const rows = await prisma.transaction.findMany({
    where: { userId, categoryId, occurredAt: { gte: since, lte: now } },
    select: { amount: true, review: { select: { worthIt: true } } },
  });

  let reviewed = 0;
  let notWorthIt = 0;
  for (const row of rows) {
    if (row.review?.worthIt === null || row.review?.worthIt === undefined) continue;
    reviewed += 1;
    if (row.review.worthIt === false) notWorthIt += 1;
  }

  return {
    purchases_last_90d: rows.length,
    reviewed,
    not_worth_it: notWorthIt,
    median_amount_fils: medianFils(rows.map((row) => row.amount)),
  };
}
