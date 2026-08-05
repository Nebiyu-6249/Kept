import { describe, expect, it } from "vitest";
import { buildScenarios } from "@/lib/demo";
import { currentPeriod } from "@/lib/period";

const TZ = "Asia/Dubai";
const NOW = new Date("2026-08-11T09:00:00Z"); // day 11 of 31
const period = currentPeriod({ periodType: "MONTHLY", periodAnchor: 1 }, NOW, TZ);

/** Even spend of 8,000 fils a day across the elapsed days. */
function evenSpend(perDay: number, days: number) {
  return Array.from({ length: days }, (_, day) => ({
    amount: perDay,
    occurredAt: new Date(period.start.getTime() + day * 86_400_000 + 3_600_000),
    discretionary: true,
  }));
}

function build(transactions: ReturnType<typeof evenSpend>, income = 1_800_000) {
  return buildScenarios({ transactions, period, income, now: NOW, currency: "AED" });
}

describe("scenario picker single source of truth", () => {
  const scenarios = build(evenSpend(8_000, period.daysElapsed));

  it("gives every scenario a path, an eyebrow and three facts", () => {
    for (const scenario of Object.values(scenarios)) {
      expect(scenario.cumulative).toHaveLength(period.daysTotal);
      expect(scenario.eyebrow.length).toBeGreaterThan(0);
      expect(scenario.facts).toHaveLength(3);
    }
  });

  it("derives the facts from the same array the path is drawn from", () => {
    // §12.2: the failure this guards against is a caption that disagrees with
    // the drawing. The projected figure must be the last point of the path.
    for (const scenario of Object.values(scenarios)) {
      const last = scenario.cumulative[scenario.cumulative.length - 1] ?? 0;
      const projected = scenario.facts[0]?.value ?? "";
      expect(projected).toBe(`AED ${Math.round(last / 100).toLocaleString("en-US")}`);
    }
  });

  it("keeps the crossing fact consistent with the crossing marker", () => {
    for (const scenario of Object.values(scenarios)) {
      const fact = scenario.facts[2];
      if (scenario.crossingDay === null) {
        expect(fact?.value).toBe("All period");
      } else {
        expect(fact?.value).toBe(String(scenario.crossingDay + 1));
      }
    }
  });

  it("orders the scenarios: tight spends least, payday most", () => {
    const end = (id: "tight" | "normal" | "payday"): number =>
      scenarios[id].cumulative[scenarios[id].cumulative.length - 1] ?? 0;
    expect(end("tight")).toBeLessThan(end("normal"));
    expect(end("normal")).toBeLessThan(end("payday"));
  });

  it("rises monotonically — cumulative spend never goes down", () => {
    for (const scenario of Object.values(scenarios)) {
      for (let day = 1; day < scenario.cumulative.length; day += 1) {
        expect(scenario.cumulative[day]).toBeGreaterThanOrEqual(scenario.cumulative[day - 1] ?? 0);
      }
    }
  });
});

describe("crossing detection", () => {
  it("reports no crossing when the period ends inside the even rate", () => {
    // 8,000/day over 31 days is 248,000, well under a 630,000 allowance.
    const scenarios = build(evenSpend(8_000, period.daysElapsed));
    expect(scenarios.normal.crossingDay).toBeNull();
    expect(scenarios.tight.crossingDay).toBeNull();
  });

  it("does not cry wolf over one heavy day early in a comfortable period", () => {
    // A single large day one, then nothing much. The line pokes above the even
    // rate immediately and recovers; that is not a projected overspend.
    const transactions = [
      { amount: 90_000, occurredAt: new Date(period.start.getTime() + 3_600_000), discretionary: true },
      ...evenSpend(1_000, period.daysElapsed).slice(1),
    ];
    const scenarios = build(transactions);
    const end = scenarios.normal.cumulative[period.daysTotal - 1] ?? 0;
    expect(end).toBeLessThan(scenarios.normal.idealPerDay * period.daysTotal);
    expect(scenarios.normal.crossingDay).toBeNull();
  });

  it("marks a crossing when the period really does end over the line", () => {
    // 60,000/day against a 630,000 allowance across 31 days.
    const scenarios = build(evenSpend(60_000, period.daysElapsed));
    expect(scenarios.payday.crossingDay).not.toBeNull();
    const day = scenarios.payday.crossingDay ?? 0;
    const cumulative = scenarios.payday.cumulative;
    // From the crossing onward the line stays above the even rate.
    for (let i = day; i < cumulative.length; i += 1) {
      expect(cumulative[i]).toBeGreaterThan(scenarios.payday.idealPerDay * (i + 1));
    }
  });

  it("handles a period with no spending at all", () => {
    const scenarios = build([]);
    expect(scenarios.normal.cumulative.every((value) => value === 0)).toBe(true);
    expect(scenarios.normal.crossingDay).toBeNull();
  });
});
