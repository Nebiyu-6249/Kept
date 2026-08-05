"use client";

import { Button, ButtonLink } from "./Button";
import { Eyebrow, OutlineHeading } from "./OutlineHeading";

/**
 * The shared error surface. Errors say what happened and what to do about it,
 * in the interface's voice, and never apologise (§18).
 */
export function RouteError({
  what,
  reset,
  error,
}: {
  /** What failed, in the user's terms: "the ledger", "your holds". */
  what: string;
  reset?: () => void;
  error?: Error & { digest?: string };
}) {
  return (
    <main
      id="main"
      className="mx-auto flex min-h-dvh w-full max-w-[640px] flex-col justify-center gap-5 px-4"
    >
      <Eyebrow>Something did not load</Eyebrow>
      <OutlineHeading as="h1" size="l" solid={["THIS", "DID", "NOT"]} outline={["LOAD"]} />
      <p className="t-body max-w-[52ch] text-[var(--color-ink-2)]">
        {what} could not be read just now. The data is still there. Try again, and if it keeps
        happening the server logs will have the detail.
      </p>
      {error?.digest ? (
        <p className="t-label text-[var(--color-muted)]">Reference {error.digest}</p>
      ) : null}
      <div className="flex flex-wrap gap-3">
        {reset ? <Button onClick={reset}>Try again</Button> : null}
        <ButtonLink href="/ask">Go to Ask</ButtonLink>
      </div>
    </main>
  );
}
