"use client";

import { useEffect, useState } from "react";
import { formatCountdown } from "@/lib/intent-machine";

/**
 * The countdown in the value column, formatted `41H 12M`.
 *
 * The server sends msRemaining so the first paint is correct and the client
 * clock never disagrees with the grouping. It ticks once a minute — the format
 * has no seconds, so a faster tick would only burn battery.
 */
export function HoldCountdown({ msRemaining }: { msRemaining: number }) {
  const [remaining, setRemaining] = useState(msRemaining);

  useEffect(() => {
    setRemaining(msRemaining);
    if (msRemaining <= 0) return;

    const startedAt = Date.now();
    const id = setInterval(() => {
      setRemaining(Math.max(0, msRemaining - (Date.now() - startedAt)));
    }, 60_000);

    return () => clearInterval(id);
  }, [msRemaining]);

  return (
    <span className="tnum" suppressHydrationWarning>
      {formatCountdown(remaining)}
    </span>
  );
}
