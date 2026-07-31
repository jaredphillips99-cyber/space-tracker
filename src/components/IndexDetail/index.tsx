import { useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { SECTOR_COLORS, SECTOR_LABELS } from '../../types';
import type { Sector } from '../../types';
import { TICKER_MAP } from '../../config/tickers';
import { useIndexValues, useIndexHistory, useIndexConstituents } from '../../hooks/useIndexValue';
import type { IndexHistoryRow, IndexConstituentRow } from '../../hooks/useIndexValue';
import {
  INDEX_NAMES,
  INDEX_DISPLAY,
  INDEX_BASE_DATE,
  COMPOSITE_COLOR,
  tickersForIndex,
  type IndexName,
} from '../../lib/indexCalc';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function isIndexName(v: string | undefined): v is IndexName {
  return !!v && (INDEX_NAMES as string[]).includes(v);
}

function accentFor(name: IndexName): string {
  return name === 'composite' ? COMPOSITE_COLOR : (SECTOR_COLORS[name as Sector] ?? COMPOSITE_COLOR);
}

function changeColor(pct: number): string {
  if (pct > 0.0001) return '#00e676';
  if (pct < -0.0001) return '#ff4b6e';
  return 'var(--text-secondary)';
}

function fmtChange(pct: number): string {
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct.toFixed(2)}%`;
}

function fmtPp(pp: number): string {
  const sign = pp > 0 ? '+' : '';
  return `${sign}${pp.toFixed(2)}`;
}

const RANGES: { label: string; days: number }[] = [
  { label: '1M', days: 30 },
  { label: '3M', days: 90 },
  { label: '1Y', days: 365 },
];

// ─── Inline SVG line chart (no charting dependency) ───────────────────────────
function LineChart({ rows, color }: { rows: IndexHistoryRow[]; color: string }) {
  const width = 860;
  const height = 300;
  const padX = 8;
  const padY = 16;
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const { path, area, min, max, first, last, pts, stepX } = useMemo(() => {
    if (rows.length < 2) {
      return {
        path: '', area: '', min: 0, max: 0,
        first: null as IndexHistoryRow | null, last: null as IndexHistoryRow | null,
        pts: [] as (readonly [number, number])[], stepX: 0,
      };
    }
    const vals = rows.map((r) => r.value);
    const lo = Math.min(...vals);
    const hi = Math.max(...vals);
    const span = hi - lo || 1;
    const step = (width - padX * 2) / (rows.length - 1);
    const points = rows.map((r, i) => {
      const x = padX + i * step;
      const y = padY + (height - padY * 2) * (1 - (r.value - lo) / span);
      return [x, y] as const;
    });
    const line = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
    const areaPath =
      `${line} L${points[points.length - 1][0].toFixed(1)},${(height - padY).toFixed(1)}` +
      ` L${points[0][0].toFixed(1)},${(height - padY).toFixed(1)} Z`;
    return {
      path: line, area: areaPath, min: lo, max: hi,
      first: rows[0], last: rows[rows.length - 1],
      pts: points, stepX: step,
    };
  }, [rows]);

  function handleMove(e: React.MouseEvent<SVGSVGElement>) {
    if (!svgRef.current || rows.length < 2) return;
    const rect = svgRef.current.getBoundingClientRect();
    // Map screen X to viewBox X (viewBox width is fixed at `width`, independent of rendered width).
    const relX = ((e.clientX - rect.left) / rect.width) * width;
    const idx = Math.round((relX - padX) / stepX);
    setHoverIdx(Math.max(0, Math.min(rows.length - 1, idx)));
  }

  if (rows.length < 2) {
    return (
      <div
        className="flex items-center justify-center rounded"
        style={{ height, border: '1px solid var(--border)', color: 'var(--text-muted)', fontFamily: 'Space Mono, monospace', fontSize: 12 }}
      >
        Not enough history yet to chart.
      </div>
    );
  }

  const gradId = `idx-grad-${color.replace('#', '')}`;
  const hover = hoverIdx != null ? rows[hoverIdx] : null;
  const hoverPt = hoverIdx != null ? pts[hoverIdx] : null;
  // Flip the tooltip to the left side once the crosshair passes the chart's midpoint,
  // so it never renders clipped off the right edge.
  const tooltipOnLeft = hoverPt != null && hoverPt[0] > width / 2;

  return (
    <div className="rounded overflow-hidden" style={{ border: '1px solid var(--border)', backgroundColor: 'var(--bg-surface)' }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        style={{ display: 'block', cursor: 'crosshair' }}
        preserveAspectRatio="none"
        onMouseMove={handleMove}
        onMouseLeave={() => setHoverIdx(null)}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.22" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#${gradId})`} />
        <path d={path} fill="none" stroke={color} strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />

        {hoverPt && (
          <>
            <line
              x1={hoverPt[0]} y1={padY} x2={hoverPt[0]} y2={height - padY}
              stroke="var(--text-muted)" strokeWidth={1} strokeDasharray="3,3" opacity={0.6}
            />
            <circle cx={hoverPt[0]} cy={hoverPt[1]} r={4} fill={color} stroke="var(--bg-surface)" strokeWidth={1.5} />
            {/* Tooltip box, kept inside the viewBox on both axes. */}
            <g transform={`translate(${tooltipOnLeft ? hoverPt[0] - 132 : hoverPt[0] + 10}, ${Math.max(padY, Math.min(hoverPt[1] - 34, height - padY - 44))})`}>
              <rect width={122} height={40} rx={4} fill="var(--bg-elevated)" stroke="var(--border)" strokeWidth={1} />
              <text x={10} y={16} fill="var(--text-secondary)" fontSize={10} fontFamily="Space Mono, monospace">
                {hover?.date}
              </text>
              <text x={10} y={31} fill="var(--text-primary)" fontSize={13} fontWeight={700} fontFamily="Space Mono, monospace">
                {hover?.value.toFixed(2)}
              </text>
            </g>
          </>
        )}
      </svg>
      <div className="flex items-center justify-between px-3 py-1.5" style={{ borderTop: '1px solid var(--border-muted)' }}>
        <span style={{ fontFamily: 'Space Mono, monospace', fontSize: 10, color: 'var(--text-muted)' }}>
          {first?.date} · low {min.toFixed(2)}
        </span>
        <span style={{ fontFamily: 'Space Mono, monospace', fontSize: 10, color: 'var(--text-muted)' }}>
          high {max.toFixed(2)} · {last?.date}
        </span>
      </div>
    </div>
  );
}

// ─── Constituent contribution table ───────────────────────────────────────────
type SortKey = 'contribution_pct' | 'weight_pct' | 'day_change_pct' | 'ticker';

function ConstituentTable({ rows, indexName }: { rows: IndexConstituentRow[]; indexName: IndexName }) {
  const [sortKey, setSortKey] = useState<SortKey>('contribution_pct');
  const [asc, setAsc] = useState(false);

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => {
      let d: number;
      if (sortKey === 'ticker') d = a.ticker.localeCompare(b.ticker);
      else d = (a[sortKey] as number) - (b[sortKey] as number);
      return asc ? d : -d;
    });
    return copy;
  }, [rows, sortKey, asc]);

  function toggle(key: SortKey) {
    if (key === sortKey) setAsc((v) => !v);
    else { setSortKey(key); setAsc(key === 'ticker'); }
  }

  const Header = ({ label, k, align = 'right' }: { label: string; k: SortKey; align?: 'left' | 'right' }) => (
    <th
      onClick={() => toggle(k)}
      style={{
        fontFamily: 'Space Mono, monospace',
        fontSize: 10,
        letterSpacing: '0.08em',
        color: sortKey === k ? 'var(--text-secondary)' : 'var(--text-muted)',
        textTransform: 'uppercase',
        textAlign: align,
        padding: '8px 12px',
        cursor: 'pointer',
        userSelect: 'none',
        whiteSpace: 'nowrap',
      }}
    >
      {label}{sortKey === k ? (asc ? ' ▲' : ' ▼') : ''}
    </th>
  );

  return (
    <div className="rounded overflow-x-auto" style={{ border: '1px solid var(--border)' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)', backgroundColor: 'var(--bg-surface)' }}>
            <Header label="Ticker" k="ticker" align="left" />
            <Header label="Weight %" k="weight_pct" />
            <Header label="Day %" k="day_change_pct" />
            <Header label="Contribution (pp)" k="contribution_pct" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => {
            const cfg = TICKER_MAP[r.ticker];
            const color = cfg ? (SECTOR_COLORS[cfg.sectors[0]] ?? 'var(--text-primary)') : 'var(--text-primary)';
            return (
              <tr key={r.ticker} style={{ borderBottom: '1px solid var(--border-muted)' }}>
                <td style={{ padding: '7px 12px' }}>
                  <Link
                    to={`/stock/${r.ticker}`}
                    style={{ fontFamily: 'Space Mono, monospace', fontSize: 12, fontWeight: 700, color, textDecoration: 'none' }}
                  >
                    {r.ticker}
                  </Link>
                </td>
                <td style={{ padding: '7px 12px', textAlign: 'right', fontFamily: 'Space Mono, monospace', fontSize: 12, color: 'var(--text-body)' }}>
                  {r.weight_pct.toFixed(2)}%
                </td>
                <td style={{ padding: '7px 12px', textAlign: 'right', fontFamily: 'Space Mono, monospace', fontSize: 12, color: changeColor(r.day_change_pct) }}>
                  {fmtChange(r.day_change_pct)}
                </td>
                <td style={{ padding: '7px 12px', textAlign: 'right', fontFamily: 'Space Mono, monospace', fontSize: 12, fontWeight: 700, color: changeColor(r.contribution_pct) }}>
                  {fmtPp(r.contribution_pct)}
                </td>
              </tr>
            );
          })}
          {sorted.length === 0 && (
            <tr>
              <td colSpan={4} style={{ padding: '24px 12px', textAlign: 'center', fontFamily: 'Space Mono, monospace', fontSize: 12, color: 'var(--text-muted)' }}>
                No stored constituent data yet for {INDEX_DISPLAY[indexName]}. It populates after the first daily index run.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export function IndexDetail() {
  const { indexName } = useParams<{ indexName: string }>();
  const [rangeDays, setRangeDays] = useState(365);

  const valid = isIndexName(indexName);
  const name: IndexName = valid ? indexName : 'composite';
  const accent = accentFor(name);

  const { values } = useIndexValues();
  const live = values[name];
  const { rows: history } = useIndexHistory(name, rangeDays);
  const { rows: constituents, date: asOfDate } = useIndexConstituents(name);

  const memberCount = tickersForIndex(name).length;

  if (!valid) {
    return (
      <div className="h-full overflow-y-auto" style={{ height: 'calc(100vh - 72px)' }}>
        <div className="max-w-5xl mx-auto px-6 py-10">
          <Link to="/" style={{ fontFamily: 'Space Mono, monospace', fontSize: 12, color: 'var(--text-secondary)', textDecoration: 'none' }}>
            ← Back to News
          </Link>
          <p className="mt-6" style={{ fontFamily: 'Space Mono, monospace', color: 'var(--text-muted)' }}>
            Unknown index “{indexName}”.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto" style={{ height: 'calc(100vh - 72px)' }}>
      <div className="max-w-5xl mx-auto px-6 py-6">
        {/* Back nav */}
        <Link
          to="/"
          className="inline-block mb-5"
          style={{ fontFamily: 'Space Mono, monospace', fontSize: 12, color: 'var(--text-secondary)', textDecoration: 'none' }}
        >
          ← Back to News
        </Link>

        {/* Header */}
        <div className="flex items-end justify-between gap-4 mb-1 flex-wrap">
          <div className="flex items-center gap-3">
            <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: accent, display: 'inline-block' }} />
            <h1 style={{ fontFamily: 'Space Mono, monospace', color: 'var(--text-primary)', fontSize: 20, fontWeight: 700, margin: 0 }}>
              {name === 'composite' ? 'AI Index' : `${SECTOR_LABELS[name as Sector]} Index`}
            </h1>
            {name !== 'composite' && (
              <span style={{ fontFamily: 'Space Mono, monospace', fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.08em' }}>
                SUB-INDEX
              </span>
            )}
          </div>
          <div className="flex items-baseline gap-3">
            <span style={{ fontFamily: 'Space Mono, monospace', color: 'var(--text-primary)', fontSize: 30, fontWeight: 700, lineHeight: 1 }}>
              {live ? live.value.toFixed(2) : '—'}
            </span>
            <span style={{ fontFamily: 'Space Mono, monospace', fontSize: 15, fontWeight: 700, color: changeColor(live?.dayChangePct ?? 0) }}>
              {live ? fmtChange(live.dayChangePct) : ''}
            </span>
          </div>
        </div>

        <p className="mb-5" style={{ fontFamily: 'DM Sans, sans-serif', color: 'var(--text-muted)', fontSize: 12 }}>
          Equal-weight, buy-and-hold · base 100 on {INDEX_BASE_DATE} · {memberCount} constituent{memberCount === 1 ? '' : 's'} (primary sector only)
          {live?.isBootstrapped ? ' · live value shown; historical series not yet written' : ''}
        </p>

        {/* Range toggle */}
        <div className="flex items-center gap-1.5 mb-3">
          {RANGES.map((r) => {
            const active = rangeDays === r.days;
            return (
              <button
                key={r.label}
                onClick={() => setRangeDays(r.days)}
                className="px-3 py-1 rounded text-xs transition-all"
                style={{
                  fontFamily: 'Space Mono, monospace',
                  backgroundColor: active ? `${accent}18` : 'transparent',
                  color: active ? accent : 'var(--text-muted)',
                  border: `1px solid ${active ? `${accent}40` : 'var(--border)'}`,
                  cursor: 'pointer',
                }}
              >
                {r.label}
              </button>
            );
          })}
        </div>

        {/* Chart */}
        <LineChart rows={history} color={accent} />

        {/* Constituents */}
        <div className="flex items-center justify-between mt-8 mb-3 flex-wrap gap-2">
          <h2 style={{ fontFamily: 'Space Mono, monospace', fontSize: 13, color: 'var(--text-primary)', margin: 0, letterSpacing: '0.06em' }}>
            CONSTITUENT CONTRIBUTION
          </h2>
          <span style={{ fontFamily: 'Space Mono, monospace', fontSize: 10, color: 'var(--text-muted)' }}>
            {asOfDate ? `as of ${asOfDate}` : 'awaiting first daily run'}
          </span>
        </div>
        <ConstituentTable rows={constituents} indexName={name} />

        {/* Methodology note */}
        <p className="mt-4" style={{ fontFamily: 'DM Sans, sans-serif', color: 'var(--text-dim)', fontSize: 11, lineHeight: 1.6 }}>
          Each constituent is given an equal initial allocation on {INDEX_BASE_DATE} and is never
          rebalanced afterward — a constituent's weight drifts over time based on its own price
          return, so a strong performer will naturally grow its share of the index. A ticker that
          joined the tracked universe after {INDEX_BASE_DATE} enters the index on its own first
          available trading day, sized so the index value does not jump at the moment of entry.
        </p>
      </div>
    </div>
  );
}
