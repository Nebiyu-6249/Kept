import { LoadingRows } from "@/components/primitives/States";

export default function Loading() {
  return (
    <main id="main" className="min-h-dvh px-4 pt-[calc(var(--frame-topbar)+34px)] md:pl-[calc(var(--frame-rail)+34px)]">
      <LoadingRows label="Loading insights" rows={8} />
    </main>
  );
}
