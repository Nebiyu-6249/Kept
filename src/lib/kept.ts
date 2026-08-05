/**
 * Kept — the product's one metric.
 *
 * A metric nobody can define is a metric nobody trusts, so the definition lives
 * here as an exported string and is rendered verbatim in the README and in the
 * tooltip on the figure. There is no second wording of it anywhere.
 */

export const KEPT_DEFINITION =
  "Kept is the sum of every hold you released and every purchase the policy declined that you did not make, within the current period. A hold you later bought contributes nothing.";

export type KeptDecision = "ALLOW" | "HOLD" | "DECLINE";
export type KeptState = "OPEN" | "HELD" | "PURCHASED" | "RELEASED" | "EXPIRED";

export type KeptIntent = {
  amount: number;
  decision: KeptDecision;
  state: KeptState;
  createdAt: Date;
  resolvedAt: Date | null;
};

/**
 * §6.3: `state = RELEASED`, plus `decision = DECLINE` where `state != PURCHASED`.
 * An intent matching both clauses is counted once, because this is one predicate
 * rather than two sums.
 */
export function countsTowardKept(intent: Pick<KeptIntent, "decision" | "state">): boolean {
  if (intent.state === "RELEASED") return true;
  return intent.decision === "DECLINE" && intent.state !== "PURCHASED";
}

/**
 * The date that places an intent in a period. A released hold belongs to the
 * period it was released in; a decline nobody acted on belongs to the period it
 * was asked in.
 */
export function keptEffectiveDate(intent: Pick<KeptIntent, "createdAt" | "resolvedAt">): Date {
  return intent.resolvedAt ?? intent.createdAt;
}

export function computeKept(
  intents: readonly KeptIntent[],
  period: { start: Date; end: Date },
): number {
  let total = 0;
  for (const intent of intents) {
    if (!countsTowardKept(intent)) continue;
    const at = keptEffectiveDate(intent);
    if (at < period.start || at > period.end) continue;
    total += intent.amount;
  }
  return total;
}

/**
 * Hold conversion, for /insights. Held intents that were released against held
 * intents that were bought anyway — the honest denominator for whether the wait
 * actually changes behaviour.
 */
export function holdConversion(intents: readonly KeptIntent[]): {
  released: number;
  purchased: number;
  releasedFils: number;
  purchasedFils: number;
} {
  let released = 0;
  let purchased = 0;
  let releasedFils = 0;
  let purchasedFils = 0;

  for (const intent of intents) {
    if (intent.decision !== "HOLD" && intent.state !== "RELEASED") continue;
    if (intent.state === "RELEASED") {
      released += 1;
      releasedFils += intent.amount;
    } else if (intent.state === "PURCHASED") {
      purchased += 1;
      purchasedFils += intent.amount;
    }
  }

  return { released, purchased, releasedFils, purchasedFils };
}
