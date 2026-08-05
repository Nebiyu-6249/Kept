/**
 * Builds evals/fixtures/verdict.json.
 *
 * The fixtures are generated rather than hand-typed so every budget_state in
 * them is internally consistent: safe_to_spend really is income minus committed
 * bills minus spend minus holds, and a category's remaining really is its limit
 * minus its spend. A fixture whose arithmetic does not add up tests nothing.
 *
 *   npx tsx evals/build-fixtures.ts
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { SEED_ALERTS } from "../prisma/seed-sms";

type Cat = { spent: number; limit: number | null };

type Rule = { ref: string; kind: "LIMIT" | "NONNEGOTIABLE" | "LEAK" | "HARD_RULE"; text: string };

const RULES = {
  wait200: {
    ref: "R-01",
    kind: "HARD_RULE",
    text: "Nothing over 200 without a 48 hour wait",
  },
  noWeekdayDelivery: {
    ref: "R-02",
    kind: "HARD_RULE",
    text: "No food delivery on a weekday",
  },
  noClothes: {
    ref: "R-03",
    kind: "HARD_RULE",
    text: "No new clothes until I have worn everything I already own",
  },
  diningLimit: { ref: "R-04", kind: "LIMIT", text: "Dining stays under 1,400 a period" },
  clothingLimit: { ref: "R-05", kind: "LIMIT", text: "Clothing stays under 700 a period" },
  billsFirst: {
    ref: "R-06",
    kind: "NONNEGOTIABLE",
    text: "Rent and utilities come out first, always",
  },
  groceriesSafe: {
    ref: "R-07",
    kind: "NONNEGOTIABLE",
    text: "Groceries are never a thing to cut",
  },
  deliveryLeak: {
    ref: "R-08",
    kind: "LEAK",
    text: "Food delivery is my leak; I order it when I am tired, not hungry",
  },
} satisfies Record<string, Rule>;

const STANDARD_RULES: Rule[] = [
  RULES.wait200,
  RULES.noWeekdayDelivery,
  RULES.diningLimit,
  RULES.clothingLimit,
  RULES.billsFirst,
  RULES.groceriesSafe,
  RULES.deliveryLeak,
];

/**
 * The boundary cases test arithmetic against a limit, so they run without the
 * 200 threshold rule. With it in play, every boundary amount above 200 would be
 * a hold on the rule alone and the case would stop testing the boundary.
 */
const BOUNDARY_RULES: Rule[] = STANDARD_RULES.filter((rule) => rule.ref !== RULES.wait200.ref);

/** Builds a budget_state whose figures agree with each other. */
function budget(options: {
  categories: Record<string, Cat>;
  income?: number;
  committedBills?: number;
  heldTotal?: number;
  kept?: number;
  daysRemaining?: number;
  daysTotal?: number;
  /** Spend that sits outside the listed categories, e.g. rent already paid. */
  otherSpent?: number;
}) {
  const income = options.income ?? 1_800_000;
  const committedBills = options.committedBills ?? 97_000;
  const heldTotal = options.heldTotal ?? 0;
  const daysTotal = options.daysTotal ?? 31;
  const daysRemaining = options.daysRemaining ?? 11;
  const daysElapsed = daysTotal - daysRemaining;

  const listed = Object.values(options.categories).reduce((sum, c) => sum + c.spent, 0);
  const spentTotal = listed + (options.otherSpent ?? 0);

  const spentByCategory: Record<
    string,
    { spent: number; limit: number | null; remaining: number | null }
  > = {};
  for (const [slug, cat] of Object.entries(options.categories)) {
    spentByCategory[slug] = {
      spent: cat.spent,
      limit: cat.limit,
      remaining: cat.limit === null ? null : cat.limit - cat.spent,
    };
  }

  const dailyBurn = Math.round(spentTotal / Math.max(daysElapsed, 1));

  return {
    period: {
      start: "2026-08-01T00:00:00.000Z",
      end: "2026-08-31T23:59:59.999Z",
      daysRemaining,
      daysTotal,
    },
    income,
    committedBills,
    spentTotal,
    spentByCategory,
    heldTotal,
    kept: options.kept ?? 0,
    dailyBurn,
    projectedEndSpend: spentTotal + dailyBurn * daysRemaining,
    safeToSpend: income - committedBills - spentTotal - heldTotal,
  };
}

function history(over: Partial<{
  purchases_last_90d: number;
  reviewed: number;
  not_worth_it: number;
  median_amount_fils: number;
}> = {}) {
  return {
    purchases_last_90d: 12,
    reviewed: 8,
    not_worth_it: 1,
    median_amount_fils: 6_200,
    ...over,
  };
}

type Case = {
  id: string;
  why: string;
  input: {
    request: { amount_fils: number; category: string; note?: string };
    budget_state: ReturnType<typeof budget>;
    category_history: ReturnType<typeof history>;
    rules: Rule[];
  };
  expect: { decision: "allow" | "hold" | "decline"; rule_ref?: string };
};

/** A roomy period: plenty of headroom everywhere. */
const roomy = {
  groceries: { spent: 30_000, limit: 150_000 },
  dining: { spent: 40_000, limit: 140_000 },
  "food-delivery": { spent: 40_000, limit: 60_000 },
  transport: { spent: 20_000, limit: 80_000 },
  clothing: { spent: 25_000, limit: 70_000 },
  household: { spent: 10_000, limit: 50_000 },
  subscriptions: { spent: 28_000, limit: 30_000 },
} satisfies Record<string, Cat>;

const CASES: Case[] = [
  /* ---------------------------------------------- 6 clear allows */
  {
    id: "allow-groceries-small",
    why: "Well inside the limit, a non-negotiable category, good history.",
    input: {
      request: { amount_fils: 6_500, category: "groceries", note: "weekly shop" },
      budget_state: budget({ categories: roomy, otherSpent: 700_000 }),
      category_history: history({ purchases_last_90d: 26, reviewed: 12, not_worth_it: 0 }),
      rules: STANDARD_RULES,
    },
    expect: { decision: "allow" },
  },
  {
    id: "allow-transport-commute",
    why: "Small, inside the limit, and the history says these are worth it.",
    input: {
      request: { amount_fils: 3_200, category: "transport", note: "ride to work" },
      budget_state: budget({ categories: roomy, otherSpent: 700_000 }),
      category_history: history({ purchases_last_90d: 20, reviewed: 9, not_worth_it: 1 }),
      rules: STANDARD_RULES,
    },
    expect: { decision: "allow" },
  },
  {
    id: "allow-groceries-bigger-shop",
    why: "120,000 of headroom against a 12,000 request.",
    input: {
      request: { amount_fils: 12_000, category: "groceries", note: "month stock up" },
      budget_state: budget({ categories: roomy, otherSpent: 600_000 }),
      category_history: history({ purchases_last_90d: 26, reviewed: 14, not_worth_it: 1 }),
      rules: STANDARD_RULES,
    },
    expect: { decision: "allow" },
  },
  {
    id: "allow-household-replacement",
    why: "40,000 remaining, 8,000 request, nothing marked not worth it.",
    input: {
      request: { amount_fils: 8_000, category: "household", note: "kettle" },
      budget_state: budget({ categories: roomy, otherSpent: 600_000 }),
      category_history: history({ purchases_last_90d: 8, reviewed: 3, not_worth_it: 0 }),
      rules: STANDARD_RULES,
    },
    expect: { decision: "allow" },
  },
  {
    id: "allow-dining-modest",
    why: "100,000 left in dining, a 4,500 request, history mostly positive.",
    input: {
      request: { amount_fils: 4_500, category: "dining", note: "lunch" },
      budget_state: budget({ categories: roomy, otherSpent: 600_000 }),
      category_history: history({ purchases_last_90d: 22, reviewed: 6, not_worth_it: 1 }),
      rules: STANDARD_RULES,
    },
    expect: { decision: "allow" },
  },
  {
    id: "allow-untracked-category",
    why: "No limit on the category and a large safe-to-spend.",
    input: {
      request: { amount_fils: 1_500, category: "transport", note: "bus fare" },
      budget_state: budget({
        categories: { ...roomy, transport: { spent: 20_000, limit: null } },
        otherSpent: 500_000,
      }),
      category_history: history({ purchases_last_90d: 20, reviewed: 8, not_worth_it: 0 }),
      rules: STANDARD_RULES,
    },
    expect: { decision: "allow" },
  },

  /* ----------------------------------------------- 8 clear holds */
  {
    id: "hold-delivery-leak",
    why: "Affordable and inside the limit, but 8 of 11 reviews said not worth it.",
    input: {
      request: { amount_fils: 8_500, category: "food-delivery", note: "Saturday, late dinner" },
      budget_state: budget({ categories: roomy, otherSpent: 600_000 }),
      category_history: history({ purchases_last_90d: 14, reviewed: 11, not_worth_it: 8 }),
      rules: STANDARD_RULES,
    },
    expect: { decision: "hold" },
  },
  {
    id: "hold-dining-over-limit",
    why: "Affordable overall but past what dining has left.",
    input: {
      request: { amount_fils: 45_000, category: "dining", note: "team dinner" },
      budget_state: budget({
        categories: { ...roomy, dining: { spent: 112_000, limit: 140_000 } },
        otherSpent: 600_000,
      }),
      category_history: history({ purchases_last_90d: 22, reviewed: 10, not_worth_it: 4 }),
      rules: STANDARD_RULES,
    },
    expect: { decision: "hold" },
  },
  {
    id: "hold-clothing-over-limit",
    why: "12,000 left in clothing against an 89,000 request, still affordable overall.",
    input: {
      request: { amount_fils: 89_000, category: "clothing", note: "jacket" },
      budget_state: budget({
        categories: { ...roomy, clothing: { spent: 58_000, limit: 70_000 } },
        otherSpent: 500_000,
      }),
      category_history: history({ purchases_last_90d: 6, reviewed: 4, not_worth_it: 2 }),
      rules: STANDARD_RULES,
    },
    expect: { decision: "hold" },
  },
  {
    id: "hold-delivery-just-over",
    why: "5,000 left, 6,000 asked. Over the category, well inside the money.",
    input: {
      request: { amount_fils: 6_000, category: "food-delivery", note: "Saturday lunch" },
      budget_state: budget({
        categories: { ...roomy, "food-delivery": { spent: 55_000, limit: 60_000 } },
        otherSpent: 500_000,
      }),
      category_history: history({ purchases_last_90d: 18, reviewed: 9, not_worth_it: 6 }),
      rules: STANDARD_RULES,
    },
    expect: { decision: "hold" },
  },
  {
    id: "hold-household-over-limit",
    why: "15,000 remaining against 35,000 asked.",
    input: {
      request: { amount_fils: 35_000, category: "household", note: "shelving" },
      budget_state: budget({
        categories: { ...roomy, household: { spent: 35_000, limit: 50_000 } },
        otherSpent: 500_000,
      }),
      category_history: history({ purchases_last_90d: 8, reviewed: 4, not_worth_it: 2 }),
      rules: STANDARD_RULES,
    },
    expect: { decision: "hold" },
  },
  {
    id: "hold-subscription-over-limit",
    why: "2,000 left in subscriptions, 4,500 asked, and it is a recurring commitment.",
    input: {
      request: { amount_fils: 4_500, category: "subscriptions", note: "another streaming service" },
      budget_state: budget({ categories: roomy, otherSpent: 500_000 }),
      category_history: history({ purchases_last_90d: 6, reviewed: 4, not_worth_it: 3 }),
      rules: STANDARD_RULES,
    },
    expect: { decision: "hold" },
  },
  {
    id: "hold-dining-history-against",
    why: "Fits the limit comfortably, but 9 of 12 reviews said not worth it.",
    input: {
      request: { amount_fils: 22_000, category: "dining", note: "dinner out" },
      budget_state: budget({ categories: roomy, otherSpent: 500_000 }),
      category_history: history({ purchases_last_90d: 22, reviewed: 12, not_worth_it: 9 }),
      rules: STANDARD_RULES,
    },
    expect: { decision: "hold" },
  },
  {
    id: "hold-clothing-history-against",
    why: "45,000 of room, but 5 of 6 clothing reviews were regrets.",
    input: {
      request: { amount_fils: 30_000, category: "clothing", note: "shoes" },
      budget_state: budget({
        categories: { ...roomy, clothing: { spent: 25_000, limit: 70_000 } },
        otherSpent: 500_000,
      }),
      category_history: history({ purchases_last_90d: 6, reviewed: 6, not_worth_it: 5 }),
      rules: STANDARD_RULES,
    },
    expect: { decision: "hold" },
  },

  /* -------------------------------------------- 4 clear declines */
  {
    id: "decline-clothing-no-money",
    why: "40,000 safe to spend against a 250,000 request.",
    input: {
      request: { amount_fils: 250_000, category: "clothing", note: "coat" },
      budget_state: budget({
        categories: roomy,
        otherSpent: 1_470_000,
        committedBills: 97_000,
      }),
      category_history: history({ purchases_last_90d: 6, reviewed: 4, not_worth_it: 2 }),
      rules: STANDARD_RULES,
    },
    expect: { decision: "decline" },
  },
  {
    id: "decline-household-no-money",
    why: "12,000 safe to spend against 180,000.",
    input: {
      request: { amount_fils: 180_000, category: "household", note: "sofa" },
      budget_state: budget({
        categories: roomy,
        otherSpent: 1_498_000,
        committedBills: 97_000,
      }),
      category_history: history({ purchases_last_90d: 8, reviewed: 3, not_worth_it: 1 }),
      rules: STANDARD_RULES,
    },
    expect: { decision: "decline" },
  },
  {
    id: "decline-already-overspent",
    why: "Safe to spend is already negative before this is added.",
    input: {
      request: { amount_fils: 90_000, category: "dining", note: "birthday" },
      budget_state: budget({
        categories: roomy,
        otherSpent: 1_535_000,
        committedBills: 97_000,
      }),
      category_history: history({ purchases_last_90d: 22, reviewed: 10, not_worth_it: 5 }),
      rules: STANDARD_RULES,
    },
    expect: { decision: "decline" },
  },
  {
    id: "decline-transport-no-money",
    why: "60,000 left, 150,000 asked, and the bills are still to come.",
    input: {
      request: { amount_fils: 150_000, category: "transport", note: "car service" },
      budget_state: budget({
        categories: roomy,
        otherSpent: 1_450_000,
        committedBills: 97_000,
      }),
      category_history: history({ purchases_last_90d: 20, reviewed: 8, not_worth_it: 1 }),
      rules: STANDARD_RULES,
    },
    expect: { decision: "decline" },
  },

  /* --------------------- 6 boundary cases, within 5% of a limit */
  {
    id: "boundary-dining-just-under",
    why: "97,000 asked against 100,000 remaining: it fits, barely.",
    input: {
      request: { amount_fils: 97_000, category: "dining", note: "group dinner" },
      budget_state: budget({
        categories: { ...roomy, dining: { spent: 40_000, limit: 140_000 } },
        otherSpent: 500_000,
      }),
      category_history: history({ purchases_last_90d: 22, reviewed: 8, not_worth_it: 1 }),
      rules: BOUNDARY_RULES,
    },
    expect: { decision: "allow" },
  },
  {
    id: "boundary-dining-just-over",
    why: "102,000 asked against 100,000 remaining: over by 2%, still affordable.",
    input: {
      request: { amount_fils: 102_000, category: "dining", note: "group dinner" },
      budget_state: budget({
        categories: { ...roomy, dining: { spent: 40_000, limit: 140_000 } },
        otherSpent: 500_000,
      }),
      category_history: history({ purchases_last_90d: 22, reviewed: 8, not_worth_it: 1 }),
      rules: BOUNDARY_RULES,
    },
    expect: { decision: "hold" },
  },
  {
    id: "boundary-transport-just-under",
    why: "59,000 against 60,000 remaining.",
    input: {
      request: { amount_fils: 59_000, category: "transport", note: "tyres" },
      budget_state: budget({ categories: roomy, otherSpent: 500_000 }),
      category_history: history({ purchases_last_90d: 20, reviewed: 8, not_worth_it: 0 }),
      rules: BOUNDARY_RULES,
    },
    expect: { decision: "allow" },
  },
  {
    id: "boundary-transport-just-over",
    why: "61,500 against 60,000 remaining: 2.5% over, affordable.",
    input: {
      request: { amount_fils: 61_500, category: "transport", note: "tyres" },
      budget_state: budget({ categories: roomy, otherSpent: 500_000 }),
      category_history: history({ purchases_last_90d: 20, reviewed: 8, not_worth_it: 0 }),
      rules: BOUNDARY_RULES,
    },
    expect: { decision: "hold" },
  },
  {
    id: "boundary-safe-to-spend-just-under",
    why: "49,000 against 50,000 safe to spend, on an untracked category.",
    input: {
      request: { amount_fils: 49_000, category: "household", note: "desk" },
      budget_state: budget({
        categories: { ...roomy, household: { spent: 10_000, limit: null } },
        otherSpent: 1_460_000,
        committedBills: 97_000,
      }),
      category_history: history({ purchases_last_90d: 8, reviewed: 4, not_worth_it: 0 }),
      rules: BOUNDARY_RULES,
    },
    expect: { decision: "allow" },
  },
  {
    id: "boundary-safe-to-spend-just-over",
    why: "51,000 against 50,000 safe to spend: the money is not there.",
    input: {
      request: { amount_fils: 51_000, category: "household", note: "desk" },
      budget_state: budget({
        categories: { ...roomy, household: { spent: 10_000, limit: null } },
        otherSpent: 1_460_000,
        committedBills: 97_000,
      }),
      category_history: history({ purchases_last_90d: 8, reviewed: 4, not_worth_it: 0 }),
      rules: BOUNDARY_RULES,
    },
    expect: { decision: "decline" },
  },

  /* ------------- 4 cases where a hard rule beats the arithmetic */
  {
    id: "rule-wins-wait-over-200",
    why: "450 is over the 200 threshold. The money is plainly there; the rule still asks for 48 hours.",
    input: {
      request: { amount_fils: 45_000, category: "household", note: "headphones" },
      budget_state: budget({
        categories: { ...roomy, household: { spent: 5_000, limit: 200_000 } },
        otherSpent: 300_000,
      }),
      category_history: history({ purchases_last_90d: 8, reviewed: 5, not_worth_it: 1 }),
      rules: STANDARD_RULES,
    },
    expect: { decision: "hold", rule_ref: "R-01" },
  },
  {
    id: "rule-wins-weekday-delivery",
    why: "A hard rule forbids it outright, and the arithmetic is comfortable.",
    input: {
      request: {
        amount_fils: 6_000,
        category: "food-delivery",
        note: "Tuesday lunch at my desk",
      },
      budget_state: budget({ categories: roomy, otherSpent: 300_000 }),
      category_history: history({ purchases_last_90d: 18, reviewed: 9, not_worth_it: 5 }),
      rules: STANDARD_RULES,
    },
    expect: { decision: "decline", rule_ref: "R-02" },
  },
  {
    id: "rule-wins-no-new-clothes",
    why: "Affordable, inside the limit, and forbidden by the user's own hard rule.",
    input: {
      request: { amount_fils: 30_000, category: "clothing", note: "new jeans" },
      budget_state: budget({
        categories: { ...roomy, clothing: { spent: 5_000, limit: 70_000 } },
        otherSpent: 300_000,
      }),
      category_history: history({ purchases_last_90d: 6, reviewed: 3, not_worth_it: 1 }),
      rules: [...STANDARD_RULES, RULES.noClothes],
    },
    expect: { decision: "decline", rule_ref: "R-03" },
  },
  {
    id: "rule-wins-just-over-threshold",
    why: "201 is over 200 by one, with a very large safe-to-spend behind it.",
    input: {
      request: { amount_fils: 20_100, category: "household", note: "lamp" },
      budget_state: budget({
        categories: { ...roomy, household: { spent: 5_000, limit: 200_000 } },
        otherSpent: 200_000,
      }),
      category_history: history({ purchases_last_90d: 8, reviewed: 4, not_worth_it: 0 }),
      rules: STANDARD_RULES,
    },
    expect: { decision: "hold", rule_ref: "R-01" },
  },

  /* ---------------------------- 2 cases with no applicable rule */
  {
    id: "no-rules-affordable",
    why: "An empty policy. Nothing to cite, and the arithmetic is comfortable.",
    input: {
      request: { amount_fils: 9_000, category: "groceries", note: "shop" },
      budget_state: budget({
        categories: { groceries: { spent: 70_000, limit: 150_000 } },
        otherSpent: 600_000,
      }),
      category_history: history({ purchases_last_90d: 26, reviewed: 10, not_worth_it: 1 }),
      rules: [],
    },
    expect: { decision: "allow" },
  },
  {
    id: "no-rules-not-affordable",
    why: "An empty policy and not enough money.",
    input: {
      request: { amount_fils: 120_000, category: "clothing", note: "coat" },
      budget_state: budget({
        categories: { clothing: { spent: 25_000, limit: 70_000 } },
        otherSpent: 1_648_000,
        committedBills: 97_000,
      }),
      category_history: history({ purchases_last_90d: 6, reviewed: 3, not_worth_it: 1 }),
      rules: [],
    },
    expect: { decision: "decline" },
  },
];

/* --------------------------------------------------------- parse fixtures */

type ParseExpect = {
  is_transaction: boolean;
  amount_fils: number | null;
  merchant?: string;
  /** For the unreadable-amount case: confidence must be below this. */
  max_confidence?: number;
};

const PARSE_EXPECT: Record<string, ParseExpect> = {
  a01: { is_transaction: true, amount_fils: 24_550, merchant: "Carrefour" },
  a02: { is_transaction: true, amount_fils: 6_200, merchant: "Talabat" },
  a03: { is_transaction: true, amount_fils: 1_800, merchant: "Careem" },
  a04: { is_transaction: true, amount_fils: 34_000, merchant: "Lulu" },
  a05: { is_transaction: true, amount_fils: 124_000, merchant: "Carrefour" },
  a06: { is_transaction: false, amount_fils: null },
  a07: { is_transaction: false, amount_fils: null },
  a08: { is_transaction: false, amount_fils: null },
  a09: { is_transaction: true, amount_fils: null, max_confidence: 0.3 },
  a10: { is_transaction: true, amount_fils: 8_975, merchant: "Union Coop" },
  a11: { is_transaction: true, amount_fils: 5_500, merchant: "Adnoc" },
  a12: { is_transaction: false, amount_fils: null },
  a13: { is_transaction: true, amount_fils: 42_000, merchant: "Noon" },
  a14: { is_transaction: true, amount_fils: 70_000, merchant: "Landlord Transfer" },
  a15: { is_transaction: true, amount_fils: 3_250, merchant: "Karak House" },
  a16: { is_transaction: true, amount_fils: 7_625, merchant: "Shawarma Station" },
  a17: { is_transaction: true, amount_fils: 24_000, merchant: "Telecom Postpaid" },
  a18: { is_transaction: false, amount_fils: null },
  a19: { is_transaction: true, amount_fils: 1_500, merchant: "Nol Top Up" },
  a20: { is_transaction: true, amount_fils: 149_900, merchant: "Sharaf DG" },
};

/* ------------------------------------------------------------------ write */

const dir = join(process.cwd(), "evals", "fixtures");
mkdirSync(dir, { recursive: true });

writeFileSync(join(dir, "verdict.json"), `${JSON.stringify(CASES, null, 2)}\n`);

const parseCases = SEED_ALERTS.map((alert) => {
  const expected = PARSE_EXPECT[alert.id];
  if (!expected) throw new Error(`No expectation for alert ${alert.id}`);
  return { id: alert.id, why: alert.note, input: { message: alert.text }, expect: expected };
});

writeFileSync(join(dir, "parse.json"), `${JSON.stringify(parseCases, null, 2)}\n`);

const counts = CASES.reduce<Record<string, number>>((acc, c) => {
  acc[c.expect.decision] = (acc[c.expect.decision] ?? 0) + 1;
  return acc;
}, {});

console.log(
  `wrote ${CASES.length} verdict cases (${JSON.stringify(counts)}) and ${parseCases.length} parse cases`,
);
