import { describe, expect, it } from "vitest";
import {
  computeKept,
  countsTowardKept,
  holdConversion,
  keptEffectiveDate,
  type KeptIntent,
} from "@/lib/kept";

const period = {
  start: new Date("2026-07-31T20:00:00.000Z"), // local 01 Aug, Dubai
  end: new Date("2026-08-31T19:59:59.999Z"), // local 31 Aug 23:59:59.999
};

const inside = new Date("2026-08-10T09:00:00Z");
const before = new Date("2026-07-20T09:00:00Z");
const after = new Date("2026-09-10T09:00:00Z");

function intent(over: Partial<KeptIntent> = {}): KeptIntent {
  return {
    amount: 10_000,
    decision: "HOLD",
    state: "RELEASED",
    createdAt: inside,
    resolvedAt: inside,
    ...over,
  };
}

describe("countsTowardKept", () => {
  it("counts a released hold", () => {
    expect(countsTowardKept({ decision: "HOLD", state: "RELEASED" })).toBe(true);
  });

  it("counts a decline that was not bought, in every non-purchased state", () => {
    for (const state of ["OPEN", "HELD", "RELEASED", "EXPIRED"] as const) {
      expect(countsTowardKept({ decision: "DECLINE", state })).toBe(true);
    }
  });

  it("does not count a decline the user bought anyway", () => {
    expect(countsTowardKept({ decision: "DECLINE", state: "PURCHASED" })).toBe(false);
  });

  it("does not count a hold that became a purchase", () => {
    expect(countsTowardKept({ decision: "HOLD", state: "PURCHASED" })).toBe(false);
  });

  it("does not count an allow that is still open or was bought", () => {
    expect(countsTowardKept({ decision: "ALLOW", state: "OPEN" })).toBe(false);
    expect(countsTowardKept({ decision: "ALLOW", state: "PURCHASED" })).toBe(false);
    expect(countsTowardKept({ decision: "ALLOW", state: "HELD" })).toBe(false);
  });
});

describe("keptEffectiveDate", () => {
  it("uses the resolution date when there is one", () => {
    expect(keptEffectiveDate({ createdAt: before, resolvedAt: inside })).toBe(inside);
  });

  it("falls back to the creation date", () => {
    expect(keptEffectiveDate({ createdAt: before, resolvedAt: null })).toBe(before);
  });
});

describe("computeKept", () => {
  it("is zero with nothing to count", () => {
    expect(computeKept([], period)).toBe(0);
  });

  it("sums released holds and unbought declines", () => {
    const total = computeKept(
      [
        intent({ amount: 45_000 }),
        intent({ amount: 12_000, decision: "DECLINE", state: "OPEN", resolvedAt: null }),
      ],
      period,
    );
    expect(total).toBe(57_000);
  });

  it("counts an intent that matches both clauses exactly once", () => {
    // A declined intent the user then released is one intent, not two.
    const total = computeKept([intent({ amount: 30_000, decision: "DECLINE", state: "RELEASED" })], period);
    expect(total).toBe(30_000);
  });

  it("excludes a hold that was later purchased", () => {
    const total = computeKept(
      [intent({ amount: 45_000 }), intent({ amount: 99_000, state: "PURCHASED" })],
      period,
    );
    expect(total).toBe(45_000);
  });

  it("excludes intents resolved outside the period", () => {
    const total = computeKept(
      [
        intent({ amount: 45_000 }),
        intent({ amount: 11_000, createdAt: before, resolvedAt: before }),
        intent({ amount: 13_000, createdAt: after, resolvedAt: after }),
      ],
      period,
    );
    expect(total).toBe(45_000);
  });

  it("places a decline by its creation date when it was never resolved", () => {
    const total = computeKept(
      [intent({ amount: 8_000, decision: "DECLINE", state: "OPEN", createdAt: before, resolvedAt: null })],
      period,
    );
    expect(total).toBe(0);
  });

  it("includes the exact period boundaries", () => {
    const total = computeKept(
      [
        intent({ amount: 100, createdAt: period.start, resolvedAt: period.start }),
        intent({ amount: 200, createdAt: period.end, resolvedAt: period.end }),
      ],
      period,
    );
    expect(total).toBe(300);
  });
});

describe("holdConversion", () => {
  it("separates released holds from holds bought anyway", () => {
    const result = holdConversion([
      intent({ amount: 45_000, state: "RELEASED" }),
      intent({ amount: 12_000, state: "RELEASED" }),
      intent({ amount: 60_000, state: "PURCHASED" }),
      intent({ amount: 5_000, state: "HELD" }),
    ]);
    expect(result).toEqual({
      released: 2,
      purchased: 1,
      releasedFils: 57_000,
      purchasedFils: 60_000,
    });
  });

  it("is all zeroes with no holds", () => {
    expect(holdConversion([])).toEqual({
      released: 0,
      purchased: 0,
      releasedFils: 0,
      purchasedFils: 0,
    });
  });
});
