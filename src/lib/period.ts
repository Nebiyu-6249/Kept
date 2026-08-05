/**
 * Period boundaries.
 *
 * All wall-clock reasoning happens in APP_TIMEZONE; every instant that leaves
 * this module is a UTC `Date`. The conversion is done with `Intl`, not a fixed
 * offset, so a zone with DST would still land on local midnight.
 */

import { APP_TIMEZONE } from "./env";

export type PeriodType = "MONTHLY" | "SEMIMONTHLY" | "WEEKLY";

export type PeriodUser = {
  periodType: PeriodType;
  periodAnchor: number;
};

export type Period = {
  /** Local midnight at the start of the period, as a UTC instant. */
  start: Date;
  /** The last instant of the period (start of the next period, minus 1ms). */
  end: Date;
  daysTotal: number;
  /**
   * Whole days left after today. On the final day of a period this is 0, which
   * reads as "the period ends today". `daysElapsed` counts today as elapsed, so
   * `daysElapsed + daysRemaining === daysTotal` always holds and the run-rate
   * projection in budget-state is exact.
   */
  daysRemaining: number;
  daysElapsed: number;
};

const MS_PER_DAY = 86_400_000;

type Parts = {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
};

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatterCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatterCache.set(timeZone, f);
  }
  return f;
}

/** The wall-clock parts of an instant, in the given zone. */
export function zonedParts(date: Date, timeZone: string = APP_TIMEZONE): Parts {
  const parts = formatter(timeZone).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes): number => {
    const found = parts.find((p) => p.type === type);
    return found ? Number.parseInt(found.value, 10) : 0;
  };
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

/** Milliseconds the zone is ahead of UTC at this instant. */
function offsetMs(date: Date, timeZone: string): number {
  const p = zonedParts(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  // Discard sub-second drift so the result is a clean offset.
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/**
 * The UTC instant whose local representation in `timeZone` is the given wall
 * clock. Resolved in two passes so a DST transition between the guess and the
 * answer is corrected.
 */
export function fromZonedWallClock(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
  timeZone: string = APP_TIMEZONE,
): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute, second);
  const first = offsetMs(new Date(guess), timeZone);
  let instant = guess - first;
  const second_ = offsetMs(new Date(instant), timeZone);
  if (second_ !== first) instant = guess - second_;
  return new Date(instant);
}

/** Local midnight of the local calendar date containing `date`. */
export function startOfLocalDay(date: Date, timeZone: string = APP_TIMEZONE): Date {
  const p = zonedParts(date, timeZone);
  return fromZonedWallClock(p.year, p.month, p.day, 0, 0, 0, timeZone);
}

/** `YYYY-MM-DD` in the app timezone. The key format for UsageCounter. */
export function dayKey(date: Date, timeZone: string = APP_TIMEZONE): string {
  const p = zonedParts(date, timeZone);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Whole local days between two local midnights. DST-safe via rounding. */
function wholeDaysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / MS_PER_DAY);
}

function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const zero = year * 12 + (month - 1) + delta;
  return { year: Math.floor(zero / 12), month: (((zero % 12) + 12) % 12) + 1 };
}

/**
 * The start of the monthly period containing `date`, and the start of the next.
 * The anchor clamps to the last day of a short month, so an anchor of 31 lands
 * on 28 February and back on 31 March.
 */
function monthlyBounds(date: Date, anchor: number, timeZone: string): [Date, Date] {
  const p = zonedParts(date, timeZone);
  const anchorFor = (year: number, month: number): number =>
    Math.min(Math.max(anchor, 1), daysInMonth(year, month));

  const thisMonthAnchor = anchorFor(p.year, p.month);
  let startY = p.year;
  let startM = p.month;

  if (p.day < thisMonthAnchor) {
    const prev = shiftMonth(p.year, p.month, -1);
    startY = prev.year;
    startM = prev.month;
  }

  const start = fromZonedWallClock(startY, startM, anchorFor(startY, startM), 0, 0, 0, timeZone);
  const next = shiftMonth(startY, startM, 1);
  const nextStart = fromZonedWallClock(
    next.year,
    next.month,
    anchorFor(next.year, next.month),
    0,
    0,
    0,
    timeZone,
  );
  return [start, nextStart];
}

/**
 * Semimonthly: two periods a month, the first starting on the anchor and the
 * second 15 days later, both clamped to the month length.
 */
function semimonthlyBounds(date: Date, anchor: number, timeZone: string): [Date, Date] {
  const p = zonedParts(date, timeZone);
  const len = daysInMonth(p.year, p.month);
  const first = Math.min(Math.max(anchor, 1), len);
  const second = Math.min(first + 15, len);

  const mk = (y: number, m: number, d: number): Date =>
    fromZonedWallClock(y, m, Math.min(d, daysInMonth(y, m)), 0, 0, 0, timeZone);

  if (p.day >= second) {
    const next = shiftMonth(p.year, p.month, 1);
    const nextFirst = Math.min(Math.max(anchor, 1), daysInMonth(next.year, next.month));
    return [mk(p.year, p.month, second), mk(next.year, next.month, nextFirst)];
  }
  if (p.day >= first) {
    return [mk(p.year, p.month, first), mk(p.year, p.month, second)];
  }
  const prev = shiftMonth(p.year, p.month, -1);
  const prevLen = daysInMonth(prev.year, prev.month);
  const prevFirst = Math.min(Math.max(anchor, 1), prevLen);
  return [mk(prev.year, prev.month, Math.min(prevFirst + 15, prevLen)), mk(p.year, p.month, first)];
}

/** Weekly: `periodAnchor` is an ISO weekday, 1 = Monday through 7 = Sunday. */
function weeklyBounds(date: Date, anchor: number, timeZone: string): [Date, Date] {
  const localMidnight = startOfLocalDay(date, timeZone);
  // getUTCDay on a local-midnight instant is unsafe; derive the weekday from the
  // local calendar date instead.
  const p = zonedParts(date, timeZone);
  const dow = new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay(); // 0=Sun
  const iso = dow === 0 ? 7 : dow;
  const target = Math.min(Math.max(anchor, 1), 7);
  const back = (iso - target + 7) % 7;
  const start = new Date(localMidnight.getTime() - back * MS_PER_DAY);
  // Re-anchor to local midnight in case the shift crossed a DST boundary.
  const startParts = zonedParts(start, timeZone);
  const cleanStart = fromZonedWallClock(
    startParts.year,
    startParts.month,
    startParts.day,
    0,
    0,
    0,
    timeZone,
  );
  const rough = new Date(cleanStart.getTime() + 7 * MS_PER_DAY);
  const roughParts = zonedParts(rough, timeZone);
  const nextStart = fromZonedWallClock(
    roughParts.year,
    roughParts.month,
    roughParts.day,
    0,
    0,
    0,
    timeZone,
  );
  return [cleanStart, nextStart];
}

/**
 * The period containing `now` for this user.
 *
 * `end` is inclusive: it is the last representable instant of the period, so a
 * query of `occurredAt BETWEEN start AND end` captures the whole final day.
 */
export function currentPeriod(
  user: PeriodUser,
  now: Date = new Date(),
  timeZone: string = APP_TIMEZONE,
): Period {
  const anchor = Number.isFinite(user.periodAnchor) ? user.periodAnchor : 1;

  const [start, nextStart] =
    user.periodType === "WEEKLY"
      ? weeklyBounds(now, anchor, timeZone)
      : user.periodType === "SEMIMONTHLY"
        ? semimonthlyBounds(now, anchor, timeZone)
        : monthlyBounds(now, anchor, timeZone);

  const end = new Date(nextStart.getTime() - 1);
  const daysTotal = Math.max(1, wholeDaysBetween(start, nextStart));

  const today = startOfLocalDay(now, timeZone);
  const elapsedWholeDays = wholeDaysBetween(start, today); // 0 on the first day
  const daysElapsed = Math.min(Math.max(elapsedWholeDays + 1, 1), daysTotal);
  const daysRemaining = daysTotal - daysElapsed;

  return { start, end, daysTotal, daysRemaining, daysElapsed };
}

/**
 * Label for the left rail: `PERIOD 01–31 AUG`. An en dash, and the month of the
 * period end so a period that straddles two months still names one.
 */
export function periodLabel(period: Period, timeZone: string = APP_TIMEZONE): string {
  const s = zonedParts(period.start, timeZone);
  const e = zonedParts(period.end, timeZone);
  const month = (m: number): string =>
    ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"][m - 1] ??
    "";
  const dd = (n: number): string => String(n).padStart(2, "0");

  return s.month === e.month
    ? `${dd(s.day)}–${dd(e.day)} ${month(s.month)}`
    : `${dd(s.day)} ${month(s.month)}–${dd(e.day)} ${month(e.month)}`;
}

/**
 * The single occurrence of a monthly `dueDay` inside this period, or null if it
 * does not land in the window. Clamped to the month length.
 */
export function billDueDateInPeriod(
  dueDay: number,
  period: Period,
  timeZone: string = APP_TIMEZONE,
): Date | null {
  const s = zonedParts(period.start, timeZone);
  const e = zonedParts(period.end, timeZone);

  const candidates: Date[] = [];
  const months: Array<{ year: number; month: number }> = [{ year: s.year, month: s.month }];
  if (s.year !== e.year || s.month !== e.month) months.push({ year: e.year, month: e.month });

  for (const m of months) {
    const day = Math.min(Math.max(dueDay, 1), daysInMonth(m.year, m.month));
    candidates.push(fromZonedWallClock(m.year, m.month, day, 0, 0, 0, timeZone));
  }

  for (const c of candidates) {
    if (c >= period.start && c <= period.end) return c;
  }
  return null;
}
