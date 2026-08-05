import { AppFrame } from "@/components/frame/AppFrame";
import { LedgerView } from "@/components/ledger/LedgerView";
import { OutlineHeading, Eyebrow } from "@/components/primitives/OutlineHeading";
import { Reveal } from "@/components/primitives/Reveal";
import { prisma } from "@/lib/db";
import { getBudgetState } from "@/lib/budget-state";
import { requireCurrentUser } from "@/lib/user";
import { toTransactionDTO, transactionSelect } from "@/lib/serialize";
import { APP_TIMEZONE } from "@/lib/env";

export const dynamic = "force-dynamic";

export const metadata = { title: "Ledger — KEPT" };

const PAGE_SIZE = 50;

export default async function LedgerPage() {
  const user = await requireCurrentUser();

  const [rows, categories, state] = await Promise.all([
    prisma.transaction.findMany({
      where: { userId: user.id },
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
      take: PAGE_SIZE + 1,
      select: transactionSelect,
    }),
    prisma.category.findMany({
      where: { userId: user.id },
      orderBy: { name: "asc" },
      select: { id: true, name: true, slug: true },
    }),
    getBudgetState(user.id),
  ]);

  const hasMore = rows.length > PAGE_SIZE;
  const page = hasMore ? rows.slice(0, PAGE_SIZE) : rows;

  return (
    <AppFrame>
      <div className="mx-auto flex w-full max-w-[1080px] flex-col gap-6">
        <Reveal immediate>
          <Eyebrow>Everything that already happened</Eyebrow>
          <OutlineHeading as="h1" size="l" solid={["THE"]} outline={["LEDGER"]} />
        </Reveal>

        <Reveal immediate delay={90}>
          <LedgerView
            initial={page.map(toTransactionDTO)}
            initialCursor={hasMore ? (page[page.length - 1]?.id ?? null) : null}
            categories={categories}
            timeZone={APP_TIMEZONE}
            currency={user.currency}
            periodStart={state.period.start}
            periodEnd={state.period.end}
            periodSpentTotal={state.spentTotal}
          />
        </Reveal>
      </div>
    </AppFrame>
  );
}
