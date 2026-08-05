import { z } from "zod";
import { prisma } from "@/lib/db";
import { ok, parseQuery, toResponse } from "@/lib/api";
import { requireCurrentUser } from "@/lib/user";
import { intentSelect, toIntentDTO } from "@/lib/serialize";

export const dynamic = "force-dynamic";

const QuerySchema = z.strictObject({
  state: z.enum(["OPEN", "HELD", "PURCHASED", "RELEASED", "EXPIRED"]).optional(),
});

export async function GET(request: Request) {
  try {
    const query = parseQuery(request.url, QuerySchema);
    const user = await requireCurrentUser();
    const now = new Date();

    const rows = await prisma.intent.findMany({
      where: { userId: user.id, ...(query.state ? { state: query.state } : {}) },
      orderBy: [{ holdUntil: "asc" }, { createdAt: "desc" }],
      select: intentSelect,
    });

    // `expired` and `msRemaining` are computed here rather than in the client,
    // so the countdown and the "ready to decide" grouping agree.
    return ok({ intents: rows.map((row) => toIntentDTO(row, now)) });
  } catch (error) {
    return toResponse(error);
  }
}
