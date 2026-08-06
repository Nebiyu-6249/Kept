import type { BudgetState } from "./budget-state";

/**
 * The local fallback shown when the policy check cannot be reached (§11.3).
 *
 * This module deliberately imports no model SDK at all: /ask runs it
 * in the browser, from the BudgetState the server already sent, and the SDK
 * must never reach a client bundle.
 *
 * It is arithmetic only. It never claims to have applied the policy, no Intent
 * is created for it, and /ask labels it ARITHMETIC ONLY — POLICY CHECK
 * UNAVAILABLE so nobody mistakes it for a verdict the engine produced.
 */

export type LocalVerdict = {
  decision: "allow" | "hold" | "decline";
  ruleRef: null;
  reasoning: string;
  affordableNow: boolean;
  figureCited: number;
};

export function arithmeticVerdict(input: {
  amountFils: number;
  categorySlug: string;
  categoryName: string;
  budgetState: BudgetState;
}): LocalVerdict {
  const { amountFils, categorySlug, categoryName, budgetState } = input;
  const category = budgetState.spentByCategory[categorySlug];
  const remaining = category?.remaining ?? null;
  const affordable = amountFils <= budgetState.safeToSpend;

  if (!affordable) {
    return {
      decision: "decline",
      ruleRef: null,
      reasoning: `Safe to spend is ${units(budgetState.safeToSpend)} after committed bills and holds, and this is ${units(
        amountFils,
      )}. On the arithmetic alone, the money is not there this period.`,
      affordableNow: false,
      figureCited: budgetState.safeToSpend,
    };
  }

  if (remaining !== null && amountFils > remaining) {
    return {
      decision: "hold",
      ruleRef: null,
      reasoning: `This fits what is left overall but not the ${categoryName.toLowerCase()} limit, which has ${units(
        remaining,
      )} left against a request of ${units(amountFils)}.`,
      affordableNow: true,
      figureCited: remaining,
    };
  }

  return {
    decision: "allow",
    ruleRef: null,
    reasoning: `On the arithmetic alone this fits: ${units(
      budgetState.safeToSpend,
    )} is safe to spend after committed bills and holds, and this is ${units(amountFils)}.`,
    affordableNow: true,
    figureCited: remaining ?? budgetState.safeToSpend,
  };
}

function units(fils: number): string {
  return Math.round(fils / 100).toLocaleString("en-US");
}
