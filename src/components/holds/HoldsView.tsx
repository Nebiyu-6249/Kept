"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LedgerRow } from "@/components/primitives/LedgerRow";
import { Button, ButtonLink } from "@/components/primitives/Button";
import { EmptyState } from "@/components/primitives/States";
import { HoldCountdown } from "@/components/verdict/HoldCountdown";
import { formatFils } from "@/lib/money";
import type { IntentDTO } from "@/lib/serialize";

export function HoldsView({ intents, currency }: { intents: IntentDTO[]; currency: string }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const expired = intents.filter((intent) => intent.expired);
  const waiting = intents.filter((intent) => !intent.expired);

  async function act(id: string, action: "purchase" | "release"): Promise<void> {
    setBusyId(id);
    setError(null);
    try {
      const response = await fetch(`/api/intents/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const payload = await response.json();
      if (!response.ok) {
        setError(payload?.error?.message ?? "That did not go through.");
        return;
      }
      router.refresh();
    } catch {
      setError("Could not reach the server. Try again.");
    } finally {
      setBusyId(null);
    }
  }

  if (intents.length === 0) {
    return (
      <EmptyState
        title="Nothing waiting"
        action={<ButtonLink href="/ask">Ask about a purchase</ButtonLink>}
      >
        No holds. When a verdict says wait, it lands here.
      </EmptyState>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {error ? (
        <p role="alert" className="t-body text-[var(--color-accent)]">
          {error}
        </p>
      ) : null}

      {expired.length > 0 ? (
        <section aria-labelledby="ready">
          <h2
            id="ready"
            className="t-label flex items-baseline justify-between border-b border-[var(--color-hairline)] pb-2 text-[var(--color-accent)]"
          >
            <span>Ready to decide</span>
            <span className="tnum">{expired.length}</span>
          </h2>
          {expired.map((intent) => (
            <HoldRow
              key={intent.id}
              intent={intent}
              currency={currency}
              busy={busyId === intent.id}
              open={openId === intent.id}
              onToggle={() => setOpenId(openId === intent.id ? null : intent.id)}
              onAct={(action) => act(intent.id, action)}
            />
          ))}
        </section>
      ) : null}

      {waiting.length > 0 ? (
        <section aria-labelledby="waiting">
          <h2
            id="waiting"
            className="t-label flex items-baseline justify-between border-b border-[var(--color-hairline)] pb-2 text-[var(--color-muted)]"
          >
            <span>Waiting</span>
            <span className="tnum">{waiting.length}</span>
          </h2>
          {waiting.map((intent) => (
            <HoldRow
              key={intent.id}
              intent={intent}
              currency={currency}
              busy={busyId === intent.id}
              open={openId === intent.id}
              onToggle={() => setOpenId(openId === intent.id ? null : intent.id)}
              onAct={(action) => act(intent.id, action)}
            />
          ))}
        </section>
      ) : null}
    </div>
  );
}

function HoldRow({
  intent,
  currency,
  busy,
  open,
  onToggle,
  onAct,
}: {
  intent: IntentDTO;
  currency: string;
  busy: boolean;
  open: boolean;
  onToggle: () => void;
  onAct: (action: "purchase" | "release") => void;
}) {
  return (
    <LedgerRow
      marker={intent.expired}
      label={intent.category?.name ?? "Uncategorised"}
      description={
        <span className="flex flex-wrap items-baseline gap-2">
          <span className="text-[var(--color-ink)]">{intent.note ?? "No note"}</span>
          {intent.ruleRef ? (
            <span className="t-label text-[var(--color-muted)]">{intent.ruleRef}</span>
          ) : null}
        </span>
      }
      value={
        <span className="inline-flex items-baseline gap-6">
          <span>{formatFils(intent.amount, { currency })}</span>
          <span className={intent.expired ? "text-[var(--color-accent)]" : ""}>
            <HoldCountdown msRemaining={intent.msRemaining} />
          </span>
        </span>
      }
      onClick={onToggle}
      expanded={open}
      controlLabel={`${intent.note ?? "Hold"}, ${formatFils(intent.amount, {
        currency,
      })}. Open details`}
      expandable={
        <div className="flex flex-col gap-4 border-t border-[var(--color-hairline)] pt-4">
          <p className="t-body max-w-[54ch] text-[var(--color-ink-2)]">{intent.reasoning}</p>
          {intent.expired ? (
            <div className="flex flex-wrap gap-3">
              <Button onClick={() => onAct("purchase")} disabled={busy}>
                Buy it
              </Button>
              <Button onClick={() => onAct("release")} disabled={busy}>
                Let it go
              </Button>
            </div>
          ) : (
            <p className="t-label text-[var(--color-muted)]">
              This opens up when the wait is over. Nothing is decided for you.
            </p>
          )}
        </div>
      }
    />
  );
}
