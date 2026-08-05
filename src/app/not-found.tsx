import Link from "next/link";
import { Eyebrow, OutlineHeading } from "@/components/primitives/OutlineHeading";

export const metadata = { title: "Not here — KEPT" };

export default function NotFound() {
  return (
    <main
      id="main"
      className="mx-auto flex min-h-dvh w-full max-w-[640px] flex-col justify-center gap-5 px-4"
    >
      <Eyebrow>That address does not exist</Eyebrow>
      <OutlineHeading as="h1" size="l" solid={["NOTHING"]} outline={["HERE"]} />
      <p className="t-body max-w-[52ch] text-[var(--color-ink-2)]">
        There is no page at this address. Ask is the place to start.
      </p>
      <div className="flex flex-wrap gap-3">
        <Link href="/ask" className="btn">
          Go to Ask
        </Link>
        <Link href="/" className="btn">
          Home
        </Link>
      </div>
    </main>
  );
}
