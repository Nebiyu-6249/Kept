"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Stepper } from "./Stepper";
import { Button, Toggle } from "@/components/primitives/Button";
import { LedgerRow } from "@/components/primitives/LedgerRow";
import { Eyebrow, OutlineHeading } from "@/components/primitives/OutlineHeading";
import { formatFils, parseAmountToFils } from "@/lib/money";
import {
  assemblePolicyBody,
  assembleRules,
  linesToRules,
  RULE_KIND_LABEL,
  type DraftCategory,
} from "@/lib/policy";
import { slugify } from "@/lib/merchant";

const STEPS = [
  "Period and income",
  "Categories",
  "Non-negotiables and leaks",
  "Hard rules",
  "Review",
] as const;

const STARTER_CATEGORIES: DraftCategory[] = [
  { name: "Groceries", slug: "groceries", limitPerPeriodFils: 150_000, discretionary: true },
  { name: "Dining", slug: "dining", limitPerPeriodFils: 140_000, discretionary: true },
  { name: "Food delivery", slug: "food-delivery", limitPerPeriodFils: 60_000, discretionary: true },
  { name: "Transport", slug: "transport", limitPerPeriodFils: 80_000, discretionary: true },
  { name: "Utilities", slug: "utilities", limitPerPeriodFils: 90_000, discretionary: false },
  { name: "Rent", slug: "rent", limitPerPeriodFils: null, discretionary: false },
  { name: "Subscriptions", slug: "subscriptions", limitPerPeriodFils: 30_000, discretionary: true },
  { name: "Clothing", slug: "clothing", limitPerPeriodFils: 70_000, discretionary: true },
  { name: "Household", slug: "household", limitPerPeriodFils: 50_000, discretionary: true },
];

type CategoryDraft = DraftCategory & { limitInput: string };

export function OnboardingFlow({ currency }: { currency: string }) {
  const router = useRouter();
  const reduced = useReducedMotion();
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [displayName, setDisplayName] = useState("");
  const [periodType, setPeriodType] = useState<"MONTHLY" | "SEMIMONTHLY" | "WEEKLY">("MONTHLY");
  const [periodAnchor, setPeriodAnchor] = useState("1");
  const [incomeInput, setIncomeInput] = useState("");

  const [categories, setCategories] = useState<CategoryDraft[]>(
    STARTER_CATEGORIES.map((category) => ({
      ...category,
      limitInput:
        category.limitPerPeriodFils === null ? "" : (category.limitPerPeriodFils / 100).toFixed(0),
    })),
  );
  const [newCategory, setNewCategory] = useState("");

  const [nonNegotiables, setNonNegotiables] = useState("");
  const [leaks, setLeaks] = useState("");
  const [hardRules, setHardRules] = useState("");

  const monthlyIncomeFils = parseAmountToFils(incomeInput);
  const anchorNumber = Number.parseInt(periodAnchor, 10);

  const draftCategories: DraftCategory[] = useMemo(
    () =>
      categories.map((category) => ({
        name: category.name,
        slug: category.slug || slugify(category.name),
        limitPerPeriodFils: category.limitInput.trim() === "" ? null : parseAmountToFils(category.limitInput),
        discretionary: category.discretionary,
      })),
    [categories],
  );

  const rules = useMemo(
    () =>
      assembleRules({
        hardRules: linesToRules(hardRules),
        categories: draftCategories,
        nonNegotiables: linesToRules(nonNegotiables),
        leaks: linesToRules(leaks),
      }),
    [hardRules, draftCategories, nonNegotiables, leaks],
  );

  const body = useMemo(
    () =>
      assemblePolicyBody({
        displayName: displayName.trim() || "You",
        monthlyIncomeFils: monthlyIncomeFils ?? 0,
        rules,
      }),
    [displayName, monthlyIncomeFils, rules],
  );

  const stepValid = ((): { ok: boolean; message?: string } => {
    if (step === 0) {
      if (monthlyIncomeFils === null) return { ok: false, message: "Enter your income, like 18000." };
      if (!Number.isFinite(anchorNumber) || anchorNumber < 1) {
        return { ok: false, message: "Pick the day your period starts." };
      }
      if (periodType === "WEEKLY" && anchorNumber > 7) {
        return { ok: false, message: "For a weekly period, pick a weekday from 1 to 7." };
      }
      if (periodType !== "WEEKLY" && anchorNumber > 31) {
        return { ok: false, message: "Pick a day from 1 to 31." };
      }
      return { ok: true };
    }
    if (step === 1) {
      if (draftCategories.length === 0) return { ok: false, message: "Keep at least one category." };
      const bad = categories.find(
        (category) => category.limitInput.trim() !== "" && parseAmountToFils(category.limitInput) === null,
      );
      if (bad) return { ok: false, message: `The limit on ${bad.name} needs to be a number.` };
      return { ok: true };
    }
    return { ok: true };
  })();

  function go(next: number): void {
    setDirection(next > step ? 1 : -1);
    setStep(next);
    setError(null);
  }

  async function submit(): Promise<void> {
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/policy", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          displayName: displayName.trim() || undefined,
          body,
          rules,
          categories: draftCategories,
          monthlyIncomeFils: monthlyIncomeFils ?? 0,
          periodType,
          periodAnchor: anchorNumber,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        setError(payload?.error?.message ?? "That did not save. Check the fields and try again.");
        return;
      }
      router.push("/ask");
      router.refresh();
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const slide = reduced
    ? {}
    : {
        initial: { opacity: 0, x: direction * 20 },
        animate: { opacity: 1, x: 0 },
        exit: { opacity: 0, x: direction * -20 },
        transition: { type: "spring" as const, stiffness: 260, damping: 30 },
      };

  return (
    <div className="mx-auto flex w-full max-w-[640px] flex-col gap-6">
      <div>
        <Eyebrow>Step {step + 1} of {STEPS.length}</Eyebrow>
        <OutlineHeading
          as="h1"
          size="l"
          solid={["WRITE", "YOUR"]}
          outline={["POLICY"]}
        />
      </div>

      <Stepper steps={STEPS} current={step} onJump={go} />

      <HeightBox reduced={Boolean(reduced)}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={step} {...slide}>
            <h2 className="t-label mb-4 text-[var(--color-muted)]">{STEPS[step]}</h2>

            {step === 0 ? (
              <StepPeriod
                displayName={displayName}
                setDisplayName={setDisplayName}
                periodType={periodType}
                setPeriodType={setPeriodType}
                periodAnchor={periodAnchor}
                setPeriodAnchor={setPeriodAnchor}
                incomeInput={incomeInput}
                setIncomeInput={setIncomeInput}
                currency={currency}
              />
            ) : null}

            {step === 1 ? (
              <StepCategories
                categories={categories}
                setCategories={setCategories}
                newCategory={newCategory}
                setNewCategory={setNewCategory}
                currency={currency}
              />
            ) : null}

            {step === 2 ? (
              <StepLists
                nonNegotiables={nonNegotiables}
                setNonNegotiables={setNonNegotiables}
                leaks={leaks}
                setLeaks={setLeaks}
              />
            ) : null}

            {step === 3 ? <StepHardRules value={hardRules} onChange={setHardRules} /> : null}

            {step === 4 ? (
              <StepReview rules={rules} body={body} currency={currency} income={monthlyIncomeFils ?? 0} />
            ) : null}
          </motion.div>
        </AnimatePresence>
      </HeightBox>

      {!stepValid.ok && stepValid.message ? (
        <p className="t-body text-[var(--color-accent)]" role="alert">
          {stepValid.message}
        </p>
      ) : null}

      {error ? (
        <p className="t-body text-[var(--color-accent)]" role="alert">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3 border-t border-[var(--color-hairline)] pt-6">
        {step > 0 ? <Button onClick={() => go(step - 1)}>Back</Button> : null}
        {step < STEPS.length - 1 ? (
          <Button onClick={() => go(step + 1)} disabled={!stepValid.ok}>
            Next
          </Button>
        ) : (
          <Button onClick={submit} disabled={submitting}>
            {submitting ? "Saving" : "Save policy"}
          </Button>
        )}
        <span className="t-label text-[var(--color-muted)]">
          {rules.length} {rules.length === 1 ? "rule" : "rules"} so far
        </span>
      </div>
    </div>
  );
}

/** Animates its height to the content, per §11.2. */
function HeightBox({ children, reduced }: { children: React.ReactNode; reduced: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  if (reduced) return <div ref={ref}>{children}</div>;
  return (
    <motion.div layout transition={{ type: "spring", stiffness: 260, damping: 34 }}>
      <div ref={ref}>{children}</div>
    </motion.div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="t-label text-[var(--color-muted)]">{label}</span>
      {children}
      {hint ? <span className="t-label text-[var(--color-muted)]">{hint}</span> : null}
    </label>
  );
}

function StepPeriod(props: {
  displayName: string;
  setDisplayName: (v: string) => void;
  periodType: "MONTHLY" | "SEMIMONTHLY" | "WEEKLY";
  setPeriodType: (v: "MONTHLY" | "SEMIMONTHLY" | "WEEKLY") => void;
  periodAnchor: string;
  setPeriodAnchor: (v: string) => void;
  incomeInput: string;
  setIncomeInput: (v: string) => void;
  currency: string;
}) {
  return (
    <div className="flex flex-col gap-5">
      <Field label="What should we call you">
        <input
          className="field t-value"
          value={props.displayName}
          placeholder="Sam"
          onChange={(event) => props.setDisplayName(event.target.value)}
        />
      </Field>

      <div className="flex flex-col gap-2">
        <span className="t-label text-[var(--color-muted)]">Period</span>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Period type">
          {(["MONTHLY", "SEMIMONTHLY", "WEEKLY"] as const).map((type) => (
            <Toggle
              key={type}
              pressed={props.periodType === type}
              onClick={() => props.setPeriodType(type)}
            >
              {type === "MONTHLY" ? "Monthly" : type === "SEMIMONTHLY" ? "Twice a month" : "Weekly"}
            </Toggle>
          ))}
        </div>
      </div>

      <Field
        label={props.periodType === "WEEKLY" ? "Weekday it starts" : "Day of the month it starts"}
        hint={
          props.periodType === "WEEKLY"
            ? "1 is Monday, 7 is Sunday."
            : "Payday, usually. A day past the end of a short month falls back to the last day."
        }
      >
        <input
          className="field t-value tnum"
          value={props.periodAnchor}
          inputMode="numeric"
          onChange={(event) => props.setPeriodAnchor(event.target.value)}
        />
      </Field>

      <Field label={`Income each period (${props.currency})`}>
        <input
          className="field t-value tnum text-[24px]"
          value={props.incomeInput}
          inputMode="decimal"
          placeholder="18000"
          onChange={(event) => props.setIncomeInput(event.target.value)}
        />
      </Field>
    </div>
  );
}

function StepCategories(props: {
  categories: CategoryDraft[];
  setCategories: (updater: (current: CategoryDraft[]) => CategoryDraft[]) => void;
  newCategory: string;
  setNewCategory: (v: string) => void;
  currency: string;
}) {
  function update(index: number, patch: Partial<CategoryDraft>): void {
    props.setCategories((current) =>
      current.map((category, i) => (i === index ? { ...category, ...patch } : category)),
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="t-body text-[var(--color-ink-2)]">
        A limit is what you want to stay under each period. Leave it blank to track the category
        without a limit. Discretionary means you have a choice about it — those are the ones a
        verdict can ask you to wait on.
      </p>

      <div>
        {props.categories.map((category, index) => (
          <div key={category.slug} className="ledger-block">
            <div className="ledger-row">
              <span className="ledger-row__label t-label text-[var(--color-accent)]">
                {category.name}
              </span>
              <span className="ledger-row__desc">
                <Toggle
                  pressed={category.discretionary}
                  onClick={() => update(index, { discretionary: !category.discretionary })}
                >
                  {category.discretionary ? "Discretionary" : "Fixed"}
                </Toggle>
              </span>
              <span className="ledger-row__value flex items-baseline justify-end gap-2">
                <span className="t-label text-[var(--color-muted)]">{props.currency}</span>
                <input
                  className="field t-value tnum w-[92px] text-right"
                  value={category.limitInput}
                  inputMode="decimal"
                  placeholder="none"
                  aria-label={`${category.name} limit per period`}
                  onChange={(event) => update(index, { limitInput: event.target.value })}
                />
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-1 flex-col gap-1">
          <span className="t-label text-[var(--color-muted)]">Add a category</span>
          <input
            className="field t-value"
            value={props.newCategory}
            placeholder="Books"
            onChange={(event) => props.setNewCategory(event.target.value)}
          />
        </label>
        <Button
          disabled={props.newCategory.trim() === ""}
          onClick={() => {
            const name = props.newCategory.trim();
            if (!name) return;
            const slug = slugify(name);
            props.setCategories((current) =>
              current.some((category) => category.slug === slug)
                ? current
                : [
                    ...current,
                    { name, slug, limitPerPeriodFils: null, discretionary: true, limitInput: "" },
                  ],
            );
            props.setNewCategory("");
          }}
        >
          Add
        </Button>
      </div>
    </div>
  );
}

function StepLists(props: {
  nonNegotiables: string;
  setNonNegotiables: (v: string) => void;
  leaks: string;
  setLeaks: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      <p className="t-body text-[var(--color-ink-2)]">
        Your words, not ours. A verdict quotes these back to you exactly as you wrote them, so write
        them the way you would say them.
      </p>
      <Field label="Non-negotiables — one per line" hint="The things you do not cut.">
        <textarea
          className="field t-body min-h-[96px] resize-y"
          value={props.nonNegotiables}
          placeholder={"Rent and utilities come out first, always\nGroceries are never a thing to cut"}
          onChange={(event) => props.setNonNegotiables(event.target.value)}
        />
      </Field>
      <Field label="Leaks — one per line" hint="Where the money goes when you are not watching.">
        <textarea
          className="field t-body min-h-[96px] resize-y"
          value={props.leaks}
          placeholder={"Food delivery when I am tired, not hungry\nSubscriptions I have not opened in a month"}
          onChange={(event) => props.setLeaks(event.target.value)}
        />
      </Field>
    </div>
  );
}

function StepHardRules({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const preview = linesToRules(value);
  return (
    <div className="flex flex-col gap-4">
      <p className="t-body text-[var(--color-ink-2)]">
        One rule per line. Each becomes a numbered rule a verdict can cite. A hard rule wins over
        the arithmetic — if the money is there but the rule says no, the answer is no.
      </p>
      <textarea
        className="field t-body min-h-[140px] resize-y"
        value={value}
        placeholder={"Nothing over 200 without a 48 hour wait\nNo food delivery on a weekday"}
        onChange={(event) => onChange(event.target.value)}
      />
      {preview.length > 0 ? (
        <div>
          {preview.map((line, index) => (
            <LedgerRow
              key={`${line}-${index}`}
              label={`R-${String(index + 1).padStart(2, "0")}`}
              description={line}
              value="HARD RULE"
              valueTone="muted"
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function StepReview({
  rules,
  body,
  currency,
  income,
}: {
  rules: ReturnType<typeof assembleRules>;
  body: string;
  currency: string;
  income: number;
}) {
  return (
    <div className="flex flex-col gap-4">
      <p className="t-body text-[var(--color-ink-2)]">
        This is the policy the verdict engine reads. Every rule keeps its ref, and a verdict quotes
        the text back to you word for word.
      </p>

      <div className="border-t border-[var(--color-hairline)]">
        <LedgerRow
          label="Income"
          description="Each period"
          value={formatFils(income, { currency })}
        />
        {rules.map((rule) => (
          <LedgerRow
            key={rule.ref}
            label={rule.ref}
            description={rule.text}
            value={RULE_KIND_LABEL[rule.kind]}
            valueTone="muted"
          />
        ))}
      </div>

      {rules.length === 0 ? (
        <p className="t-body text-[var(--color-ink-2)]">
          No rules yet. You can save an empty policy and every verdict will be decided on the
          arithmetic alone — go back and add a rule if you would rather it had something to quote.
        </p>
      ) : null}

      <details>
        <summary className="t-label cursor-pointer text-[var(--color-muted)]">
          The stored policy text
        </summary>
        <pre className="t-body mt-2 whitespace-pre-wrap break-words text-[var(--color-ink-2)]">
          {body}
        </pre>
      </details>
    </div>
  );
}
