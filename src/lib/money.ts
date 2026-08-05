/**
 * Money is an integer count of fils. 1 AED = 100 fils.
 *
 * Nothing else in the app parses, adds, or formats an amount. Components take
 * fils and call the formatters here; there is no `toFixed(2)` anywhere else in
 * the codebase, and no float ever holds a monetary value.
 */

export const FILS_PER_UNIT = 100;

/** Grouping is pinned to en-US so a locale change can never move a separator. */
const GROUPER = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
  useGrouping: true,
});

export type DecimalMode = "always" | "auto" | "never";

export type FormatOptions = {
  /** Prefix the currency code, e.g. `AED 450.00`. */
  currency?: boolean | string;
  /** `always` = 2dp, `auto` = 2dp only when there are fils, `never` = whole units. */
  decimals?: DecimalMode;
  /** Render a leading `-` for negative values (they are otherwise absolute). */
  signed?: boolean;
};

/**
 * Format fils for display.
 *
 *   formatFils(45000)                          -> "450.00"
 *   formatFils(45000, { currency: true })       -> "AED 450.00"
 *   formatFils(124000, { decimals: "never" })   -> "1,240"
 *   formatFils(-2500, { signed: true })         -> "-25.00"
 */
export function formatFils(fils: number, options: FormatOptions = {}): string {
  const { currency = false, decimals = "always", signed = false } = options;

  if (!Number.isFinite(fils)) throw new TypeError("formatFils: not a number");
  const rounded = Math.round(fils);
  const negative = rounded < 0;
  const abs = Math.abs(rounded);

  let body: string;
  if (decimals === "never") {
    body = GROUPER.format(Math.round(abs / FILS_PER_UNIT));
  } else {
    const units = Math.trunc(abs / FILS_PER_UNIT);
    const remainder = abs % FILS_PER_UNIT;
    const showDecimals = decimals === "always" || remainder !== 0;
    body = showDecimals
      ? `${GROUPER.format(units)}.${String(remainder).padStart(2, "0")}`
      : GROUPER.format(units);
  }

  const sign = negative && signed ? "-" : "";
  const code =
    currency === true ? "AED " : typeof currency === "string" ? `${currency} ` : "";

  return `${sign}${code}${body}`;
}

/** Whole-unit form used by the rail and the large figures: `AED 1,240`. */
export function formatFilsWhole(fils: number, currency: boolean | string = false): string {
  return formatFils(fils, { currency, decimals: "never" });
}

/**
 * Parse user input into fils. Returns null when the input is not a usable
 * amount, so callers surface a validation error rather than storing a guess.
 *
 * Accepts: "45", "45.5", "45.50", "1,234.56", "AED 45", " 45 ".
 * Rejects: "", "-5", "abc", "45.555", "1e3", "."
 */
export function parseAmountToFils(input: string): number | null {
  if (typeof input !== "string") return null;

  const cleaned = input
    .trim()
    .replace(/^AED\s*/i, "")
    .replace(/,/g, "")
    .trim();

  if (cleaned === "") return null;
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;

  // Split on the decimal point and convert as integers. Multiplying a float by
  // 100 loses fils: 45.55 * 100 is 4554.999999999999.
  const [whole = "0", fraction = ""] = cleaned.split(".");
  const fils =
    Number.parseInt(whole, 10) * FILS_PER_UNIT +
    Number.parseInt(fraction.padEnd(2, "0"), 10);

  return Number.isSafeInteger(fils) ? fils : null;
}

/**
 * Parse an amount that appeared inside free text, e.g. a bank alert. Handles a
 * leading currency code and thousands separators. Returns null when unreadable,
 * which is what makes the parser able to say "I could not read this".
 */
export function parseLooseAmountToFils(input: string): number | null {
  const match = input.match(/(\d[\d,]*)(?:\.(\d{1,2}))?/);
  if (!match) return null;
  const whole = (match[1] ?? "").replace(/,/g, "");
  if (whole === "") return null;
  const fraction = (match[2] ?? "").padEnd(2, "0");
  const fils = Number.parseInt(whole, 10) * FILS_PER_UNIT + Number.parseInt(fraction, 10);
  return Number.isSafeInteger(fils) ? fils : null;
}

/** Sum fils safely. Empty input is 0, not NaN. */
export function sumFils(values: readonly number[]): number {
  let total = 0;
  for (const v of values) total += Math.round(v);
  return total;
}

/** Floor a value at zero. Used where a negative remaining would read as a credit. */
export function clampMin0(fils: number): number {
  return fils > 0 ? Math.round(fils) : 0;
}

/** Integer median, for the category history supplied to the verdict prompt. */
export function medianFils(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return Math.round(sorted[mid] ?? 0);
  return Math.round(((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2);
}

/** Convert to major units for chart geometry only. Never for storage or display. */
export function filsToUnits(fils: number): number {
  return fils / FILS_PER_UNIT;
}
