/**
 * Validate netlify.toml before pushing.
 *
 * A bad deploy config costs a full build to discover, and the worst failures
 * here are silent: a functions directory Netlify never looks in produces no
 * cron, no background import, and no error message. Everything this checks was
 * either an actual failure or a verified near miss.
 *
 *   npm run check:netlify
 */

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parse } from "smol-toml";

type Problem = { where: string; message: string };

const problems: Problem[] = [];
const notes: string[] = [];

function fail(where: string, message: string): void {
  problems.push({ where, message });
}

/* ------------------------------------------------------------------- parse */

const tomlPath = join(process.cwd(), "netlify.toml");
if (!existsSync(tomlPath)) {
  console.error("netlify.toml is missing.");
  process.exit(1);
}

const raw = readFileSync(tomlPath, "utf8");

let config: Record<string, unknown>;
try {
  // This is the check that would have caught the duplicate [functions."nightly-sweep"]
  // table: TOML forbids redefining a table, and the deploy fails at config
  // parsing before the build starts.
  config = parse(raw) as Record<string, unknown>;
} catch (error) {
  console.error("netlify.toml is not valid TOML:\n");
  console.error(`  ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

notes.push("netlify.toml parses as valid TOML");

/* --------------------------------------------------------------- functions */

const functions = (config.functions ?? {}) as Record<string, unknown>;
const directory = typeof functions.directory === "string" ? functions.directory : null;

if (!directory) {
  fail(
    "[functions] directory",
    "Not set. Netlify defaults to netlify/functions at the repo root; if the " +
      "functions live anywhere else it finds none and says nothing.",
  );
} else if (!existsSync(join(process.cwd(), directory))) {
  fail("[functions] directory", `"${directory}" does not exist.`);
} else {
  notes.push(`functions directory "${directory}" exists`);
}

const functionFiles = directory
  ? readdirSync(join(process.cwd(), directory)).filter((name) => /\.(ts|js|mjs)$/.test(name))
  : [];

if (directory && functionFiles.length === 0) {
  fail("[functions] directory", `"${directory}" contains no function files.`);
}

/**
 * The -background suffix in the filename is the only thing that makes a
 * function asynchronous. Renaming the file silently turns a 15-minute job into
 * one that must finish inside the 10s sync timeout.
 */
const backgroundFunctions = functionFiles.filter((name) => /-background\.(ts|js|mjs)$/.test(name));
if (backgroundFunctions.length === 0) {
  fail(
    "functions",
    "No file ends in -background. The import pipeline needs an async function, " +
      "and the filename suffix is what creates one.",
  );
} else {
  notes.push(`background function(s): ${backgroundFunctions.join(", ")}`);
}

/* ---------------------------------------------- per-function table sanity */

/**
 * TOML has already rejected an exact duplicate, but `[functions.name]` and
 * `[functions."name"]` normalise to the same key only *after* parsing — this
 * re-checks the raw text so a near-miss is reported with its line numbers
 * rather than as a bare parser error.
 */
const tableNames = new Map<string, number[]>();
raw.split("\n").forEach((line, index) => {
  const match = line.match(/^\s*\[functions\.(.+?)\]\s*$/);
  if (!match?.[1]) return;
  const name = match[1].replace(/^["']|["']$/g, "");
  const lines = tableNames.get(name) ?? [];
  lines.push(index + 1);
  tableNames.set(name, lines);
});

for (const [name, lines] of tableNames) {
  if (lines.length > 1) {
    fail(
      `[functions."${name}"]`,
      `Declared ${lines.length} times, on lines ${lines.join(" and ")}. ` +
        "Quoted and bare keys are the same table; merge them into one block.",
    );
  }
}

/* ------------------------------------------------------------- schedules */

/**
 * The cron can be declared in netlify.toml or in the function's own config
 * export. Both work; two copies that disagree is the failure mode, so if both
 * exist they must match.
 */
for (const [name, table] of Object.entries(functions)) {
  if (typeof table !== "object" || table === null) continue;
  const tomlSchedule = (table as { schedule?: unknown }).schedule;
  if (typeof tomlSchedule !== "string") continue;

  if (!/^(\S+\s+){4}\S+$/.test(tomlSchedule)) {
    fail(`[functions."${name}"] schedule`, `"${tomlSchedule}" is not a 5-field cron expression.`);
    continue;
  }

  const file = functionFiles.find((candidate) => candidate.replace(/\.[^.]+$/, "") === name);
  if (!file || !directory) {
    fail(`[functions."${name}"]`, `Scheduled, but no matching file in ${directory ?? "?"}.`);
    continue;
  }

  const source = readFileSync(join(process.cwd(), directory, file), "utf8");
  const inCode = source.match(/schedule:\s*["'`]([^"'`]+)["'`]/)?.[1];

  if (inCode && inCode !== tomlSchedule) {
    fail(
      `[functions."${name}"] schedule`,
      `netlify.toml says "${tomlSchedule}" but ${file} says "${inCode}". Pick one.`,
    );
  } else {
    notes.push(
      `${name} scheduled "${tomlSchedule}"${inCode ? " (matches the in-code config)" : ""}`,
    );
  }
}

/* ------------------------------------------------------------ build stage */

const build = (config.build ?? {}) as Record<string, unknown>;
const contexts = (config.context ?? {}) as Record<string, { command?: unknown }>;

const defaultCommand = typeof build.command === "string" ? build.command : "";
const productionCommand =
  typeof contexts.production?.command === "string" ? contexts.production.command : defaultCommand;

if (build.publish !== ".next") {
  fail("[build] publish", `Expected ".next" for @netlify/plugin-nextjs, found "${build.publish}".`);
}

for (const [label, command] of [
  ["[build] command", defaultCommand],
  ["[context.production] command", productionCommand],
] as const) {
  if (!command) {
    fail(label, "Not set.");
    continue;
  }
  if (!command.includes("prisma generate")) {
    fail(label, "Missing `prisma generate`; the client is not committed to the repo.");
  }
  if (command.includes("prisma migrate dev")) {
    fail(label, "Uses `migrate dev`, which is interactive and will hang a deploy.");
  }
  // The preflight is worthless unless it runs before anything that can fail on
  // a missing variable.
  if (!/^\s*npm run preflight/.test(command)) {
    fail(
      label,
      "Does not start with the preflight; a missing variable would fail later and worse.",
    );
  }
}

/**
 * Migrations belong to exactly one context. If the default command migrates,
 * every deploy preview and branch deploy rewrites the production schema — which
 * is the failure this whole arrangement exists to prevent.
 */
if (defaultCommand.includes("prisma migrate deploy")) {
  fail(
    "[build] command",
    "Runs `prisma migrate deploy`. That is the default for every context, so deploy " +
      "previews and branch deploys would migrate the production database. Move it to " +
      "[context.production].",
  );
}
if (!productionCommand.includes("prisma migrate deploy")) {
  fail(
    "[context.production] command",
    "Missing `prisma migrate deploy`; the schema would never be applied on a real deploy.",
  );
}
// Either `npm run preflight:migrations` or `npm run preflight -- --migrations`.
const preflightChecksMigrations =
  /preflight:migrations|preflight\s+--\s+--migrations|preflight.*--migrations/.test(
    productionCommand,
  );

if (productionCommand.includes("prisma migrate deploy") && !preflightChecksMigrations) {
  fail(
    "[context.production] command",
    "Migrates, but its preflight is not in --migrations mode, so a missing DIRECT_URL " +
      "would slip through to Prisma P1012.",
  );
}
if (!defaultCommand.includes("prisma migrate deploy")) {
  notes.push("only [context.production] migrates; previews leave the schema alone");
}

const plugins = (config.plugins ?? []) as Array<{ package?: string }>;
if (!plugins.some((plugin) => plugin.package === "@netlify/plugin-nextjs")) {
  fail("[[plugins]]", "@netlify/plugin-nextjs is not declared.");
}

/* ---------------------------------------------------------------- report */

for (const note of notes) console.log(`  ok   ${note}`);

if (problems.length > 0) {
  console.error(`\n${problems.length} problem(s) in netlify.toml:\n`);
  for (const problem of problems) console.error(`  ${problem.where}\n    ${problem.message}\n`);
  process.exit(1);
}

console.log("\nnetlify.toml is valid.");
