"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useReducedMotion } from "framer-motion";
import { OutlineHeading } from "@/components/primitives/OutlineHeading";
import { Reveal } from "@/components/primitives/Reveal";
import { formatFilsWhole } from "@/lib/money";

/**
 * The hero.
 *
 * Behind everything sits the demo dataset's Kept figure as an outlined numeral.
 * That is the app's one piece of semantics at page scale: hollow type is money
 * that stayed put, and this figure has no transaction behind it by definition.
 * It counter-travels horizontally on scroll while the copy lifts.
 */
export function Hero({
  keptFils,
  currency,
  transactionCount,
  ruleCount,
  available,
}: {
  keptFils: number;
  currency: string;
  transactionCount: number;
  ruleCount: number;
  available: boolean;
}) {
  const ghostRef = useRef<HTMLDivElement | null>(null);
  const copyRef = useRef<HTMLDivElement | null>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced) return;
    const ghost = ghostRef.current;
    const copy = copyRef.current;
    if (!ghost || !copy) return;

    let frame = 0;
    const paint = (): void => {
      frame = 0;
      const progress = Math.min(window.scrollY / Math.max(window.innerHeight, 1), 1);
      ghost.style.transform = `translate3d(${-progress * 22}%, 0, 0)`;
      copy.style.transform = `translate3d(0, ${-progress * 40}px, 0)`;
    };
    const onScroll = (): void => {
      if (frame) return;
      frame = requestAnimationFrame(paint);
    };

    paint();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
    };
  }, [reduced]);

  return (
    <section
      className="relative flex min-h-[calc(100dvh-58px)] flex-col justify-between overflow-hidden bg-[var(--color-ground-2)] px-4 pb-4 pt-[88px] md:px-6"
      style={{ isolation: "isolate" }}
    >
      <div
        ref={ghostRef}
        aria-hidden="true"
        className="pointer-events-none absolute right-[-6%] top-1/2 -z-10 -translate-y-1/2 will-change-transform"
      >
        <span
          className="t-outline-hairline tnum block font-[family-name:var(--font-display)] font-700 leading-none tracking-[-.04em]"
          style={{ fontSize: "clamp(220px, 44vw, 660px)" }}
        >
          {available ? formatFilsWhole(keptFils) : "0"}
        </span>
      </div>

      <div ref={copyRef} className="flex max-w-full flex-col gap-6 will-change-transform md:max-w-[44vw]">
        <Reveal immediate>
          <p className="t-label text-[var(--color-muted)]">Spending advisor · {currency}</p>
        </Reveal>

        <Reveal immediate delay={90}>
          <OutlineHeading
            as="h1"
            size="xl"
            solid={["ASK", "BEFORE"]}
            outline={["YOU BUY"]}
            stacked
          />
        </Reveal>

        <Reveal immediate delay={180}>
          <p className="t-body max-w-[46ch] text-[var(--color-ink-2)]">
            You write the spending policy. KEPT applies it before you buy, makes waiting the
            default when the answer is not yet, and counts the money that never left.
          </p>
        </Reveal>

        <Reveal immediate delay={270}>
          <div className="flex flex-wrap gap-3">
            <a href="#deck" className="btn">
              See how it decides
            </a>
            <Link href="/onboarding" className="btn">
              Start
            </Link>
          </div>
        </Reveal>
      </div>

      <div className="flex items-end justify-between gap-4 border-t border-[var(--color-hairline)] pt-4">
        <p className="t-label text-[var(--color-muted)]">
          {available
            ? `Every figure here is computed from ${transactionCount} seeded transactions and ${ruleCount} rules`
            : "Seed the database to see this run on real rows"}
        </p>
        <p className="t-label tnum text-right text-[var(--color-ink-2)]">
          <span className="text-[var(--color-muted)]">KEPT </span>
          {available ? formatFilsWhole(keptFils, currency) : "—"}
        </p>
      </div>
    </section>
  );
}
