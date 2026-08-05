/**
 * Scoring, separated from the runner so the pass/fail arithmetic can be unit
 * tested without a model call. An eval harness that miscounts is worse than no
 * harness: it reports green while the prompt degrades.
 */

export type Row = {
  id: string;
  pass: boolean;
  detail: string;
  /** Secondary signal, reported but not gating. */
  soft?: string;
};

export type Score = {
  passed: number;
  total: number;
  rate: number;
  ok: boolean;
  softMisses: number;
};

export function score(rows: readonly Row[], threshold: number): Score {
  const passed = rows.filter((row) => row.pass).length;
  // An empty suite is a failure, not a free pass — it means the fixtures did
  // not load, and reporting 100% for zero cases is how a broken harness hides.
  const rate = rows.length === 0 ? 0 : passed / rows.length;
  const softMisses = rows.filter(
    (row) => row.soft?.includes("MISS") || row.soft?.includes("DRIFT"),
  ).length;

  return {
    passed,
    total: rows.length,
    rate,
    ok: rows.length > 0 && rate >= threshold,
    softMisses,
  };
}

export function renderTable(title: string, rows: readonly Row[], threshold: number): string {
  const result = score(rows, threshold);
  const lines: string[] = ["", title, "=".repeat(title.length)];

  const width = Math.max(...rows.map((row) => row.id.length), 4);
  for (const row of rows) {
    lines.push(`  ${row.pass ? "PASS" : "FAIL"}  ${row.id.padEnd(width)}  ${row.detail}`);
    if (row.soft) lines.push(`        ${" ".repeat(width)}  ${row.soft}`);
  }

  lines.push(
    "",
    `  ${result.passed}/${result.total} = ${(result.rate * 100).toFixed(1)}%  (threshold ${(
      threshold * 100
    ).toFixed(0)}%)  ${result.ok ? "OK" : "BELOW THRESHOLD"}`,
  );

  if (result.softMisses > 0) {
    lines.push(`  ${result.softMisses} secondary miss(es) reported above, not gating.`);
  }

  return lines.join("\n");
}
