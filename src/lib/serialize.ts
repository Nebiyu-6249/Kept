/**
 * Row shapes shared by the API and the pages that render them.
 *
 * Serialising in one place is what keeps the client from ever seeing a Date, a
 * Decimal, or a field the API did not mean to expose.
 */

import type { Prisma } from "@prisma/client";

export type TransactionDTO = {
  id: string;
  amount: number;
  merchant: string;
  merchantRaw: string;
  occurredAt: string;
  source: "SMS" | "CSV" | "MANUAL" | "INTENT";
  reference: string;
  sourceText: string | null;
  confidence: number | null;
  corrected: boolean;
  category: { id: string; name: string; slug: string } | null;
  intentId: string | null;
};

export const transactionSelect = {
  id: true,
  amount: true,
  merchant: true,
  merchantRaw: true,
  occurredAt: true,
  source: true,
  reference: true,
  sourceText: true,
  confidence: true,
  corrected: true,
  intentId: true,
  category: { select: { id: true, name: true, slug: true } },
} satisfies Prisma.TransactionSelect;

type TransactionRow = Prisma.TransactionGetPayload<{ select: typeof transactionSelect }>;

export function toTransactionDTO(row: TransactionRow): TransactionDTO {
  return {
    id: row.id,
    amount: row.amount,
    merchant: row.merchant,
    merchantRaw: row.merchantRaw,
    occurredAt: row.occurredAt.toISOString(),
    source: row.source,
    reference: row.reference,
    sourceText: row.sourceText,
    confidence: row.confidence,
    corrected: row.corrected,
    category: row.category,
    intentId: row.intentId,
  };
}

export type IntentDTO = {
  id: string;
  amount: number;
  note: string | null;
  decision: "ALLOW" | "HOLD" | "DECLINE";
  ruleRef: string | null;
  reasoning: string;
  affordable: boolean;
  state: "OPEN" | "HELD" | "PURCHASED" | "RELEASED" | "EXPIRED";
  holdUntil: string | null;
  resolvedAt: string | null;
  createdAt: string;
  category: { id: string; name: string; slug: string } | null;
  expired: boolean;
  msRemaining: number;
};

export const intentSelect = {
  id: true,
  amount: true,
  note: true,
  decision: true,
  ruleRef: true,
  reasoning: true,
  affordable: true,
  state: true,
  holdUntil: true,
  resolvedAt: true,
  createdAt: true,
  category: { select: { id: true, name: true, slug: true } },
} satisfies Prisma.IntentSelect;

type IntentRow = Prisma.IntentGetPayload<{ select: typeof intentSelect }>;

export function toIntentDTO(row: IntentRow, now: Date = new Date()): IntentDTO {
  const expired =
    row.state === "HELD" && row.holdUntil !== null && row.holdUntil.getTime() <= now.getTime();
  return {
    id: row.id,
    amount: row.amount,
    note: row.note,
    decision: row.decision,
    ruleRef: row.ruleRef,
    reasoning: row.reasoning,
    affordable: row.affordable,
    state: row.state,
    holdUntil: row.holdUntil?.toISOString() ?? null,
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    category: row.category,
    expired,
    msRemaining: row.holdUntil ? Math.max(0, row.holdUntil.getTime() - now.getTime()) : 0,
  };
}
