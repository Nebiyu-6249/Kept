/**
 * Server-side environment access. Nothing here is prefixed NEXT_PUBLIC_, so
 * nothing here can reach the client bundle.
 */

export const APP_TIMEZONE = process.env.APP_TIMEZONE ?? "Asia/Dubai";
export const DEFAULT_CURRENCY = process.env.DEFAULT_CURRENCY ?? "AED";

export const VERDICT_DAILY_LIMIT = Number.parseInt(
  process.env.VERDICT_DAILY_LIMIT ?? "100",
  10,
);

/** Hold window in milliseconds. 48 hours, per §6.4. */
export const HOLD_WINDOW_MS = 48 * 60 * 60 * 1000;

/** A DECLINE intent with no action expires after this long (§6.4, nightly sweep). */
export const DECLINE_EXPIRY_DAYS = 7;

/** A discretionary purchase becomes reviewable this many days after it happened. */
export const REVIEW_DELAY_DAYS = 7;

/** Messages sent to the parser per model call (§7.3). */
export const PARSE_CHUNK_SIZE = 20;

/** Maximum messages accepted by POST /api/import. */
export const IMPORT_MAX_MESSAGES = 500;

export function requireAnthropicKey(): string {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY is not set");
  return key;
}

/**
 * Absolute origin used by API routes to invoke the Netlify background function.
 * Netlify sets URL and DEPLOY_PRIME_URL for us; APP_ORIGIN is the local override.
 */
export function appOrigin(): string | null {
  return (
    process.env.APP_ORIGIN ??
    process.env.DEPLOY_PRIME_URL ??
    process.env.URL ??
    null
  );
}
