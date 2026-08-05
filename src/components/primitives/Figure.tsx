"use client";

import { useEffect, useRef } from "react";
import { useMotionValueEvent, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { formatFils, formatFilsWhole } from "@/lib/money";

export type FigureProps = {
  valueFils: number;
  label?: string;
  /**
   * Bind the count to scroll progress through this element's own section rather
   * than to a timer, so it runs backwards on scroll up.
   */
  scrollBound?: boolean;
  /** Whole units (`AED 1,240`) or two decimals (`AED 1,240.00`). */
  whole?: boolean;
  currency?: boolean;
  size?: "xl" | "l" | "m";
  className?: string;
  /** Explanatory text surfaced on hover and focus — used for the Kept figure. */
  tooltip?: string;
};

const SIZE = {
  xl: "t-display-xl",
  l: "t-display-l",
  m: "t-display-m",
} as const;

export function Figure({
  valueFils,
  label,
  scrollBound = false,
  whole = true,
  currency = true,
  size = "l",
  className = "",
  tooltip,
}: FigureProps) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const liveRef = useRef<HTMLSpanElement | null>(null);
  const reduced = useReducedMotion();

  const format = (fils: number): string =>
    whole ? formatFilsWhole(fils, currency) : formatFils(fils, { currency });

  const finalText = format(valueFils);

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start 0.95", "start 0.4"],
  });
  const counted = useTransform(scrollYProgress, [0, 1], [0, valueFils]);

  useMotionValueEvent(counted, "change", (latest) => {
    if (!scrollBound || reduced) return;
    const node = liveRef.current;
    if (node) node.textContent = format(Math.round(latest));
  });

  useEffect(() => {
    const node = liveRef.current;
    if (!node) return;
    // Reduced motion, or a static figure: the final value, immediately.
    if (!scrollBound || reduced) {
      node.textContent = finalText;
      return;
    }
    node.textContent = format(Math.round(counted.get()));
    // format is derived from props that are already dependencies.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollBound, reduced, finalText]);

  const figure = (
    // The spacer carries the final string, so the box is sized to the widest
    // value it will ever hold and the count never reflows the row beside it.
    <span ref={ref} className={`relative inline-block tnum ${SIZE[size]} ${className}`}>
      <span className="opacity-0">{finalText}</span>
      <span
        ref={liveRef}
        aria-hidden="true"
        className="absolute inset-0 flex items-baseline justify-start"
      >
        {finalText}
      </span>
    </span>
  );

  if (!label && !tooltip) return figure;

  return (
    <span className="inline-flex flex-col gap-1">
      {label ? (
        <span
          className="t-label text-[var(--color-muted)]"
          {...(tooltip ? { title: tooltip, tabIndex: 0, "aria-label": `${label}. ${tooltip}` } : {})}
        >
          {label}
        </span>
      ) : null}
      {figure}
    </span>
  );
}
