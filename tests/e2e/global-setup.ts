import { execFileSync } from "node:child_process";

/**
 * Reseed before the suite so both smoke tests start from a dataset they can
 * reason about. The seed is idempotent, so this leaves exactly one copy.
 */
export default function globalSetup(): void {
  execFileSync("npx", ["tsx", "prisma/seed.ts"], { stdio: "inherit" });
}
