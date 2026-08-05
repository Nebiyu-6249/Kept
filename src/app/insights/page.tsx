import { AppFrame } from "@/components/frame/AppFrame";
import { HoldBar, PeriodBurn } from "@/components/insights/PeriodBurn";
import { LedgerRow } from "@/components/primitives/LedgerRow";
import { Eyebrow, OutlineHeading } from "@/components/primitives/OutlineHeading";
import { Reveal } from "@/components/primitives/Reveal";
import { EmptyState } from "@/components/primitives/States";
import { ButtonLink } from "@/components/primitives/Button";
import { getInsights } from "@/lib/insights";
import { requireCurrentUser } from "@/lib/user";
import { formatFils } from "@/lib/money";

export const dynamic = "force-dynamic";

export const metadata = { title: "Insights — KEPT" };

/** Reads as a sentence at every count, including zero and one. */
function describeReviews(reviewed: number, notWorthIt: number): string {
  if (reviewed === 0) return "Nothing reviewed yet";
  if (notWorthIt === 0) {
    return reviewed === 1 ? "1 reviewed, and it was worth it" : `${reviewed} reviewed, all worth it`;
  }
  if (notWorthIt === reviewed) {
    return reviewed === 1
      ? "1 reviewed, and it was not worth it"
      : `${reviewed} reviewed, none worth it`;
  }
  return `${notWorthIt} of ${reviewed} reviewed were not worth it`;
}

export default async function InsightsPage() {
  const user = await requireCurrentUser();
  const insights = await getInsights(user.id);
  const currency = user.currency;
  const money = (fils: number) => formatFils(fils, { currency });

  return (
    <AppFrame>
      <div className="mx-auto flex w-full max-w-[880px] flex-col gap-9">
        <Reveal immediate>
          <div className="flex flex-col gap-3">
            <Eyebrow>What the period is actually doing</Eyebrow>
            <OutlineHeading as="h1" size="l" solid={["THE"]} outline={["EVIDENCE"]} />
          </div>
        </Reveal>

        {!insights.hasEnoughData ? (
          <Reveal immediate delay={90}>
            <EmptyState
              title="Not enough to chart yet"
              action={<ButtonLink href="/import">Import your alerts</ButtonLink>}
            >
              A burn line needs a few days of real spending behind it. Rather than draw a
              confident line through three points, this waits until there is something to see.
            </EmptyState>
          </Reveal>
        ) : (
          <Reveal immediate delay={90}>
            <section className="flex flex-col gap-4" aria-labelledby="burn">
              <h2 id="burn" className="t-label text-[var(--color-muted)]">
                Discretionary spend against an even rate
              </h2>
              <PeriodBurn
                cumulative={insights.cumulative}
                idealPerDay={insights.idealPerDay}
                daysElapsed={insights.daysElapsed}
                currency={currency}
              />
              <div className="border-t border-[var(--color-hairline)]">
                <LedgerRow
                  label="Spent"
                  description="Everything this period, bills included"
                  value={money(insights.budgetState.spentTotal)}
                />
                <LedgerRow
                  label="Discretionary"
                  description="The part a verdict can do anything about"
                  value={money(insights.budgetState.spentDiscretionary)}
                />
                <LedgerRow
                  label="Safe to spend"
                  description="Income less committed bills, spend and holds"
                  value={money(insights.budgetState.safeToSpend)}
                  valueTone={insights.budgetState.safeToSpend < 0 ? "accent" : "default"}
                />
              </div>
            </section>
          </Reveal>
        )}

        <Reveal delay={90}>
          <section className="flex flex-col gap-4" aria-labelledby="categories">
            <h2 id="categories" className="t-label text-[var(--color-muted)]">
              By category, with your own regret rate
            </h2>
            <div className="border-t border-[var(--color-hairline)]">
              {insights.categories.map((category) => (
                <LedgerRow
                  key={category.slug}
                  marker={
                    category.notWorthItRate !== null &&
                    category.reviewed >= 3 &&
                    category.notWorthItRate >= 0.5
                  }
                  label={category.name}
                  description={describeReviews(category.reviewed, category.notWorthIt)}
                  value={
                    category.limit === null
                      ? money(category.spent)
                      : `${money(category.spent)} / ${formatFils(category.limit)}`
                  }
                  valueTone={
                    category.remaining !== null && category.remaining < 0 ? "accent" : "default"
                  }
                />
              ))}
            </div>
          </section>
        </Reveal>

        <Reveal delay={90}>
          <section className="flex flex-col gap-4" aria-labelledby="holds">
            <h2 id="holds" className="t-label text-[var(--color-muted)]">
              Does waiting actually change anything
            </h2>
            <div className="flex flex-wrap items-end gap-9">
              <div className="flex flex-col gap-1">
                <span className="t-label text-[var(--color-muted)]">Let go</span>
                <span className="t-display-m tnum">{insights.holds.released}</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="t-label text-[var(--color-muted)]">Bought anyway</span>
                <span className="t-display-m tnum">{insights.holds.purchased}</span>
              </div>
            </div>
            <HoldBar
              released={insights.holds.released}
              purchased={insights.holds.purchased}
            />
            <div className="border-t border-[var(--color-hairline)]">
              <LedgerRow
                label="Let go"
                description="Money a hold kept where it was"
                value={money(insights.holds.releasedFils)}
                valueTone="accent"
              />
              <LedgerRow
                label="Bought anyway"
                description="Money that went out after the wait"
                value={money(insights.holds.purchasedFils)}
              />
            </div>
          </section>
        </Reveal>

        <Reveal delay={90}>
          <section className="flex flex-col gap-4" aria-labelledby="cost">
            <h2 id="cost" className="t-label text-[var(--color-muted)]">
              What it costs to run
            </h2>
            <div className="border-t border-[var(--color-hairline)]">
              <LedgerRow
                label="Verdicts"
                description="Policy checks run this period"
                value={String(insights.cost.verdictsThisPeriod)}
              />
              <LedgerRow
                label="Tokens in"
                description="Across those verdicts"
                value={insights.cost.inputTokens.toLocaleString("en-US")}
              />
              <LedgerRow
                label="Tokens out"
                description="Across those verdicts"
                value={insights.cost.outputTokens.toLocaleString("en-US")}
              />
              <LedgerRow
                label="Median latency"
                description="How long a verdict takes to come back"
                value={
                  insights.cost.medianLatencyMs === null
                    ? "—"
                    : `${insights.cost.medianLatencyMs} ms`
                }
              />
            </div>
            <p className="t-label text-[var(--color-muted)]">
              Recorded per verdict as it runs. Seeded verdicts have no usage against them, so a
              fresh dataset reads as zero rather than as an estimate.
            </p>
          </section>
        </Reveal>
      </div>
    </AppFrame>
  );
}
