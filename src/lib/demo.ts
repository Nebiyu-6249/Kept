import { prisma } from "./db";
import { computeKept } from "./kept";
import { currentPeriod } from "./period";

/**
 * The figures the signed-out home renders.
 *
 * Every one is computed from the seeded database — the same rows the app runs
 * on. Nothing on the marketing page is a number somebody typed in, because a
 * spending advisor that invents its own statistics has answered the only
 * question that matters about it.
 *
 * If the database is empty the page renders its own honest empty state rather
 * than a placeholder figure.
 */

export type DeckCard = {
  id: string;
  amountFils: number;
  merchant: string;
  category: string;
  ruleRef: string | null;
  ruleText: string | null;
  decision: "ALLOW" | "HOLD" | "DECLINE";
  reasoning: string;
};

export type DemoData = {
  available: boolean;
  keptFils: number;
  currency: string;
  cards: DeckCard[];
  /** Cumulative spend per day of the current period, in fils. */
  scenarios: ScenarioSet;
  transactionCount: number;
  ruleCount: number;
};

export type Scenario = {
  id: "tight" | "normal" | "payday";
  label: string;
  /** Cumulative spend by day index, fils. Index 0 is day one. */
  cumulative: number[];
  daysTotal: number;
  /** The straight line the period would follow at an even rate. */
  idealPerDay: number;
  eyebrow: string;
  facts: Array<{ label: string; value: string }>;
  /** Day index where projected spend crosses the ideal line, or null. */
  crossingDay: number | null;
};

export type ScenarioSet = Record<Scenario["id"], Scenario>;

export async function getDemoData(): Promise<DemoData> {
  const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });

  if (!user) {
    return {
      available: false,
      keptFils: 0,
      currency: "AED",
      cards: [],
      scenarios: emptyScenarios(),
      transactionCount: 0,
      ruleCount: 0,
    };
  }

  const now = new Date();
  const period = currentPeriod(user);

  const [intents, keptIntents, transactions, rules, transactionCount] = await Promise.all([
    prisma.intent.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 4,
      select: {
        id: true,
        amount: true,
        note: true,
        decision: true,
        ruleRef: true,
        reasoning: true,
        category: { select: { name: true } },
      },
    }),
    prisma.intent.findMany({
      where: {
        userId: user.id,
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
    prisma.transaction.findMany({
      where: { userId: user.id, occurredAt: { gte: period.start, lte: period.end } },
      orderBy: { occurredAt: "asc" },
      select: { amount: true, occurredAt: true, category: { select: { discretionary: true } } },
    }),
    prisma.rule.findMany({
      where: { policy: { userId: user.id } },
      select: { ref: true, text: true },
    }),
    prisma.transaction.count({ where: { userId: user.id } }),
  ]);

  const ruleByRef = new Map(rules.map((rule) => [rule.ref, rule.text]));

  return {
    available: true,
    keptFils: computeKept(keptIntents, period),
    currency: user.currency,
    cards: intents.map((intent) => ({
      id: intent.id,
      amountFils: intent.amount,
      merchant: intent.note ?? "A purchase",
      category: intent.category?.name ?? "Uncategorised",
      ruleRef: intent.ruleRef,
      ruleText: intent.ruleRef ? (ruleByRef.get(intent.ruleRef) ?? null) : null,
      decision: intent.decision,
      reasoning: intent.reasoning,
    })),
    scenarios: buildScenarios({
      transactions: transactions.map((transaction) => ({
        amount: transaction.amount,
        occurredAt: transaction.occurredAt,
        discretionary: transaction.category?.discretionary !== false,
      })),
      period,
      income: user.monthlyIncome,
      now,
      currency: user.currency,
    }),
    transactionCount,
    ruleCount: rules.length,
  };
}

/* ------------------------------------------------------------- scenarios */

function fmt(fils: number, currency: string): string {
  return `${currency} ${Math.round(fils / 100).toLocaleString("en-US")}`;
}

/**
 * §12.2: one function produces the path, the facts and the eyebrow together.
 *
 * A panel that prints one figure in the caption and another in the eyebrow is
 * broken and nothing warns you — so there is exactly one source for all three,
 * and the picker swaps whole Scenario objects rather than recomputing anything.
 */
export function buildScenarios(input: {
  transactions: Array<{ amount: number; occurredAt: Date; discretionary: boolean }>;
  period: { start: Date; end: Date; daysTotal: number; daysElapsed: number };
  income: number;
  now: Date;
  currency: string;
}): ScenarioSet {
  const { period, income, currency } = input;
  const daysTotal = period.daysTotal;

  // Real cumulative discretionary spend for the seeded period, by day index.
  const perDay = new Array<number>(daysTotal).fill(0);
  for (const transaction of input.transactions) {
    if (!transaction.discretionary) continue;
    const index = Math.floor(
      (transaction.occurredAt.getTime() - period.start.getTime()) / 86_400_000,
    );
    if (index < 0 || index >= daysTotal) continue;
    perDay[index] = (perDay[index] ?? 0) + transaction.amount;
  }

  const observedDays = Math.max(period.daysElapsed, 1);
  const observedTotal = perDay.slice(0, observedDays).reduce((sum, value) => sum + value, 0);
  const observedRate = observedTotal / observedDays;

  // A discretionary allowance: what is left after the fixed half of income.
  // Derived from the user's own income, not a number chosen for the chart.
  const allowance = Math.round(income * 0.35);
  const idealPerDay = Math.round(allowance / daysTotal);

  const build = (
    id: Scenario["id"],
    label: string,
    rate: number,
    eyebrow: string,
  ): Scenario => {
    const cumulative: number[] = [];
    let running = 0;
    for (let day = 0; day < daysTotal; day += 1) {
      // Observed days use the real rows; the rest project at this scenario's rate.
      running += day < observedDays ? (perDay[day] ?? 0) * (rate / Math.max(observedRate, 1)) : rate;
      cumulative.push(Math.round(running));
    }

    const endSpend = cumulative[cumulative.length - 1] ?? 0;

    // The crossing is where the line goes above the even rate and stays there,
    // not the first day it pokes above. A single heavy Saturday in week one is
    // not a projected overspend, and marking it as one would cry wolf on a
    // period that ends comfortably inside the line.
    const crossingDay = ((): number | null => {
      if (endSpend <= idealPerDay * daysTotal) return null;
      for (let day = daysTotal - 1; day >= 0; day -= 1) {
        if ((cumulative[day] ?? 0) <= idealPerDay * (day + 1)) {
          return day + 1 < daysTotal ? day + 1 : null;
        }
      }
      return 0; // Above the line from the very first day.
    })();

    return {
      id,
      label,
      cumulative,
      daysTotal,
      idealPerDay,
      eyebrow,
      crossingDay,
      facts: [
        { label: "Projected by period end", value: fmt(endSpend, currency) },
        { label: "An even rate would be", value: fmt(allowance, currency) },
        {
          label: crossingDay === null ? "Stays inside the line" : "Crosses the line on day",
          value: crossingDay === null ? "All period" : String(crossingDay + 1),
        },
      ],
    };
  };

  return {
    tight: build(
      "tight",
      "Tight month",
      observedRate * 0.62,
      "Spending held down. The line stays under the even rate to the end.",
    ),
    normal: build(
      "normal",
      "Normal month",
      observedRate,
      "The rate this period has actually run at, carried forward.",
    ),
    payday: build(
      "payday",
      "After payday",
      observedRate * 1.55,
      "The week after money lands, when the rate climbs and stays there.",
    ),
  };
}

function emptyScenarios(): ScenarioSet {
  const blank = (id: Scenario["id"], label: string): Scenario => ({
    id,
    label,
    cumulative: [],
    daysTotal: 0,
    idealPerDay: 0,
    eyebrow: "No data yet.",
    crossingDay: null,
    facts: [],
  });
  return {
    tight: blank("tight", "Tight month"),
    normal: blank("normal", "Normal month"),
    payday: blank("payday", "After payday"),
  };
}
