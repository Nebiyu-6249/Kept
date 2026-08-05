"use client";

import { LedgerRow } from "@/components/primitives/LedgerRow";
import { Button } from "@/components/primitives/Button";
import { formatFils } from "@/lib/money";
import type { BudgetState } from "@/lib/budget-state";

export type VerdictView = {
  intentId: string | null;
  decision: "allow" | "hold" | "decline";
  ruleRef: string | null;
  ruleText: string | null;
  reasoning: string;
  amountFils: number;
  categoryName: string;
  categorySlug: string;
  /** True when the policy check was unreachable and this is local arithmetic. */
  arithmeticOnly: boolean;
};

/**
 * The verdict word is the app's signature: one solid word beside one outlined
 * qualifier. Decision styling is typographic only — the accent appears as a
 * single 1px rule down the left edge for hold and decline, and nowhere else.
 * No red backgrounds, no traffic lights, no icons (§11.3).
 */
const WORDS: Record<VerdictView["decision"], { solid: string; outline: string }> = {
  allow: { solid: "GO", outline: "AHEAD" },
  hold: { solid: "HOLD", outline: "FOR NOW" },
  decline: { solid: "NOT", outline: "THIS PERIOD" },
};

export function VerdictCard({
  verdict,
  budgetState,
  currency,
  busy,
  onHold,
  onLog,
  onRetry,
  onAskAgain,
  actionError,
}: {
  verdict: VerdictView;
  budgetState: BudgetState;
  currency: string;
  busy: boolean;
  onHold: () => void;
  onLog: () => void;
  onRetry: () => void;
  onAskAgain: () => void;
  actionError: string | null;
}) {
  const marked = verdict.decision !== "allow";
  const words = WORDS[verdict.decision];
  const category = budgetState.spentByCategory[verdict.categorySlug];

  return (
    <section
      aria-live="polite"
      className={`flex flex-col gap-5 py-1 pl-4 ${
        marked ? "border-l border-[var(--color-accent)]" : "border-l border-transparent"
      }`}
    >
      <div className="flex items-baseline justify-between gap-4">
        <span className="t-label text-[var(--color-accent)]">
          {verdict.arithmeticOnly
            ? "ARITHMETIC ONLY — POLICY CHECK UNAVAILABLE"
            : verdict.ruleRef
              ? `[ ${verdict.ruleRef} ]`
              : "NO RULE APPLIED"}
        </span>
        <span className="t-value tnum shrink-0">
          {formatFils(verdict.amountFils, { currency })}
        </span>
      </div>

      <h2 className="t-display-m">
        <span>{words.solid}</span> <span className="t-outline">{words.outline}</span>
      </h2>

      {verdict.ruleText ? (
        <blockquote className="t-body border-l border-[var(--color-hairline)] pl-4 text-[var(--color-ink)]">
          &ldquo;{verdict.ruleText}&rdquo;
        </blockquote>
      ) : null}

      <p className="t-body max-w-[54ch] text-[var(--color-ink-2)]">{verdict.reasoning}</p>

      <div className="border-t border-[var(--color-hairline)]">
        <LedgerRow
          label={`Spent · ${verdict.categoryName}`}
          description="This period"
          value={
            category
              ? category.limit === null
                ? formatFils(category.spent, { currency })
                : `${formatFils(category.spent, { currency })} / ${formatFils(category.limit)}`
              : "—"
          }
        />
        <LedgerRow
          label="Days left"
          description="In this period"
          value={String(budgetState.period.daysRemaining)}
        />
        <LedgerRow
          label="Bills"
          description="Still due before the period ends"
          value={formatFils(budgetState.committedBills, { currency })}
        />
        <LedgerRow
          label="Safe to spend"
          description="Income less bills, spend and holds"
          value={formatFils(budgetState.safeToSpend, { currency, signed: true })}
          valueTone={budgetState.safeToSpend < 0 ? "accent" : "default"}
        />
      </div>

      {actionError ? (
        <p role="alert" className="t-body text-[var(--color-accent)]">
          {actionError}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-3">
        {verdict.arithmeticOnly ? (
          <>
            <Button onClick={onRetry} disabled={busy}>
              {busy ? "Checking" : "Try the policy check again"}
            </Button>
            <Button onClick={onAskAgain} disabled={busy}>
              Ask about something else
            </Button>
          </>
        ) : (
          <>
            <Button onClick={onHold} disabled={busy}>
              Hold it
            </Button>
            <Button onClick={onLog} disabled={busy}>
              {verdict.decision === "allow" ? "Log it" : "Log it anyway"}
            </Button>
            <Button onClick={onAskAgain} disabled={busy}>
              Ask about something else
            </Button>
          </>
        )}
      </div>

      {verdict.arithmeticOnly ? (
        <p className="t-label text-[var(--color-muted)]">
          Nothing was recorded. This is the arithmetic from your own figures, not a policy check.
        </p>
      ) : null}
    </section>
  );
}
