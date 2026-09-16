/**
 * Pure calendar-grid helpers for the News earnings view.
 * All civil dates are YYYY-MM-DD interpreted in America/New_York
 * (noon-UTC anchoring so the weekday matches the NY calendar date).
 */

export interface CalendarDay {
  iso: string;
  inMonth: boolean;
  isToday: boolean;
  isWeekend: boolean;
  weekday: number; // 0 = Sunday
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

export function todayNyISO(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function nyWeekday(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  const utcNoon = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const short = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
  }).format(utcNoon);
  return WEEKDAYS.indexOf(short as (typeof WEEKDAYS)[number]);
}

export function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

export function monthStartIso(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

export function monthEndIso(iso: string): string {
  const [y, m] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m, 0));
  return dt.toISOString().slice(0, 10);
}

/** First of the month `delta` months from `iso`'s month. */
export function addMonthsIso(iso: string, delta: number): string {
  const [y, m] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + delta, 1));
  return dt.toISOString().slice(0, 10);
}

export function weekStartSunday(iso: string): string {
  return addDaysIso(iso, -nyWeekday(iso));
}

export function buildMonthGrid(monthStart: string, todayIso: string): CalendarDay[] {
  const start = monthStartIso(monthStart);
  const end = monthEndIso(start);
  const leading = nyWeekday(start);
  const first = addDaysIso(start, -leading);
  const days: CalendarDay[] = [];
  // 6 weeks covers every Gregorian month
  for (let i = 0; i < 42; i++) {
    const iso = addDaysIso(first, i);
    const weekday = nyWeekday(iso);
    days.push({
      iso,
      inMonth: iso >= start && iso <= end,
      isToday: iso === todayIso,
      isWeekend: weekday === 0 || weekday === 6,
      weekday,
    });
  }
  return days;
}

export function buildWeekDays(weekStart: string, todayIso: string): CalendarDay[] {
  const start = weekStartSunday(weekStart);
  const monthOf = monthStartIso(todayIso);
  return Array.from({ length: 7 }, (_, i) => {
    const iso = addDaysIso(start, i);
    const weekday = nyWeekday(iso);
    return {
      iso,
      inMonth: monthStartIso(iso) === monthOf,
      isToday: iso === todayIso,
      isWeekend: weekday === 0 || weekday === 6,
      weekday,
    };
  });
}

export function formatMonthLabel(monthStart: string): string {
  const [y, m] = monthStart.split('-').map(Number);
  const utcNoon = new Date(Date.UTC(y, m - 1, 1, 12, 0, 0));
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    month: 'long',
    year: 'numeric',
  }).format(utcNoon);
}

export function formatDayHeading(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const utcNoon = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(utcNoon);
}

export const WEEKDAY_LABELS = WEEKDAYS;
