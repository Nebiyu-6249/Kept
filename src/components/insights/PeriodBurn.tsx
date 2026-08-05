"use client";

import { useEffect, useRef } from "react";
import { useReducedMotion } from "framer-motion";

const WIDTH = 720;
const HEIGHT = 260;
const PAD = { top: 20, right: 88, bottom: 30, left: 8 };

/**
 * The current period's burn against the even rate. Hand-authored SVG; there is
 * no chart library in this project.
 *
 * Only the elapsed days are drawn as a solid line — the rest of the period has
 * not happened yet, so the projection is a separate dashed run to the end
 * rather than a line pretending to be observation.
 */
export function PeriodBurn({
  cumulative,
  idealPerDay,
  daysElapsed,
  currency,
}: {
  cumulative: number[];
  idealPerDay: number;
  daysElapsed: number;
  currency: string;
}) {
  const pathRef = useRef<SVGPathElement | null>(null);
  const reduced = useReducedMotion();

  const daysTotal = cumulative.length;
  const observed = cumulative.slice(0, Math.max(daysElapsed, 1));
  const spentSoFar = observed[observed.length - 1] ?? 0;
  const rate = spentSoFar / Math.max(observed.length, 1);
  const projectedEnd = Math.round(spentSoFar + rate * (daysTotal - observed.length));
  const idealTotal = idealPerDay * daysTotal;

  const peak = Math.max(projectedEnd, idealTotal, spentSoFar, 1);

  const x = (day: number): number =>
    PAD.left + (day / Math.max(daysTotal - 1, 1)) * (WIDTH - PAD.left - PAD.right);
  const y = (fils: number): number =>
    HEIGHT - PAD.bottom - (fils / peak) * (HEIGHT - PAD.top - PAD.bottom);

  const observedPath = observed
    .map((value, day) => `${day === 0 ? "M" : "L"}${x(day)},${y(value)}`)
    .join(" ");

  const projectionPath = `M${x(observed.length - 1)},${y(spentSoFar)} L${x(daysTotal - 1)},${y(
    projectedEnd,
  )}`;

  const overspends = projectedEnd > idealTotal;

  useEffect(() => {
    const path = pathRef.current;
    if (!path) return;
    if (reduced) {
      path.style.strokeDasharray = "none";
      path.style.strokeDashoffset = "0";
      return;
    }
    const length = path.getTotalLength();
    path.style.transition = "none";
    path.style.strokeDasharray = `${length}`;
    path.style.strokeDashoffset = `${length}`;
    void path.getBoundingClientRect();
    path.style.transition = "stroke-dashoffset 2000ms cubic-bezier(.22,1,.36,1)";
    path.style.strokeDashoffset = "0";
  }, [observedPath, reduced]);

  const money = (fils: number): string =>
    `${currency} ${Math.round(fils / 100).toLocaleString("en-US")}`;

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className="h-auto w-full"
      role="img"
      aria-label={`Discretionary spend across the period. ${money(
        spentSoFar,
      )} after ${observed.length} days, projecting ${money(projectedEnd)} against an even rate of ${money(
        idealTotal,
      )}.`}
    >
      <line
        x1={PAD.left}
        y1={HEIGHT - PAD.bottom}
        x2={WIDTH - PAD.right}
        y2={HEIGHT - PAD.bottom}
        stroke="var(--color-hairline)"
        strokeWidth="1"
      />

      <path
        d={`M${x(0)},${y(idealPerDay)} L${x(daysTotal - 1)},${y(idealTotal)}`}
        fill="none"
        stroke="var(--color-hairline)"
        strokeWidth="1"
        strokeDasharray="3 4"
      />
      <text
        x={WIDTH - PAD.right + 8}
        y={y(idealTotal)}
        fill="var(--color-muted)"
        fontSize="9.5"
        letterSpacing="1.2"
        dominantBaseline="middle"
      >
        EVEN RATE
      </text>

      <path
        ref={pathRef}
        d={observedPath}
        fill="none"
        stroke="var(--color-ink)"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {/* The projection is dashed: it has not happened. */}
      <path
        d={projectionPath}
        fill="none"
        stroke={overspends ? "var(--color-accent)" : "var(--color-muted)"}
        strokeWidth="1"
        strokeDasharray="2 4"
      />

      <circle cx={x(observed.length - 1)} cy={y(spentSoFar)} r="3" fill="var(--color-ink)" />

      {overspends ? (
        <>
          <circle cx={x(daysTotal - 1)} cy={y(projectedEnd)} r="3" fill="var(--color-accent)" />
          <text
            x={WIDTH - PAD.right + 8}
            y={y(projectedEnd)}
            fill="var(--color-accent)"
            fontSize="9.5"
            letterSpacing="1.2"
            dominantBaseline="middle"
          >
            OVER BY {money(projectedEnd - idealTotal)}
          </text>
        </>
      ) : (
        <text
          x={WIDTH - PAD.right + 8}
          y={y(projectedEnd)}
          fill="var(--color-muted)"
          fontSize="9.5"
          letterSpacing="1.2"
          dominantBaseline="middle"
        >
          PROJECTED
        </text>
      )}

      <text
        x={PAD.left}
        y={HEIGHT - PAD.bottom + 18}
        fill="var(--color-muted)"
        fontSize="9.5"
        letterSpacing="1.2"
      >
        DAY 1
      </text>
      <text
        x={WIDTH - PAD.right}
        y={HEIGHT - PAD.bottom + 18}
        textAnchor="end"
        fill="var(--color-muted)"
        fontSize="9.5"
        letterSpacing="1.2"
      >
        DAY {daysTotal}
      </text>
    </svg>
  );
}

/**
 * Hold conversion as a single pair of rects on one hairline track. Two figures
 * and a bar, exactly as §11.8 asks — no legend, no axis, no library.
 */
export function HoldBar({
  released,
  purchased,
}: {
  released: number;
  purchased: number;
}) {
  const total = released + purchased;
  if (total === 0) {
    return (
      <p className="t-body text-[var(--color-ink-2)]">
        No holds have been resolved yet. This fills in once a wait ends.
      </p>
    );
  }

  const releasedWidth = (released / total) * 100;

  return (
    <svg
      viewBox="0 0 100 4"
      preserveAspectRatio="none"
      className="h-[4px] w-full"
      role="img"
      aria-label={`${released} of ${total} resolved holds were released rather than bought.`}
    >
      <rect x="0" y="1.5" width="100" height="1" fill="var(--color-hairline)" />
      <rect x="0" y="1" width={releasedWidth} height="2" fill="var(--color-accent)" />
    </svg>
  );
}
