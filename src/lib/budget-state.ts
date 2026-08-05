/**
 * The single source of truth for every figure in the app.
 *
 * The verdict engine, /ask, the rail and /insights all read this one shape. No
 * component recomputes a figure — if a number is on screen, it came from here.
 */

import { prisma } from "./db";
import { computeKept, type KeptIntent } from "./kept";
import { billDueDateInPeriod, currentPeriod, startOfLocalDay, type Period } from "./period";
import { APP_TIMEZONE } from "./env";

export type CategoryBudget = {
  spent: number;
  limit: number | null;
  remaining: number | null;
};

export type BudgetState = {
  period: { start: string; end: string; daysRemaining: number; daysTotal: number };
  income: number;
  /** Active bills whose due date falls between today and the period end. */
  committedBills: number;
  spentTotal: number;
  /** Keyed by category slug. Every category appears, including untouched ones. */
  spentByCategory: Record<string, CategoryBudget>;
  heldTotal: number;
  kept: number;
  dailyBurn: number;
  projectedEndSpend: number;
  safeToSpend: number;
};

export type BudgetInput = {
  period: Period;
  income: number;
  bills: ReadonlyArray<{ amount: number; dueDay: number; active: boolean }>;
  /** Transactions already scoped to the period. */
  transactions: ReadonlyArray<{ amount: number; categoryId: string | null }>;
  categories: ReadonlyArray<{ id: string; slug: string; limitPerPeriod: number | null }>;
  /** Intents currently in state HELD, whatever their hold expiry. */
  heldIntents: ReadonlyArray<{ amount: number }>;
  /** Every intent that could contribute to Kept this period. */
  keptIntents: readonly KeptIntent[];
  now: Date;
  timeZone?: string;
};

/**
 * A bill counts as committed when its due date has not passed yet. Bills already
 * due inside this period are assumed paid, and their payment is already sitting
 * in `spentTotal` — counting them again would double-charge the user's own
 * money against them.
 */
export function committedBillsTotal(
  bills: BudgetInput["bills"],
  period: Period,
  now: Date,
  timeZone: string = APP_TIMEZONE,
): number {
  const today = startOfLocalDay(now, timeZone);
  let total = 0;
  for (const bill of bills) {
    if (!bill.active) continue;
    const due = billDueDateInPeriod(bill.dueDay, period, timeZone);
    if (!due) continue;
    if (due < today) continue;
    total += bill.amount;
  }
  return total;
}

/** Pure assembly, so every figure is unit-testable without a database. */
export function assembleBudgetState(input: BudgetInput): BudgetState {
  const { period, income, transactions, categories, heldIntents, keptIntents, now } = input;
  const timeZone = input.timeZone ?? APP_TIMEZONE;

  const slugById = new Map(categories.map((c) => [c.id, c.slug]));

  const spentByCategory: Record<string, CategoryBudget> = {};
  for (const category of categories) {
    spentByCategory[category.slug] = {
      spent: 0,
      limit: category.limitPerPeriod,
      remaining: category.limitPerPeriod === null ? null : category.limitPerPeriod,
    };
  }

  let spentTotal = 0;
  for (const tx of transactions) {
    spentTotal += tx.amount;
    const slug = tx.categoryId ? slugById.get(tx.categoryId) : undefined;
    if (!slug) continue;
    const bucket = spentByCategory[slug];
    if (!bucket) continue;
    bucket.spent += tx.amount;
  }

  for (const bucket of Object.values(spentByCategory)) {
    bucket.remaining = bucket.limit === null ? null : bucket.limit - bucket.spent;
  }

  const committedBills = committedBillsTotal(input.bills, period, now, timeZone);
  const heldTotal = heldIntents.reduce((sum, i) => sum + i.amount, 0);
  const kept = computeKept(keptIntents, period);

  // daysElapsed counts today and is never 0, so this cannot divide by zero.
  const dailyBurn = Math.round(spentTotal / period.daysElapsed);
  const projectedEndSpend = spentTotal + dailyBurn * period.daysRemaining;
  const safeToSpend = income - committedBills - spentTotal - heldTotal;

  return {
    period: {
      start: period.start.toISOString(),
      end: period.end.toISOString(),
      daysRemaining: period.daysRemaining,
      daysTotal: period.daysTotal,
    },
    income,
    committedBills,
    spentTotal,
    spentByCategory,
    heldTotal,
    kept,
    dailyBurn,
    projectedEndSpend,
    safeToSpend,
  };
}

/** §8: cached 30s in memory. Per instance — a cold function starts empty. */
const CACHE_TTL_MS = 30_000;
const cache = new Map<string, { at: number; value: BudgetState }>();

export function invalidateBudgetState(userId: string): void {
  cache.delete(userId);
}

export async function getBudgetState(
  userId: string,
  now: Date = new Date(),
  options: { fresh?: boolean } = {},
): Promise<BudgetState> {
  const hit = cache.get(userId);
  if (!options.fresh && hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error(`getBudgetState: no user ${userId}`);

  const period = currentPeriod(user, now);

  const [categories, transactions, bills, heldIntents, keptIntents] = await Promise.all([
    prisma.category.findMany({
      where: { userId },
      select: { id: true, slug: true, limitPerPeriod: true },
    }),
    prisma.transaction.findMany({
      where: { userId, occurredAt: { gte: period.start, lte: period.end } },
      select: { amount: true, categoryId: true },
    }),
    prisma.bill.findMany({
      where: { userId, active: true },
      select: { amount: true, dueDay: true, active: true },
    }),
    prisma.intent.findMany({
      where: { userId, state: "HELD" },
      select: { amount: true },
    }),
    prisma.intent.findMany({
      where: {
        userId,
        OR: [{ state: "RELEASED" }, { decision: "DECLINE", NOT: { state: "PURCHASED" } }],
      },
      select: {
        amount: true,
        decision: true,
        state: true,
        createdAt: true,
        resolvedAt: true,
      },
    }),
  ]);

  const value = assembleBudgetState({
    period,
    income: user.monthlyIncome,
    bills,
    transactions,
    categories,
    heldIntents,
    keptIntents,
    now,
  });

  cache.set(userId, { at: Date.now(), value });
  return value;
}
