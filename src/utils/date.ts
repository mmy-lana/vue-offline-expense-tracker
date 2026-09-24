/**
 * Local-calendar date engine.
 *
 * Every helper works on the user's local timezone and on the canonical string
 * formats `YYYY-MM-DD` (calendar day) and `YYYY-MM` (month bucket). `Date`
 * objects are never serialised directly: persisting an ISO/UTC string would
 * shift a transaction into the neighbouring day for half of the world's
 * timezones.
 */

const MONTH_BUCKET_PATTERN = /^(\d{4})-(\d{2})$/;
const CALENDAR_DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

const pad2 = (value: number): string => value.toString().padStart(2, '0');

/** `2026-09-24` for the local calendar day of `date`. */
export const toLocalDateString = (date: Date): string =>
  `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;

/** `2026-09` for the local month bucket of `date`. */
export const toYearMonth = (date: Date): string =>
  `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;

export const getCurrentLocalDateString = (): string => toLocalDateString(new Date());

export const getCurrentYearMonth = (): string => toYearMonth(new Date());

/** True only for a syntactically valid, really existing calendar day. */
export const isValidCalendarDayString = (value: string): boolean => {
  const match = CALENDAR_DAY_PATTERN.exec(value);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;

  return getDaysInMonth(`${match[1]}-${match[2]}`) >= day && year > 0;
};

/** True only for a syntactically valid, really existing month bucket. */
export const isValidYearMonthString = (value: string): boolean => {
  const match = MONTH_BUCKET_PATTERN.exec(value);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  return year > 0 && month >= 1 && month <= 12;
};

/**
 * Builds a `Date` anchored at midday for a `YYYY-MM-DD` string.
 *
 * Midday, not midnight: in timezones whose DST transition happens at 00:00
 * (Brazil, Lebanon, Chile, Cuba and others) local midnight may not exist on the
 * transition day, and `Date` silently rolls such instants into the previous or
 * next day — which would corrupt weekday labels, day steppers and month bounds.
 * Noon is always a valid, unambiguous local instant.
 *
 * Returns `null` instead of an `Invalid Date` guard-rail for callers.
 */
export const parseLocalDate = (dateString: string): Date | null => {
  if (!isValidCalendarDayString(dateString)) return null;

  const match = CALENDAR_DAY_PATTERN.exec(dateString);
  if (!match) return null;

  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0);
};

/** Number of calendar days in a `YYYY-MM` bucket (28–31). */
export const getDaysInMonth = (yearMonth: string): number => {
  const match = MONTH_BUCKET_PATTERN.exec(yearMonth);
  if (!match) return 0;

  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return 0;

  // Day 0 of the following month is the last day of the requested month.
  return new Date(year, month, 0).getDate();
};

/** First and last calendar day of a month bucket, inclusive. */
export const getMonthBoundaries = (
  yearMonth: string
): { start: string; end: string; daysInMonth: number } => {
  const daysInMonth = getDaysInMonth(yearMonth);
  const safeMonth = isValidYearMonthString(yearMonth) ? yearMonth : getCurrentYearMonth();
  const safeDays = daysInMonth > 0 ? daysInMonth : getDaysInMonth(safeMonth);

  return {
    start: `${safeMonth}-01`,
    end: `${safeMonth}-${pad2(safeDays)}`,
    daysInMonth: safeDays
  };
};

/** Shifts a month bucket by a signed number of months. */
export const shiftYearMonth = (yearMonth: string, deltaMonths: number): string => {
  const match = MONTH_BUCKET_PATTERN.exec(yearMonth);
  if (!match) return getCurrentYearMonth();

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  if (!Number.isFinite(deltaMonths)) return yearMonth;

  const shifted = new Date(year, monthIndex + Math.trunc(deltaMonths), 1, 12, 0, 0);
  return toYearMonth(shifted);
};

/** Shifts a calendar day by a signed number of days. */
export const shiftDateByDays = (dateString: string, deltaDays: number): string => {
  const base = parseLocalDate(dateString);
  if (!base || !Number.isFinite(deltaDays)) return dateString;

  base.setDate(base.getDate() + Math.trunc(deltaDays));
  return toLocalDateString(base);
};

/** Negative when `a` is earlier than `b`, positive when later, 0 when equal. */
export const compareDateStrings = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export const isSameYearMonth = (a: string, b: string): boolean => a === b;

/** Inclusive calendar range, used by the ledger filter engine. */
export const isDateInRange = (date: string, start: string, end: string): boolean =>
  compareDateStrings(date, start) >= 0 && compareDateStrings(date, end) <= 0;

/** `true` when the month bucket is strictly before the current local month. */
export const isPastYearMonth = (yearMonth: string, reference: Date = new Date()): boolean =>
  compareDateStrings(yearMonth, toYearMonth(reference)) < 0;

/** `true` when the month bucket is strictly after the current local month. */
export const isFutureYearMonth = (yearMonth: string, reference: Date = new Date()): boolean =>
  compareDateStrings(yearMonth, toYearMonth(reference)) > 0;

/**
 * Days still available for spending inside a month bucket, floored at 1 for the
 * active month so projections never divide by zero; 0 for past months and the
 * full month length for a future month.
 */
export const getRemainingDaysInMonth = (yearMonth: string, reference: Date = new Date()): number => {
  const currentYearMonth = toYearMonth(reference);
  const daysInMonth = getDaysInMonth(yearMonth);

  if (compareDateStrings(yearMonth, currentYearMonth) < 0) return 0;
  if (compareDateStrings(yearMonth, currentYearMonth) > 0) return daysInMonth;

  return Math.max(1, daysInMonth - reference.getDate() + 1);
};

/** The `count` month buckets ending with (and including) `yearMonth`. */
export const getTrailingYearMonths = (yearMonth: string, count: number): string[] => {
  const total = Number.isFinite(count) ? Math.max(0, Math.trunc(count)) : 0;
  const months: string[] = [];

  for (let offset = total - 1; offset >= 0; offset--) {
    months.push(shiftYearMonth(yearMonth, -offset));
  }

  return months;
};

/** 0 = Sunday … 6 = Saturday, for a `YYYY-MM-DD` string. */
export const getWeekdayIndex = (dateString: string): number => {
  const date = parseLocalDate(dateString);
  return date ? date.getDay() : 0;
};

/** Day of month (1–31) for a `YYYY-MM-DD` string. */
export const getDayOfMonth = (dateString: string): number => {
  const match = CALENDAR_DAY_PATTERN.exec(dateString);
  return match ? Number(match[3]) : 0;
};

/** Weekday labels ordered so the configured first day of week comes first. */
export const getWeekdayLabels = (firstDayOfWeek: 0 | 1, locale?: string): string[] => {
  const resolvedLocale = locale ?? (typeof navigator !== 'undefined' && navigator.language ? navigator.language : 'en-US');
  const formatter = new Intl.DateTimeFormat(resolvedLocale, { weekday: 'short' });

  // 2024-01-07 is a Sunday, which anchors index 0 to Sunday (noon avoids DST
  // midnight shifts when later advancing the date).
  const sunday = new Date(2024, 0, 7, 12, 0, 0);
  const labels: string[] = [];

  for (let offset = 0; offset < 7; offset++) {
    const day = new Date(sunday);
    day.setDate(sunday.getDate() + offset);
    labels.push(formatter.format(day));
  }

  return firstDayOfWeek === 1 ? [...labels.slice(1), ...labels.slice(0, 1)] : labels;
};

/** `September 2026` for a month bucket. */
export const formatYearMonthLabel = (yearMonth: string, locale?: string): string => {
  const match = MONTH_BUCKET_PATTERN.exec(yearMonth);
  if (!match) return yearMonth;

  const resolvedLocale = locale ?? (typeof navigator !== 'undefined' && navigator.language ? navigator.language : 'en-US');
  return new Intl.DateTimeFormat(resolvedLocale, { month: 'long', year: 'numeric' }).format(
    new Date(Number(match[1]), Number(match[2]) - 1, 1, 12, 0, 0)
  );
};

/** `Sep` for a month bucket, used by compact axis labels. */
export const formatYearMonthShortLabel = (yearMonth: string, locale?: string): string => {
  const match = MONTH_BUCKET_PATTERN.exec(yearMonth);
  if (!match) return yearMonth;

  const resolvedLocale =
    locale ?? (typeof navigator !== 'undefined' && navigator.language ? navigator.language : 'en-US');
  return new Intl.DateTimeFormat(resolvedLocale, { month: 'short' }).format(
    new Date(Number(match[1]), Number(match[2]) - 1, 1, 12, 0, 0)
  );
};

/** `Sep 2026` for a month bucket, used where space is tighter than the full label. */
export const formatYearMonthCompactLabel = (yearMonth: string, locale?: string): string => {
  const match = MONTH_BUCKET_PATTERN.exec(yearMonth);
  if (!match) return yearMonth;

  const resolvedLocale =
    locale ?? (typeof navigator !== 'undefined' && navigator.language ? navigator.language : 'en-US');
  return new Intl.DateTimeFormat(resolvedLocale, { month: 'short', year: 'numeric' }).format(
    new Date(Number(match[1]), Number(match[2]) - 1, 1, 12, 0, 0)
  );
};

/** `12 Sep 2026` for a calendar day. */
export const formatDateLabel = (dateString: string, locale?: string): string => {
  const date = parseLocalDate(dateString);
  if (!date) return dateString;

  const resolvedLocale = locale ?? (typeof navigator !== 'undefined' && navigator.language ? navigator.language : 'en-US');
  return new Intl.DateTimeFormat(resolvedLocale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  }).format(date);
};

/**
 * Sticky ledger header label: `Today`, `Yesterday`, otherwise `Sat, 12 Sep`.
 */
export const formatDayHeaderLabel = (
  dateString: string,
  reference: Date = new Date(),
  locale?: string
): string => {
  const date = parseLocalDate(dateString);
  if (!date) return dateString;

  const today = toLocalDateString(reference);
  const yesterday = shiftDateByDays(today, -1);

  if (dateString === today) return 'Today';
  if (dateString === yesterday) return 'Yesterday';

  const resolvedLocale = locale ?? (typeof navigator !== 'undefined' && navigator.language ? navigator.language : 'en-US');
  return new Intl.DateTimeFormat(resolvedLocale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short'
  }).format(date);
};
