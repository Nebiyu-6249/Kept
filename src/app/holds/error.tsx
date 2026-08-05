"use client";

import { RouteError } from "@/components/primitives/RouteError";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <RouteError what="Your holds" error={error} reset={reset} />;
}
