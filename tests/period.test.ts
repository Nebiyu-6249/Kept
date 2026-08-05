import { describe, expect, it } from "vitest";
import {
  billDueDateInPeriod,
  currentPeriod,
  dayKey,
  daysInMonth,
  fromZonedWallClock,
  periodLabel,
  startOfLocalDay,
  zonedParts,
} from "@/lib/period";

const TZ = "Asia/Dubai"; // UTC+4, no DST

/** Local midnight in Dubai, expressed as the UTC instant. */
const localMidnight = (iso: string): string => `${iso}T00:00:00.000+04:00`;

describe("zone conversion", () => {
  it("reads wall-clock parts in the app timezone, not UTC", () => {
    const p = zonedParts(new Date("2026-08-05T20:30:00Z"), TZ);
    expect(p).toMatchObject({ year: 2026, month: 8, day: 6, hour: 0, minute: 30 });
  });

  it("builds the UTC instant for a local wall clock", () => {
    expect(fromZonedWallClock(2026, 8, 1, 0, 0, 0, TZ).toISOString()).toBe(
      "2026-07-31T20:00:00.000Z",
    );
  });

  it("keys days by the local calendar date", () => {
    // 20:30 UTC is already tomorrow in Dubai.
    expect(dayKey(new Date("2026-08-05T20:30:00Z"), TZ)).toBe("2026-08-06");
    expect(dayKey(new Date("2026-08-05T19:59:00Z"), TZ)).toBe("2026-08-05");
  });

  it("snaps to local midnight", () => {
    expect(startOfLocalDay(new Date("2026-08-05T09:00:00Z"), TZ).toISOString()).toBe(
      "2026-08-04T20:00:00.000Z",
    );
  });

  it("knows month lengths including leap years", () => {
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(2026, 8)).toBe(31);
    expect(daysInMonth(2026, 4)).toBe(30);
  });
});

describe("currentPeriod — monthly", () => {
  it("runs anchor to the day before the next anchor", () => {
    const p = currentPeriod(
      { periodType: "MONTHLY", periodAnchor: 1 },
      new Date("2026-08-05T09:00:00Z"),
      TZ,
    );
    expect(p.start.toISOString()).toBe(new Date(localMidnight("2026-08-01")).toISOString());
    expect(p.end.toISOString()).toBe(
      new Date(new Date(localMidnight("2026-09-01")).getTime() - 1).toISOString(),
    );
    expect(p.daysTotal).toBe(31);
  });

  it("counts today as elapsed and the rest as remaining", () => {
    const p = currentPeriod(
      { periodType: "MONTHLY", periodAnchor: 1 },
      new Date("2026-08-05T09:00:00Z"),
      TZ,
    );
    expect(p.daysElapsed).toBe(5);
    expect(p.daysRemaining).toBe(26);
    expect(p.daysElapsed + p.daysRemaining).toBe(p.daysTotal);
  });

  it("is on day one at the very start of a period", () => {
    const p = currentPeriod(
      { periodType: "MONTHLY", periodAnchor: 1 },
      new Date(localMidnight("2026-08-01")),
      TZ,
    );
    expect(p.daysElapsed).toBe(1);
    expect(p.daysRemaining).toBe(30);
  });

  it("has zero days remaining on the last day", () => {
    const p = currentPeriod(
      { periodType: "MONTHLY", periodAnchor: 1 },
      new Date(localMidnight("2026-08-31")),
      TZ,
    );
    expect(p.daysRemaining).toBe(0);
    expect(p.daysElapsed).toBe(31);
  });

  it("looks back to the previous month before the anchor day", () => {
    const p = currentPeriod(
      { periodType: "MONTHLY", periodAnchor: 15 },
      new Date("2026-08-05T09:00:00Z"),
      TZ,
    );
    expect(p.start.toISOString()).toBe(new Date(localMidnight("2026-07-15")).toISOString());
    expect(p.daysTotal).toBe(31);
  });

  it("clamps an anchor past the end of a short month", () => {
    // Anchor 31 in February clamps to the 28th.
    const p = currentPeriod(
      { periodType: "MONTHLY", periodAnchor: 31 },
      new Date("2026-02-10T09:00:00Z"),
      TZ,
    );
    expect(p.start.toISOString()).toBe(new Date(localMidnight("2026-01-31")).toISOString());
    expect(p.end.toISOString()).toBe(
      new Date(new Date(localMidnight("2026-02-28")).getTime() - 1).toISOString(),
    );
    expect(p.daysTotal).toBe(28);
  });

  it("returns to the full anchor day after a short month", () => {
    const p = currentPeriod(
      { periodType: "MONTHLY", periodAnchor: 31 },
      new Date("2026-03-05T09:00:00Z"),
      TZ,
    );
    expect(p.start.toISOString()).toBe(new Date(localMidnight("2026-02-28")).toISOString());
    expect(p.end.toISOString()).toBe(
      new Date(new Date(localMidnight("2026-03-31")).getTime() - 1).toISOString(),
    );
  });

  it("never divides by zero: daysElapsed is at least one", () => {
    for (const day of ["2026-08-01", "2026-08-15", "2026-08-31"]) {
      const p = currentPeriod(
        { periodType: "MONTHLY", periodAnchor: 1 },
        new Date(localMidnight(day)),
        TZ,
      );
      expect(p.daysElapsed).toBeGreaterThanOrEqual(1);
    }
  });
});

describe("currentPeriod — semimonthly and weekly", () => {
  it("splits the month in two", () => {
    const first = currentPeriod(
      { periodType: "SEMIMONTHLY", periodAnchor: 1 },
      new Date("2026-08-05T09:00:00Z"),
      TZ,
    );
    expect(first.start.toISOString()).toBe(new Date(localMidnight("2026-08-01")).toISOString());
    expect(first.daysTotal).toBe(15);

    const second = currentPeriod(
      { periodType: "SEMIMONTHLY", periodAnchor: 1 },
      new Date("2026-08-20T09:00:00Z"),
      TZ,
    );
    expect(second.start.toISOString()).toBe(new Date(localMidnight("2026-08-16")).toISOString());
    expect(second.daysTotal).toBe(16);
  });

  it("anchors the week on an ISO weekday", () => {
    // 2026-08-05 is a Wednesday; anchor 1 is Monday.
    const p = currentPeriod(
      { periodType: "WEEKLY", periodAnchor: 1 },
      new Date("2026-08-05T09:00:00Z"),
      TZ,
    );
    expect(p.start.toISOString()).toBe(new Date(localMidnight("2026-08-03")).toISOString());
    expect(p.daysTotal).toBe(7);
    expect(p.daysElapsed).toBe(3);
    expect(p.daysRemaining).toBe(4);
  });
});

describe("periodLabel", () => {
  it("names one month when the period sits inside it", () => {
    const p = currentPeriod(
      { periodType: "MONTHLY", periodAnchor: 1 },
      new Date("2026-08-05T09:00:00Z"),
      TZ,
    );
    expect(periodLabel(p, TZ)).toBe("01–31 AUG");
  });

  it("names both months when the period straddles them", () => {
    const p = currentPeriod(
      { periodType: "MONTHLY", periodAnchor: 15 },
      new Date("2026-08-05T09:00:00Z"),
      TZ,
    );
    expect(periodLabel(p, TZ)).toBe("15 JUL–14 AUG");
  });
});

describe("billDueDateInPeriod", () => {
  const period = currentPeriod(
    { periodType: "MONTHLY", periodAnchor: 1 },
    new Date("2026-08-05T09:00:00Z"),
    TZ,
  );

  it("finds the single occurrence inside the window", () => {
    const due = billDueDateInPeriod(12, period, TZ);
    expect(due?.toISOString()).toBe(new Date(localMidnight("2026-08-12")).toISOString());
  });

  it("clamps a due day past the month length", () => {
    const feb = currentPeriod(
      { periodType: "MONTHLY", periodAnchor: 1 },
      new Date("2026-02-10T09:00:00Z"),
      TZ,
    );
    const due = billDueDateInPeriod(31, feb, TZ);
    expect(due?.toISOString()).toBe(new Date(localMidnight("2026-02-28")).toISOString());
  });

  it("finds a due day in the second month of a straddling period", () => {
    const straddle = currentPeriod(
      { periodType: "MONTHLY", periodAnchor: 15 },
      new Date("2026-08-05T09:00:00Z"),
      TZ,
    );
    const due = billDueDateInPeriod(3, straddle, TZ);
    expect(due?.toISOString()).toBe(new Date(localMidnight("2026-08-03")).toISOString());
  });
});
