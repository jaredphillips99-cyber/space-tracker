import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { TICKER_MAP } from '../../config/tickers';
import { TICKER_THEME_MAP, THEME_DISPLAY, THEME_COLORS, THEME_ORDER } from '../../config/themes';
import type { Theme } from '../../config/themes';
import { SECTOR_COLORS } from '../../types';
import { useEarningsCalendar } from '../../hooks/useEarningsCalendar';
import type { EarningsCalendarEvent, SessionChip } from '../../hooks/useEarningsCalendar';
import {
  addMonthsIso,
  addDaysIso,
  buildMonthGrid,
  buildWeekDays,
  formatDayHeading,
  formatMonthLabel,
  monthStartIso,
  todayNyISO,
  weekStartSunday,
  WEEKDAY_LABELS,
  type CalendarDay,
} from '../../lib/earningsCalendar';
import { NewsSectionNav } from '../NewsSectionNav';

type ViewMode = 'week' | 'month';

function sessionRank(session: SessionChip | null): number {
  if (session === 'bmo') return 0;
  if (session === 'amc') return 1;
  return 2;
}

function tickerColor(ticker: string): string {
  const cfg = TICKER_MAP[ticker];
  if (cfg) return SECTOR_COLORS[cfg.sectors[0]] ?? 'var(--text-primary)';
  return 'var(--text-primary)';
}

function eventTitle(event: EarningsCalendarEvent): string {
  const name = TICKER_MAP[event.ticker]?.name ?? event.ticker;
  const bits = [name];
  if (event.session === 'bmo') bits.push('BMO');
  if (event.session === 'amc') bits.push('AMC');
  bits.push(event.estimated ? 'estimated (Yahoo)' : 'confirmed (Yahoo)');
  if (event.dateEnd) bits.push(`window ${event.date}–${event.dateEnd}`);
  return bits.join(' · ');
}

function TickerChip({ event, muted }: { event: EarningsCalendarEvent; muted?: boolean }) {
  const navigate = useNavigate();
  const color = tickerColor(event.ticker);
  return (
    <button
      type="button"
      onClick={() => navigate(`/stock/${event.ticker}`)}
      title={eventTitle(event)}
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded transition-opacity"
      style={{
        fontFamily: 'Space Mono, monospace',
        fontSize: 10,
        color,
        backgroundColor: `${color}14`,
        border: event.estimated ? `1px dashed ${color}66` : '1px solid transparent',
        cursor: 'pointer',
        opacity: muted ? 0.65 : 1,
      }}
    >
      <span className="font-bold">{event.ticker}</span>
      {event.session && (
        <span style={{ color: 'var(--text-secondary)', fontSize: 8, letterSpacing: '0.06em' }}>
          {event.session.toUpperCase()}
        </span>
      )}
      {event.estimated && (
        <span style={{ color: 'var(--text-muted)', fontSize: 8, letterSpacing: '0.06em' }}>
          EST
        </span>
      )}
    </button>
  );
}

function DayCell({
  day,
  events,
  compact,
}: {
  day: CalendarDay;
  events: EarningsCalendarEvent[];
  compact?: boolean;
}) {
  const todayIso = todayNyISO();
  const muted = day.iso < todayIso;
  return (
    <div
      className="flex flex-col min-h-0 rounded"
      style={{
        backgroundColor: day.isToday ? 'var(--bg-elevated)' : 'var(--bg-surface)',
        border: day.isToday ? '1px solid #00c8ff55' : '1px solid var(--border-muted)',
        opacity: day.inMonth ? 1 : 0.45,
        padding: compact ? '8px 10px' : '8px',
        minHeight: compact ? 88 : 108,
      }}
    >
      <div className="flex items-baseline justify-between mb-1.5">
        <span
          style={{
            fontFamily: 'Space Mono, monospace',
            fontSize: compact ? 11 : 10,
            color: day.isToday ? '#00c8ff' : 'var(--text-secondary)',
          }}
        >
          {compact ? formatDayHeading(day.iso) : day.iso.slice(8)}
        </span>
        {events.length > 0 && (
          <span style={{ fontFamily: 'Space Mono, monospace', fontSize: 9, color: 'var(--text-muted)' }}>
            {events.length}
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-1">
        {events.length === 0 ? (
          <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 11, color: 'var(--text-dim)' }}>
            —
          </span>
        ) : (
          events.map((event) => (
            <TickerChip key={`${event.ticker}-${event.kind}`} event={event} muted={muted} />
          ))
        )}
      </div>
    </div>
  );
}

function groupEvents(
  events: EarningsCalendarEvent[],
  themeFilter: Theme | null,
): Map<string, EarningsCalendarEvent[]> {
  const map = new Map<string, EarningsCalendarEvent[]>();
  for (const event of events) {
    if (themeFilter) {
      const mapped = TICKER_THEME_MAP[event.ticker];
      if (!mapped || mapped.theme !== themeFilter) continue;
    }
    const list = map.get(event.date) ?? [];
    list.push(event);
    map.set(event.date, list);
  }
  for (const list of map.values()) {
    list.sort((a, b) => sessionRank(a.session) - sessionRank(b.session) || a.ticker.localeCompare(b.ticker));
  }
  return map;
}

export function EarningsCalendar() {
  const today = todayNyISO();
  const [view, setView] = useState<ViewMode>('week');
  const [cursor, setCursor] = useState(today);
  const [themeFilter, setThemeFilter] = useState<Theme | null>(null);

  const from = view === 'month'
    ? buildMonthGrid(monthStartIso(cursor), today)[0].iso
    : weekStartSunday(cursor);
  const to = view === 'month'
    ? addDaysIso(from, 41)
    : addDaysIso(weekStartSunday(cursor), 6);

  const { events, loading, error, data } = useEarningsCalendar(from, to);
  const byDate = useMemo(() => groupEvents(events, themeFilter), [events, themeFilter]);

  const days = view === 'month'
    ? buildMonthGrid(monthStartIso(cursor), today)
    : buildWeekDays(cursor, today);

  const heading = view === 'month'
    ? formatMonthLabel(monthStartIso(cursor))
    : `${formatDayHeading(from)} – ${formatDayHeading(to)}`;

  function goToday() {
    setCursor(today);
  }
  function goPrev() {
    setCursor(view === 'month' ? addMonthsIso(cursor, -1) : addDaysIso(weekStartSunday(cursor), -7));
  }
  function goNext() {
    setCursor(view === 'month' ? addMonthsIso(cursor, 1) : addDaysIso(weekStartSunday(cursor), 7));
  }

  return (
    <div className="h-full overflow-y-auto" style={{ height: 'calc(100vh - 88px)' }}>
      <div className="max-w-5xl mx-auto px-6 py-6">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1
              className="text-lg font-bold"
              style={{ fontFamily: 'Space Mono, monospace', color: 'var(--text-primary)', margin: 0 }}
            >
              News
            </h1>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)', fontFamily: 'DM Sans, sans-serif' }}>
              Tracked-universe earnings · America/New_York
            </p>
          </div>
          <NewsSectionNav />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <button type="button" onClick={goPrev} style={navBtnStyle} aria-label="Previous">‹</button>
            <div
              style={{
                fontFamily: 'Space Mono, monospace',
                color: 'var(--text-primary)',
                fontSize: 13,
                minWidth: 220,
              }}
            >
              {heading}
            </div>
            <button type="button" onClick={goNext} style={navBtnStyle} aria-label="Next">›</button>
            <button type="button" onClick={goToday} style={{ ...navBtnStyle, padding: '4px 10px', fontSize: 10 }}>
              TODAY
            </button>
          </div>

          <div className="flex items-center gap-1" role="group" aria-label="Calendar view">
            {(['week', 'month'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setView(mode)}
                className="px-3 py-1 rounded text-xs"
                style={{
                  fontFamily: 'Space Mono, monospace',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  backgroundColor: view === mode ? 'var(--bg-elevated)' : 'transparent',
                  color: view === mode ? 'var(--text-primary)' : 'var(--text-muted)',
                  border: `1px solid ${view === mode ? 'var(--border)' : 'transparent'}`,
                  cursor: 'pointer',
                }}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 mb-4">
          <button
            type="button"
            onClick={() => setThemeFilter(null)}
            className="px-3 py-1 rounded text-xs transition-all"
            style={{
              fontFamily: 'Space Mono, monospace',
              backgroundColor: themeFilter === null ? 'var(--bg-elevated)' : 'transparent',
              color: themeFilter === null ? 'var(--text-primary)' : 'var(--text-muted)',
              border: `1px solid ${themeFilter === null ? 'var(--border)' : 'transparent'}`,
              cursor: 'pointer',
            }}
          >
            ALL
          </button>
          {THEME_ORDER.map((theme) => (
            <FilterPill
              key={theme}
              label={THEME_DISPLAY[theme]}
              active={themeFilter === theme}
              color={THEME_COLORS[theme]}
              onClick={() => setThemeFilter(themeFilter === theme ? null : theme)}
            />
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3 mb-4" style={{ fontFamily: 'Space Mono, monospace', fontSize: 9, color: 'var(--text-muted)', letterSpacing: '0.06em' }}>
          <span>BMO before open</span>
          <span>AMC after close</span>
          <span style={{ border: '1px dashed var(--border-strong)', padding: '1px 6px', borderRadius: 4 }}>EST = Yahoo estimate</span>
        </div>

        {error && (
          <div
            className="mb-4 px-3 py-2 rounded text-xs"
            style={{ fontFamily: 'Space Mono, monospace', backgroundColor: '#ff4b6e18', color: '#ff4b6e' }}
          >
            Couldn&apos;t load calendar — {error}
          </div>
        )}

        {loading && events.length === 0 ? (
          <div className="px-3 py-8 text-center text-xs" style={{ color: 'var(--text-dim)', fontFamily: 'Space Mono, monospace' }}>
            Loading earnings…
          </div>
        ) : view === 'month' ? (
          <div>
            <div
              className="grid mb-1"
              style={{ gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 6 }}
            >
              {WEEKDAY_LABELS.map((label) => (
                <div
                  key={label}
                  className="text-center"
                  style={{ fontFamily: 'Space Mono, monospace', fontSize: 9, color: 'var(--text-muted)', letterSpacing: '0.1em' }}
                >
                  {label.toUpperCase()}
                </div>
              ))}
            </div>
            <div className="grid" style={{ gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 6 }}>
              {days.map((day) => (
                <DayCell key={day.iso} day={day} events={byDate.get(day.iso) ?? []} />
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {days.map((day) => (
              <DayCell key={day.iso} day={day} events={byDate.get(day.iso) ?? []} compact />
            ))}
          </div>
        )}

        <p
          className="mt-6 text-xs"
          style={{ fontFamily: 'DM Sans, sans-serif', color: 'var(--text-muted)', lineHeight: 1.6, maxWidth: 640 }}
        >
          Dates come from Yahoo Finance quote fields (earningsTimestamp / Start / End).
          Confirmed vs estimated is Yahoo&apos;s <span style={{ fontFamily: 'Space Mono, monospace' }}>isEarningsDateEstimate</span> flag.
          BMO/AMC chips appear only when Yahoo supplied a clock time.
          {data?.fetchedAt ? ` Cached as of ${new Date(data.fetchedAt).toLocaleString('en-US', { timeZone: 'America/New_York' })} ET.` : ''}
        </p>
      </div>
    </div>
  );
}

function FilterPill({
  label,
  active,
  color,
  onClick,
}: {
  label: string;
  active: boolean;
  color: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="px-3 py-1 rounded text-xs transition-all"
      style={{
        fontFamily: 'Space Mono, monospace',
        backgroundColor: active ? `${color}18` : 'transparent',
        color: active ? color : 'var(--text-muted)',
        border: `1px solid ${active ? `${color}40` : 'transparent'}`,
        cursor: 'pointer',
      }}
    >
      {label.toUpperCase()}
    </button>
  );
}

const navBtnStyle: CSSProperties = {
  fontFamily: 'Space Mono, monospace',
  fontSize: 14,
  color: 'var(--text-secondary)',
  background: 'var(--bg-surface)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  width: 28,
  height: 28,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
};

export function ThisWeekEarnings() {
  const today = todayNyISO();
  const from = weekStartSunday(today);
  const to = addDaysIso(from, 6);
  const { events, loading, error } = useEarningsCalendar(from, to);
  const byDate = useMemo(() => groupEvents(events, null), [events]);

  const daysWithReports = useMemo(() => {
    const out: { iso: string; events: EarningsCalendarEvent[] }[] = [];
    for (let i = 0; i < 7; i++) {
      const iso = addDaysIso(from, i);
      const list = byDate.get(iso) ?? [];
      if (list.length > 0) out.push({ iso, events: list });
    }
    return out;
  }, [from, byDate]);

  if (loading && events.length === 0) return null;
  if (error) return null;

  return (
    <section className="mb-8">
      <div className="flex items-center justify-between mb-3">
        <div
          className="text-xs tracking-widest"
          style={{
            fontFamily: 'Space Mono, monospace',
            color: 'var(--text-muted)',
            fontSize: 11,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
          }}
        >
          Earnings this week
        </div>
        <Link
          to="/calendar"
          className="text-xs no-underline"
          style={{ fontFamily: 'Space Mono, monospace', color: '#00c8ff', fontSize: 11 }}
        >
          Full calendar →
        </Link>
      </div>
      {daysWithReports.length === 0 ? (
        <p style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
          No tracked names on Yahoo&apos;s calendar this week.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {daysWithReports.map(({ iso, events: dayEvents }) => (
            <div
              key={iso}
              className="flex items-start gap-3 px-3 py-2 rounded"
              style={{ backgroundColor: 'var(--bg-surface)', border: iso === today ? '1px solid #00c8ff55' : '1px solid var(--border-muted)' }}
            >
              <div
                className="shrink-0"
                style={{ fontFamily: 'Space Mono, monospace', fontSize: 11, color: iso === today ? '#00c8ff' : 'var(--text-secondary)', width: 92, paddingTop: 2 }}
              >
                {iso === today ? 'Today' : formatDayHeading(iso)}
              </div>
              <div className="flex flex-wrap gap-1">
                {dayEvents.map((event) => (
                  <TickerChip key={`${event.ticker}-${event.kind}`} event={event} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
