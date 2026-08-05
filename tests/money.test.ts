import { describe, expect, it } from "vitest";
import {
  clampMin0,
  formatFils,
  formatFilsWhole,
  medianFils,
  parseAmountToFils,
  parseLooseAmountToFils,
  sumFils,
} from "@/lib/money";

describe("formatFils", () => {
  it("renders two decimals by default", () => {
    expect(formatFils(45000)).toBe("450.00");
    expect(formatFils(4505)).toBe("45.05");
    expect(formatFils(5)).toBe("0.05");
    expect(formatFils(0)).toBe("0.00");
  });

  it("groups thousands", () => {
    expect(formatFils(124000)).toBe("1,240.00");
    expect(formatFils(123456789)).toBe("1,234,567.89");
  });

  it("prefixes the currency when asked", () => {
    expect(formatFils(45000, { currency: true })).toBe("AED 450.00");
    expect(formatFils(45000, { currency: "USD" })).toBe("USD 450.00");
  });

  it("drops decimals in whole mode, rounding to the nearest unit", () => {
    expect(formatFilsWhole(124000)).toBe("1,240");
    expect(formatFilsWhole(124049)).toBe("1,240");
    expect(formatFilsWhole(124050)).toBe("1,241");
    expect(formatFilsWhole(124000, true)).toBe("AED 1,240");
  });

  it("shows decimals in auto mode only when there are fils", () => {
    expect(formatFils(45000, { decimals: "auto" })).toBe("450");
    expect(formatFils(45050, { decimals: "auto" })).toBe("450.50");
  });

  it("renders negatives as absolute unless signed is requested", () => {
    expect(formatFils(-2500)).toBe("25.00");
    expect(formatFils(-2500, { signed: true })).toBe("-25.00");
    expect(formatFils(-2500, { signed: true, currency: true })).toBe("-AED 25.00");
  });

  it("rejects non-finite input rather than printing NaN", () => {
    expect(() => formatFils(Number.NaN)).toThrow(TypeError);
    expect(() => formatFils(Number.POSITIVE_INFINITY)).toThrow(TypeError);
  });
});

describe("parseAmountToFils", () => {
  it("accepts the shapes a person actually types", () => {
    expect(parseAmountToFils("45")).toBe(4500);
    expect(parseAmountToFils("45.5")).toBe(4550);
    expect(parseAmountToFils("45.50")).toBe(4550);
    expect(parseAmountToFils("1,234.56")).toBe(123456);
    expect(parseAmountToFils(" 45 ")).toBe(4500);
    expect(parseAmountToFils("AED 45")).toBe(4500);
    expect(parseAmountToFils("aed 45.05")).toBe(4505);
    expect(parseAmountToFils("0")).toBe(0);
  });

  it("does not lose fils to float multiplication", () => {
    // 45.55 * 100 is 4554.999999999999 in IEEE 754.
    expect(parseAmountToFils("45.55")).toBe(4555);
    expect(parseAmountToFils("1.10")).toBe(110);
    expect(parseAmountToFils("8.29")).toBe(829);
  });

  it("returns null rather than guessing", () => {
    expect(parseAmountToFils("")).toBeNull();
    expect(parseAmountToFils("   ")).toBeNull();
    expect(parseAmountToFils("abc")).toBeNull();
    expect(parseAmountToFils("-5")).toBeNull();
    expect(parseAmountToFils("45.555")).toBeNull();
    expect(parseAmountToFils("1e3")).toBeNull();
    expect(parseAmountToFils(".")).toBeNull();
    expect(parseAmountToFils("4 5")).toBeNull();
  });
});

describe("parseLooseAmountToFils", () => {
  it("pulls an amount out of alert text", () => {
    expect(parseLooseAmountToFils("AED 45.50 at CARREFOUR")).toBe(4550);
    expect(parseLooseAmountToFils("Purchase of AED 1,240.00")).toBe(124000);
    expect(parseLooseAmountToFils("AED 20 spent")).toBe(2000);
  });

  it("returns null when there is no number at all", () => {
    expect(parseLooseAmountToFils("amount unreadable")).toBeNull();
  });
});

describe("arithmetic helpers", () => {
  it("sums an empty list to zero", () => {
    expect(sumFils([])).toBe(0);
    expect(sumFils([100, 250, 5])).toBe(355);
  });

  it("floors at zero", () => {
    expect(clampMin0(-500)).toBe(0);
    expect(clampMin0(500)).toBe(500);
    expect(clampMin0(0)).toBe(0);
  });

  it("takes an integer median", () => {
    expect(medianFils([])).toBe(0);
    expect(medianFils([100])).toBe(100);
    expect(medianFils([100, 300])).toBe(200);
    expect(medianFils([500, 100, 300])).toBe(300);
    expect(medianFils([100, 200, 300, 401])).toBe(250);
  });
});
