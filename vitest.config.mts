import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

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
    env: {
      APP_TIMEZONE: "Asia/Dubai",
      DEFAULT_CURRENCY: "AED",
    },
  },
});
