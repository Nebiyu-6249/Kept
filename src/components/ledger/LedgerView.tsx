"use client";

import { useMemo, useState } from "react";
import { LedgerRow } from "@/components/primitives/LedgerRow";
import { Button, Toggle } from "@/components/primitives/Button";
import { formatFils } from "@/lib/money";
import { dayGroupKey, dayHeading, timeOfDay, toDateInputValue } from "@/lib/format-date";
import type { TransactionDTO } from "@/lib/serialize";

export type LedgerCategory = { id: string; name: string; slug: string };

type Props = {
  initial: TransactionDTO[];
  initialCursor: string | null;
  categories: LedgerCategory[];
  timeZone: string;
  currency: string;
  /** Period bounds and spend, so the running column is exact without a refetch. */
  periodStart: string;
  periodEnd: string;
  periodSpentTotal: number;
};

/** Confidence below this carries an accent marker until the row is reviewed. */
const LOW_CONFIDENCE = 0.6;

export function LedgerView({
  initial,
  initialCursor,
  categories,
  timeZone,
  currency,
  periodStart,
  periodEnd,
  periodSpentTotal,
}: Props) {
  const [rows, setRows] = useState<TransactionDTO[]>(initial);
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const visible = useMemo(
    () => (categoryId ? rows.filter((r) => r.category?.id === categoryId) : rows),
    [rows, categoryId],
  );

  /**
   * Running spend within the current period, cumulative up to and including
   * each row. Rows arrive newest first, so this walks down from the period
   * total — which means the column is exact from the first page and does not
   * shift when more pages load.
   */
  const runningById = useMemo(() => {
    const start = new Date(periodStart).getTime();
    const end = new Date(periodEnd).getTime();
    const map = new Map<string, number>();
    let remaining = periodSpentTotal;
    for (const row of rows) {
      const at = new Date(row.occurredAt).getTime();
      if (at < start || at > end) continue;
      map.set(row.id, remaining);
      remaining -= row.amount;
    }
    return map;
  }, [rows, periodStart, periodEnd, periodSpentTotal]);

  const groups = useMemo(() => {
    const byDay = new Map<string, TransactionDTO[]>();
    for (const row of visible) {
      const key = dayGroupKey(row.occurredAt, timeZone);
      const list = byDay.get(key);
      if (list) list.push(row);
      else byDay.set(key, [row]);
    }
    return [...byDay.entries()];
  }, [visible, timeZone]);

  async function loadMore(): Promise<void> {
    if (!cursor || loading) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ cursor });
      if (categoryId) params.set("categoryId", categoryId);
      const response = await fetch(`/api/transactions?${params.toString()}`);
      const body = await response.json();
      if (!response.ok) {
        setError(body?.error?.message ?? "Could not load more rows.");
        return;
      }
      setRows((current) => [...current, ...body.transactions]);
      setCursor(body.nextCursor);
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  function applyPatch(updated: TransactionDTO): void {
    setRows((current) => current.map((row) => (row.id === updated.id ? updated : row)));
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by category">
        <Toggle pressed={categoryId === null} onClick={() => setCategoryId(null)}>
          All
        </Toggle>
        {categories.map((category) => (
          <Toggle
            key={category.id}
            pressed={categoryId === category.id}
            onClick={() => setCategoryId(category.id)}
          >
            {category.name}
          </Toggle>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="t-body max-w-[52ch] text-[var(--color-ink-2)]">
          {categoryId
            ? "Nothing in this category yet. Clear the filter to see everything else."
            : "No transactions yet. Paste your bank alerts on Import and they will land here."}
        </p>
      ) : null}

      {groups.map(([day, dayRows]) => (
        <section key={day} aria-label={dayHeading(dayRows[0]?.occurredAt ?? day, timeZone)}>
          <h2 className="t-label flex items-baseline justify-between gap-4 border-b border-[var(--color-hairline)] pb-2 text-[var(--color-muted)]">
            <span>{dayHeading(dayRows[0]?.occurredAt ?? day, timeZone)}</span>
            <span className="tnum">
              {formatFils(
                dayRows.reduce((sum, row) => sum + row.amount, 0),
                { currency },
              )}
            </span>
          </h2>

          {dayRows.map((row) => {
            const running = runningById.get(row.id);
            const lowConfidence =
              row.confidence !== null && row.confidence < LOW_CONFIDENCE && !row.corrected;

            return (
              <LedgerRow
                key={row.id}
                marker={lowConfidence}
                label={row.category?.name ?? "Uncategorised"}
                description={
                  <span className="flex flex-wrap items-baseline gap-2">
                    <span className="text-[var(--color-ink)]">{row.merchant}</span>
                    <span className="t-label text-[var(--color-muted)]">
                      {timeOfDay(row.occurredAt, timeZone)} · {row.source}
                    </span>
                    {lowConfidence ? (
                      <span className="t-label text-[var(--color-accent)]">NEEDS A LOOK</span>
                    ) : null}
                    {row.corrected ? (
                      <span className="t-label text-[var(--color-muted)]">CORRECTED</span>
                    ) : null}
                  </span>
                }
                value={
                  <span className="inline-flex items-baseline gap-6">
                    <span>{formatFils(row.amount, { currency })}</span>
                    <span
                      className="hidden w-[104px] text-[var(--color-muted)] lg:inline-block"
                      title="Running spend this period"
                    >
                      {running === undefined ? "—" : formatFils(running, { currency })}
                    </span>
                  </span>
                }
                onClick={() => setOpenId(openId === row.id ? null : row.id)}
                expanded={openId === row.id}
                controlLabel={`${row.merchant}, ${formatFils(row.amount, { currency })}. Open details`}
                expandable={
                  <RowDetail
                    row={row}
                    categories={categories}
                    timeZone={timeZone}
                    onSaved={applyPatch}
                  />
                }
              />
            );
          })}
        </section>
      ))}

      {error ? (
        <p role="alert" className="t-body text-[var(--color-accent)]">
          {error}
        </p>
      ) : null}

      {cursor ? (
        <div>
          <Button onClick={loadMore} disabled={loading}>
            {loading ? "Loading" : "Load more"}
          </Button>
        </div>
      ) : visible.length > 0 ? (
        <p className="t-label text-[var(--color-muted)]">That is everything.</p>
      ) : null}
    </div>
  );
}

function RowDetail({
  row,
  categories,
  timeZone,
  onSaved,
}: {
  row: TransactionDTO;
  categories: LedgerCategory[];
  timeZone: string;
  onSaved: (row: TransactionDTO) => void;
}) {
  const [amount, setAmount] = useState((row.amount / 100).toFixed(2));
  const [merchant, setMerchant] = useState(row.merchant);
  const [categoryId, setCategoryId] = useState(row.category?.id ?? "");
  const [occurredAt, setOccurredAt] = useState(toDateInputValue(row.occurredAt, timeZone));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function save(): Promise<void> {
    setSaving(true);
    setMessage(null);
    const fils = Math.round(Number.parseFloat(amount) * 100);
    if (!Number.isFinite(fils) || fils < 0) {
      setMessage("Enter an amount like 45.50.");
      setSaving(false);
      return;
    }
    try {
      const response = await fetch(`/api/transactions/${row.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          amountFils: fils,
          merchant,
          categoryId: categoryId || null,
          occurredAt: new Date(occurredAt).toISOString(),
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        setMessage(body?.error?.message ?? "Could not save that change.");
        return;
      }
      onSaved(body.transaction);
      setMessage("Saved.");
    } catch {
      setMessage("Could not reach the server. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 border-t border-[var(--color-hairline)] pt-4">
      <dl className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div>
          <dt className="t-label text-[var(--color-muted)]">Reference</dt>
          <dd className="t-value break-all">{row.reference}</dd>
        </div>
        <div>
          <dt className="t-label text-[var(--color-muted)]">Confidence</dt>
          <dd className="t-value">
            {row.confidence === null ? "—" : row.confidence.toFixed(2)}
          </dd>
        </div>
        <div>
          <dt className="t-label text-[var(--color-muted)]">Source</dt>
          <dd className="t-value">{row.source}</dd>
        </div>
      </dl>

      {row.sourceText ? (
        <div>
          <p className="t-label text-[var(--color-muted)]">Parsed from</p>
          <p className="t-body break-words text-[var(--color-ink-2)]">{row.sourceText}</p>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="t-label text-[var(--color-muted)]">
          Amount
          <input
            className="field t-value mt-1 text-[var(--color-ink)]"
            value={amount}
            inputMode="decimal"
            onChange={(event) => setAmount(event.target.value)}
          />
        </label>
        <label className="t-label text-[var(--color-muted)]">
          Merchant
          <input
            className="field t-value mt-1 text-[var(--color-ink)]"
            value={merchant}
            onChange={(event) => setMerchant(event.target.value)}
          />
        </label>
        <label className="t-label text-[var(--color-muted)]">
          Category
          <select
            className="field t-value mt-1 text-[var(--color-ink)]"
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
          >
            <option value="">Uncategorised</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
        <label className="t-label text-[var(--color-muted)]">
          When
          <input
            type="datetime-local"
            className="field t-value mt-1 text-[var(--color-ink)]"
            value={occurredAt}
            onChange={(event) => setOccurredAt(event.target.value)}
          />
        </label>
      </div>

      <div className="flex items-center gap-4">
        <Button onClick={save} disabled={saving}>
          {saving ? "Saving" : "Save correction"}
        </Button>
        {message ? (
          <span aria-live="polite" className="t-label text-[var(--color-ink-2)]">
            {message}
          </span>
        ) : null}
      </div>
    </div>
  );
}
