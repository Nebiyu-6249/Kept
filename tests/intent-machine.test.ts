import { describe, expect, it } from "vitest";
import {
  applyAction,
  formatCountdown,
  holdUntilFrom,
  isHoldExpired,
  isLegalAction,
  legalActions,
  msRemaining,
  type IntentAction,
  type IntentState,
} from "@/lib/intent-machine";

const STATES: IntentState[] = ["OPEN", "HELD", "PURCHASED", "RELEASED", "EXPIRED"];
const ACTIONS: IntentAction[] = ["hold", "purchase", "release"];

const LEGAL: Array<[IntentState, IntentAction, IntentState]> = [
  ["OPEN", "hold", "HELD"],
  ["OPEN", "purchase", "PURCHASED"],
  ["HELD", "purchase", "PURCHASED"],
  ["HELD", "release", "RELEASED"],
];

describe("hold state machine", () => {
  it.each(LEGAL)("allows %s + %s -> %s", (from, action, to) => {
    expect(applyAction(from, action)).toEqual({ ok: true, next: to });
  });

  it("rejects every transition not in the table", () => {
    const legalKeys = new Set(LEGAL.map(([s, a]) => `${s}:${a}`));
    const rejected: string[] = [];

    for (const state of STATES) {
      for (const action of ACTIONS) {
        if (legalKeys.has(`${state}:${action}`)) continue;
        const result = applyAction(state, action);
        expect(result.ok).toBe(false);
        rejected.push(`${state}:${action}`);
      }
    }

    // 5 states x 3 actions = 15 pairs, 4 of which are legal.
    expect(rejected).toHaveLength(11);
  });

  it("refuses to release an intent that was never held", () => {
    const result = applyAction("OPEN", "release");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("Cannot release an intent that is open.");
  });

  it("treats purchased, released and expired as terminal", () => {
    for (const state of ["PURCHASED", "RELEASED", "EXPIRED"] as const) {
      expect(legalActions(state)).toEqual([]);
      for (const action of ACTIONS) expect(isLegalAction(state, action)).toBe(false);
    }
  });

  it("cannot re-release an intent and inflate Kept twice", () => {
    const first = applyAction("HELD", "release");
    expect(first).toEqual({ ok: true, next: "RELEASED" });
    expect(applyAction("RELEASED", "release").ok).toBe(false);
  });

  it("offers the right buttons per state", () => {
    expect(legalActions("OPEN")).toEqual(["hold", "purchase"]);
    expect(legalActions("HELD")).toEqual(["purchase", "release"]);
  });
});

describe("hold window", () => {
  const now = new Date("2026-08-05T09:00:00Z");

  it("is 48 hours", () => {
    expect(holdUntilFrom(now).toISOString()).toBe("2026-08-07T09:00:00.000Z");
  });

  it("expires without leaving the HELD state", () => {
    const expired = { state: "HELD" as const, holdUntil: new Date("2026-08-04T09:00:00Z") };
    const active = { state: "HELD" as const, holdUntil: new Date("2026-08-06T09:00:00Z") };
    expect(isHoldExpired(expired, now)).toBe(true);
    expect(isHoldExpired(active, now)).toBe(false);
  });

  it("expires exactly on the boundary", () => {
    expect(isHoldExpired({ state: "HELD", holdUntil: now }, now)).toBe(true);
  });

  it("is never expired in a state that is not HELD", () => {
    expect(
      isHoldExpired({ state: "OPEN", holdUntil: new Date("2020-01-01T00:00:00Z") }, now),
    ).toBe(false);
    expect(isHoldExpired({ state: "HELD", holdUntil: null }, now)).toBe(false);
  });

  it("never reports negative time remaining", () => {
    expect(msRemaining({ holdUntil: new Date("2026-08-04T09:00:00Z") }, now)).toBe(0);
    expect(msRemaining({ holdUntil: new Date("2026-08-06T09:00:00Z") }, now)).toBe(86_400_000);
    expect(msRemaining({ holdUntil: null }, now)).toBe(0);
  });
});

describe("formatCountdown", () => {
  it("renders hours and minutes, zero-padded", () => {
    expect(formatCountdown(41 * 3_600_000 + 12 * 60_000)).toBe("41H 12M");
    expect(formatCountdown(3_600_000 + 60_000)).toBe("01H 01M");
    expect(formatCountdown(47 * 3_600_000 + 59 * 60_000)).toBe("47H 59M");
  });

  it("reads READY once the window has passed", () => {
    expect(formatCountdown(0)).toBe("READY");
    expect(formatCountdown(-5)).toBe("READY");
  });
});
