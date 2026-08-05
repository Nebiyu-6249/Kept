import { LoadingRows } from "@/components/primitives/States";

export default function Loading() {
  return (
    <main id="main" className="min-h-dvh px-4 py-[56px]">
      <LoadingRows label="Loading onboarding" rows={5} />
    </main>
  );
}
