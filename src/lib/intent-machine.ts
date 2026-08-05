/**
 * The hold lifecycle (§6.4) as a closed state machine.
 *
 * Every transition the app performs goes through `applyAction`. An action that
 * is not in the table is a 409, not a silent no-op, so a double-tapped "Let it
 * go" cannot quietly re-release an intent and inflate Kept.
 */

/**
 * The hold window, §6.4. A fixed constant rather than configuration — 48 hours
 * is the product, not a setting.
 *
 * It lives here rather than in lib/env.ts because this module is reachable from
 * a client component (HoldCountdown), and importing the server env module from
 * the client graph pulled APP_TIMEZONE and VERDICT_DAILY_LIMIT into the browser
 * bundle. No secret leaked — Next replaces non-public process.env reads with
 * undefined — but server env plumbing has no business being shipped at all.
 */
export const HOLD_WINDOW_MS = 48 * 60 * 60 * 1000;

export type IntentState = "OPEN" | "HELD" | "PURCHASED" | "RELEASED" | "EXPIRED";
export type IntentAction = "hold" | "purchase" | "release";

/**
 * OPEN → HELD           user holds, or the verdict was HOLD
 * OPEN → PURCHASED      verdict was ALLOW and the user logged it
 * HELD → PURCHASED      the wait ended and the user bought it
 * HELD → RELEASED       the wait ended and the user let it go
 *
 * `release` from OPEN is deliberately absent. Kept means money that survived a
 * wait or a refusal; letting an intent go the same second it was allowed never
 * involved either. A declined intent already counts toward Kept while it sits
 * in OPEN, so nothing is lost by refusing the shortcut.
 *
 * PURCHASED, RELEASED and EXPIRED are terminal. A hold whose `holdUntil` has
 * passed is still HELD — expiry surfaces in the UI, it does not move the row.
 */
const TRANSITIONS: Readonly<Record<IntentState, Readonly<Partial<Record<IntentAction, IntentState>>>>> =
  {
    OPEN: { hold: "HELD", purchase: "PURCHASED" },
    HELD: { purchase: "PURCHASED", release: "RELEASED" },
    PURCHASED: {},
    RELEASED: {},
    EXPIRED: {},
  };

export type TransitionResult =
  | { ok: true; next: IntentState }
  | { ok: false; reason: string };

export function applyAction(state: IntentState, action: IntentAction): TransitionResult {
  const next = TRANSITIONS[state][action];
  if (!next) {
    return {
      ok: false,
      reason: `Cannot ${action} an intent that is ${state.toLowerCase()}.`,
    };
  }
  return { ok: true, next };
}

export function isLegalAction(state: IntentState, action: IntentAction): boolean {
  return applyAction(state, action).ok;
}

/** Every action legal from this state, for rendering the right buttons. */
export function legalActions(state: IntentState): IntentAction[] {
  return Object.keys(TRANSITIONS[state]) as IntentAction[];
}

export function holdUntilFrom(now: Date = new Date()): Date {
  return new Date(now.getTime() + HOLD_WINDOW_MS);
}

/** A hold is "ready to decide" once its window has passed. It stays HELD. */
export function isHoldExpired(
  intent: { state: IntentState; holdUntil: Date | null },
  now: Date = new Date(),
): boolean {
  if (intent.state !== "HELD" || !intent.holdUntil) return false;
  return intent.holdUntil.getTime() <= now.getTime();
}

export function msRemaining(
  intent: { holdUntil: Date | null },
  now: Date = new Date(),
): number {
  if (!intent.holdUntil) return 0;
  return Math.max(0, intent.holdUntil.getTime() - now.getTime());
}

/** `41H 12M`, the countdown format used in the value column on /holds. */
export function formatCountdown(ms: number): string {
  if (ms <= 0) return "READY";
  const totalMinutes = Math.floor(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}H ${String(minutes).padStart(2, "0")}M`;
}
