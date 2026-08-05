import { describe, expect, it } from "vitest";
import { isRegular, looksLikeSameBill } from "@/lib/sweep";

const days = (...offsets: number[]): Date[] =>
  offsets.map((offset) => new Date(Date.UTC(2026, 0, 1) + offset * 86_400_000));

describe("recurring charge detection", () => {
  it("needs at least three occurrences", () => {
    expect(isRegular(days(0))).toBe(false);
    expect(isRegular(days(0, 30))).toBe(false);
    expect(isRegular(days(0, 30, 60))).toBe(true);
  });

  it("accepts a monthly charge with a few days of drift", () => {
    // 30, 31, 28 day gaps: mean 29.7, sd 1.25, variance 4% — regular.
    expect(isRegular(days(0, 30, 61, 89))).toBe(true);
  });

  it("rejects irregular gaps", () => {
    // 5, 40, 12 day gaps: nowhere near regular.
    expect(isRegular(days(0, 5, 45, 57))).toBe(false);
  });

  it("rejects same-day repeats, which are a split basket not a bill", () => {
    const sameDay = [
      new Date("2026-01-01T09:00:00Z"),
      new Date("2026-01-01T09:05:00Z"),
      new Date("2026-01-01T09:11:00Z"),
    ];
    expect(isRegular(sameDay)).toBe(false);
  });

  it("accepts a weekly charge", () => {
    expect(isRegular(days(0, 7, 14, 21, 28))).toBe(true);
  });

  it("rejects a charge that stopped being regular", () => {
    // Monthly, monthly, then a 4 month gap.
    expect(isRegular(days(0, 30, 60, 180))).toBe(false);
  });
});

describe("duplicate bill guard", () => {
  it("treats the same payment under a different label as the same bill", () => {
    // "Rent" set up by hand vs "Landlord Transfer" on the statement.
    expect(looksLikeSameBill({ amount: 700_000, dueDay: 1 }, { amount: 700_000, dueDay: 1 })).toBe(
      true,
    );
  });

  it("tolerates a small amount drift and a few days", () => {
    expect(looksLikeSameBill({ amount: 300_00, dueDay: 12 }, { amount: 320_00, dueDay: 14 })).toBe(
      true,
    );
  });

  it("wraps around the end of the month", () => {
    expect(looksLikeSameBill({ amount: 42_000, dueDay: 30 }, { amount: 42_000, dueDay: 2 })).toBe(
      true,
    );
  });

  it("keeps genuinely different bills apart", () => {
    expect(looksLikeSameBill({ amount: 700_000, dueDay: 1 }, { amount: 42_000, dueDay: 1 })).toBe(
      false,
    );
    expect(looksLikeSameBill({ amount: 42_000, dueDay: 8 }, { amount: 42_000, dueDay: 22 })).toBe(
      false,
    );
  });

  it("never matches a zero-amount bill", () => {
    expect(looksLikeSameBill({ amount: 0, dueDay: 1 }, { amount: 0, dueDay: 1 })).toBe(false);
  });
});
