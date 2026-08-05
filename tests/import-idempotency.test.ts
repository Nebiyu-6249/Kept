import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { runImportBatch } from "@/lib/import-runner";
import type { ParsedRow } from "@/lib/ai/schemas";

/**
 * Import idempotency (§15).
 *
 * Netlify retries a failed background function after 1 minute and again after
 * 2, so a second run of the same batch is not hypothetical — it is the normal
 * failure path. Running the same batch twice must add zero rows.
 *
 * The parser is stubbed. This suite is about the pipeline, not the model, and
 * a deterministic stub makes "the same batch" actually mean the same batch.
 */

const hasDatabase = Boolean(process.env.DATABASE_URL);
const describeDb = hasDatabase ? describe : describe.skip;

const prisma = new PrismaClient();
const USER_ID = "testuserimportidempotency";

const MESSAGES = [
  "Your Card ending 4417 was used for AED 245.50 at CARREF 4471 DUBAI AE on 12/07/2026 14:32",
  "Purchase of AED 62.00 at TALABAT.COM on 14-07-2026. Ref 88213A",
  "AED 18.00 spent at CAREEM NETWORKS FZ LLC on 15/07/2026",
  "Salary credit of AED 18,000.00 has been credited to your account",
  "Transaction declined. Amount could not be authorised at SHARAF DG",
];

/** Deterministic stand-in for the model: same input, same output, every time. */
const stubParse = async (messages: readonly string[]) => ({
  rows: messages.map((message, index): ParsedRow => {
    if (message.includes("credited")) {
      return {
        index,
        is_transaction: false,
        amount_fils: null,
        merchant_raw: null,
        merchant: null,
        occurred_at: null,
        reference: null,
        category_guess: null,
        confidence: 0.98,
      };
    }
    if (message.includes("could not be authorised")) {
      return {
        index,
        is_transaction: true,
        amount_fils: null,
        merchant_raw: "SHARAF DG",
        merchant: "Sharaf DG",
        occurred_at: null,
        reference: null,
        category_guess: null,
        confidence: 0.2,
      };
    }
    const amount = message.includes("245.50") ? 24_550 : message.includes("62.00") ? 6_200 : 1_800;
    const merchant = message.includes("CARREF")
      ? "Carrefour"
      : message.includes("TALABAT")
        ? "Talabat"
        : "Careem";
    return {
      index,
      is_transaction: true,
      amount_fils: amount,
      merchant_raw: merchant.toUpperCase(),
      merchant,
      occurred_at: "2026-07-14T10:00:00.000Z",
      reference: message.includes("88213A") ? "88213A" : null,
      category_guess: "groceries",
      confidence: 0.94,
    };
  }),
  usage: { inputTokens: 0, outputTokens: 0, latencyMs: 0 },
});

async function createBatch(): Promise<string> {
  const batch = await prisma.importBatch.create({
    data: {
      userId: USER_ID,
      total: MESSAGES.length,
      state: "QUEUED",
      rows: {
        createMany: { data: MESSAGES.map((sourceText, index) => ({ index, sourceText })) },
      },
    },
    select: { id: true },
  });
  return batch.id;
}

const countTransactions = (): Promise<number> =>
  prisma.transaction.count({ where: { userId: USER_ID } });

describeDb("import idempotency", () => {
  beforeAll(async () => {
    await prisma.user.deleteMany({ where: { id: USER_ID } });
    await prisma.user.create({
      data: {
        id: USER_ID,
        displayName: "Import Test",
        monthlyIncome: 1_800_000,
        categories: {
          create: [
            { name: "Groceries", slug: "groceries", limitPerPeriod: 150_000 },
            { name: "Dining", slug: "dining", limitPerPeriod: 140_000 },
          ],
        },
      },
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: USER_ID } });
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.transaction.deleteMany({ where: { userId: USER_ID } });
    await prisma.importBatch.deleteMany({ where: { userId: USER_ID } });
  });

  it("writes one transaction per parseable message", async () => {
    const batchId = await createBatch();
    const result = await runImportBatch(batchId, { parse: stubParse });

    // 5 messages: 3 parse, 1 is a credit and is skipped, 1 has an unreadable
    // amount and fails for a human to look at.
    expect(await countTransactions()).toBe(3);
    expect(result.state).toBe("DONE");
    expect(result.processed).toBe(5);
    expect(result.failed).toBe(1);
  });

  it("adds zero rows when the same batch runs twice", async () => {
    const batchId = await createBatch();
    await runImportBatch(batchId, { parse: stubParse });
    const afterFirst = await countTransactions();

    await runImportBatch(batchId, { parse: stubParse });
    const afterSecond = await countTransactions();

    expect(afterFirst).toBe(3);
    expect(afterSecond).toBe(afterFirst);
  });

  it("adds zero rows even when every row is reprocessed from scratch", async () => {
    // The retry guard is that resolved rows are skipped. This removes that
    // guard entirely to prove the composite unique on Transaction holds on its
    // own — belt and braces, because a retry after a partial write is exactly
    // when both are needed.
    const batchId = await createBatch();
    await runImportBatch(batchId, { parse: stubParse });
    const afterFirst = await countTransactions();

    await prisma.importRow.updateMany({
      where: { batchId },
      data: { state: "PENDING", merchant: null, amount: null, error: null },
    });

    await runImportBatch(batchId, { parse: stubParse });

    expect(await countTransactions()).toBe(afterFirst);
  });

  it("records a skipped credit as SKIPPED, not as a failure", async () => {
    const batchId = await createBatch();
    await runImportBatch(batchId, { parse: stubParse });

    const rows = await prisma.importRow.findMany({
      where: { batchId },
      orderBy: { index: "asc" },
      select: { index: true, state: true },
    });

    expect(rows.map((row) => row.state)).toEqual([
      "PARSED",
      "PARSED",
      "PARSED",
      "SKIPPED",
      "FAILED",
    ]);
  });

  it("keeps going when a chunk throws, and marks only that chunk failed", async () => {
    const batchId = await createBatch();
    const throwing = async () => {
      throw new Error("model unavailable");
    };

    const result = await runImportBatch(batchId, { parse: throwing });

    expect(await countTransactions()).toBe(0);
    expect(result.state).toBe("FAILED");
    expect(result.failed).toBe(MESSAGES.length);

    const batch = await prisma.importBatch.findUnique({
      where: { id: batchId },
      select: { state: true, error: true },
    });
    expect(batch?.state).toBe("FAILED");
    expect(batch?.error).toBeTruthy();
  });

  it("stores the raw message on the row it produced, for correction feedback", async () => {
    const batchId = await createBatch();
    await runImportBatch(batchId, { parse: stubParse });

    const transaction = await prisma.transaction.findFirst({
      where: { userId: USER_ID, merchant: "Carrefour" },
      select: { sourceText: true, confidence: true, reference: true },
    });

    expect(transaction?.sourceText).toContain("CARREF 4471");
    expect(transaction?.confidence).toBeCloseTo(0.94);
    // No bank reference in that message, so the reference is derived from the
    // message itself and is stable across runs.
    expect(transaction?.reference).toMatch(/^SMS-[0-9a-f]{16}$/);
  });

  it("uses the bank's own reference when the message carries one", async () => {
    const batchId = await createBatch();
    await runImportBatch(batchId, { parse: stubParse });

    const transaction = await prisma.transaction.findFirst({
      where: { userId: USER_ID, merchant: "Talabat" },
      select: { reference: true },
    });

    expect(transaction?.reference).toBe("88213A");
  });
});
