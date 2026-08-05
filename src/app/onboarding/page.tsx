import { redirect } from "next/navigation";
import { OnboardingFlow } from "@/components/onboarding/OnboardingFlow";
import { findCurrentUser, hasPolicy } from "@/lib/user";
import { DEFAULT_CURRENCY } from "@/lib/env";

export const dynamic = "force-dynamic";

export const metadata = { title: "Write your policy — KEPT" };

export default async function OnboardingPage() {
  const user = await findCurrentUser();
  // Onboarding is a one-way door: once a policy exists, /ask is the home.
  if (user && (await hasPolicy(user.id))) redirect("/ask");

  return (
    <main id="main" className="min-h-dvh px-4 py-[56px]">
      <OnboardingFlow currency={user?.currency ?? DEFAULT_CURRENCY} />
    </main>
  );
}
