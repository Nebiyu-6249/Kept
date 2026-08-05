/**
 * Merchant normalisation.
 *
 * The parser is asked to normalise too, but recurring-charge detection compares
 * merchant strings across months and cannot depend on the model returning the
 * identical string every time. Everything that needs a stable key runs through
 * here, so `CARREF 4471 DUBAI AE` and `MAF CARREFOUR MALL` collapse to the same
 * merchant whether a model or a CSV produced them.
 */

const PROCESSOR_PREFIXES = [
  "POS",
  "PURCHASE",
  "PURCHASE AT",
  "PAYMENT TO",
  "PAYMENT",
  "PMT",
  "CARD",
  "CARD PURCHASE",
  "VISA",
  "MASTERCARD",
  "MC",
  "ECOM",
  "ECOMMERCE",
  "ONLINE",
  "TXN",
  "DEBIT",
  "DR",
  "TRF",
];

const PLACE_SUFFIXES = new Set([
  "AE",
  "UAE",
  "ARE",
  "DUBAI",
  "DXB",
  "ABU",
  "DHABI",
  "AUH",
  "SHARJAH",
  "SHJ",
  "AJMAN",
  "FUJAIRAH",
  "RAK",
  "UMM",
  "QUWAIN",
  "MALL",
  "BRANCH",
  "BR",
  "STORE",
  "STR",
  "LLC",
  "FZE",
  "FZCO",
  "TRADING",
]);

/**
 * Known chains, matched on a normalised token stream. Keeps the demo dataset,
 * the parser and the sweep agreeing on one spelling per merchant.
 */
const ALIASES: ReadonlyArray<{ match: RegExp; name: string }> = [
  { match: /\bCARREF(OUR)?\b/, name: "Carrefour" },
  { match: /\bLULU\b/, name: "Lulu" },
  { match: /\bUNION\s*COOP\b/, name: "Union Coop" },
  { match: /\bTALABAT\b/, name: "Talabat" },
  { match: /\bCAREEM\b/, name: "Careem" },
  { match: /\bNOON\b/, name: "Noon" },
  { match: /\bADNOC\b/, name: "Adnoc" },
  { match: /\bSHARAF\s*DG\b/, name: "Sharaf DG" },
];

function stripDiacritics(input: string): string {
  return input.normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

function titleCase(input: string): string {
  return input
    .toLowerCase()
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function normalizeMerchant(raw: string): string {
  if (!raw) return "Unknown";

  // Arabic-only strings have no ASCII to normalise; keep them as written rather
  // than reducing them to nothing.
  const ascii = stripDiacritics(raw)
    .toUpperCase()
    .replace(/[^A-Z0-9\s&'.-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!ascii) return raw.trim();

  for (const alias of ALIASES) {
    if (alias.match.test(ascii)) return alias.name;
  }

  let working = ascii;
  for (const prefix of PROCESSOR_PREFIXES) {
    const re = new RegExp(`^${prefix}\\b[\\s*.:-]*`);
    if (re.test(working)) working = working.replace(re, "").trim();
  }

  const tokens = working
    .split(" ")
    .filter(Boolean)
    // Store numbers: bare digits, or a short alphanumeric code like STR12 / 4471A.
    .filter((token) => !/^\d+$/.test(token))
    .filter((token) => !/^[A-Z]{0,3}\d{2,}[A-Z]?$/.test(token));

  // Drop place and legal-form words from the tail only. `Dubai Mall Optics`
  // keeps its leading words; `CARREFOUR DUBAI AE` loses its trailing ones.
  while (tokens.length > 1) {
    const last = tokens[tokens.length - 1];
    if (last && PLACE_SUFFIXES.has(last)) tokens.pop();
    else break;
  }

  const cleaned = tokens.join(" ").replace(/[\s.-]+$/, "").trim();
  if (!cleaned) return titleCase(ascii) || raw.trim();

  return titleCase(cleaned);
}

/** A stable key for grouping the same merchant across months. */
export function merchantKey(raw: string): string {
  return normalizeMerchant(raw).toLowerCase();
}

export function slugify(input: string): string {
  return stripDiacritics(input)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
