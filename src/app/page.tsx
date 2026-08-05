import Link from "next/link";
import { Hero } from "@/components/home/Hero";
import { SwipeDeck } from "@/components/deck/SwipeDeck";
import { BurnLine } from "@/components/burnline/BurnLine";
import { Spine } from "@/components/frame/Spine";
import { LedgerRow } from "@/components/primitives/LedgerRow";
import { Eyebrow, OutlineHeading } from "@/components/primitives/OutlineHeading";
import { Reveal } from "@/components/primitives/Reveal";
import { getDemoData } from "@/lib/demo";
import { KEPT_DEFINITION } from "@/lib/kept";

export const dynamic = "force-dynamic";

/**
 * The signed-out home.
 *
 * Every figure on this page is computed from the seeded database. There are no
 * testimonials, no user counts, no logos and no press mentions, because none of
 * those exist — and a spending advisor that invents its own numbers has already
 * answered the only question worth asking about it.
 */
export default async function Home() {
  const demo = await getDemoData();

  return (
    <>
      <Spine />

      <header className="fixed inset-x-0 top-0 z-[85] h-[var(--frame-topbar)] border-b border-[var(--color-hairline)]">
        <div
          className="flex h-full items-center justify-between px-4 md:px-6"
          style={{
            background: "color-mix(in srgb, var(--color-ground) 82%, transparent)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            height: "100%",
          }}
        >
          <span className="font-[family-name:var(--font-display)] text-[15px] font-700 tracking-[-.03em]">
            KEPT.
          </span>
          <Link href="/onboarding" className="btn">
            Start
          </Link>
        </div>
      </header>

      <main id="main">
        <Hero
          keptFils={demo.keptFils}
          currency={demo.currency}
          transactionCount={demo.transactionCount}
          ruleCount={demo.ruleCount}
          available={demo.available}
        />

        {/* ------------------------------------------------------ deck fold */}
        <section id="deck" className="flex flex-col gap-8 px-4 py-[88px] md:px-6">
          <Reveal>
            <Eyebrow>What a verdict looks like</Eyebrow>
            <OutlineHeading as="h2" size="l" solid={["IT", "SAYS"]} outline={["NO"]} />
          </Reveal>

          <Reveal delay={90}>
            {demo.cards.length > 0 ? (
              <SwipeDeck cards={demo.cards} currency={demo.currency} />
            ) : (
              <p className="t-body max-w-[52ch] text-[var(--color-ink-2)]">
                The deck draws its cards from real verdicts. Seed the database, or write a policy
                and ask about a purchase, and they will appear here.
              </p>
            )}
          </Reveal>
        </section>

        {/* ------------------------------------------------- burn line fold */}
        <section className="flex flex-col gap-8 border-t border-[var(--color-hairline)] px-4 py-[88px] md:px-6">
          <Reveal>
            <Eyebrow>Where the period is heading</Eyebrow>
            <OutlineHeading as="h2" size="l" solid={["THE", "BURN"]} outline={["LINE"]} />
          </Reveal>

          <Reveal delay={90}>
            <div className="max-w-[860px]">
              <BurnLine scenarios={demo.scenarios} />
            </div>
          </Reveal>
        </section>

        {/* ------------------------------------------------- how it decides */}
        <section className="flex flex-col gap-8 border-t border-[var(--color-hairline)] px-4 py-[88px] md:px-6">
          <Reveal>
            <Eyebrow>No illustrations, no metaphors</Eyebrow>
            <OutlineHeading as="h2" size="l" solid={["HOW", "IT"]} outline={["DECIDES"]} />
          </Reveal>

          <Reveal delay={90}>
            <div className="max-w-[860px] border-t border-[var(--color-hairline)]">
              <LedgerRow
                label="A policy"
                description="You write it in your own words: limits, non-negotiables, leaks and hard rules. Each rule gets a ref, and a verdict quotes yours back verbatim."
                value="YOURS"
                valueTone="muted"
              />
              <LedgerRow
                label="A hold"
                description="When the answer is not yet, the purchase waits 48 hours. Nothing is decided for you at the end of it — you buy it or you let it go."
                value="48H"
                valueTone="muted"
              />
              <LedgerRow
                label="Kept"
                description={KEPT_DEFINITION}
                value="THE METRIC"
                valueTone="accent"
              />
              <LedgerRow
                label="Never"
                description="No investment advice, no loan or credit recommendations, no bank connection. This is your own outgoing spending and nothing else."
                value="OUT OF SCOPE"
                valueTone="muted"
              />
              <LedgerRow
                label="Your data"
                description="The alerts you paste in, the transactions parsed from them, your policy and your reviews. It has no access to any account."
                value="PASTED IN"
                valueTone="muted"
              />
              <LedgerRow
                label="Running it"
                description="One model call per verdict, and one per twenty alerts parsed. Every call's token usage is recorded against the row that triggered it, and Insights shows the real total."
                value="MEASURED"
                valueTone="muted"
              />
            </div>
          </Reveal>
        </section>

        {/* --------------------------------------------------------- close */}
        <section className="flex flex-col gap-8 border-t border-[var(--color-hairline)] px-4 pt-[88px] md:px-6">
          <Reveal>
            <OutlineHeading
              as="h2"
              size="l"
              solid={["DECIDE", "ONCE."]}
              outline={["THEN LET IT HOLD."]}
              stacked
            />
          </Reveal>

          <Reveal delay={90}>
            <p className="t-label max-w-[60ch] text-[var(--color-muted)]">
              Single user, no accounts to connect, no billing. KEPT stores what you paste in and
              nothing more.
            </p>
          </Reveal>

          <Reveal delay={180}>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <Link href="/onboarding" className="btn">
                Write your policy
              </Link>
              <Link href="/ask" className="btn">
                Go to the app
              </Link>
            </div>
          </Reveal>

          <div className="border-t border-[var(--color-hairline)] pt-4">
            <p className="t-label text-[var(--color-muted)]">KEPT · Spending advisor · AED</p>
          </div>

          {/* The wordmark, cropped by the page edge. */}
          <div aria-hidden="true" className="overflow-hidden">
            <span
              className="block font-[family-name:var(--font-display)] font-700 leading-[.8] tracking-[-.045em]"
              style={{ fontSize: "clamp(70px, 19vw, 290px)", transform: "translateY(.17em)" }}
            >
              KEPT.
            </span>
          </div>
        </section>
      </main>
    </>
  );
}
