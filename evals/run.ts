/**
 * The eval harness.
 *
 * Runs every fixture against the live prompts and prints a table with a diff
 * for each failure. Exits non-zero below 90% on verdict decisions and 95% on
 * parse amounts, so a prompt change that quietly degrades either one fails CI
 * rather than shipping.
 *
 *   npm run eval                 both suites
 *   npm run eval:verdict         verdict only
 *   npm run eval:parse           parse only
 *   npm run eval:validate        fixture integrity, no model calls, no key
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runVerdict } from "../src/lib/ai/verdict";
import { parseMessages } from "../src/lib/ai/parse-sms";
import { normalizeMerchant } from "../src/lib/merchant";
import type { BudgetState } from "../src/lib/budget-state";
import type { PromptRule } from "../src/lib/ai/schemas";
import { renderTable, score, type Row } from "./score";

const VERDICT_THRESHOLD = 0.9;
const PARSE_THRESHOLD = 0.95;
const CONCURRENCY = 4;

type VerdictCase = {
  id: string;
  why: string;
  input: {
    request: { amount_fils: number; category: string; note?: string };
    budget_state: BudgetState;
    category_history: {
      purchases_last_90d: number;
      reviewed: number;
      not_worth_it: number;
      median_amount_fils: number;
    };
    rules: PromptRule[];
  };
  expect: { decision: "allow" | "hold" | "decline"; rule_ref?: string };
};

type ParseCase = {
  id: string;
  why: string;
  input: { message: string };
  expect: {
    is_transaction: boolean;
    amount_fils: number | null;
    merchant?: string;
    max_confidence?: number;
  };
};

const args = new Set(process.argv.slice(2));
const suiteArg = process.argv.find((a) => a.startsWith("--suite="))?.split("=")[1];
const validateOnly = args.has("--validate-only");
const runVerdictSuite = !suiteArg || suiteArg === "verdict";
const runParseSuite = !suiteArg || suiteArg === "parse";

function load<T>(name: string): T[] {
  const path = join(process.cwd(), "evals", "fixtures", name);
  return JSON.parse(readFileSync(path, "utf8")) as T[];
}

/* --------------------------------------------------------------- integrity */

/**
 * Fixture integrity, checked before any model call. A fixture whose budget
 * state does not add up would pass or fail for reasons unrelated to the prompt.
 */
function validateVerdictFixtures(cases: VerdictCase[]): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();

  for (const item of cases) {
    if (seen.has(item.id)) problems.push(`${item.id}: duplicate id`);
    seen.add(item.id);

    const state = item.input.budget_state;
    const listed = Object.values(state.spentByCategory).reduce((sum, c) => sum + c.spent, 0);
    if (listed > state.spentTotal) {
      problems.push(`${item.id}: category spend ${listed} exceeds spentTotal ${state.spentTotal}`);
    }

    for (const [slug, bucket] of Object.entries(state.spentByCategory)) {
      const expected = bucket.limit === null ? null : bucket.limit - bucket.spent;
      if (bucket.remaining !== expected) {
        problems.push(
          `${item.id}: ${slug} remaining ${bucket.remaining} should be ${expected}`,
        );
      }
    }

    const safe = state.income - state.committedBills - state.spentTotal - state.heldTotal;
    if (state.safeToSpend !== safe) {
      problems.push(`${item.id}: safeToSpend ${state.safeToSpend} should be ${safe}`);
    }

    if (!state.spentByCategory[item.input.request.category]) {
      problems.push(`${item.id}: request category ${item.input.request.category} not in state`);
    }

    if (item.expect.rule_ref) {
      const known = item.input.rules.some((rule) => rule.ref === item.expect.rule_ref);
      if (!known) problems.push(`${item.id}: expects ${item.expect.rule_ref}, not in rules`);
    }

    const history = item.input.category_history;
    if (history.not_worth_it > history.reviewed) {
      problems.push(`${item.id}: not_worth_it exceeds reviewed`);
    }
    if (history.reviewed > history.purchases_last_90d) {
      problems.push(`${item.id}: reviewed exceeds purchases_last_90d`);
    }
  }

  return problems;
}

function validateParseFixtures(cases: ParseCase[]): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const item of cases) {
    if (seen.has(item.id)) problems.push(`${item.id}: duplicate id`);
    seen.add(item.id);
    if (!item.input.message.trim()) problems.push(`${item.id}: empty message`);
    if (!item.expect.is_transaction && item.expect.amount_fils !== null) {
      problems.push(`${item.id}: a skipped message cannot expect an amount`);
    }
  }
  return problems;
}

/* ------------------------------------------------------------------ runner */

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const index = cursor++;
      const item = items[index];
      if (index >= items.length || item === undefined) return;
      results[index] = await worker(item, index);
    }
  });
  await Promise.all(runners);
  return results;
}

async function runVerdictCase(item: VerdictCase): Promise<Row> {
  try {
    const { verdict } = await runVerdict({
      request: item.input.request,
      budget_state: item.input.budget_state,
      category_history: item.input.category_history,
      rules: item.input.rules,
    });

    const decisionOk = verdict.decision === item.expect.decision;
    const refExpected = item.expect.rule_ref;
    const refOk = !refExpected || verdict.ruleRef === refExpected;

    const detail = decisionOk
      ? `${verdict.decision}`
      : `expected ${item.expect.decision}, got ${verdict.decision} — "${verdict.reasoning}"`;

    return {
      id: item.id,
      pass: decisionOk,
      detail,
      soft: refExpected
        ? refOk
          ? `cited ${verdict.ruleRef}`
          : `RULE MISS: expected ${refExpected}, cited ${verdict.ruleRef ?? "nothing"}`
        : undefined,
    };
  } catch (error) {
    return {
      id: item.id,
      pass: false,
      detail: `error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

async function runParseSuiteAll(cases: ParseCase[]): Promise<Row[]> {
  // The parser is batched at 20 per call, which is exactly the fixture count —
  // so this also exercises the real batch size rather than one message at a time.
  const { rows } = await parseMessages(cases.map((item) => item.input.message));

  return cases.map((item, index) => {
    const row = rows[index];
    if (!row) return { id: item.id, pass: false, detail: "no result returned for this index" };

    if (row.is_transaction !== item.expect.is_transaction) {
      return {
        id: item.id,
        pass: false,
        detail: `expected is_transaction ${item.expect.is_transaction}, got ${row.is_transaction}`,
      };
    }

    if (row.amount_fils !== item.expect.amount_fils) {
      return {
        id: item.id,
        pass: false,
        detail: `expected amount ${item.expect.amount_fils}, got ${row.amount_fils}`,
      };
    }

    if (item.expect.max_confidence !== undefined && row.confidence >= item.expect.max_confidence) {
      return {
        id: item.id,
        pass: false,
        detail: `expected confidence below ${item.expect.max_confidence}, got ${row.confidence}`,
      };
    }

    // Merchant is reported but does not gate: the exit criterion is amounts.
    let soft: string | undefined;
    if (item.expect.merchant) {
      const got = normalizeMerchant(row.merchant ?? "");
      const want = normalizeMerchant(item.expect.merchant);
      soft =
        got.toLowerCase() === want.toLowerCase()
          ? `merchant ${got}`
          : `MERCHANT DRIFT: expected ${want}, got ${got || "nothing"}`;
    }

    return { id: item.id, pass: true, detail: `ok (${row.amount_fils ?? "skipped"})`, soft };
  });
}

/* ------------------------------------------------------------------ report */

function table(title: string, rows: Row[], threshold: number): boolean {
  console.log(renderTable(title, rows, threshold));
  return score(rows, threshold).ok;
}

async function main(): Promise<void> {
  const verdictCases = load<VerdictCase>("verdict.json");
  const parseCases = load<ParseCase>("parse.json");

  const problems = [
    ...validateVerdictFixtures(verdictCases),
    ...validateParseFixtures(parseCases),
  ];

  if (problems.length > 0) {
    console.error("Fixture integrity failed:");
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exit(1);
  }

  console.log(
    `Fixtures valid: ${verdictCases.length} verdict cases, ${parseCases.length} parse cases.`,
  );

  if (validateOnly) {
    console.log("--validate-only: fixture integrity checked, no model calls made.");
    return;
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error(
      "\nANTHROPIC_API_KEY is not set. The eval suites call the live model.\n" +
        "Run `npm run eval:validate` to check fixture integrity without a key.",
    );
    process.exit(1);
  }

  let allOk = true;

  if (runVerdictSuite) {
    const rows = await mapWithConcurrency(verdictCases, CONCURRENCY, runVerdictCase);
    allOk = table("Verdict decisions", rows, VERDICT_THRESHOLD) && allOk;
  }

  if (runParseSuite) {
    const rows = await runParseSuiteAll(parseCases);
    allOk = table("Parse amounts", rows, PARSE_THRESHOLD) && allOk;
  }

  if (!allOk) {
    console.error("\nEval failed.");
    process.exit(1);
  }
  console.log("\nEval passed.");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
