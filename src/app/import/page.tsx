import { AppFrame } from "@/components/frame/AppFrame";
import { ImportView } from "@/components/import/ImportView";
import { Eyebrow, OutlineHeading } from "@/components/primitives/OutlineHeading";
import { Reveal } from "@/components/primitives/Reveal";
import { requireCurrentUser } from "@/lib/user";

export const dynamic = "force-dynamic";

export const metadata = { title: "Import — KEPT" };

export default async function ImportPage() {
  const user = await requireCurrentUser();

  return (
    <AppFrame>
      <div className="mx-auto flex w-full max-w-[720px] flex-col gap-8">
        <Reveal immediate>
          <div className="flex flex-col gap-3">
            <Eyebrow>Paste what your bank sent you</Eyebrow>
            <OutlineHeading as="h1" size="l" solid={["IMPORT"]} outline={["ALERTS"]} />
            <p className="t-body max-w-[54ch] text-[var(--color-ink-2)]">
              KEPT has no access to your bank. It reads the alert messages you paste in, and
              nothing else.
            </p>
          </div>
        </Reveal>

        <Reveal immediate delay={90}>
          <ImportView currency={user.currency} />
        </Reveal>
      </div>
    </AppFrame>
  );
}
