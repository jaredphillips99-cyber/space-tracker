import { useNavigate } from 'react-router-dom';
import { SECTOR_COLORS } from '../../types';
import type { Sector } from '../../types';
import { useIndexValues, useIndexHistory } from '../../hooks/useIndexValue';
import type { LiveIndexValue } from '../../hooks/useIndexValue';
import {
  SUB_INDEX_NAMES,
  INDEX_DISPLAY,
  COMPOSITE_COLOR,
  type IndexName,
} from '../../lib/indexCalc';

// ─── Inline SVG sparkline (no charting dependency) ────────────────────────────
function Sparkline({ values, color, width = 96, height = 28 }: {
  values: number[];
  color: string;
  width?: number;
  height?: number;
}) {
  if (values.length < 2) {
    return <div style={{ width, height }} aria-hidden />;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const stepX = width / (values.length - 1);
  const points = values.map((v, i) => {
    const x = i * stepX;
    const y = height - ((v - min) / span) * height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return (
    <svg width={width} height={height} style={{ display: 'block', overflow: 'visible' }}>
      <polyline
        points={points.join(' ')}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
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

// ─── Composite hero + sub-index pills ─────────────────────────────────────────
function CompositeCard({ composite, loading }: { composite: LiveIndexValue | undefined; loading: boolean }) {
  const navigate = useNavigate();
  const { rows } = useIndexHistory('composite', 30);
  const spark = rows.map((r) => r.value);

  return (
    <button
      onClick={() => navigate('/index/composite')}
      className="flex items-center gap-4 rounded transition-colors text-left w-full"
      style={{
        backgroundColor: 'var(--bg-surface)',
        border: `1px solid ${COMPOSITE_COLOR}33`,
        padding: '12px 16px',
        cursor: 'pointer',
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--bg-elevated)'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--bg-surface)'; }}
      title="Open the AI Index"
    >
      <div className="flex flex-col">
        <span
          className="text-xs tracking-widest"
          style={{ fontFamily: 'Space Mono, monospace', color: COMPOSITE_COLOR, fontSize: 10, letterSpacing: '0.14em' }}
        >
          AI INDEX
        </span>
        <div className="flex items-baseline gap-2 mt-0.5">
          <span
            style={{ fontFamily: 'Space Mono, monospace', color: 'var(--text-primary)', fontSize: 22, fontWeight: 700, lineHeight: 1 }}
          >
            {loading && !composite ? '—' : (composite?.value ?? 0).toFixed(2)}
          </span>
          <span
            style={{ fontFamily: 'Space Mono, monospace', fontSize: 12, fontWeight: 700, color: changeColor(composite?.dayChangePct ?? 0) }}
          >
            {composite ? fmtChange(composite.dayChangePct) : ''}
          </span>
        </div>
      </div>

      <div className="ml-auto flex items-center gap-3">
        <Sparkline values={spark} color={changeColor(composite?.dayChangePct ?? 0)} />
        <span
          className="text-xs"
          style={{ fontFamily: 'Space Mono, monospace', color: 'var(--text-muted)', fontSize: 16 }}
          aria-hidden
        >
          ›
        </span>
      </div>
    </button>
  );
}

function SubIndexPill({ name, value }: { name: IndexName; value: LiveIndexValue | undefined }) {
  const navigate = useNavigate();
  const color = SECTOR_COLORS[name as Sector] ?? 'var(--text-secondary)';

  return (
    <button
      onClick={() => navigate(`/index/${name}`)}
      className="flex flex-col items-start rounded transition-colors"
      style={{
        backgroundColor: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        padding: '7px 10px',
        cursor: 'pointer',
        minWidth: 0,
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--bg-elevated)'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--bg-surface)'; }}
      title={`Open the ${INDEX_DISPLAY[name]} sub-index`}
    >
      <span
        className="truncate"
        style={{ fontFamily: 'Space Mono, monospace', color, fontSize: 9.5, letterSpacing: '0.1em', textTransform: 'uppercase', maxWidth: '100%' }}
      >
        {INDEX_DISPLAY[name]}
      </span>
      <div className="flex items-baseline gap-1.5 mt-0.5">
        <span style={{ fontFamily: 'Space Mono, monospace', color: 'var(--text-primary)', fontSize: 13, fontWeight: 700 }}>
          {value ? value.value.toFixed(2) : '—'}
        </span>
        <span style={{ fontFamily: 'Space Mono, monospace', fontSize: 10, fontWeight: 700, color: changeColor(value?.dayChangePct ?? 0) }}>
          {value ? fmtChange(value.dayChangePct) : ''}
        </span>
      </div>
    </button>
  );
}

/**
 * Compact AI Index header widget for the News tab. Shows the composite value,
 * day %, and a 30-day sparkline, plus one pill per sub-index. All values are
 * computed live in-browser from store prices — no extra fetches, zero API cost.
 */
export function IndexTicker() {
  const { values, loading } = useIndexValues();

  return (
    <div className="mb-6">
      <CompositeCard composite={values.composite} loading={loading} />
      <div
        className="grid gap-2 mt-2"
        style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))' }}
      >
        {SUB_INDEX_NAMES.map((name) => (
          <SubIndexPill key={name} name={name} value={values[name]} />
        ))}
      </div>
    </div>
  );
}
