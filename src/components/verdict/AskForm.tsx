"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Button, Toggle } from "@/components/primitives/Button";
import { Eyebrow, OutlineHeading } from "@/components/primitives/OutlineHeading";
import { VerdictCard, type VerdictView } from "./VerdictCard";
import { arithmeticVerdict } from "@/lib/arithmetic-verdict";
import { parseAmountToFils } from "@/lib/money";
import type { BudgetState } from "@/lib/budget-state";

export type AskCategory = { id: string; name: string; slug: string };

export function AskForm({
  categories,
  budgetState,
  currency,
}: {
  categories: AskCategory[];
  budgetState: BudgetState;
  currency: string;
}) {
  const router = useRouter();
  const reduced = useReducedMotion();

  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState<string>(categories[0]?.id ?? "");
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [verdict, setVerdict] = useState<VerdictView | null>(null);
  const [state, setState] = useState<BudgetState>(budgetState);

  async function ask(): Promise<void> {
    const amountFils = parseAmountToFils(amount);
    if (amountFils === null || amountFils < 1) {
      setFormError("Enter an amount like 450 or 45.50.");
      return;
    }
    const category = categories.find((item) => item.id === categoryId);
    if (!category) {
      setFormError("Pick a category.");
      return;
    }

    setFormError(null);
    setActionError(null);
    setPending(true);

    try {
      const response = await fetch("/api/verdict", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          amountFils,
          categoryId,
          ...(note.trim() ? { note: note.trim() } : {}),
        }),
      });
      const payload = await response.json();

      if (response.ok) {
        setState(payload.budgetState);
        setVerdict({
          intentId: payload.intentId,
          decision: payload.decision,
          ruleRef: payload.ruleRef,
          ruleText: payload.ruleText,
          reasoning: payload.reasoning,
          amountFils,
          categoryName: category.name,
          categorySlug: category.slug,
          arithmeticOnly: false,
        });
        return;
      }

      if (payload?.error?.code === "AI_UNAVAILABLE") {
        // §11.3: the arithmetic verdict, computed here from the BudgetState the
        // server already sent, and labelled as such. Nothing was recorded,
        // because the engine did not produce a verdict.
        const local = arithmeticVerdict({
          amountFils,
          categorySlug: category.slug,
          categoryName: category.name,
          budgetState: state,
        });
        setVerdict({
          intentId: null,
          decision: local.decision,
          ruleRef: null,
          ruleText: null,
          reasoning: local.reasoning,
          amountFils,
          categoryName: category.name,
          categorySlug: category.slug,
          arithmeticOnly: true,
        });
        return;
      }

      setFormError(payload?.error?.message ?? "That did not go through. Try again.");
    } catch {
      setFormError("Could not reach the server. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  async function act(action: "hold" | "purchase"): Promise<void> {
    if (!verdict?.intentId) return;
    setBusy(true);
    setActionError(null);
    try {
      const response = await fetch(`/api/intents/${verdict.intentId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const payload = await response.json();
      if (!response.ok) {
        setActionError(payload?.error?.message ?? "That did not go through.");
        return;
      }
      router.push(action === "hold" ? "/holds" : "/ledger");
      router.refresh();
    } catch {
      setActionError("Could not reach the server. Try again.");
    } finally {
      setBusy(false);
    }
  }

  function reset(): void {
    setVerdict(null);
    setAmount("");
    setNote("");
    setActionError(null);
    setFormError(null);
  }

  const fade = reduced
    ? {}
    : {
        initial: { opacity: 0, y: 26, filter: "blur(9px)" },
        animate: { opacity: 1, y: 0, filter: "blur(0px)" },
        exit: { opacity: 0, y: -12, filter: "blur(6px)" },
        transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] as const },
      };

  return (
    <AnimatePresence mode="wait" initial={false}>
      {verdict ? (
        <motion.div key="verdict" {...fade}>
          <VerdictCard
            verdict={verdict}
            budgetState={state}
            currency={currency}
            busy={busy}
            onHold={() => act("hold")}
            onLog={() => act("purchase")}
            onRetry={ask}
            onAskAgain={reset}
            actionError={actionError}
          />
        </motion.div>
      ) : (
        <motion.div key="form" {...fade}>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void ask();
            }}
            // The form does not spin. It dims, and one mono line says what is
            // happening. The progress spine is not a loading indicator (§11.3).
            className={`flex flex-col gap-6 transition-opacity duration-300 ${
              pending ? "pointer-events-none opacity-40" : "opacity-100"
            }`}
            aria-busy={pending}
          >
            <div className="flex flex-col gap-2">
              <label htmlFor="amount" className="t-label text-[var(--color-muted)]">
                Amount
              </label>
              <div className="flex items-baseline gap-3 border-b border-[var(--color-hairline)] focus-within:border-[var(--color-accent)]">
                <span className="t-label text-[var(--color-muted)]">{currency}</span>
                <input
                  id="amount"
                  // No outline-none here: the container's accent border is a
                  // nice touch, not a replacement for a 2px focus ring (§16).
                  className="tnum w-full border-0 bg-transparent py-2 font-[family-name:var(--font-mono)] text-[clamp(28px,5vw,38px)] font-500 tracking-[.02em]"
                  value={amount}
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="0.00"
                  onChange={(event) => setAmount(event.target.value)}
                />
              </div>
            </div>

            <fieldset className="flex flex-col gap-2 border-0 p-0">
              <legend className="t-label text-[var(--color-muted)]">Category</legend>
              <div className="flex flex-wrap gap-2">
                {categories.map((category) => (
                  <Toggle
                    key={category.id}
                    pressed={categoryId === category.id}
                    onClick={() => setCategoryId(category.id)}
                  >
                    {category.name}
                  </Toggle>
                ))}
              </div>
            </fieldset>

            <div className="flex flex-col gap-2">
              <label htmlFor="note" className="t-label text-[var(--color-muted)]">
                Note (optional)
              </label>
              <input
                id="note"
                className="field t-body"
                value={note}
                maxLength={280}
                placeholder="team lunch"
                onChange={(event) => setNote(event.target.value)}
              />
            </div>

            {formError ? (
              <p role="alert" className="t-body text-[var(--color-accent)]">
                {formError}
              </p>
            ) : null}

            <div className="flex items-center gap-4">
              <Button type="submit" disabled={pending}>
                Ask
              </Button>
              {pending ? (
                <span className="t-label text-[var(--color-accent)]" aria-live="polite">
                  CHECKING AGAINST YOUR POLICY
                </span>
              ) : null}
            </div>
          </form>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function AskHeading() {
  return (
    <div className="flex flex-col gap-3">
      <Eyebrow>Before you buy</Eyebrow>
      <OutlineHeading as="h1" size="l" solid={["ASK"]} outline={["BEFORE YOU BUY"]} stacked />
    </div>
  );
}
