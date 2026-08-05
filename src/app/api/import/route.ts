import { z } from "zod";
import { prisma } from "@/lib/db";
import { ApiFailure, ok, parseBody, toResponse } from "@/lib/api";
import { requireCurrentUser } from "@/lib/user";
import { csvToMessages } from "@/lib/csv";
import { appOrigin, IMPORT_MAX_MESSAGES, VERDICT_DAILY_LIMIT } from "@/lib/env";
import { assertUnderDailyLimit, RateLimitedError } from "@/lib/ai/client";
import { runImportBatch } from "@/lib/import-runner";

export const dynamic = "force-dynamic";

const ImportSchema = z.union([
  z.strictObject({ messages: z.array(z.string().min(1).max(2_000)).min(1).max(IMPORT_MAX_MESSAGES) }),
  z.strictObject({ csv: z.string().min(1).max(2_000_000) }),
]);

export async function POST(request: Request) {
  try {
    const input = await parseBody(request, ImportSchema);
    const user = await requireCurrentUser();

    try {
      await assertUnderDailyLimit(user.id, "parse", VERDICT_DAILY_LIMIT);
    } catch (error) {
      if (error instanceof RateLimitedError) throw new ApiFailure("RATE_LIMIT", error.message);
      throw error;
    }

    const messages = "csv" in input ? csvToMessages(input.csv) : input.messages;

    if (messages.length === 0) {
      throw new ApiFailure(
        "VALIDATION",
        "Nothing to import. A CSV needs a header row with an amount and a description.",
        "csv",
      );
    }
    if (messages.length > IMPORT_MAX_MESSAGES) {
      throw new ApiFailure(
        "VALIDATION",
        `That is ${messages.length} rows. Import up to ${IMPORT_MAX_MESSAGES} at a time.`,
      );
    }

    const batch = await prisma.importBatch.create({
      data: {
        userId: user.id,
        total: messages.length,
        state: "QUEUED",
        rows: {
          createMany: {
            data: messages.map((sourceText, index) => ({ index, sourceText })),
          },
        },
      },
      select: { id: true, total: true },
    });

    await dispatch(batch.id);

    return ok({ batchId: batch.id, total: batch.total }, 202);
  } catch (error) {
    return toResponse(error);
  }
}

/**
 * Hand the batch to the Netlify background function, which returns 202 at once
 * and may run for up to 15 minutes. A sync function would hit the 10s timeout
 * on anything past a chunk or two.
 *
 * With no origin configured — local `next dev` — the work runs in the
 * background of this process instead, so the flow is exercisable end to end
 * without the Netlify runtime.
 */
async function dispatch(batchId: string): Promise<void> {
  const origin = appOrigin();

  if (origin) {
    try {
      await fetch(`${origin}/.netlify/functions/import-background`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ batchId }),
      });
      return;
    } catch (error) {
      console.error("[import] background dispatch failed, running inline", error);
    }
  }

  // Not awaited: POST /api/import must return 202 immediately.
  void runImportBatch(batchId).catch(async (error: unknown) => {
    console.error("[import] inline run failed", error);
    await prisma.importBatch.update({
      where: { id: batchId },
      data: {
        state: "FAILED",
        error: error instanceof Error ? error.message.slice(0, 400) : "Import failed.",
      },
    });
  });
}
