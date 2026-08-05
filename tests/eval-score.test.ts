import { describe, expect, it } from "vitest";
import { renderTable, score, type Row } from "../evals/score";

const row = (id: string, pass: boolean, soft?: string): Row => ({
  id,
  pass,
  detail: pass ? "ok" : "expected allow, got hold",
  ...(soft ? { soft } : {}),
});

describe("eval scoring", () => {
  it("counts passes and computes a rate", () => {
    const result = score([row("a", true), row("b", true), row("c", false), row("d", true)], 0.9);
    expect(result).toMatchObject({ passed: 3, total: 4, ok: false });
    expect(result.rate).toBeCloseTo(0.75);
  });

  it("passes exactly at the threshold", () => {
    const rows = [...Array(9).fill(null).map((_, i) => row(`p${i}`, true)), row("f", false)];
    const result = score(rows, 0.9);
    expect(result.rate).toBeCloseTo(0.9);
    expect(result.ok).toBe(true);
  });

  it("fails just under the threshold", () => {
    const rows = [...Array(18).fill(null).map((_, i) => row(`p${i}`, true)), row("x", false), row("y", false)];
    expect(score(rows, 0.95).ok).toBe(false);
  });

  it("fails an empty suite rather than reporting a free 100%", () => {
    // Fixtures that did not load must not read as green.
    const result = score([], 0.9);
    expect(result).toMatchObject({ passed: 0, total: 0, rate: 0, ok: false });
  });

  it("counts secondary misses without gating on them", () => {
    const rows = [row("a", true, "MERCHANT DRIFT: expected Lulu, got Lulu Hyper"), row("b", true, "merchant Carrefour")];
    const result = score(rows, 0.9);
    expect(result.ok).toBe(true);
    expect(result.softMisses).toBe(1);
  });

  it("renders every case and the threshold verdict", () => {
    const output = renderTable("Verdict decisions", [row("allow-01", true), row("hold-02", false)], 0.9);
    expect(output).toContain("PASS  allow-01");
    expect(output).toContain("FAIL  hold-02");
    expect(output).toContain("expected allow, got hold");
    expect(output).toContain("1/2 = 50.0%");
    expect(output).toContain("BELOW THRESHOLD");
  });
});
