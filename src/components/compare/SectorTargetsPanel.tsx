import { useState, useEffect } from 'react';
import {
  type TopLevelSector,
  type SubSector,
  SECTOR_DISPLAY,
  SUBSECTOR_DISPLAY,
} from '../../config/gics';

// ─── Types ────────────────────────────────────────────────────────────────────

export type { TopLevelSector, SubSector };

export type SectorTargets = Partial<Record<TopLevelSector, number | null>>;
export type SectorActuals = Partial<Record<TopLevelSector, number>>;
export type SubSectorActuals = Partial<Record<SubSector, number>>;

interface Props {
  open: boolean;
  onClose: () => void;
  actuals: SectorActuals;
  subSectorActuals?: SubSectorActuals;
  targets: SectorTargets;
  onSave: (targets: SectorTargets) => void;
}

const ALL_SECTORS: TopLevelSector[] = [
  'information_technology',
  'industrials',
  'energy',
  'communication_services',
  'financials',
  'consumer_discretionary',
  'consumer_staples',
  'health_care',
  'materials',
  'real_estate',
  'utilities',
  'other',
];

function toDisplay(v: number | null | undefined): string {
  return v == null ? '' : String(v);
}

function parseField(s: string): number | null {
  const n = parseInt(s, 10);
  if (isNaN(n) || n < 0 || n > 100) return null;
  return n;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SectorTargetsPanel({
  open,
  onClose,
  actuals,
  subSectorActuals = {},
  targets,
  onSave,
}: Props) {
  const [draft, setDraft] = useState<SectorTargets>(targets);
  const [expanded, setExpanded] = useState<Set<TopLevelSector>>(new Set());

  useEffect(() => {
    setDraft(targets);
  }, [targets, open]);

  if (!open) return null;

  const visibleSectors = ALL_SECTORS.filter(
    s => (actuals[s] ?? 0) > 0.05 || draft[s] != null,
  );

  const sectorsToShow =
    visibleSectors.length >= 5
      ? visibleSectors
      : ALL_SECTORS.slice(0, Math.max(5, visibleSectors.length));

  const total = sectorsToShow.reduce((sum, s) => sum + (draft[s] ?? 0), 0);
  const totalOk = total === 100;

  function getSubSectors(parent: TopLevelSector): SubSector[] {
    return (Object.keys(SUBSECTOR_DISPLAY) as SubSector[]).filter(
      ss => SUBSECTOR_DISPLAY[ss].parent === parent,
    );
  }

  function hasSubSectorData(parent: TopLevelSector): boolean {
    return getSubSectors(parent).some(ss => (subSectorActuals[ss] ?? 0) > 0.05);
  }

  function toggleExpand(sector: TopLevelSector) {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(sector) ? next.delete(sector) : next.add(sector);
      return next;
    });
  }

  function handleChange(key: TopLevelSector, raw: string) {
    setDraft(prev => ({ ...prev, [key]: parseField(raw) }));
  }

  function handleSave() {
    if (!totalOk) return;
    onSave(draft);
    onClose();
  }

  function handleReset() {
    setDraft({});
    setExpanded(new Set());
  }

  function renderDelta(sector: TopLevelSector) {
    const target = draft[sector];
    const actual = actuals[sector] ?? 0;
    if (target == null)
      return (
        <span style={{ color: '#8b93a8', fontFamily: 'Space Mono, monospace', fontSize: 11 }}>
          —
        </span>
      );
    const delta = Math.round(actual - target);
    if (delta === 0)
      return (
        <span style={{ color: '#8b93a8', fontFamily: 'Space Mono, monospace', fontSize: 11 }}>
          0pp
        </span>
      );
    const sign = delta > 0 ? '+' : '';
    return (
      <span style={{ color: delta > 0 ? '#ff4b6e' : '#00e676', fontFamily: 'Space Mono, monospace', fontSize: 11 }}>
        {sign}{delta}pp
      </span>
    );
  }

  const cellStyle = (align: 'left' | 'right' = 'left'): React.CSSProperties => ({
    fontSize: 10,
    color: '#8b93a8',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.07em',
    textAlign: align,
  });

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(0,0,0,0.55)' }}
      />

      {/* Panel */}
      <div
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 50,
          width: 460,
          background: '#0f1117', borderLeft: '1px solid #1e2230',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #1e2230', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 500, color: '#e2e6f0' }}>Set sector targets</div>
            <div style={{ fontSize: 12, color: '#8b93a8', marginTop: 3 }}>
              Define ideal weightings. Must sum to 100%. Tap ▶ to expand sub-sectors.
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8b93a8', fontSize: 20, lineHeight: 1, padding: 4 }} aria-label="Close">×</button>
        </div>

        {/* Column labels — FIX: wider TARGET column */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '24px 1fr 60px 80px 64px',
            gap: 8,
            padding: '10px 24px 6px',
            borderBottom: '1px solid #1e2230',
          }}
        >
          <span />
          <span style={cellStyle()}>Sector</span>
          <span style={cellStyle('right')}>Actual</span>
          <span style={cellStyle('right')}>Target</span>
          <span style={cellStyle('right')}>Delta</span>
        </div>

        {/* Rows */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 24px 8px' }}>
          {sectorsToShow.map(sector => {
            const { label, color } = SECTOR_DISPLAY[sector];
            const actual = actuals[sector] ?? 0;
            const isExp = expanded.has(sector);
            const canExpand = hasSubSectorData(sector);
            const subSectors = getSubSectors(sector).filter(ss => (subSectorActuals[ss] ?? 0) > 0.05);

            return (
              <div key={sector}>
                {/* Parent row — FIX: wider TARGET column matches header */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '24px 1fr 60px 80px 64px',
                    gap: 8,
                    alignItems: 'center',
                    padding: '10px 0',
                    borderBottom: '1px solid #1e2230',
                  }}
                >
                  {/* Expand chevron */}
                  <button
                    onClick={() => canExpand && toggleExpand(sector)}
                    style={{ background: 'none', border: 'none', cursor: canExpand ? 'pointer' : 'default', color: canExpand ? '#8b93a8' : 'transparent', fontSize: 10, padding: 0, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    title={canExpand ? 'Show sub-sectors' : undefined}
                  >
                    {canExpand ? (isExp ? '▼' : '▶') : ''}
                  </button>

                  {/* Sector label */}
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color, fontWeight: 500 }}>
                    <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
                    {label}
                  </span>

                  {/* Actual — FIX: always enough room */}
                  <span style={{ fontSize: 12, fontFamily: 'Space Mono, monospace', color: '#8b93a8', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {actual > 0 ? `${actual.toFixed(1)}%` : '—'}
                  </span>

                  {/* Target input — FIX: wider input so 2-digit numbers + % don't clip */}
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step={1}
                        value={toDisplay(draft[sector])}
                        onChange={e => handleChange(sector, e.target.value)}
                        placeholder="—"
                        style={{
                          width: 52,
                          background: '#161922',
                          border: '1px solid #1e2230',
                          borderRadius: 6,
                          color: '#e2e6f0',
                          fontSize: 12,
                          fontFamily: 'Space Mono, monospace',
                          padding: '4px 6px 4px 8px',
                          textAlign: 'right',
                          outline: 'none',
                          // Hide number input spinners
                          MozAppearance: 'textfield' as any,
                        }}
                      />
                      {/* FIX: % as sibling span outside input so number has full width */}
                      <span style={{ fontSize: 11, color: '#8b93a8', marginLeft: 4, flexShrink: 0 }}>%</span>
                    </div>
                  </div>

                  {/* Delta */}
                  <div style={{ textAlign: 'right' }}>{renderDelta(sector)}</div>
                </div>

                {/* Sub-sector rows */}
                {isExp && subSectors.map(ss => {
                  const ssInfo = SUBSECTOR_DISPLAY[ss];
                  const ssActual = subSectorActuals[ss] ?? 0;
                  return (
                    <div
                      key={ss}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '24px 1fr 60px 80px 64px',
                        gap: 8,
                        alignItems: 'center',
                        padding: '7px 0 7px 8px',
                        borderBottom: '1px solid #1e222866',
                        background: '#161922',
                        marginLeft: -24,
                        marginRight: -24,
                        paddingLeft: 48,
                        paddingRight: 24,
                      }}
                    >
                      <span />
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#8b93a8' }}>
                        <span style={{ display: 'inline-block', width: 5, height: 5, borderRadius: '50%', background: color, opacity: 0.6, flexShrink: 0 }} />
                        {ssInfo.label}
                      </span>
                      <span style={{ fontSize: 11, fontFamily: 'Space Mono, monospace', color: '#6b7190', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {ssActual.toFixed(1)}%
                      </span>
                      <span style={{ fontSize: 11, fontFamily: 'Space Mono, monospace', color: '#6b7190', textAlign: 'right' }}>—</span>
                      <span />
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* Total + actions */}
        <div style={{ padding: '16px 24px 20px', borderTop: '1px solid #1e2230' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <span style={{ fontSize: 12, color: '#8b93a8' }}>Total</span>
            <span style={{ fontSize: 13, fontFamily: 'Space Mono, monospace', fontWeight: 500, color: totalOk ? '#00e676' : total > 0 ? '#ff4b6e' : '#8b93a8' }}>
              {total}%{' '}
              {totalOk ? '✓' : total > 100 ? `— over by ${total - 100}pp` : total > 0 ? `— ${100 - total}pp remaining` : ''}
            </span>
          </div>

          {!totalOk && total > 0 && (
            <div style={{ fontSize: 11, color: '#8b93a8', marginBottom: 12, background: '#161922', borderRadius: 6, padding: '6px 10px' }}>
              Targets must add up to exactly 100% before saving.
            </div>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleReset} style={{ flex: 1, background: 'none', border: '1px solid #1e2230', borderRadius: 8, color: '#8b93a8', fontSize: 12, padding: '8px 0', cursor: 'pointer' }}>Clear targets</button>
            <button onClick={onClose} style={{ flex: 1, background: 'none', border: '1px solid #1e2230', borderRadius: 8, color: '#e2e6f0', fontSize: 12, padding: '8px 0', cursor: 'pointer' }}>Cancel</button>
            <button onClick={handleSave} disabled={!totalOk} style={{ flex: 1, background: totalOk ? '#e2e6f0' : '#1e2230', border: 'none', borderRadius: 8, color: totalOk ? '#08090d' : '#8b93a8', fontSize: 12, fontWeight: 500, padding: '8px 0', cursor: totalOk ? 'pointer' : 'not-allowed', transition: 'background 0.15s' }}>Save targets</button>
          </div>
        </div>
      </div>
    </>
  );
}