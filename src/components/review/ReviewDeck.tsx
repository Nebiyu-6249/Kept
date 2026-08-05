"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Button } from "@/components/primitives/Button";
import { Eyebrow } from "@/components/primitives/OutlineHeading";
import { formatFils } from "@/lib/money";
import { fullDate } from "@/lib/format-date";
import type { PendingReview } from "@/app/api/review/route";

/**
 * One question, one card, nothing else on screen.
 *
 * This is deliberately the plainest surface in the app (§11.7): no marker, no
 * accent rule, no figure treatment. The answer feeds the category history the
 * verdict engine reads, so the only thing that matters here is that it is easy
 * to answer honestly.
 */
export function ReviewDeck({
  initial,
  currency,
  timeZone,
}: {
  initial: PendingReview | null;
  currency: string;
  timeZone: string;
}) {
  const router = useRouter();
  const reduced = useReducedMotion();
  const [current, setCurrent] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [answered, setAnswered] = useState(0);

  async function answer(worthIt: boolean): Promise<void> {
    if (!current) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/review", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ transactionId: current.transactionId, worthIt }),
      });
      const payload = await response.json();
      if (!response.ok) {
        setError(payload?.error?.message ?? "That answer did not save.");
        return;
      }
      setAnswered((count) => count + 1);
      setCurrent(payload.next);
      if (!payload.next) router.refresh();
    } catch {
      setError("Could not reach the server. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const slide = reduced
    ? {}
    : {
        initial: { opacity: 0, x: 24 },
        animate: { opacity: 1, x: 0 },
        exit: { opacity: 0, x: -24 },
        transition: { type: "spring" as const, stiffness: 280, damping: 32 },
      };

  if (!current) {
    return (
      <div className="flex flex-col gap-4" aria-live="polite">
        <Eyebrow>Review</Eyebrow>
        <h1 className="t-display-m">
          <span>NOTHING</span> <span className="t-outline">TO REVIEW</span>
        </h1>
        <p className="t-body max-w-[46ch] text-[var(--color-ink-2)]">
          {answered > 0
            ? `That is all of them. ${answered} answered, and each one makes the next verdict in that category better informed.`
            : "Purchases become reviewable a week after they happen. Come back when something has had time to settle."}
        </p>
      </div>
    );
  }

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div key={current.transactionId} {...slide} className="flex flex-col gap-6">
        <div aria-live="polite" className="flex flex-col gap-2">
          <Eyebrow>{current.category?.name ?? "Uncategorised"}</Eyebrow>
          <p className="t-display-m tnum">{formatFils(current.amount, { currency })}</p>
          <p className="t-body text-[var(--color-ink-2)]">
            {current.merchant} · {fullDate(current.occurredAt, timeZone)}
          </p>
        </div>

        <h1 className="t-display-m">
          <span>WORTH</span> <span className="t-outline">IT?</span>
        </h1>

        {error ? (
          <p role="alert" className="t-body text-[var(--color-accent)]">
            {error}
          </p>
        ) : null}

        <div className="flex gap-3">
          <Button onClick={() => answer(true)} disabled={busy}>
            Yes
          </Button>
          <Button onClick={() => answer(false)} disabled={busy}>
            No
          </Button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
