import { AppFrame } from "@/components/frame/AppFrame";
import { AskForm, AskHeading } from "@/components/verdict/AskForm";
import { EmptyState } from "@/components/primitives/States";
import { ButtonLink } from "@/components/primitives/Button";
import { Reveal } from "@/components/primitives/Reveal";
import { prisma } from "@/lib/db";
import { getBudgetState } from "@/lib/budget-state";
import { requireCurrentUser } from "@/lib/user";

export const dynamic = "force-dynamic";

export const metadata = { title: "Ask — KEPT" };

export default async function AskPage() {
  const user = await requireCurrentUser();

  const [categories, budgetState] = await Promise.all([
    prisma.category.findMany({
      where: { userId: user.id },
      orderBy: { name: "asc" },
      select: { id: true, name: true, slug: true },
    }),
    getBudgetState(user.id),
  ]);

  return (
    <AppFrame>
      <div className="mx-auto flex w-full max-w-[640px] flex-col gap-8">
        <Reveal immediate>
          <AskHeading />
        </Reveal>

        <Reveal immediate delay={90}>
          {categories.length === 0 ? (
            <EmptyState
              title="No categories yet"
              action={<ButtonLink href="/onboarding">Write your policy</ButtonLink>}
            >
              A verdict needs a category to weigh the amount against. Add some in onboarding and
              come back.
            </EmptyState>
          ) : (
            <AskForm
              categories={categories}
              budgetState={budgetState}
              currency={user.currency}
            />
          )}
        </Reveal>
      </div>
    </AppFrame>
  );
}
