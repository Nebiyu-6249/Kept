/**
 * The left rail (§10). 34px, full height, one line of vertical monospace:
 *
 *   PERIOD 01–31 AUG · KEPT AED 1,240
 *
 * Both figures come from BudgetState. The rail computes nothing.
 */
export function Rail({ periodLabel, keptLabel }: { periodLabel: string; keptLabel: string }) {
  return (
    <div
      aria-hidden="true"
      className="fixed inset-y-0 left-0 z-[80] hidden w-[var(--frame-rail)] border-r border-[var(--color-hairline)] md:block"
    >
      <div
        className="t-label flex h-full items-end justify-center pb-4 text-[var(--color-muted)]"
        style={{ writingMode: "vertical-rl" }}
      >
        <span className="tnum whitespace-nowrap">
          PERIOD {periodLabel} <span className="text-[var(--color-accent)]">·</span> KEPT{" "}
          {keptLabel}
        </span>
      </div>
    </div>
  );
}
