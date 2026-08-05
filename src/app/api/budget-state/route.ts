import { ok, toResponse } from "@/lib/api";
import { getBudgetState } from "@/lib/budget-state";
import { requireCurrentUser } from "@/lib/user";

export const dynamic = "force-dynamic";

/** §8: the BudgetState object. Cached 30s in memory inside getBudgetState. */
export async function GET() {
  try {
    const user = await requireCurrentUser();
    return ok(await getBudgetState(user.id));
  } catch (error) {
    return toResponse(error);
  }
}
