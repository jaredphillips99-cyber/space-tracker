/**
 * America/New_York helpers + Yahoo quote → earnings-event mapping.
 *
 * DATA SOURCE (do not invent dates):
 *   yahoo-finance2 `quote()` fields, which wrap Yahoo Finance's public quote
 *   payload — the same vendor already used by `api/prices.ts`:
 *     - earningsTimestamp          last printed report time (Yahoo)
 *     - earningsTimestampStart/End next expected report window (Yahoo)
 *     - isEarningsDateEstimate     Yahoo's own estimated-vs-confirmed flag
 *
 * Yahoo documents these timestamps as possibly inaccurate by ±2 days
 * (yahoo-finance2 quote module remarks). We pass them through as-is.
 * A ticker with no Yahoo date is omitted — we never interpolate a fiscal
 * quarter-end or "typical reporting week".
 *
 * Session chips (BMO/AMC) are derived from the Yahoo timestamp converted to
 * America/New_York. Midnight NY = time not supplied → no chip. Prints at or
 * after 15:00 ET are labeled AMC because Yahoo stores the canonical "after
 * close" stamp as 20:00 UTC year-round (16:00 EDT / 15:00 EST). We do not
 * guess BMO/AMC when Yahoo gave no clock time.
 */

export const NY_TZ = 'America/New_York';

export type SessionChip = 'bmo' | 'amc';

export type EarningsKind = 'last' | 'next';

export interface YahooEarningsFields {
  earningsTimestamp?: Date | string | number | null;
  earningsTimestampStart?: Date | string | number | null;
  earningsTimestampEnd?: Date | string | number | null;
  isEarningsDateEstimate?: boolean | null;
}

export interface EarningsEvent {
  ticker: string;
  /** YYYY-MM-DD in America/New_York — Yahoo's date, never interpolated. */
  date: string;
  /** Set only when Yahoo's start/end window spans two different NY calendar days. */
  dateEnd: string | null;
  session: SessionChip | null;
  estimated: boolean;
  kind: EarningsKind;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

export function asDate(value: unknown): Date | null {
  if (value == null) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === 'number' || typeof value === 'string') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === 'object' && 'raw' in (value as { raw?: unknown })) {
    return asDate((value as { raw: unknown }).raw);
  }
  return null;
}

export function nyDateISO(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: NY_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

export function todayNyISO(now: Date = new Date()): string {
  return nyDateISO(now);
}

function nyParts(d: Date): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: NY_TZ,
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(d);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  return { hour, minute };
}

export function nyMinutesSinceMidnight(d: Date): number {
  const { hour, minute } = nyParts(d);
  return hour * 60 + minute;
}

/**
 * BMO = before 09:30 America/New_York.
 * AMC = 15:00 or later America/New_York (see file header for the 20:00 UTC quirk).
 * Midnight, or a mid-session print before 15:00, → null (do not invent).
 */
export function sessionFromTimestamp(d: Date): SessionChip | null {
  const mins = nyMinutesSinceMidnight(d);
  if (mins === 0) return null;
  if (mins < 9 * 60 + 30) return 'bmo';
  if (mins >= 15 * 60) return 'amc';
  return null;
}

function eventFromInstant(
  ticker: string,
  instant: Date,
  end: Date | null,
  estimated: boolean,
  kind: EarningsKind,
): EarningsEvent {
  const date = nyDateISO(instant);
  const dateEnd = end ? nyDateISO(end) : null;
  return {
    ticker,
    date,
    dateEnd: dateEnd && dateEnd !== date ? dateEnd : null,
    session: sessionFromTimestamp(instant),
    estimated,
    kind,
  };
}

/**
 * Map a Yahoo quote's earnings fields to 0–2 events (last print + next window).
 * Returns [] when Yahoo supplied nothing — caller must not fill the gap.
 */
export function eventsFromYahooQuote(
  ticker: string,
  fields: YahooEarningsFields,
): EarningsEvent[] {
  const last = asDate(fields.earningsTimestamp);
  const start = asDate(fields.earningsTimestampStart);
  const end = asDate(fields.earningsTimestampEnd);
  const estimated = fields.isEarningsDateEstimate === true;

  const events: EarningsEvent[] = [];
  const nextInstant = start ?? end;

  if (nextInstant) {
    events.push(eventFromInstant(ticker, nextInstant, end, estimated, 'next'));
  }

  if (last) {
    const lastDate = nyDateISO(last);
    if (!events.some((e) => e.date === lastDate)) {
      events.push(eventFromInstant(ticker, last, null, false, 'last'));
    }
  }

  return events;
}

export function eventOverlapsRange(
  event: EarningsEvent,
  from: string,
  to: string,
): boolean {
  return event.date >= from && event.date <= to;
}
