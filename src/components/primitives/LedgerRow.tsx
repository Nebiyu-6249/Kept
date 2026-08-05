import type { ReactNode } from "react";

export type ValueTone = "default" | "accent" | "muted";

export type LedgerRowProps = {
  /** Short uppercase label, rendered in accent. The left column. */
  label?: ReactNode;
  description?: ReactNode;
  /** Right-aligned, tabular. Stays on row one when the description wraps. */
  value?: ReactNode;
  valueTone?: ValueTone;
  /** 1px accent rule on the left edge. */
  marker?: boolean;
  onClick?: () => void;
  /** Content revealed beneath the row, as a sibling of the row control. */
  expandable?: ReactNode;
  expanded?: boolean;
  /** Accessible name for the row control when the label alone is not enough. */
  controlLabel?: string;
  controlId?: string;
  className?: string;
};

const TONE: Record<ValueTone, string> = {
  default: "text-[var(--color-ink)]",
  accent: "text-[var(--color-accent)]",
  muted: "text-[var(--color-muted)]",
};

/**
 * The single layout primitive (§9.4). Every list in the app is made of these:
 * transactions, policy rules, holds, bills, insights, settings.
 *
 * Below 640px the description wraps to a second line and the value stays on
 * row one — handled by the grid areas in globals.css, not by a second markup
 * path, so there is only ever one row to reason about.
 *
 * The expanded panel is a sibling of the row control, never a child: inputs
 * inside a <button> are invalid and unreachable by keyboard.
 */
export function LedgerRow({
  label,
  description,
  value,
  valueTone = "default",
  marker = false,
  onClick,
  expandable,
  expanded = false,
  controlLabel,
  controlId,
  className = "",
}: LedgerRowProps) {
  const interactive = typeof onClick === "function";

  const cells = (
    <>
      <span className="ledger-row__label t-label text-[var(--color-accent)]">{label}</span>
      <span className="ledger-row__desc t-body text-[var(--color-ink-2)]">{description}</span>
      <span className={`ledger-row__value t-value ${TONE[valueTone]}`}>{value}</span>
    </>
  );

  return (
    <div className={`ledger-block ${marker ? "ledger-block--marker" : ""} ${className}`}>
      {interactive ? (
        <button
          type="button"
          onClick={onClick}
          id={controlId}
          aria-expanded={expandable ? expanded : undefined}
          aria-label={controlLabel}
          className="ledger-row ledger-row-control cursor-pointer text-left"
        >
          {cells}
        </button>
      ) : (
        <div className="ledger-row">{cells}</div>
      )}

      {expandable && expanded ? <div className="pb-4">{expandable}</div> : null}
    </div>
  );
}

/** A section heading above a run of ledger rows. */
export function LedgerHeading({
  children,
  value,
  id,
}: {
  children: ReactNode;
  value?: ReactNode;
  id?: string;
}) {
  return (
    <div
      id={id}
      className="t-label flex items-baseline justify-between gap-4 border-b border-[var(--color-hairline)] pb-2 text-[var(--color-muted)]"
    >
      <span>{children}</span>
      {value ? <span className="tnum">{value}</span> : null}
    </div>
  );
}
