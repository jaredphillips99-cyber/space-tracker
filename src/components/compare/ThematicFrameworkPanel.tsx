import { useState, useEffect } from 'react';
import {
  THEME_ORDER,
  THEME_DISPLAY,
  THEME_COLORS,
  SUBTHEME_DISPLAY,
  getSubThemes,
  type Theme,
  type SubTheme,
} from '../../config/themes';
import { SECTOR_DISPLAY, type TopLevelSector } from '../../config/gics';
import { NON_THEME_SECTORS } from './PortfolioTab';
import type { ThemePreferences, ThemeStance, SectorConviction } from './PortfolioTab';

// ─── Thematic Framework Panel ────────────────────────────────────────────────
// Slide-in panel (same shell/width/save-cancel pattern as SectorTargetsPanel)
// for setting directional conviction on each of the four macro themes.
//
// Unlike SectorTargetsPanel this takes NO numeric target — conviction is a
// three-state lean (lean in / neutral / avoid), not a percentage. The numeric
// side lives in SectorTargetsPanel at the GICS level; do not duplicate it here.
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onClose: () => void;
  themeActuals: Record<string, number>;     // theme → actual % of portfolio
  subThemeActuals: Record<string, number>;  // subTheme → actual % of portfolio
  sectorActuals: Record<string, number>;    // GICS sector → actual % of portfolio
  value: ThemePreferences;
  sectorValue: SectorConviction;
  onSave: (prefs: ThemePreferences, sectors: SectorConviction) => void;
}

const STANCES: { key: ThemeStance; label: string }[] = [
  { key: 'lean_in', label: 'Lean in' },
  { key: 'neutral', label: 'Neutral' },
  { key: 'avoid',   label: 'Avoid' },
];

// Active-stance color: lean-in adopts the theme color, avoid is red (it's a hard
// block downstream), neutral is muted. Inactive buttons stay quiet.
function stanceColor(stance: ThemeStance, themeColor: string): string {
  if (stance === 'lean_in') return themeColor;
  if (stance === 'avoid')   return '#ff4b6e';
  return 'var(--text-secondary)';
}

export default function ThematicFrameworkPanel({
  open,
  onClose,
  themeActuals,
  subThemeActuals,
  sectorActuals,
  value,
  sectorValue,
  onSave,
}: Props) {
  const [draft, setDraft] = useState<ThemePreferences>(value);
  const [sectorDraft, setSectorDraft] = useState<SectorConviction>(sectorValue);
  const [expanded, setExpanded] = useState<Set<Theme>>(new Set());

  useEffect(() => {
    setDraft(value);
    setSectorDraft(sectorValue);
  }, [value, sectorValue, open]);

  if (!open) return null;

  const maxActual = Math.max(...THEME_ORDER.map(t => themeActuals[t] ?? 0), 1);
  const maxSectorActual = Math.max(...NON_THEME_SECTORS.map(s => sectorActuals[s] ?? 0), 1);

  function setStance(theme: Theme, stance: ThemeStance) {
    setDraft(prev => ({ ...prev, [theme]: stance }));
  }

  function setSectorStance(sector: TopLevelSector, stance: ThemeStance) {
    setSectorDraft(prev => ({ ...prev, [sector]: stance }));
  }

  function toggleExpand(theme: Theme) {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(theme) ? next.delete(theme) : next.add(theme);
      return next;
    });
  }

  function handleSave() {
    onSave(draft, sectorDraft);
    onClose();
  }

  function handleReset() {
    setDraft({
      space_economy: 'neutral',
      ai_infrastructure: 'neutral',
      defense: 'neutral',
      clean_energy_nuclear: 'neutral',
    });
    setSectorDraft(
      NON_THEME_SECTORS.reduce((acc, s) => { acc[s] = 'neutral'; return acc; }, {} as SectorConviction),
    );
    setExpanded(new Set());
  }

  function hasSubThemeData(theme: Theme): boolean {
    return getSubThemes(theme).some(st => (subThemeActuals[st] ?? 0) > 0.05);
  }

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
          background: 'var(--bg-surface)', borderLeft: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--text-primary)' }}>Theme conviction</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 3 }}>
              Directional lean on each macro theme. Shapes what AI recommends — Lean in gets prioritized, Avoid is never recommended.
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 20, lineHeight: 1, padding: 4 }} aria-label="Close">×</button>
        </div>

        {/* Cards */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 20px 8px' }}>
          {THEME_ORDER.map(theme => {
            const color = THEME_COLORS[theme];
            const actual = themeActuals[theme] ?? 0;
            const stance = draft[theme];
            const isExp = expanded.has(theme);
            const canExpand = hasSubThemeData(theme);
            const subThemes = getSubThemes(theme).filter(st => (subThemeActuals[st] ?? 0) > 0.05);

            return (
              <div
                key={theme}
                style={{
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border)',
                  borderLeftWidth: 3,
                  borderLeftColor: color,
                  borderRadius: 8,
                  padding: '12px 14px',
                  marginBottom: 12,
                }}
              >
                {/* Theme name + actual weight */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <button
                      onClick={() => canExpand && toggleExpand(theme)}
                      style={{ background: 'none', border: 'none', cursor: canExpand ? 'pointer' : 'default', color: canExpand ? 'var(--text-secondary)' : 'transparent', fontSize: 10, padding: 0, lineHeight: 1 }}
                      title={canExpand ? 'Show sub-themes' : undefined}
                    >
                      {canExpand ? (isExp ? '▼' : '▶') : '•'}
                    </button>
                    <span style={{ fontSize: 13, fontWeight: 500, color }}>{THEME_DISPLAY[theme]}</span>
                  </span>
                  <span style={{ fontSize: 12, fontFamily: 'Space Mono, monospace', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                    {actual > 0.05 ? `${actual.toFixed(1)}%` : '—'}
                  </span>
                </div>

                {/* Weight bar (actual share of portfolio, scaled to the largest theme) */}
                <div style={{ height: 6, background: 'var(--bg-inset)', borderRadius: 3, overflow: 'hidden', margin: '10px 0 12px' }}>
                  <div style={{ height: '100%', width: `${Math.min(100, (actual / maxActual) * 100)}%`, background: color, borderRadius: 3, transition: 'width 0.2s' }} />
                </div>

                {/* Segmented stance control */}
                <div style={{ display: 'flex', gap: 6 }}>
                  {STANCES.map(s => {
                    const active = stance === s.key;
                    const ac = stanceColor(s.key, color);
                    return (
                      <button
                        key={s.key}
                        onClick={() => setStance(theme, s.key)}
                        style={{
                          flex: 1,
                          padding: '6px 0',
                          borderRadius: 6,
                          fontSize: 11,
                          fontFamily: 'Space Mono, monospace',
                          letterSpacing: '0.03em',
                          cursor: 'pointer',
                          transition: 'all 0.12s',
                          border: active ? `1px solid ${ac}` : '1px solid var(--border)',
                          background: active ? `${ac}22` : 'transparent',
                          color: active ? ac : 'var(--text-secondary)',
                          fontWeight: active ? 600 : 400,
                        }}
                      >
                        {s.label}
                      </button>
                    );
                  })}
                </div>

                {/* Sub-theme breakdown */}
                {isExp && subThemes.length > 0 && (
                  <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border-faint)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {subThemes.map(st => {
                      const ssActual = subThemeActuals[st] ?? 0;
                      return (
                        <div key={st} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-secondary)' }}>
                            <span style={{ display: 'inline-block', width: 5, height: 5, borderRadius: '50%', background: color, opacity: 0.6, flexShrink: 0 }} />
                            {SUBTHEME_DISPLAY[st as SubTheme].label}
                          </span>
                          <span style={{ fontSize: 11, fontFamily: 'Space Mono, monospace', color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>
                            {ssActual.toFixed(1)}%
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {/* ── Other GICS sectors (outside the four themes) ── */}
          <div style={{ margin: '4px 2px 10px', paddingTop: 8, borderTop: '1px solid var(--border)' }}>
            <div style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
              Other GICS sectors
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 3, lineHeight: 1.4 }}>
              Conviction on sectors outside the four themes — a Lean in here makes that sector a
              first-class diversification candidate for cash deployment.
            </div>
          </div>

          {NON_THEME_SECTORS.map(sector => {
            const info = SECTOR_DISPLAY[sector];
            const color = info.color;
            const actual = sectorActuals[sector] ?? 0;
            const stance = sectorDraft[sector] ?? 'neutral';

            return (
              <div
                key={sector}
                style={{
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border)',
                  borderLeftWidth: 3,
                  borderLeftColor: color,
                  borderRadius: 8,
                  padding: '10px 14px',
                  marginBottom: 10,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
                    <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{info.label}</span>
                  </span>
                  <span style={{ fontSize: 12, fontFamily: 'Space Mono, monospace', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                    {actual > 0.05 ? `${actual.toFixed(1)}%` : '—'}
                  </span>
                </div>

                <div style={{ height: 5, background: 'var(--bg-inset)', borderRadius: 3, overflow: 'hidden', margin: '8px 0 10px' }}>
                  <div style={{ height: '100%', width: `${Math.min(100, (actual / maxSectorActual) * 100)}%`, background: color, borderRadius: 3, transition: 'width 0.2s' }} />
                </div>

                <div style={{ display: 'flex', gap: 6 }}>
                  {STANCES.map(s => {
                    const active = stance === s.key;
                    const ac = stanceColor(s.key, color);
                    return (
                      <button
                        key={s.key}
                        onClick={() => setSectorStance(sector, s.key)}
                        style={{
                          flex: 1,
                          padding: '5px 0',
                          borderRadius: 6,
                          fontSize: 11,
                          fontFamily: 'Space Mono, monospace',
                          letterSpacing: '0.03em',
                          cursor: 'pointer',
                          transition: 'all 0.12s',
                          border: active ? `1px solid ${ac}` : '1px solid var(--border)',
                          background: active ? `${ac}22` : 'transparent',
                          color: active ? ac : 'var(--text-secondary)',
                          fontWeight: active ? 600 : 400,
                        }}
                      >
                        {s.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}

          <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5, padding: '4px 2px 8px' }}>
            Conviction is directional, not a percentage target — set numeric sector weights under “Edit targets.”
          </div>
        </div>

        {/* Actions */}
        <div style={{ padding: '16px 24px 20px', borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleReset} style={{ flex: 1, background: 'none', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-secondary)', fontSize: 12, padding: '8px 0', cursor: 'pointer' }}>Reset to neutral</button>
            <button onClick={onClose} style={{ flex: 1, background: 'none', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 12, padding: '8px 0', cursor: 'pointer' }}>Cancel</button>
            <button onClick={handleSave} style={{ flex: 1, background: 'var(--text-primary)', border: 'none', borderRadius: 8, color: 'var(--bg-surface)', fontSize: 12, fontWeight: 500, padding: '8px 0', cursor: 'pointer' }}>Save conviction</button>
          </div>
        </div>
      </div>
    </>
  );
}
