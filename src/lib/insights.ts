import { prisma } from "./db";
import { getBudgetState, type BudgetState } from "./budget-state";
import { holdConversion } from "./kept";
import { currentPeriod } from "./period";

/**
 * Everything /insights renders. Computed here so the page is a rendering of a
 * shape rather than a screen that does arithmetic of its own.
 *
 * Where the dataset is too thin to say anything, the figures come back as
 * zeroes and the page says so rather than drawing a confident empty chart.
 */

export type CategoryInsight = {
  slug: string;
  name: string;
  spent: number;
  limit: number | null;
  remaining: number | null;
  reviewed: number;
  notWorthIt: number;
  /** null when nothing in this category has been reviewed yet. */
  notWorthItRate: number | null;
};

export type Insights = {
  budgetState: BudgetState;
  /** Cumulative discretionary spend by day index for the current period. */
  cumulative: number[];
  idealPerDay: number;
  daysElapsed: number;
  categories: CategoryInsight[];
  holds: { released: number; purchased: number; releasedFils: number; purchasedFils: number };
  cost: {
    verdictsThisPeriod: number;
    inputTokens: number;
    outputTokens: number;
    medianLatencyMs: number | null;
  };
  hasEnoughData: boolean;
};

export async function getInsights(userId: string, now: Date = new Date()): Promise<Insights> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const period = currentPeriod(user, now);

  const [budgetState, categories, transactions, intents] = await Promise.all([
    getBudgetState(userId, now),
    prisma.category.findMany({
      where: { userId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, slug: true, discretionary: true },
    }),
    prisma.transaction.findMany({
      where: { userId, occurredAt: { gte: period.start, lte: period.end } },
      select: {
        amount: true,
        occurredAt: true,
        categoryId: true,
        category: { select: { discretionary: true } },
      },
    }),
    prisma.intent.findMany({
      where: { userId },
      select: {
        amount: true,
        decision: true,
        state: true,
        createdAt: true,
        resolvedAt: true,
        inputTokens: true,
        outputTokens: true,
        latencyMs: true,
      },
    }),
  ]);

  // Review counts per category, over the whole history rather than one period —
  // a regret rate needs more than a fortnight to mean anything.
  const reviews = await prisma.review.findMany({
    where: { answeredAt: { not: null }, transaction: { userId } },
    select: { worthIt: true, transaction: { select: { categoryId: true } } },
  });

  const reviewsByCategory = new Map<string, { reviewed: number; notWorthIt: number }>();
  for (const review of reviews) {
    const categoryId = review.transaction.categoryId;
    if (!categoryId || review.worthIt === null) continue;
    const bucket = reviewsByCategory.get(categoryId) ?? { reviewed: 0, notWorthIt: 0 };
    bucket.reviewed += 1;
    if (!review.worthIt) bucket.notWorthIt += 1;
    reviewsByCategory.set(categoryId, bucket);
  }

  const cumulative = new Array<number>(period.daysTotal).fill(0);
  for (const transaction of transactions) {
    if (transaction.category?.discretionary === false) continue;
    const index = Math.floor(
      (transaction.occurredAt.getTime() - period.start.getTime()) / 86_400_000,
    );
    if (index < 0 || index >= period.daysTotal) continue;
    cumulative[index] = (cumulative[index] ?? 0) + transaction.amount;
  }
  for (let day = 1; day < cumulative.length; day += 1) {
    cumulative[day] = (cumulative[day] ?? 0) + (cumulative[day - 1] ?? 0);
  }

  const categoryInsights: CategoryInsight[] = categories.map((category) => {
    const bucket = budgetState.spentByCategory[category.slug];
    const review = reviewsByCategory.get(category.id);
    return {
      slug: category.slug,
      name: category.name,
      spent: bucket?.spent ?? 0,
      limit: bucket?.limit ?? null,
      remaining: bucket?.remaining ?? null,
      reviewed: review?.reviewed ?? 0,
      notWorthIt: review?.notWorthIt ?? 0,
      notWorthItRate: review && review.reviewed > 0 ? review.notWorthIt / review.reviewed : null,
    };
  });

  const periodIntents = intents.filter(
    (intent) => intent.createdAt >= period.start && intent.createdAt <= period.end,
  );

  const latencies = periodIntents
    .map((intent) => intent.latencyMs)
    .filter((value): value is number => value !== null)
    .sort((a, b) => a - b);

  return {
    budgetState,
    cumulative,
    // The same allowance basis the demo burn line uses, so the two charts in
    // the product mean the same thing.
    idealPerDay: Math.round(Math.round(user.monthlyIncome * 0.35) / period.daysTotal),
    daysElapsed: period.daysElapsed,
    categories: categoryInsights,
    holds: holdConversion(intents),
    cost: {
      verdictsThisPeriod: periodIntents.length,
      inputTokens: periodIntents.reduce((sum, intent) => sum + (intent.inputTokens ?? 0), 0),
      outputTokens: periodIntents.reduce((sum, intent) => sum + (intent.outputTokens ?? 0), 0),
      medianLatencyMs:
        latencies.length > 0 ? (latencies[Math.floor(latencies.length / 2)] ?? null) : null,
    },
    // Below this there is nothing honest to draw.
    hasEnoughData: transactions.length >= 3,
  };
}
