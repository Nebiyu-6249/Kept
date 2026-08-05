import { prisma } from "./db";
import { merchantKey } from "./merchant";
import { DECLINE_EXPIRY_DAYS, REVIEW_DELAY_DAYS } from "./env";

/**
 * The nightly sweep (§8.2). Runs under a 30s cap, so each step is bounded and
 * the whole thing reports how long it took.
 */

export type SweepResult = {
  expiredIntents: number;
  reviewsCreated: number;
  billsDetected: number;
  ranOutOfTime: boolean;
  ms: number;
};

/** Leaves headroom inside the platform's 30s cap for the final writes. */
const TIME_BUDGET_MS = 20_000;

/** A charge must appear at least this many times to count as recurring. */
const MIN_OCCURRENCES = 3;

/** Interval variance under this fraction counts as regular. */
const MAX_INTERVAL_VARIANCE = 0.2;

export async function runNightlySweep(now: Date = new Date()): Promise<SweepResult> {
  const started = Date.now();
  const result: SweepResult = {
    expiredIntents: 0,
    reviewsCreated: 0,
    billsDetected: 0,
    ranOutOfTime: false,
    ms: 0,
  };

  const outOfTime = (): boolean => Date.now() - started > TIME_BUDGET_MS;

  // 1. DECLINE intents nobody acted on expire after 7 days.
  const declineCutoff = new Date(now.getTime() - DECLINE_EXPIRY_DAYS * 86_400_000);
  const expired = await prisma.intent.updateMany({
    where: { decision: "DECLINE", state: "OPEN", createdAt: { lt: declineCutoff } },
    data: { state: "EXPIRED", resolvedAt: now },
  });
  result.expiredIntents = expired.count;

  if (outOfTime()) {
    result.ranOutOfTime = true;
    result.ms = Date.now() - started;
    return result;
  }

  // 2. Discretionary purchases become reviewable a week after they happened.
  const reviewCutoff = new Date(now.getTime() - REVIEW_DELAY_DAYS * 86_400_000);
  const needsReview = await prisma.transaction.findMany({
    where: {
      occurredAt: { lt: reviewCutoff },
      review: null,
      category: { discretionary: true },
    },
    select: { id: true },
    take: 500,
  });

  if (needsReview.length > 0) {
    const created = await prisma.review.createMany({
      data: needsReview.map((transaction) => ({ transactionId: transaction.id, askedAt: now })),
      skipDuplicates: true,
    });
    result.reviewsCreated = created.count;
  }

  if (outOfTime()) {
    result.ranOutOfTime = true;
    result.ms = Date.now() - started;
    return result;
  }

  // 3. Recurring charges become detected bills.
  result.billsDetected = await detectRecurringBills(now);

  result.ms = Date.now() - started;
  return result;
}

/**
 * A charge is recurring when the same normalised merchant appears at least
 * three times and the gaps between those appearances are regular — coefficient
 * of variation under 20%.
 *
 * Normalisation happens here rather than trusting the stored merchant string,
 * because rows arrive from a model, a CSV and manual entry, and only a shared
 * key makes them comparable.
 */
export async function detectRecurringBills(now: Date = new Date()): Promise<number> {
  const since = new Date(now.getTime() - 180 * 86_400_000);

  const transactions = await prisma.transaction.findMany({
    where: { occurredAt: { gte: since, lte: now } },
    orderBy: { occurredAt: "asc" },
    select: {
      userId: true,
      merchant: true,
      amount: true,
      occurredAt: true,
      categoryId: true,
    },
  });

  type Group = {
    userId: string;
    label: string;
    categoryId: string | null;
    amounts: number[];
    dates: Date[];
  };

  const groups = new Map<string, Group>();
  for (const transaction of transactions) {
    const key = `${transaction.userId}::${merchantKey(transaction.merchant)}`;
    const group = groups.get(key);
    if (group) {
      group.amounts.push(transaction.amount);
      group.dates.push(transaction.occurredAt);
    } else {
      groups.set(key, {
        userId: transaction.userId,
        label: transaction.merchant,
        categoryId: transaction.categoryId,
        amounts: [transaction.amount],
        dates: [transaction.occurredAt],
      });
    }
  }

  let detected = 0;

  for (const group of groups.values()) {
    if (group.dates.length < MIN_OCCURRENCES) continue;
    if (!isRegular(group.dates)) continue;

    const amounts = [...group.amounts].sort((a, b) => a - b);
    const median = amounts[Math.floor(amounts.length / 2)] ?? 0;
    if (median <= 0) continue;

    const lastDate = group.dates[group.dates.length - 1];
    if (!lastDate) continue;
    const dueDay = lastDate.getUTCDate();

    // Upsert on (userId, label) so a re-run updates rather than duplicates, and
    // so a bill the user set up by hand is never overwritten by a guess.
    const existing = await prisma.bill.findUnique({
      where: { userId_label: { userId: group.userId, label: group.label } },
      select: { id: true, detected: true },
    });

    if (existing && !existing.detected) continue; // Hand-made bills are left alone.

    if (!existing) {
      // The same payment often already has a bill under a different label —
      // "Rent" set up by hand against "Landlord Transfer" on the statement.
      // Adding a second one would count that money twice in committedBills and
      // quietly shrink safe-to-spend, so a near match wins over a new row.
      const bills = await prisma.bill.findMany({
        where: { userId: group.userId, active: true },
        select: { amount: true, dueDay: true },
      });
      if (bills.some((bill) => looksLikeSameBill(bill, { amount: median, dueDay }))) continue;
    }

    await prisma.bill.upsert({
      where: { userId_label: { userId: group.userId, label: group.label } },
      create: {
        userId: group.userId,
        categoryId: group.categoryId,
        label: group.label,
        amount: median,
        dueDay,
        active: true,
        detected: true,
      },
      update: { amount: median, dueDay },
    });

    detected += 1;
  }

  return detected;
}

/**
 * Two bills are the same commitment when they cost about the same and fall at
 * about the same point in the month. Labels are not comparable — the statement
 * says LANDLORD TRANSFER where the user wrote Rent.
 */
export function looksLikeSameBill(
  a: { amount: number; dueDay: number },
  b: { amount: number; dueDay: number },
): boolean {
  const larger = Math.max(a.amount, b.amount);
  if (larger === 0) return false;
  const amountDrift = Math.abs(a.amount - b.amount) / larger;
  if (amountDrift > 0.15) return false;

  // Day-of-month distance, wrapping across the end of the month.
  const raw = Math.abs(a.dueDay - b.dueDay);
  const dayDistance = Math.min(raw, 31 - raw);
  return dayDistance <= 3;
}

/** Coefficient of variation of the gaps between dates, under the threshold. */
export function isRegular(dates: readonly Date[]): boolean {
  if (dates.length < MIN_OCCURRENCES) return false;

  const gaps: number[] = [];
  for (let i = 1; i < dates.length; i += 1) {
    const previous = dates[i - 1];
    const current = dates[i];
    if (!previous || !current) continue;
    gaps.push((current.getTime() - previous.getTime()) / 86_400_000);
  }

  if (gaps.length < MIN_OCCURRENCES - 1) return false;

  const mean = gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length;
  // Same-day repeats are a till splitting a basket, not a recurring charge.
  if (mean < 1) return false;

  const variance = gaps.reduce((sum, gap) => sum + (gap - mean) ** 2, 0) / gaps.length;
  return Math.sqrt(variance) / mean < MAX_INTERVAL_VARIANCE;
}
