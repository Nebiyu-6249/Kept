import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import { readFileSync, existsSync } from "node:fs";

/**
 * Load .env for the integration suite, which talks to a real Postgres. Unit
 * suites do not need it; the integration suite skips itself when DATABASE_URL
 * is absent rather than failing the whole run.
 */
function dotenv(): Record<string, string> {
  const path = fileURLToPath(new URL("./.env", import.meta.url));
  if (!existsSync(path)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match?.[1]) continue;
    out[match[1]] = (match[2] ?? "").replace(/^["']|["']$/g, "");
  }
  return out;
}

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // The integration suite talks to a real Postgres and must not race the
    // unit suite's assumptions about row counts.
    fileParallelism: false,
    testTimeout: 30_000,
    env: {
      ...dotenv(),
      APP_TIMEZONE: "Asia/Dubai",
      DEFAULT_CURRENCY: "AED",
    },
  },
});
