"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/primitives/Button";
import { LedgerRow } from "@/components/primitives/LedgerRow";
import { formatFils } from "@/lib/money";

type RowState = "PENDING" | "PARSED" | "SKIPPED" | "FAILED";

type BatchRow = {
  index: number;
  sourceText: string;
  state: RowState;
  merchant: string | null;
  amount: number | null;
  error: string | null;
};

type Batch = {
  batchId: string;
  state: "QUEUED" | "RUNNING" | "DONE" | "FAILED";
  total: number;
  processed: number;
  failed: number;
  error: string | null;
  rows: BatchRow[];
};

const PLACEHOLDER = `Paste one alert per line, for example:

Your Card ending 4417 was used for AED 245.50 at CARREF 4471 DUBAI AE on 12/07/2026 14:32. Avl Bal AED 8,412.10
Purchase of AED 62.00 at TALABAT.COM on 14-07-2026. Ref 88213A`;

/** §8: poll every 1.5s, backing off to 4s after 30s. */
const FAST_INTERVAL = 1_500;
const SLOW_INTERVAL = 4_000;
const BACKOFF_AFTER = 30_000;

const STATE_TONE: Record<RowState, "default" | "accent" | "muted"> = {
  PENDING: "muted",
  PARSED: "default",
  SKIPPED: "muted",
  FAILED: "accent",
};

export function ImportView({ currency }: { currency: string }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [batch, setBatch] = useState<Batch | null>(null);
  const startedAt = useRef<number>(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const poll = useCallback(async (batchId: string) => {
    try {
      const response = await fetch(`/api/import/${batchId}`);
      const payload = await response.json();
      if (!response.ok) {
        setError(payload?.error?.message ?? "Could not read that import.");
        return;
      }

      setBatch(payload);

      if (payload.state === "QUEUED" || payload.state === "RUNNING") {
        const elapsed = Date.now() - startedAt.current;
        const wait = elapsed > BACKOFF_AFTER ? SLOW_INTERVAL : FAST_INTERVAL;
        timer.current = setTimeout(() => void poll(batchId), wait);
      } else {
        // Finished: the ledger and the rail figures have new rows behind them.
        router.refresh();
      }
    } catch {
      setError("Lost contact with the server while importing. Reload to see where it got to.");
    }
  }, [router]);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  async function submit(): Promise<void> {
    const messages = text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    if (messages.length === 0) {
      setError("Paste at least one alert.");
      return;
    }

    setSubmitting(true);
    setError(null);
    setBatch(null);

    try {
      const response = await fetch("/api/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages }),
      });
      const payload = await response.json();
      if (!response.ok) {
        setError(payload?.error?.message ?? "That import did not start.");
        return;
      }
      startedAt.current = Date.now();
      setBatch({
        batchId: payload.batchId,
        state: "QUEUED",
        total: payload.total,
        processed: 0,
        failed: 0,
        error: null,
        rows: messages.map((sourceText, index) => ({
          index,
          sourceText,
          state: "PENDING" as const,
          merchant: null,
          amount: null,
          error: null,
        })),
      });
      void poll(payload.batchId);
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function uploadCsv(file: File): Promise<void> {
    setSubmitting(true);
    setError(null);
    try {
      const csv = await file.text();
      const response = await fetch("/api/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ csv }),
      });
      const payload = await response.json();
      if (!response.ok) {
        setError(payload?.error?.message ?? "That file did not import.");
        return;
      }
      startedAt.current = Date.now();
      setBatch({
        batchId: payload.batchId,
        state: "QUEUED",
        total: payload.total,
        processed: 0,
        failed: 0,
        error: null,
        rows: [],
      });
      void poll(payload.batchId);
    } catch {
      setError("Could not read that file.");
    } finally {
      setSubmitting(false);
    }
  }

  const running = batch?.state === "QUEUED" || batch?.state === "RUNNING";

  return (
    <div className="flex flex-col gap-6">
      {!batch ? (
        <>
          <label htmlFor="alerts" className="t-label text-[var(--color-muted)]">
            Bank alerts
          </label>
          <textarea
            id="alerts"
            rows={12}
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={PLACEHOLDER}
            className="field t-body w-full resize-y font-[family-name:var(--font-mono)]"
          />
          <div className="flex flex-wrap items-center gap-4">
            <Button onClick={submit} disabled={submitting}>
              {submitting ? "Starting" : "Parse"}
            </Button>
            <span className="t-label text-[var(--color-muted)]">
              One per line. Up to 500 at a time.
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-4 border-t border-[var(--color-hairline)] pt-6">
            <label className="t-label cursor-pointer text-[var(--color-muted)]">
              Or upload a CSV
              <input
                type="file"
                accept=".csv,text/csv"
                className="block pt-2 text-[var(--color-ink-2)]"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void uploadCsv(file);
                }}
              />
            </label>
          </div>
        </>
      ) : null}

      {error ? (
        <p role="alert" className="t-body text-[var(--color-accent)]">
          {error}
        </p>
      ) : null}

      {batch ? (
        <div className="flex flex-col gap-4">
          <div
            aria-live="polite"
            className="t-label flex items-baseline justify-between border-b border-[var(--color-hairline)] pb-2"
          >
            <span className={running ? "text-[var(--color-accent)]" : "text-[var(--color-muted)]"}>
              {batch.state === "QUEUED"
                ? "Queued"
                : batch.state === "RUNNING"
                  ? "Reading your alerts"
                  : batch.state === "FAILED"
                    ? "Import failed"
                    : "Done"}
            </span>
            {/* Progress is a count, not a bar. */}
            <span className="tnum text-[var(--color-ink)]">
              {batch.processed} / {batch.total}
            </span>
          </div>

          {batch.error ? (
            <p role="alert" className="t-body text-[var(--color-accent)]">
              {batch.error}
            </p>
          ) : null}

          <div>
            {batch.rows.map((row) => (
              <LedgerRow
                key={row.index}
                marker={row.state === "FAILED"}
                label={row.state}
                description={
                  <span className="flex flex-col gap-1">
                    <span className="text-[var(--color-ink)]">
                      {row.merchant ?? row.sourceText.slice(0, 72)}
                    </span>
                    {row.error ? (
                      <span className="t-label text-[var(--color-accent)]">{row.error}</span>
                    ) : null}
                  </span>
                }
                value={row.amount === null ? "—" : formatFils(row.amount, { currency })}
                valueTone={STATE_TONE[row.state]}
              />
            ))}
          </div>

          {batch.rows.length === 0 && batch.state === "DONE" ? (
            <p className="t-body text-[var(--color-ink-2)]">
              That import finished with no rows to show.
            </p>
          ) : null}

          {!running ? (
            <div className="flex flex-wrap gap-3">
              <Button
                onClick={() => {
                  setBatch(null);
                  setText("");
                  setError(null);
                }}
              >
                Import more
              </Button>
              {batch.failed > 0 ? (
                <span className="t-label text-[var(--color-muted)]">
                  {batch.failed} could not be read. Add those by hand in the ledger.
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
