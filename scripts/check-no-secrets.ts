/**
 * §17: verify no server secret reached the client bundle.
 *
 * Run after `next build`. It walks the built client chunks and fails on the
 * literal secret values from the environment, on any NEXT_PUBLIC_ variable
 * whose name looks like a credential, and on the Anthropic SDK's own marker
 * strings — the SDK being bundled client-side is itself the bug, whether or
 * not a key travelled with it.
 *
 *   npm run build && npm run check:no-secrets
 */

import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

const CLIENT_DIRS = [".next/static"];

/** Env vars whose value must never appear in a client chunk. */
const SECRET_ENV_VARS = ["ANTHROPIC_API_KEY", "DATABASE_URL", "DIRECT_URL"];

/** Strings that indicate the server-only SDK was bundled for the browser. */
const FORBIDDEN_MARKERS = [
  "x-api-key",
  "anthropic-version",
  "sk-ant-",
  "postgresql://",
  "@anthropic-ai/sdk",
];

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...walk(path));
    else if (/\.(js|mjs|cjs|json|css|map)$/.test(entry)) out.push(path);
  }
  return out;
}

function main(): void {
  const files = CLIENT_DIRS.flatMap(walk);

  if (files.length === 0) {
    console.error("No client bundle found. Run `npm run build` first.");
    process.exit(1);
  }

  const needles: Array<{ label: string; value: string }> = [];

  for (const name of SECRET_ENV_VARS) {
    const value = process.env[name];
    // A short or absent value cannot be searched for meaningfully.
    if (value && value.length >= 12) needles.push({ label: `value of ${name}`, value });
  }
  for (const marker of FORBIDDEN_MARKERS) {
    needles.push({ label: `marker "${marker}"`, value: marker });
  }

  const findings: string[] = [];

  for (const file of files) {
    const contents = readFileSync(file, "utf8");
    for (const needle of needles) {
      if (contents.includes(needle.value)) {
        findings.push(`${file}: contains ${needle.label}`);
      }
    }
  }

  // Any NEXT_PUBLIC_ variable that looks like a credential is a mistake by
  // construction — the prefix ships it to the browser.
  for (const name of Object.keys(process.env)) {
    if (!name.startsWith("NEXT_PUBLIC_")) continue;
    if (/KEY|SECRET|TOKEN|PASSWORD|DATABASE|DSN|CREDENTIAL/i.test(name)) {
      findings.push(`env: ${name} is public by prefix and named like a credential`);
    }
  }

  console.log(`Scanned ${files.length} client files for ${needles.length} patterns.`);

  if (findings.length > 0) {
    console.error("\nSecrets found in the client bundle:");
    for (const finding of findings) console.error(`  - ${finding}`);
    process.exit(1);
  }

  console.log("No server secrets in the client bundle.");
}

main();
