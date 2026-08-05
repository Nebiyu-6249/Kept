import { z } from "zod";
import { prisma } from "@/lib/db";
import { ok, parseQuery, toResponse } from "@/lib/api";
import { requireCurrentUser } from "@/lib/user";
import { toTransactionDTO, transactionSelect } from "@/lib/serialize";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

const QuerySchema = z.strictObject({
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
  categoryId: z.string().min(1).optional(),
  /** Opaque cursor: the id of the last row of the previous page. */
  cursor: z.string().min(1).optional(),
});

export async function GET(request: Request) {
  try {
    const query = parseQuery(request.url, QuerySchema);
    const user = await requireCurrentUser();

    const occurredAt =
      query.from || query.to
        ? {
            ...(query.from ? { gte: new Date(query.from) } : {}),
            ...(query.to ? { lte: new Date(query.to) } : {}),
          }
        : undefined;

    const rows = await prisma.transaction.findMany({
      where: {
        userId: user.id,
        ...(occurredAt ? { occurredAt } : {}),
        ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      },
      // occurredAt alone is not unique, so id is the tiebreaker that makes the
      // cursor stable across pages.
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
      take: PAGE_SIZE + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      select: transactionSelect,
    });

    const hasMore = rows.length > PAGE_SIZE;
    const page = hasMore ? rows.slice(0, PAGE_SIZE) : rows;

    return ok({
      transactions: page.map(toTransactionDTO),
      nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null,
    });
  } catch (error) {
    return toResponse(error);
  }
}
