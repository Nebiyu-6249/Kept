import type { ReactNode } from "react";
import { Eyebrow } from "./OutlineHeading";

/**
 * The loading and error surfaces every route shares. An unhandled empty state
 * is a bug (§11), so these exist rather than being written per screen.
 */

/** Skeleton rows that match the ledger row's geometry, so nothing jumps. */
export function LoadingRows({ label = "Loading", rows = 6 }: { label?: string; rows?: number }) {
  return (
    <div aria-live="polite" aria-busy="true" className="mx-auto w-full max-w-[1080px]">
      <Eyebrow>{label}</Eyebrow>
      <div className="mt-4">
        {Array.from({ length: rows }, (_, index) => (
          <div key={index} className="ledger-block">
            <div className="ledger-row">
              <span className="ledger-row__label h-[10px] w-[64px] bg-[var(--color-ground-2)]" />
              <span className="ledger-row__desc h-[10px] w-[40%] bg-[var(--color-ground-2)]" />
              <span className="ledger-row__value h-[10px] w-[72px] bg-[var(--color-ground-2)]" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex max-w-[52ch] flex-col gap-4 border-t border-[var(--color-hairline)] pt-6">
      <Eyebrow>{title}</Eyebrow>
      <p className="t-body text-[var(--color-ink-2)]">{children}</p>
      {action ? <div className="flex gap-3">{action}</div> : null}
    </div>
  );
}
