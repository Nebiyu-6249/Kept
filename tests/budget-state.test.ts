import { describe, expect, it } from "vitest";
import { assembleBudgetState, committedBillsTotal, type BudgetInput } from "@/lib/budget-state";
import { currentPeriod } from "@/lib/period";

const TZ = "Asia/Dubai";
const NOW = new Date("2026-08-11T09:00:00Z"); // local 11 Aug, day 11 of 31
const period = currentPeriod({ periodType: "MONTHLY", periodAnchor: 1 }, NOW, TZ);

const categories = [
  { id: "c-groceries", slug: "groceries", limitPerPeriod: 150_000, discretionary: true },
  { id: "c-dining", slug: "dining", limitPerPeriod: 140_000, discretionary: true },
  { id: "c-rent", slug: "rent", limitPerPeriod: null, discretionary: false },
];

function build(over: Partial<BudgetInput> = {}) {
  return assembleBudgetState({
    period,
    income: 1_800_000,
    bills: [],
    transactions: [],
    categories,
    heldIntents: [],
    keptIntents: [],
    now: NOW,
    timeZone: TZ,
    ...over,
  });
}

describe("assembleBudgetState", () => {
  it("reports the period in the contract's shape", () => {
    const state = build();
    expect(state.period).toEqual({
      start: period.start.toISOString(),
      end: period.end.toISOString(),
      daysRemaining: 20,
      daysTotal: 31,
    });
  });

  it("lists every category, including ones with no spend", () => {
    const state = build();
    expect(Object.keys(state.spentByCategory).sort()).toEqual(["dining", "groceries", "rent"]);
    expect(state.spentByCategory.groceries).toEqual({
      spent: 0,
      limit: 150_000,
      remaining: 150_000,
    });
  });

  it("carries a null limit through as a null remaining", () => {
    const state = build();
    expect(state.spentByCategory.rent).toEqual({ spent: 0, limit: null, remaining: null });
  });

  it("totals spend and splits it by category", () => {
    const state = build({
      transactions: [
        { amount: 12_000, categoryId: "c-groceries" },
        { amount: 8_000, categoryId: "c-groceries" },
        { amount: 45_000, categoryId: "c-dining" },
      ],
    });
    expect(state.spentTotal).toBe(65_000);
    expect(state.spentByCategory.groceries).toEqual({
      spent: 20_000,
      limit: 150_000,
      remaining: 130_000,
    });
  });

  it("counts uncategorised spend in the total but in no category", () => {
    const state = build({
      transactions: [
        { amount: 10_000, categoryId: null },
        { amount: 5_000, categoryId: "c-dining" },
      ],
    });
    expect(state.spentTotal).toBe(15_000);
    expect(state.spentByCategory.dining?.spent).toBe(5_000);
  });

  it("lets a category remaining go negative rather than hiding an overspend", () => {
    const state = build({ transactions: [{ amount: 160_000, categoryId: "c-groceries" }] });
    expect(state.spentByCategory.groceries?.remaining).toBe(-10_000);
  });

  it("divides burn by elapsed days, counting today", () => {
    const state = build({ transactions: [{ amount: 110_000, categoryId: "c-dining" }] });
    // 110000 over 11 elapsed days.
    expect(state.dailyBurn).toBe(10_000);
  });

  it("projects the run rate over the days that are actually left", () => {
    const state = build({ transactions: [{ amount: 110_000, categoryId: "c-dining" }] });
    expect(state.projectedEndSpend).toBe(110_000 + 10_000 * 20);
  });

  it("burns zero rather than NaN when nothing has been spent", () => {
    const state = build();
    expect(state.dailyBurn).toBe(0);
    expect(state.projectedEndSpend).toBe(0);
  });

  it("subtracts bills, spend and holds from income for safe-to-spend", () => {
    const state = build({
      transactions: [{ amount: 300_000, categoryId: "c-groceries" }],
      bills: [{ amount: 800_000, dueDay: 25, active: true }],
      heldIntents: [{ amount: 45_000 }],
    });
    expect(state.committedBills).toBe(800_000);
    expect(state.heldTotal).toBe(45_000);
    expect(state.safeToSpend).toBe(1_800_000 - 800_000 - 300_000 - 45_000);
  });

  it("lets safe-to-spend go negative rather than clamping a real overspend", () => {
    const state = build({ transactions: [{ amount: 2_000_000, categoryId: "c-groceries" }] });
    expect(state.safeToSpend).toBeLessThan(0);
  });

  it("keeps a lump-sum bill out of the discretionary burn", () => {
    const state = build({
      transactions: [
        { amount: 700_000, categoryId: "c-rent" },
        { amount: 110_000, categoryId: "c-dining" },
      ],
    });
    // dailyBurn follows §6.2 exactly and is dominated by the rent payment.
    expect(state.spentTotal).toBe(810_000);
    expect(state.dailyBurn).toBe(Math.round(810_000 / 11));
    // The discretionary companion is what the burn line reads.
    expect(state.spentDiscretionary).toBe(110_000);
    expect(state.dailyBurnDiscretionary).toBe(10_000);
    expect(state.projectedEndSpendDiscretionary).toBe(110_000 + 10_000 * 20);
  });

  it("treats uncategorised spend as discretionary", () => {
    const state = build({ transactions: [{ amount: 9_000, categoryId: null }] });
    expect(state.spentDiscretionary).toBe(9_000);
  });

  it("takes Kept from the same rule the metric is defined by", () => {
    const state = build({
      keptIntents: [
        {
          amount: 45_000,
          decision: "HOLD",
          state: "RELEASED",
          createdAt: NOW,
          resolvedAt: NOW,
        },
        {
          amount: 60_000,
          decision: "HOLD",
          state: "PURCHASED",
          createdAt: NOW,
          resolvedAt: NOW,
        },
      ],
    });
    expect(state.kept).toBe(45_000);
  });
});

describe("committedBillsTotal", () => {
  const bill = (over: Partial<{ amount: number; dueDay: number; active: boolean }> = {}) => ({
    amount: 100_000,
    dueDay: 25,
    active: true,
    ...over,
  });

  it("counts a bill still ahead of today", () => {
    expect(committedBillsTotal([bill({ dueDay: 25 })], period, NOW, TZ)).toBe(100_000);
  });

  it("counts a bill due today", () => {
    expect(committedBillsTotal([bill({ dueDay: 11 })], period, NOW, TZ)).toBe(100_000);
  });

  it("skips a bill already due this period, because its payment is in spentTotal", () => {
    expect(committedBillsTotal([bill({ dueDay: 3 })], period, NOW, TZ)).toBe(0);
  });

  it("skips inactive bills", () => {
    expect(committedBillsTotal([bill({ dueDay: 25, active: false })], period, NOW, TZ)).toBe(0);
  });

  it("sums several bills", () => {
    expect(
      committedBillsTotal(
        [bill({ dueDay: 25, amount: 100_000 }), bill({ dueDay: 28, amount: 30_000 })],
        period,
        NOW,
        TZ,
      ),
    ).toBe(130_000);
  });
});
