"use client";

/**
 * Square step indicators with a hairline connector that fills with accent.
 * No glow on the active step (§11.2) — the active step is accent type and an
 * accent border, nothing more.
 */
export function Stepper({
  steps,
  current,
  onJump,
}: {
  steps: readonly string[];
  current: number;
  onJump: (index: number) => void;
}) {
  return (
    <ol className="flex list-none items-center gap-0" aria-label="Onboarding progress">
      {steps.map((step, index) => {
        const done = index < current;
        const active = index === current;
        return (
          <li key={step} className="flex flex-1 items-center gap-0 last:flex-none">
            <button
              type="button"
              onClick={() => onJump(index)}
              disabled={index > current}
              aria-current={active ? "step" : undefined}
              className={`t-label flex size-[26px] shrink-0 items-center justify-center border tnum transition-colors ${
                active || done
                  ? "border-[var(--color-accent)] text-[var(--color-accent)]"
                  : "border-[var(--color-hairline)] text-[var(--color-muted)]"
              } ${index > current ? "cursor-not-allowed" : "cursor-pointer"}`}
            >
              <span className="sr-only">{step}</span>
              <span aria-hidden="true">{index + 1}</span>
            </button>
            {index < steps.length - 1 ? (
              <span
                aria-hidden="true"
                className={`h-px flex-1 ${
                  done ? "bg-[var(--color-accent)]" : "bg-[var(--color-hairline)]"
                }`}
              />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
