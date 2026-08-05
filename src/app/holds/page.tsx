import { AppFrame } from "@/components/frame/AppFrame";
import { HoldsView } from "@/components/holds/HoldsView";
import { Figure } from "@/components/primitives/Figure";
import { Eyebrow, OutlineHeading } from "@/components/primitives/OutlineHeading";
import { Reveal } from "@/components/primitives/Reveal";
import { prisma } from "@/lib/db";
import { getBudgetState } from "@/lib/budget-state";
import { KEPT_DEFINITION } from "@/lib/kept";
import { requireCurrentUser } from "@/lib/user";
import { intentSelect, toIntentDTO } from "@/lib/serialize";

export const dynamic = "force-dynamic";

export const metadata = { title: "Holds — KEPT" };

export default async function HoldsPage() {
  const user = await requireCurrentUser();
  const now = new Date();

  const [rows, state] = await Promise.all([
    prisma.intent.findMany({
      where: { userId: user.id, state: "HELD" },
      orderBy: [{ holdUntil: "asc" }],
      select: intentSelect,
    }),
    getBudgetState(user.id, now),
  ]);

  return (
    <AppFrame>
      <div className="mx-auto flex w-full max-w-[880px] flex-col gap-8">
        <Reveal immediate>
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div className="flex flex-col gap-3">
              <Eyebrow>What is waiting</Eyebrow>
              <OutlineHeading as="h1" size="l" solid={["ON"]} outline={["HOLD"]} />
            </div>
            {/* The figure is scroll-bound and carries its own definition, because
                a metric nobody can define is a metric nobody trusts. */}
            <Figure
              valueFils={state.kept}
              label="Kept this period"
              tooltip={KEPT_DEFINITION}
              scrollBound
              size="m"
              currency
            />
          </div>
        </Reveal>

        <Reveal immediate delay={90}>
          <HoldsView
            intents={rows.map((row) => toIntentDTO(row, now))}
            currency={user.currency}
          />
        </Reveal>
      </div>
    </AppFrame>
  );
}
