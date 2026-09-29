/**
 * Dates in a `.ftree` file are plain strings. The editor writes `YYYY-MM-DD`,
 * but hand-edited files may hold a bare year or a year and month, so all three
 * shapes are understood.
 *
 * Nothing here goes through `new Date(string)`: that parses ISO dates as UTC
 * midnight, which local getters then read back as the previous day in any
 * zone west of Greenwich.
 */

export interface DateParts {
  year: number;
  month?: number;
  day?: number;
}

const DATE_PATTERN = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?(?:[T ].*)?$/;

export function parseDateParts(value: string | undefined): DateParts | undefined {
  if (!value) return undefined;
  const match = DATE_PATTERN.exec(value.trim());
  if (!match) return undefined;

  const year = Number(match[1]);
  const month = match[2] === undefined ? undefined : Number(match[2]);
  const day = match[3] === undefined ? undefined : Number(match[3]);
  if (month !== undefined && (month < 1 || month > 12)) return undefined;
  if (day !== undefined && (month === undefined || day < 1 || day > daysInMonth(year, month))) return undefined;
  return { year, month, day };
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Today's calendar date in the machine's own time zone. */
export function todayParts(now: Date = new Date()): DateParts {
  return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
}

/**
 * Whole years between two dates, or `undefined` when the pair is impossible
 * (the end precedes the start). Missing months or days are treated as unknown
 * rather than guessed, so a year-only birth never claims a birthday has passed.
 */
export function yearsBetween(start: DateParts, end: DateParts): number | undefined {
  let years = end.year - start.year;
  if (start.month !== undefined && end.month !== undefined) {
    const monthDelta = end.month - start.month;
    const dayDelta = start.day !== undefined && end.day !== undefined ? end.day - start.day : 0;
    if (monthDelta < 0 || (monthDelta === 0 && dayDelta < 0)) years -= 1;
  }
  return years >= 0 ? years : undefined;
}

/** Sortable number: year, then month, then day; unknown parts sort first. */
export function dateSortKey(parts: DateParts): number {
  return parts.year * 10_000 + (parts.month ?? 0) * 100 + (parts.day ?? 0);
}
