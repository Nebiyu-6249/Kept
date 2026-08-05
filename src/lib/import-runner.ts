import { createHash } from "node:crypto";
import { prisma } from "./db";
import { normalizeMerchant } from "./merchant";
import { chunkMessages, parseMessages, type Correction } from "./ai/parse-sms";
import { AiUnavailableError, incrementUsage, RateLimitedError } from "./ai/client";
import { invalidateBudgetState } from "./budget-state";
import { PARSE_CHUNK_SIZE } from "./env";
import type { ParsedRow } from "./ai/schemas";

/**
 * The import pipeline (§8.1).
 *
 * Netlify retries a failed background function after 1 minute and again after
 * 2, so this must be idempotent end to end. Two things make it so:
 *
 *  1. Only rows still PENDING are processed. A retry skips everything that
 *     already resolved, so a chunk that succeeded before the crash is never
 *     parsed or inserted twice.
 *  2. Rows are written with `skipDuplicates` against the composite unique on
 *     Transaction (userId, source, reference, occurredAt), so even a genuinely
 *     reprocessed row cannot land twice.
 *
 * A chunk failure increments `failed` and moves on. One bad chunk never aborts
 * the batch.
 */

export type ParseFn = typeof parseMessages;

export type ImportRunResult = {
  processed: number;
  failed: number;
  state: "DONE" | "FAILED";
};

/** Deterministic reference for a message the bank gave no reference for. */
function referenceFor(sourceText: string, bankRef: string | null): string {
  if (bankRef && bankRef.trim()) return bankRef.trim();
  return `SMS-${createHash("sha1").update(sourceText).digest("hex").slice(0, 16)}`;
}

function occurredAtFor(row: ParsedRow, fallback: Date): Date {
  if (!row.occurred_at) return fallback;
  const parsed = new Date(row.occurred_at);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

export async function runImportBatch(
  batchId: string,
  options: { parse?: ParseFn } = {},
): Promise<ImportRunResult> {
  const parse = options.parse ?? parseMessages;

  const batch = await prisma.importBatch.findUnique({
    where: { id: batchId },
    select: { id: true, userId: true, createdAt: true, total: true },
  });
  if (!batch) throw new Error(`runImportBatch: no batch ${batchId}`);

  await prisma.importBatch.update({
    where: { id: batch.id },
    data: { state: "RUNNING" },
  });

  // Only what has not resolved yet. This is the first half of idempotency.
  const pending = await prisma.importRow.findMany({
    where: { batchId: batch.id, state: "PENDING" },
    orderBy: { index: "asc" },
    select: { id: true, index: true, sourceText: true },
  });

  const [categories, corrections] = await Promise.all([
    prisma.category.findMany({
      where: { userId: batch.userId },
      select: { id: true, slug: true, name: true },
    }),
    prisma.correction.findMany({
      where: { userId: batch.userId },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { sourceText: true, corrected: true },
    }),
  ]);

  const categoryBySlug = new Map(categories.map((category) => [category.slug, category.id]));
  const correctionExamples: Correction[] = corrections.map((correction) => ({
    sourceText: correction.sourceText,
    corrected: correction.corrected as Record<string, unknown>,
  }));

  const chunks = chunkMessages(
    pending.map((row) => row.sourceText),
    PARSE_CHUNK_SIZE,
  );

  let cursor = 0;
  let failedChunks = 0;

  for (const chunk of chunks) {
    const slice = pending.slice(cursor, cursor + chunk.length);
    cursor += chunk.length;

    try {
      const { rows } = await parse(chunk, correctionExamples);
      await incrementUsage(batch.userId, "parse");

      const creates: Array<{
        userId: string;
        categoryId: string | null;
        amount: number;
        merchantRaw: string;
        merchant: string;
        occurredAt: Date;
        source: "SMS";
        reference: string;
        sourceText: string;
        confidence: number;
        batchId: string;
      }> = [];

      for (const [offset, parsedRow] of rows.entries()) {
        const importRow = slice[offset];
        if (!importRow) continue;

        if (!parsedRow.is_transaction) {
          await prisma.importRow.update({
            where: { id: importRow.id },
            data: { state: "SKIPPED", merchant: parsedRow.merchant },
          });
          continue;
        }

        if (parsedRow.amount_fils === null) {
          // The parser was honest that it could not read the amount. That is a
          // row for a human, not a guess.
          await prisma.importRow.update({
            where: { id: importRow.id },
            data: {
              state: "FAILED",
              merchant: parsedRow.merchant,
              error: "Amount could not be read. Add it by hand.",
            },
          });
          continue;
        }

        const merchantRaw = parsedRow.merchant_raw ?? importRow.sourceText.slice(0, 120);
        creates.push({
          userId: batch.userId,
          categoryId: parsedRow.category_guess
            ? (categoryBySlug.get(parsedRow.category_guess) ?? null)
            : null,
          amount: parsedRow.amount_fils,
          merchantRaw,
          merchant: parsedRow.merchant
            ? normalizeMerchant(parsedRow.merchant)
            : normalizeMerchant(merchantRaw),
          occurredAt: occurredAtFor(parsedRow, batch.createdAt),
          source: "SMS",
          reference: referenceFor(importRow.sourceText, parsedRow.reference),
          sourceText: importRow.sourceText,
          confidence: parsedRow.confidence,
          batchId: batch.id,
        });

        await prisma.importRow.update({
          where: { id: importRow.id },
          data: {
            state: "PARSED",
            merchant: parsedRow.merchant,
            amount: parsedRow.amount_fils,
          },
        });
      }

      if (creates.length > 0) {
        // The second half of idempotency.
        await prisma.transaction.createMany({ data: creates, skipDuplicates: true });
      }
    } catch (error) {
      // A chunk failure never aborts the batch.
      failedChunks += 1;
      await prisma.importRow.updateMany({
        where: { id: { in: slice.map((row) => row.id) }, state: "PENDING" },
        data: { state: "FAILED", error: rowError(error) },
      });
    }

    const counts = await countRows(batch.id);
    await prisma.importBatch.update({
      where: { id: batch.id },
      data: { processed: counts.processed, failed: counts.failed },
    });
  }

  const counts = await countRows(batch.id);
  const everyChunkFailed = chunks.length > 0 && failedChunks === chunks.length;

  await prisma.importBatch.update({
    where: { id: batch.id },
    data: {
      state: everyChunkFailed ? "FAILED" : "DONE",
      processed: counts.processed,
      failed: counts.failed,
      error: everyChunkFailed ? "Every batch of messages failed to parse." : null,
    },
  });

  invalidateBudgetState(batch.userId);

  return {
    processed: counts.processed,
    failed: counts.failed,
    state: everyChunkFailed ? "FAILED" : "DONE",
  };
}

/**
 * What the user reads on the row. The underlying error is logged for us; the
 * screen gets a sentence that says what happened and what to do about it.
 */
function rowError(error: unknown): string {
  if (error instanceof AiUnavailableError) {
    return "The parser could not be reached. Nothing was changed — try this batch again.";
  }
  if (error instanceof RateLimitedError) {
    return "That is today's parsing cap. This batch will read fine tomorrow.";
  }
  console.error("[import] chunk failed", error);
  return "This message could not be read. Add it by hand in the ledger.";
}

async function countRows(batchId: string): Promise<{ processed: number; failed: number }> {
  const [processed, failed] = await Promise.all([
    prisma.importRow.count({ where: { batchId, state: { not: "PENDING" } } }),
    prisma.importRow.count({ where: { batchId, state: "FAILED" } }),
  ]);
  return { processed, failed };
}
