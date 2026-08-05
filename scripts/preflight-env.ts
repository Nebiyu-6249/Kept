/**
 * Deploy preflight.
 *
 * Runs as the first step of the build command so a misconfigured environment
 * fails in seconds with a message that says what to do, instead of failing
 * three minutes later inside Prisma with `P1012: Environment variable not
 * found`.
 *
 * It reports *every* problem it finds at once. One build round trip should
 * surface the whole list, not the first item on it.
 *
 *   npm run preflight                 what a build needs
 *   npm run preflight -- --migrations what a build that runs migrations needs
 *   npm run preflight -- --runtime    what a deployed function needs
 *   npm run preflight -- --strict     treat every warning as a failure
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Load .env exactly the way the Prisma CLI does — present-only, and never
 * overriding a variable that is already set.
 *
 * Without this the preflight and the command right after it disagree locally:
 * Prisma reads .env and succeeds while the preflight, seeing only process.env,
 * reports the variable missing. On Netlify there is no .env and this is a
 * no-op; the point is that a local run of the build command behaves the same.
 */
function loadDotEnv(): void {
  const path = join(process.cwd(), ".env");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    const name = match?.[1];
    if (!name || process.env[name] !== undefined) continue;
    process.env[name] = (match[2] ?? "").trim().replace(/^["']|["']$/g, "");
  }
}

loadDotEnv();

const args = new Set(process.argv.slice(2));
const withMigrations = args.has("--migrations");
const runtimeMode = args.has("--runtime");
const strict = args.has("--strict");

/** Netlify sets this. Useful context in the output, never used as a gate. */
const context = process.env.CONTEXT ?? "local";

type Severity = "FAIL" | "WARN";

type Finding = {
  severity: Severity;
  variable: string;
  problem: string;
  neededBy: string;
  scope: string;
  where?: string;
  fix?: string;
};

const findings: Finding[] = [];
const ok: string[] = [];

function report(finding: Finding): void {
  findings.push(finding);
}

/* ------------------------------------------------------------- validators */

const POSTGRES = /^postgres(ql)?:\/\/[^\s]+$/;

/** Neon's pooled host carries `-pooler`; the direct host does not. */
function isPooled(url: string): boolean {
  try {
    return new URL(url).hostname.includes("-pooler");
  } catch {
    return url.includes("-pooler");
  }
}

function redact(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.username ? "***@" : ""}${parsed.hostname}${parsed.pathname}`;
  } catch {
    return "<unparseable>";
  }
}

/* --------------------------------------------------------- DATABASE_URL */

const NEON_POOLED =
  'Neon Console → your project → Connection Details, with "Connection pooling" ON. The host contains "-pooler".';
const NEON_DIRECT =
  'Neon Console → your project → Connection Details, with "Connection pooling" OFF. The host must NOT contain "-pooler".';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  report({
    severity: "FAIL",
    variable: "DATABASE_URL",
    problem: "Not set.",
    neededBy: runtimeMode
      ? "every database query the app makes"
      : "prisma migrate deploy, and every query at runtime",
    scope: "Functions AND Builds",
    where: NEON_POOLED,
  });
} else if (!POSTGRES.test(databaseUrl)) {
  report({
    severity: "FAIL",
    variable: "DATABASE_URL",
    problem: `Not a postgres URL (got ${redact(databaseUrl)}).`,
    neededBy: "prisma migrate deploy, and every query at runtime",
    scope: "Functions AND Builds",
    where: NEON_POOLED,
  });
} else if (!isPooled(databaseUrl)) {
  // A warning, not a failure: a direct URL works, it just gives up connection
  // pooling, which is what serverless functions need most.
  report({
    severity: "WARN",
    variable: "DATABASE_URL",
    problem: `Host has no "-pooler" (${redact(databaseUrl)}), so this looks like the direct string.`,
    neededBy: "serverless functions, which open a connection per invocation",
    scope: "Functions AND Builds",
    where: NEON_POOLED,
    fix: "It will work, but you will exhaust connections under load. Use the pooled string.",
  });
} else {
  ok.push(`DATABASE_URL is a pooled postgres URL (${redact(databaseUrl)})`);
}

/* ----------------------------------------------------------- DIRECT_URL */

const directUrl = process.env.DIRECT_URL;

if (!directUrl) {
  if (withMigrations) {
    report({
      severity: "FAIL",
      variable: "DIRECT_URL",
      problem: "Not set, and this build runs migrations.",
      neededBy: "prisma migrate deploy — this is the P1012 that failed the last build",
      scope: "Builds",
      where: NEON_DIRECT,
      fix: "Runtime never reads it. Builds-only scope is correct and sufficient.",
    });
  } else {
    ok.push("DIRECT_URL not set, and not needed — this step runs no migrations");
  }
} else if (!POSTGRES.test(directUrl)) {
  report({
    severity: "FAIL",
    variable: "DIRECT_URL",
    problem: `Not a postgres URL (got ${redact(directUrl)}).`,
    neededBy: "prisma migrate deploy",
    scope: "Builds",
    where: NEON_DIRECT,
  });
} else if (isPooled(directUrl)) {
  // The specific mistake this catches: pasting the pooled string into both.
  report({
    severity: "FAIL",
    variable: "DIRECT_URL",
    problem: `Host contains "-pooler" (${redact(directUrl)}), so the pooled string was pasted twice.`,
    neededBy: "prisma migrate deploy, which needs a direct session",
    scope: "Builds",
    where: NEON_DIRECT,
    fix: "Migrations over a transaction pooler behave oddly: advisory locks and DDL do not survive it.",
  });
} else if (databaseUrl && directUrl === databaseUrl) {
  report({
    severity: "WARN",
    variable: "DIRECT_URL",
    problem: "Identical to DATABASE_URL.",
    neededBy: "prisma migrate deploy",
    scope: "Builds",
    where: NEON_DIRECT,
    fix: "Fine if neither is pooled, but then DATABASE_URL is not the pooled string either.",
  });
} else {
  ok.push(`DIRECT_URL is a direct (unpooled) postgres URL (${redact(directUrl)})`);
}

/* ---------------------------------------------------- ANTHROPIC_API_KEY */

const anthropicKey = process.env.ANTHROPIC_API_KEY;

if (anthropicKey) {
  ok.push("ANTHROPIC_API_KEY is set");
} else if (runtimeMode) {
  report({
    severity: "FAIL",
    variable: "ANTHROPIC_API_KEY",
    problem: "Not set.",
    neededBy: "the verdict engine and the SMS parser",
    scope: "Functions only",
  });
} else {
  /*
   * Deliberately a warning during a build. The key is scoped to Functions only
   * — which is the correct scope — so it is *supposed* to be invisible here. A
   * build-time check cannot see a Functions-scoped variable, and failing the
   * build over it would punish the right configuration.
   */
  report({
    severity: "WARN",
    variable: "ANTHROPIC_API_KEY",
    problem: "Not visible to this build.",
    neededBy: "the verdict engine and the SMS parser, at runtime",
    scope: "Functions only",
    fix:
      "Expected if it is scoped to Functions only, which is correct. A build cannot " +
      "see a Functions-scoped variable. If it is genuinely unset, /ask returns 503 " +
      "AI_UNAVAILABLE and falls back to arithmetic; import rows fail with a message.",
  });
}

/* ------------------------------------------------- defaulted, but checked */

const APP_DEFAULTS: Array<{
  name: string;
  fallback: string;
  scope: string;
  validate?: (value: string) => string | null;
}> = [
  {
    name: "APP_TIMEZONE",
    fallback: "Asia/Dubai",
    scope: "Functions AND Builds",
    validate: (value) => {
      try {
        new Intl.DateTimeFormat("en-US", { timeZone: value });
        return null;
      } catch {
        return `"${value}" is not an IANA timezone.`;
      }
    },
  },
  {
    name: "DEFAULT_CURRENCY",
    fallback: "AED",
    scope: "Functions AND Builds",
    validate: (value) =>
      /^[A-Z]{3}$/.test(value) ? null : `"${value}" is not a three-letter currency code.`,
  },
  {
    name: "VERDICT_DAILY_LIMIT",
    fallback: "100",
    scope: "Functions",
    validate: (value) => {
      const parsed = Number.parseInt(value, 10);
      return Number.isInteger(parsed) && parsed > 0
        ? null
        : `"${value}" is not a positive integer.`;
    },
  },
];

for (const item of APP_DEFAULTS) {
  const value = process.env[item.name];
  if (!value) {
    ok.push(`${item.name} not set, defaulting to "${item.fallback}"`);
    continue;
  }
  const problem = item.validate?.(value) ?? null;
  if (problem) {
    report({
      severity: "FAIL",
      variable: item.name,
      problem,
      neededBy: "period boundaries, formatting and the daily model-call cap",
      scope: item.scope,
    });
  } else {
    ok.push(`${item.name} = "${value}"`);
  }
}

/* ---------------------------------------------------------------- report */

const mode = runtimeMode ? "runtime" : withMigrations ? "build + migrations" : "build";
console.log(`\nKEPT preflight — context: ${context}, checking: ${mode}\n`);

for (const line of ok) console.log(`  ok    ${line}`);

const failures = findings.filter((finding) => finding.severity === "FAIL");
const warnings = findings.filter((finding) => finding.severity === "WARN");

if (findings.length > 0) console.log("");

for (const finding of [...failures, ...warnings]) {
  console.log(`  ${finding.severity}  ${finding.variable} — ${finding.problem}`);
  console.log(`        Needed by   ${finding.neededBy}`);
  console.log(`        Scope       ${finding.scope}`);
  if (finding.where) console.log(`        Where       ${finding.where}`);
  if (finding.fix) console.log(`        Note        ${finding.fix}`);
  console.log("");
}

const fatal = strict ? findings.length : failures.length;

if (fatal > 0) {
  console.error(
    `${failures.length} failure(s)` +
      (warnings.length > 0 ? ` and ${warnings.length} warning(s)` : "") +
      (strict ? ", strict mode" : "") +
      ". Set them in Netlify under Site configuration → Environment variables,",
  );
  console.error("for the Production deploy context, then redeploy.\n");
  process.exit(1);
}

if (warnings.length > 0) {
  console.log(`Preflight passed with ${warnings.length} warning(s).\n`);
} else {
  console.log("Preflight passed.\n");
}
