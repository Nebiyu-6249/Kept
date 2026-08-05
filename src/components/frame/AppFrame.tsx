import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { Rail } from "./Rail";
import { Spine } from "./Spine";
import { TopBar } from "./TopBar";
import { getBudgetState } from "@/lib/budget-state";
import { formatFilsWhole } from "@/lib/money";
import { currentPeriod, periodLabel as toPeriodLabel } from "@/lib/period";
import { findCurrentUser } from "@/lib/user";
import { prisma } from "@/lib/db";

/**
 * The fixed frame present on every authenticated route (§10), plus the guard
 * from §11.2: anything other than /onboarding sends you there when no policy
 * exists, because a verdict engine with no policy to apply has nothing to say.
 *
 * The rail and the top bar read their figures from BudgetState. Nothing in the
 * frame computes a number.
 */
export async function AppFrame({ children }: { children: ReactNode }) {
  const user = await findCurrentUser();
  if (!user) redirect("/onboarding");

  const policy = await prisma.policy.findUnique({
    where: { userId: user.id },
    select: { id: true },
  });
  if (!policy) redirect("/onboarding");

  const state = await getBudgetState(user.id);
  const label = toPeriodLabel(currentPeriod(user));
  const kept = formatFilsWhole(state.kept, user.currency);

  return (
    <>
      <Spine />
      <Rail periodLabel={label} keptLabel={kept} />
      <TopBar periodLabel={label} />
      <main
        id="main"
        className="min-h-dvh px-4 pb-[88px] pt-[calc(var(--frame-topbar)+34px)] md:pl-[calc(var(--frame-rail)+34px)] md:pr-[34px]"
      >
        {children}
      </main>
    </>
  );
}
