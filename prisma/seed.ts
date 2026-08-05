/**
 * Seed data for KEPT.
 *
 * Idempotent: the seeded user is deleted (cascading to everything it owns) and
 * rewritten from a fixed PRNG seed, so re-running produces the same dataset
 * rather than a second copy of it.
 *
 * Every merchant string here is a synthetic placeholder written for this
 * repository. Nothing in this file is real transaction data, and no figure in
 * the UI is hard-coded — the app computes all of them from these rows.
 */

import { PrismaClient, type Prisma } from "@prisma/client";
import { normalizeMerchant, slugify } from "../src/lib/merchant";
import { startOfLocalDay, fromZonedWallClock, zonedParts, daysInMonth } from "../src/lib/period";
import { APP_TIMEZONE } from "../src/lib/env";

const prisma = new PrismaClient();

const SEED_USER_ID = "seeduserkept00000000001";
const TZ = APP_TIMEZONE;
const DAYS_BACK = 90;

/* ------------------------------------------------------------------ random */

/** mulberry32. Fixed seed, so the dataset is byte-identical between runs. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = mulberry32(20260805);

function intBetween(min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

function pick<T>(items: readonly T[]): T {
  const item = items[Math.floor(rng() * items.length)];
  if (item === undefined) throw new Error("pick from empty list");
  return item;
}

/* -------------------------------------------------------------- categories */

type CategorySeed = {
  slug: string;
  name: string;
  limitPerPeriod: number | null;
  discretionary: boolean;
  /** Roughly how many purchases land in this category per 90 days. */
  events: number;
  amount: [number, number];
  merchants: readonly string[];
};

const CATEGORIES: readonly CategorySeed[] = [
  {
    slug: "groceries",
    name: "Groceries",
    limitPerPeriod: 150_000,
    discretionary: true,
    events: 26,
    amount: [3_500, 18_000],
    merchants: ["CARREF 4471 DUBAI AE", "LULU HYPERMARKET SILICON OASIS", "UNION COOP AL BARSHA"],
  },
  {
    slug: "dining",
    name: "Dining",
    limitPerPeriod: 140_000,
    discretionary: true,
    events: 22,
    amount: [2_500, 9_500],
    merchants: ["KARAK HOUSE JLT", "SHAWARMA STATION", "CORNER BISTRO", "NOODLE BAR DUBAI AE"],
  },
  {
    slug: "food-delivery",
    name: "Food delivery",
    limitPerPeriod: 60_000,
    discretionary: true,
    events: 18,
    amount: [3_500, 11_000],
    merchants: ["TALABAT.COM", "CITY EATS DELIVERY"],
  },
  {
    slug: "transport",
    name: "Transport",
    limitPerPeriod: 80_000,
    discretionary: true,
    events: 20,
    amount: [1_200, 6_500],
    merchants: ["CAREEM NETWORKS FZ LLC", "ADNOC DISTRIBUTION 0092", "NOL TOP UP RTA DUBAI"],
  },
  {
    slug: "utilities",
    name: "Utilities",
    limitPerPeriod: 90_000,
    discretionary: false,
    events: 0, // covered entirely by bills
    amount: [0, 0],
    merchants: ["UTILITIES AUTHORITY"],
  },
  {
    slug: "rent",
    name: "Rent",
    limitPerPeriod: null,
    discretionary: false,
    events: 0, // covered entirely by bills
    amount: [0, 0],
    merchants: ["LANDLORD TRANSFER"],
  },
  {
    slug: "subscriptions",
    name: "Subscriptions",
    limitPerPeriod: 30_000,
    discretionary: true,
    events: 6,
    amount: [2_300, 3_900],
    merchants: ["STREAMING MONTHLY", "MUSIC MONTHLY"],
  },
  {
    slug: "clothing",
    name: "Clothing",
    limitPerPeriod: 70_000,
    discretionary: true,
    events: 6,
    amount: [12_000, 45_000],
    merchants: ["NOON COM FZ LLC DUBAI", "FASHION OUTLET MALL"],
  },
  {
    slug: "household",
    name: "Household",
    limitPerPeriod: 50_000,
    discretionary: true,
    events: 8,
    amount: [4_000, 22_000],
    merchants: ["SHARAF DG DUBAI FESTIVAL CITY", "HOMEWARE OUTLET", "LULU HYPERMARKET"],
  },
];

/* -------------------------------------------------------------------- rules */

const POLICY_BODY = `I earn 18,000 a month and I want to know where it goes without thinking about it every day.

Rent and utilities come out first. Groceries are not something I cut. Everything else is a choice, and I would rather be told to wait than be told off afterwards.

My leak is food delivery. I order it when I am tired, not when I am hungry, and I have never once been glad about it the next morning.

If something costs more than 200, I want to sleep on it.`;

const RULES: ReadonlyArray<{ ref: string; text: string; kind: Prisma.RuleCreateManyPolicyInput["kind"]; order: number }> = [
  { ref: "R-01", text: "Nothing over 200 without a 48 hour wait", kind: "HARD_RULE", order: 1 },
  { ref: "R-02", text: "No food delivery on a weekday", kind: "HARD_RULE", order: 2 },
  { ref: "R-03", text: "Dining stays under 1,400 a month", kind: "LIMIT", order: 3 },
  { ref: "R-04", text: "Clothing stays under 700 a month", kind: "LIMIT", order: 4 },
  { ref: "R-05", text: "Rent and utilities come out first, always", kind: "NONNEGOTIABLE", order: 5 },
  { ref: "R-06", text: "Groceries are never a thing to cut", kind: "NONNEGOTIABLE", order: 6 },
  { ref: "R-07", text: "Food delivery is my leak; I order it when I am tired, not hungry", kind: "LEAK", order: 7 },
  { ref: "R-08", text: "A subscription I have not opened in a month is a leak", kind: "LEAK", order: 8 },
];

/* -------------------------------------------------------------------- bills */

const BILLS: ReadonlyArray<{
  label: string;
  amount: number;
  dueDay: number;
  categorySlug: string;
  merchant: string;
}> = [
  { label: "Rent", amount: 700_000, dueDay: 1, categorySlug: "rent", merchant: "LANDLORD TRANSFER" },
  { label: "Utilities Authority", amount: 42_000, dueDay: 8, categorySlug: "utilities", merchant: "UTILITIES AUTHORITY" },
  { label: "Telecom Postpaid", amount: 30_000, dueDay: 12, categorySlug: "utilities", merchant: "TELECOM POSTPAID BILL" },
  { label: "Gym Membership", amount: 25_000, dueDay: 22, categorySlug: "subscriptions", merchant: "GYM MEMBERSHIP" },
];

/* ------------------------------------------------------------------ helpers */

function atLocalHour(day: Date, hour: number, minute: number): Date {
  const p = zonedParts(day, TZ);
  return fromZonedWallClock(p.year, p.month, p.day, hour, minute, 0, TZ);
}

function addDays(day: Date, delta: number): Date {
  const p = zonedParts(new Date(day.getTime() + delta * 86_400_000), TZ);
  return fromZonedWallClock(p.year, p.month, p.day, 0, 0, 0, TZ);
}

/* --------------------------------------------------------------------- main */

async function main(): Promise<void> {
  const now = new Date();
  const today = startOfLocalDay(now, TZ);
  const windowStart = addDays(today, -DAYS_BACK);

  // Idempotency: one delete, one rebuild. Cascades clear policy, rules,
  // categories, transactions, intents, bills, reviews, batches and counters.
  await prisma.user.deleteMany({ where: { id: SEED_USER_ID } });

  const user = await prisma.user.create({
    data: {
      id: SEED_USER_ID,
      displayName: "Sam",
      currency: "AED",
      periodType: "MONTHLY",
      periodAnchor: 1,
      monthlyIncome: 1_800_000, // AED 18,000
    },
  });

  const policy = await prisma.policy.create({
    data: { userId: user.id, body: POLICY_BODY, version: 1 },
  });

  await prisma.rule.createMany({
    data: RULES.map((rule) => ({ ...rule, policyId: policy.id })),
  });

  const categoryIdBySlug = new Map<string, string>();
  for (const category of CATEGORIES) {
    const created = await prisma.category.create({
      data: {
        userId: user.id,
        name: category.name,
        slug: category.slug,
        limitPerPeriod: category.limitPerPeriod,
        discretionary: category.discretionary,
      },
    });
    categoryIdBySlug.set(category.slug, created.id);
  }

  /* ------------------------------------------------------------ bills */

  for (const bill of BILLS) {
    await prisma.bill.create({
      data: {
        userId: user.id,
        categoryId: categoryIdBySlug.get(bill.categorySlug) ?? null,
        label: bill.label,
        amount: bill.amount,
        dueDay: bill.dueDay,
        active: true,
        detected: false,
      },
    });
  }

  /* ----------------------------------------------------- transactions */

  type Row = Prisma.TransactionCreateManyInput;
  const rows: Row[] = [];

  // Bill payments land on their due date, for every due date inside the window
  // that has already passed. This is what makes committedBills honest: a bill
  // already due this period has a matching payment sitting in spentTotal.
  for (const bill of BILLS) {
    const cursor = zonedParts(windowStart, TZ);
    for (let m = 0; m <= 4; m += 1) {
      const zero = cursor.year * 12 + (cursor.month - 1) + m;
      const year = Math.floor(zero / 12);
      const month = (((zero % 12) + 12) % 12) + 1;
      const day = Math.min(bill.dueDay, daysInMonth(year, month));
      const due = fromZonedWallClock(year, month, day, 9, 5, 0, TZ);
      if (due < windowStart || due > today) continue;

      rows.push({
        userId: user.id,
        categoryId: categoryIdBySlug.get(bill.categorySlug) ?? null,
        amount: bill.amount,
        merchantRaw: bill.merchant,
        merchant: normalizeMerchant(bill.merchant),
        occurredAt: due,
        source: "MANUAL",
        reference: `BILL-${slugify(bill.label)}-${year}${String(month).padStart(2, "0")}`,
        confidence: null,
      });
    }
  }

  // Discretionary purchases, spread across the window with jitter.
  for (const category of CATEGORIES) {
    if (category.events === 0) continue;
    const categoryId = categoryIdBySlug.get(category.slug) ?? null;
    const spacing = DAYS_BACK / category.events;

    for (let i = 0; i < category.events; i += 1) {
      const jitter = rng() * spacing * 0.8 - spacing * 0.4;
      const offset = Math.round(i * spacing + jitter);
      const clamped = Math.min(Math.max(offset, 0), DAYS_BACK);
      const day = addDays(windowStart, clamped);
      if (day > today) continue;

      const merchantRaw = pick(category.merchants);
      const amount = intBetween(category.amount[0], category.amount[1]);
      const hour = intBetween(8, 21);

      rows.push({
        userId: user.id,
        categoryId,
        amount,
        merchantRaw,
        merchant: normalizeMerchant(merchantRaw),
        occurredAt: atLocalHour(day, hour, intBetween(0, 59)),
        source: rng() < 0.75 ? "SMS" : "MANUAL",
        reference: `SEED-${category.slug.toUpperCase()}-${String(i).padStart(3, "0")}`,
        sourceText: null,
        confidence: rng() < 0.12 ? Number((0.4 + rng() * 0.19).toFixed(2)) : Number((0.82 + rng() * 0.17).toFixed(2)),
      });
    }
  }

  await prisma.transaction.createMany({ data: rows, skipDuplicates: true });

  /* ---------------------------------------------------------- intents */

  const dining = categoryIdBySlug.get("dining");
  const clothing = categoryIdBySlug.get("clothing");
  const delivery = categoryIdBySlug.get("food-delivery");
  const groceries = categoryIdBySlug.get("groceries");
  const household = categoryIdBySlug.get("household");
  if (!dining || !clothing || !delivery || !groceries || !household) {
    throw new Error("seed: category ids missing");
  }

  const hours = (n: number): Date => new Date(now.getTime() + n * 3_600_000);

  // Two waiting, one whose window has passed, one released, two resolved as
  // purchases. Decisions are chosen so Kept exercises both of its clauses: a
  // released hold, and a decline the user has not acted on.
  const intents: Prisma.IntentCreateManyInput[] = [
    {
      id: "seedintent0000000000001",
      userId: user.id,
      categoryId: dining,
      amount: 45_000,
      note: "Team lunch on Thursday",
      decision: "HOLD",
      ruleRef: "R-01",
      reasoning:
        "You have 280 left against your 1,400 dining limit and this is 450, so it does not fit without borrowing from next month. Your own rule asks for 48 hours on anything over 200.",
      affordable: true,
      state: "HELD",
      holdUntil: hours(30),
      createdAt: hours(-18),
    },
    {
      id: "seedintent0000000000002",
      userId: user.id,
      categoryId: clothing,
      amount: 89_000,
      note: "Jacket",
      decision: "HOLD",
      ruleRef: "R-04",
      reasoning:
        "This is 890 against a 700 clothing limit for the period, so it does not fit. Waiting costs you nothing and the limit resets in nine days.",
      affordable: true,
      state: "HELD",
      holdUntil: hours(11),
      createdAt: hours(-37),
    },
    {
      // The window has passed. The row stays HELD and surfaces as ready to
      // decide; expiry never releases on the user's behalf.
      id: "seedintent0000000000003",
      userId: user.id,
      categoryId: household,
      amount: 129_900,
      note: "Air fryer",
      decision: "DECLINE",
      ruleRef: "R-05",
      reasoning:
        "Rent and utilities still take 720 before this period ends, which leaves 1,299 short of safe to spend. This is not a wait, it is money that is already committed.",
      affordable: false,
      state: "HELD",
      holdUntil: hours(-6),
      createdAt: hours(-54),
    },
    {
      id: "seedintent0000000000004",
      userId: user.id,
      categoryId: delivery,
      amount: 8_200,
      note: "Late dinner",
      decision: "HOLD",
      ruleRef: "R-07",
      reasoning:
        "You have ordered delivery 14 times in 90 days and marked 8 of those as not worth it. It fits the budget, which is exactly why waiting is the useful answer.",
      affordable: true,
      state: "RELEASED",
      holdUntil: hours(-70),
      resolvedAt: hours(-64),
      createdAt: hours(-118),
    },
    {
      id: "seedintent0000000000005",
      userId: user.id,
      categoryId: groceries,
      amount: 16_400,
      note: "Weekly shop",
      decision: "ALLOW",
      ruleRef: "R-06",
      reasoning:
        "Groceries sit inside your limit with 640 left and your own policy puts them outside the things you cut. Nothing here needs a wait.",
      affordable: true,
      state: "PURCHASED",
      resolvedAt: hours(-96),
      createdAt: hours(-97),
    },
    {
      id: "seedintent0000000000006",
      userId: user.id,
      categoryId: dining,
      amount: 21_500,
      note: "Birthday dinner",
      decision: "HOLD",
      ruleRef: "R-03",
      reasoning:
        "This takes dining to 1,335 of your 1,400 limit with eleven days still to go. It fits today, but it leaves almost nothing behind it.",
      affordable: true,
      state: "PURCHASED",
      resolvedAt: hours(-140),
      createdAt: hours(-160),
    },
  ];

  await prisma.intent.createMany({ data: intents });

  // The two purchased intents each own a transaction, source INTENT.
  for (const intent of intents.filter((i) => i.state === "PURCHASED")) {
    const resolvedAt = intent.resolvedAt as Date;
    await prisma.transaction.create({
      data: {
        userId: user.id,
        categoryId: intent.categoryId,
        amount: intent.amount,
        merchantRaw: intent.note ?? "Logged from a verdict",
        merchant: normalizeMerchant(intent.note ?? "Logged from a verdict"),
        occurredAt: resolvedAt,
        source: "INTENT",
        reference: intent.id as string,
        intentId: intent.id as string,
      },
    });
  }

  /* ---------------------------------------------------------- reviews */

  // The skew the verdict prompt reads as evidence: delivery and dining mostly
  // not worth it, groceries and transport mostly worth it.
  const REVIEW_PLAN: ReadonlyArray<{ slug: string; verdicts: readonly boolean[] }> = [
    { slug: "dining", verdicts: [false, false, false, false, true] },
    { slug: "food-delivery", verdicts: [false, false, false] },
    { slug: "groceries", verdicts: [true, true, true] },
    { slug: "transport", verdicts: [true, true] },
    { slug: "clothing", verdicts: [false] },
  ];

  const reviewCutoff = addDays(today, -7);
  let reviewCount = 0;

  for (const plan of REVIEW_PLAN) {
    const categoryId = categoryIdBySlug.get(plan.slug);
    if (!categoryId) continue;

    const candidates = await prisma.transaction.findMany({
      where: { userId: user.id, categoryId, occurredAt: { lt: reviewCutoff } },
      orderBy: { occurredAt: "desc" },
      take: plan.verdicts.length,
      select: { id: true, occurredAt: true },
    });

    for (const [index, tx] of candidates.entries()) {
      const worthIt = plan.verdicts[index];
      if (worthIt === undefined) continue;
      await prisma.review.create({
        data: {
          transactionId: tx.id,
          worthIt,
          askedAt: new Date(tx.occurredAt.getTime() + 7 * 86_400_000),
          answeredAt: new Date(tx.occurredAt.getTime() + 7 * 86_400_000 + 3_600_000),
        },
      });
      reviewCount += 1;
    }
  }

  // One unanswered review so /review has a real queue rather than an empty one.
  const pending = await prisma.transaction.findFirst({
    where: {
      userId: user.id,
      categoryId: categoryIdBySlug.get("dining"),
      occurredAt: { lt: reviewCutoff },
      review: null,
    },
    orderBy: { occurredAt: "desc" },
    select: { id: true, occurredAt: true },
  });
  if (pending) {
    await prisma.review.create({
      data: {
        transactionId: pending.id,
        worthIt: null,
        askedAt: new Date(pending.occurredAt.getTime() + 7 * 86_400_000),
      },
    });
  }

  /* ----------------------------------------------------------- report */

  const [txCount, intentCount, billCount, categoryCount] = await Promise.all([
    prisma.transaction.count({ where: { userId: user.id } }),
    prisma.intent.count({ where: { userId: user.id } }),
    prisma.bill.count({ where: { userId: user.id } }),
    prisma.category.count({ where: { userId: user.id } }),
  ]);

  console.log(
    [
      "seeded",
      `user       ${user.displayName} (${user.id})`,
      `categories ${categoryCount}`,
      `rules      ${RULES.length}`,
      `bills      ${billCount}`,
      `txns       ${txCount}`,
      `intents    ${intentCount}`,
      `reviews    ${reviewCount} answered${pending ? " + 1 pending" : ""}`,
    ].join("\n  "),
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
