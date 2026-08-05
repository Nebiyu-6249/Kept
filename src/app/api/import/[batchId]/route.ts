import { prisma } from "@/lib/db";
import { ApiFailure, ok, toResponse } from "@/lib/api";
import { requireCurrentUser } from "@/lib/user";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ batchId: string }> }) {
  try {
    const { batchId } = await context.params;
    const user = await requireCurrentUser();

    const batch = await prisma.importBatch.findFirst({
      where: { id: batchId, userId: user.id },
      select: {
        id: true,
        state: true,
        total: true,
        processed: true,
        failed: true,
        error: true,
        rows: {
          orderBy: { index: "asc" },
          select: {
            index: true,
            sourceText: true,
            state: true,
            merchant: true,
            amount: true,
            error: true,
          },
        },
      },
    });

    if (!batch) throw new ApiFailure("NOT_FOUND", "That import is not here.");

    return ok({
      batchId: batch.id,
      state: batch.state,
      total: batch.total,
      processed: batch.processed,
      failed: batch.failed,
      error: batch.error,
      rows: batch.rows,
    });
  } catch (error) {
    return toResponse(error);
  }
}
