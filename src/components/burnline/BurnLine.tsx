"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { ScenarioPicker } from "./ScenarioPicker";
import type { Scenario, ScenarioSet } from "@/lib/demo";

const WIDTH = 720;
const HEIGHT = 300;
const PAD = { top: 24, right: 96, bottom: 34, left: 8 };

/**
 * Hand-authored SVG. No chart library anywhere in this project.
 *
 * §12.2: the picker swaps one whole Scenario object, so the path, the three
 * facts and the eyebrow always come from the same computation. A panel that
 * prints one figure in the caption and another in the eyebrow is broken and
 * nothing warns you — the only defence is having one source, not three.
 */
export function BurnLine({ scenarios }: { scenarios: ScenarioSet }) {
  const [id, setId] = useState<Scenario["id"]>("normal");
  const scenario = scenarios[id];
  const reduced = useReducedMotion();
  const pathRef = useRef<SVGPathElement | null>(null);
  const clipId = useId();

  const days = scenario.daysTotal;
  const hasData = days > 0 && scenario.cumulative.length > 0;

  const peak = Math.max(
    ...scenario.cumulative,
    scenario.idealPerDay * days,
    1,
  );

  const x = (day: number): number =>
    PAD.left + (day / Math.max(days - 1, 1)) * (WIDTH - PAD.left - PAD.right);
  const y = (fils: number): number =>
    HEIGHT - PAD.bottom - (fils / peak) * (HEIGHT - PAD.top - PAD.bottom);

  const spendPath = hasData
    ? scenario.cumulative.map((value, day) => `${day === 0 ? "M" : "L"}${x(day)},${y(value)}`).join(" ")
    : "";

  const idealPath = hasData
    ? `M${x(0)},${y(scenario.idealPerDay)} L${x(days - 1)},${y(scenario.idealPerDay * days)}`
    : "";

  // Self-draw: measure the real path length, then run the dash offset to zero.
  useEffect(() => {
    const path = pathRef.current;
    if (!path || !hasData) return;

    if (reduced) {
      path.style.strokeDasharray = "none";
      path.style.strokeDashoffset = "0";
      return;
    }

    const length = path.getTotalLength();
    path.style.transition = "none";
    path.style.strokeDasharray = `${length}`;
    path.style.strokeDashoffset = `${length}`;
    // Force a reflow so the next assignment is a transition, not a jump.
    void path.getBoundingClientRect();
    path.style.transition = "stroke-dashoffset 2000ms cubic-bezier(.22,1,.36,1)";
    path.style.strokeDashoffset = "0";
  }, [spendPath, reduced, hasData]);

  if (!hasData) {
    return (
      <div className="flex flex-col gap-4">
        <p className="t-body max-w-[52ch] text-[var(--color-ink-2)]">
          The burn line needs a period with spending in it. Import some alerts and it will draw
          itself from your own rows.
        </p>
      </div>
    );
  }

  const crossing = scenario.crossingDay;

  return (
    <div className="flex flex-col gap-5">
      <ScenarioPicker
        scenarios={scenarios}
        current={id}
        onChange={setId}
      />

      {/* The eyebrow comes from the same Scenario object as the path below it. */}
      <p aria-live="polite" className="t-body max-w-[56ch] text-[var(--color-ink-2)]">
        {scenario.eyebrow}
      </p>

      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="h-auto w-full"
        role="img"
        aria-label={`Cumulative spend across the period under the ${scenario.label} scenario, against an even rate.`}
      >
        <defs>
          <clipPath id={clipId}>
            <rect x="0" y="0" width={WIDTH} height={HEIGHT} />
          </clipPath>
        </defs>

        {/* Baseline and the even-rate line: 1px hairlines, never filled. */}
        <line
          x1={PAD.left}
          y1={HEIGHT - PAD.bottom}
          x2={WIDTH - PAD.right}
          y2={HEIGHT - PAD.bottom}
          stroke="var(--color-hairline)"
          strokeWidth="1"
        />
        <path
          d={idealPath}
          fill="none"
          stroke="var(--color-hairline)"
          strokeWidth="1"
          strokeDasharray="3 4"
        />
        <text
          x={WIDTH - PAD.right + 8}
          y={y(scenario.idealPerDay * days)}
          className="t-label"
          fill="var(--color-muted)"
          fontSize="9.5"
          letterSpacing="1.2"
          dominantBaseline="middle"
        >
          EVEN RATE
        </text>

        <g clipPath={`url(#${clipId})`}>
          <path
            ref={pathRef}
            d={spendPath}
            fill="none"
            stroke="var(--color-ink)"
            strokeWidth="1.5"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </g>

        {crossing !== null ? (
          <g>
            {/* The crossing: a 3px accent dot with a 1px leader to a label. */}
            <line
              x1={x(crossing)}
              y1={y(scenario.cumulative[crossing] ?? 0)}
              x2={WIDTH - PAD.right + 4}
              y2={y(scenario.cumulative[crossing] ?? 0)}
              stroke="var(--color-accent)"
              strokeWidth="1"
            />
            <circle
              cx={x(crossing)}
              cy={y(scenario.cumulative[crossing] ?? 0)}
              r="3"
              fill="var(--color-accent)"
            />
            <text
              x={WIDTH - PAD.right + 8}
              y={y(scenario.cumulative[crossing] ?? 0)}
              className="t-label"
              fill="var(--color-accent)"
              fontSize="9.5"
              letterSpacing="1.2"
              dominantBaseline="middle"
            >
              DAY {crossing + 1}
            </text>
          </g>
        ) : null}

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
          DAY {days}
        </text>
      </svg>

      {/* The facts come from the same Scenario object as the path and eyebrow. */}
      <dl className="border-t border-[var(--color-hairline)]">
        {scenario.facts.map((fact) => (
          <div key={fact.label} className="ledger-block">
            <div className="ledger-row">
              <dt className="ledger-row__label t-label text-[var(--color-accent)]">
                {fact.label}
              </dt>
              <dd className="ledger-row__desc" />
              <dd className="ledger-row__value t-value tnum">{fact.value}</dd>
            </div>
          </div>
        ))}
      </dl>
    </div>
  );
}
