/**
 * Current user.
 *
 * KEPT is single-user by design (§1: no auth providers, no teams). There is one
 * row in User and every server path resolves it here, so the day this grows a
 * session there is exactly one function to change.
 */

import { prisma } from "./db";
import { ApiFailure } from "./api";

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof prisma.user.findFirst>>>;

export async function findCurrentUser(): Promise<CurrentUser | null> {
  return prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
}

/** Throws NOT_FOUND when nobody has been through onboarding yet. */
export async function requireCurrentUser(): Promise<CurrentUser> {
  const user = await findCurrentUser();
  if (!user) {
    throw new ApiFailure("NOT_FOUND", "No account yet. Start with onboarding.");
  }
  return user;
}

/** True once a policy exists; the guard every authenticated route runs. */
export async function hasPolicy(userId: string): Promise<boolean> {
  const policy = await prisma.policy.findUnique({ where: { userId }, select: { id: true } });
  return policy !== null;
}
