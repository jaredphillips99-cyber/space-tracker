import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../../store/useStore';
import { TICKERS } from '../../config/tickers';
import {
  computeImpliedUpside,
  isAnalysisStale,
  SECTOR_COLORS,
  recommendationMeanToLabel,
  YAHOO_RATING_COLORS,
  type SortField,
} from '../../types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number, decimals = 2) {
  return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function fmtPrice(n: number) {
  return n >= 1 ? `$${fmt(n, 2)}` : `$${fmt(n, 4)}`;
}

function fmtPct(n: number) {
  const sign = n >= 0 ? '+' : '';
  return `${sign}${fmt(n, 2)}%`;
}

function fmtMktCap(n?: number) {
  if (!n) return '—';
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9)  return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6)  return `$${(n / 1e6).toFixed(0)}M`;
  return `$${n.toLocaleString()}`;
}

// Abbreviated sector labels for compact pills
const SECTOR_ABBR: Record<string, string> = {
  space:             'SPACE',
  ai_infrastructure: 'AI',
  defense:           'DEF',
  clean_energy:      'ENERGY',
  lng_export:        'LNG',
};

// ─── Sort header button ────────────────────────────────────────────────────────

function SortTh({
  field,
  label,
  currentSort,
  currentDir,
  onSort,
  align = 'right',
}: {
  field: SortField;
  label: string;
  currentSort: SortField;
  currentDir: 'asc' | 'desc';
  onSort: (f: SortField) => void;
  align?: 'left' | 'right';
}) {
  const active = currentSort === field;
  return (
    <th
      className={`px-3 py-2.5 text-xs cursor-pointer select-none whitespace-nowrap ${align === 'right' ? 'text-right' : 'text-left'}`}
      style={{
        fontFamily: 'Space Mono, monospace',
        fontSize: 10,
        letterSpacing: '0.08em',
        color: active ? '#c8cde0' : '#3d4259',
        userSelect: 'none',
        transition: 'color 0.15s',
      }}
      onClick={() => onSort(field)}
    >
      {label}
      {active && (
        <span className="ml-1" style={{ color: '#00c8ff' }}>
          {currentDir === 'desc' ? '↓' : '↑'}
        </span>
      )}
    </th>
  );
}

// ─── Analyst rating badge (sourced from Yahoo Finance) ───────────────────────

function AnalystRatingBadge({ mean }: { mean?: number }) {
  const label = recommendationMeanToLabel(mean);
  if (!label) return <span style={{ color: '#2e3249' }}>—</span>;
  const { text, bg } = YAHOO_RATING_COLORS[label];
  return (
    <span
      className="px-2 py-0.5 rounded-sm"
      style={{
        backgroundColor: bg,
        color: text,
        fontFamily: 'Space Mono, monospace',
        fontSize: 9,
        letterSpacing: '0.1em',
        border: `1px solid ${text}28`,
        whiteSpace: 'nowrap',
      }}
    >
      {label.toUpperCase()}
    </span>
  );
}

// ─── Sector pills ─────────────────────────────────────────────────────────────
// Compact dot + label treatment. Primary sector shown full; secondary sector
// shown as a faint dot-only indicator to keep the column narrow.

function SectorPills({ sectors }: { sectors: string[] }) {
  return (
    <div className="flex items-center gap-1.5">
      {sectors.slice(0, 2).map((s, i) => {
        const color = SECTOR_COLORS[s as keyof typeof SECTOR_COLORS] ?? '#8b8fa8';
        const abbr  = SECTOR_ABBR[s] ?? s.toUpperCase();
        // Secondary tag: dot only (saves column width, still informative on hover)
        if (i > 0) {
          return (
            <span
              key={s}
              title={s.replace('_', ' ').toUpperCase()}
              className="rounded-full shrink-0"
              style={{
                width: 5,
                height: 5,
                backgroundColor: color,
                opacity: 0.5,
                display: 'inline-block',
              }}
            />
          );
        }
        // Primary tag: dot + abbreviated label
        return (
          <span
            key={s}
            className="flex items-center gap-1"
            style={{
              color,
              fontFamily: 'Space Mono, monospace',
              fontSize: 9,
              letterSpacing: '0.07em',
            }}
          >
            <span
              className="rounded-full shrink-0"
              style={{ width: 4, height: 4, backgroundColor: color, display: 'inline-block' }}
            />
            {abbr}
          </span>
        );
      })}
    </div>
  );
}

// ─── Analysis status cell ─────────────────────────────────────────────────────

function AnalysisStatus({
  isStreaming,
  stale,
  hasAnalysis,
}: {
  isStreaming?: boolean;
  stale: boolean;
  hasAnalysis: boolean;
}) {
  if (isStreaming) {
    return (
      <span
        className="animate-pulse"
        style={{ fontFamily: 'Space Mono, monospace', fontSize: 9, letterSpacing: '0.08em', color: '#a259ff' }}
      >
        ● STREAMING
      </span>
    );
  }
  if (stale) {
    return (
      <span style={{ fontFamily: 'Space Mono, monospace', fontSize: 9, letterSpacing: '0.08em', color: '#f59e0b' }}>
        ⚠ STALE
      </span>
    );
  }
  if (hasAnalysis) {
    return (
      <span style={{ fontFamily: 'Space Mono, monospace', fontSize: 9, letterSpacing: '0.08em', color: '#22c55e' }}>
        ✓ ANALYZED
      </span>
    );
  }
  return (
    <span style={{ fontFamily: 'Space Mono, monospace', fontSize: 9, letterSpacing: '0.08em', color: '#2e3249' }}>
      AWAITING
    </span>
  );
}

// ─── Main table ───────────────────────────────────────────────────────────────

export function PriceTable() {
  const navigate = useNavigate();
  const prices             = useStore((s) => s.prices);
  const pricesLoadingState = useStore((s) => s.pricesLoadingState);
  const analyses           = useStore((s) => s.analyses);
  const sectorFilter       = useStore((s) => s.sectorFilter);
  const sortBy             = useStore((s) => s.sortBy);
  const sortDir            = useStore((s) => s.sortDir);
  const toggleSort         = useStore((s) => s.toggleSort);

  const isLoading = pricesLoadingState === 'loading';

  const rows = useMemo(() => {
    let list = TICKERS.filter((t) =>
      // ── FIX: filter by PRIMARY sector (sectors[0]) only.
      // Secondary/crossover tags are displayed on the row but do not
      // cause a stock to appear in multiple sector tabs.
      sectorFilter ? t.sectors[0] === sectorFilter : true,
    );

    list = [...list].sort((a, b) => {
      const pa = prices[a.ticker];
      const pb = prices[b.ticker];
      const aa = analyses[a.ticker];
      const ab = analyses[b.ticker];

      let va: number | string = 0;
      let vb: number | string = 0;

      switch (sortBy) {
        case 'ticker':     va = a.ticker;  vb = b.ticker;  break;
        case 'price':      va = pa?.price ?? 0;  vb = pb?.price ?? 0;  break;
        case 'dayChange':  va = pa?.changePercent ?? 0;  vb = pb?.changePercent ?? 0;  break;
        case 'weekChange': va = pa?.weekChangePercent ?? 0;  vb = pb?.weekChangePercent ?? 0;  break;
        case 'marketCap':  va = pa?.marketCap ?? 0;  vb = pb?.marketCap ?? 0;  break;
        case 'upside': {
          const ua = computeImpliedUpside(pa?.price, aa?.analystTarget);
          const ub = computeImpliedUpside(pb?.price, ab?.analystTarget);
          va = ua ?? -Infinity;
          vb = ub ?? -Infinity;
          break;
        }
      }

      if (typeof va === 'string') {
        return sortDir === 'asc'
          ? va.localeCompare(vb as string)
          : (vb as string).localeCompare(va);
      }
      return sortDir === 'asc'
        ? (va as number) - (vb as number)
        : (vb as number) - (va as number);
    });

    return list;
  }, [prices, analyses, sectorFilter, sortBy, sortDir]);

  return (
    <div className="w-full overflow-x-auto">
      {isLoading && (
        <div
          className="mb-3 px-3 py-1.5 rounded-sm text-xs"
          style={{
            fontFamily: 'Space Mono, monospace',
            fontSize: 10,
            letterSpacing: '0.06em',
            backgroundColor: '#0c111f',
            color: '#3b82f6',
            border: '1px solid #1e2a42',
          }}
        >
          FETCHING LIVE PRICES…
        </div>
      )}
      <table className="w-full border-collapse" style={{ minWidth: 980 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #1a1d2e' }}>
            {/* Static non-sortable left-aligned headers */}
            <SortTh field="ticker"     label="TICKER"   currentSort={sortBy} currentDir={sortDir} onSort={toggleSort} align="left" />
            <th
              className="px-3 py-2.5 text-left"
              style={{ fontFamily: 'Space Mono, monospace', fontSize: 10, letterSpacing: '0.08em', color: '#3d4259' }}
            >
              SECTOR
            </th>
            <SortTh field="price"      label="PRICE"    currentSort={sortBy} currentDir={sortDir} onSort={toggleSort} />
            <SortTh field="dayChange"  label="1D %"     currentSort={sortBy} currentDir={sortDir} onSort={toggleSort} />
            <SortTh field="weekChange" label="1W %"     currentSort={sortBy} currentDir={sortDir} onSort={toggleSort} />
            <th
              className="px-3 py-2.5 text-right"
              style={{ fontFamily: 'Space Mono, monospace', fontSize: 10, letterSpacing: '0.08em', color: '#3d4259' }}
            >
              52W
            </th>
            <SortTh field="marketCap"  label="MKT CAP"  currentSort={sortBy} currentDir={sortDir} onSort={toggleSort} />
            <SortTh field="upside"     label="UPSIDE"   currentSort={sortBy} currentDir={sortDir} onSort={toggleSort} />
            <th
              className="px-3 py-2.5 text-right"
              style={{ fontFamily: 'Space Mono, monospace', fontSize: 10, letterSpacing: '0.08em', color: '#3d4259' }}
            >
              RATING
            </th>
            <th
              className="px-3 py-2.5 text-right"
              style={{ fontFamily: 'Space Mono, monospace', fontSize: 10, letterSpacing: '0.08em', color: '#3d4259' }}
            >
              ANALYSIS
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((ticker) => {
            const price    = prices[ticker.ticker];
            const analysis = analyses[ticker.ticker];
            const hasAnalysis = !!analysis;
            const stale       = hasAnalysis && isAnalysisStale(analysis);
            const awaiting    = !hasAnalysis;
            // Upside now sourced from Yahoo Finance analyst consensus target — available for all stocks
            const upside      = computeImpliedUpside(price?.price, price?.analystTargetPrice);

            const accentColor = SECTOR_COLORS[ticker.sectors[0] as keyof typeof SECTOR_COLORS] ?? '#8b8fa8';
            const priceError  = price?.fetchError === true;

            // Left accent bar: color = primary sector color; opacity dims for awaiting rows
            const accentOpacity = awaiting ? 0.25 : 1;

            return (
              <tr
                key={ticker.ticker}
                onClick={() => navigate(`/stock/${ticker.ticker}`)}
                className="cursor-pointer group"
                style={{
                  borderBottom: '1px solid #10111a',
                  backgroundColor: 'transparent',
                  opacity: priceError ? 0.85 : awaiting ? 0.6 : 1,
                  // Stale rows: subtle amber left outline
                  outline: stale ? '1px solid #f59e0b28' : undefined,
                  transition: 'background-color 0.1s',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLTableRowElement).style.backgroundColor = '#0d0e17';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLTableRowElement).style.backgroundColor = 'transparent';
                }}
              >
                {/* Ticker + Name */}
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    {/* Primary sector accent bar */}
                    <div
                      className="shrink-0 rounded-full"
                      style={{
                        width: 2,
                        height: 28,
                        backgroundColor: accentColor,
                        opacity: accentOpacity,
                      }}
                    />
                    <div>
                      <div
                        className="font-bold"
                        style={{
                          fontFamily: 'Space Mono, monospace',
                          fontSize: 12,
                          letterSpacing: '0.04em',
                          color: accentColor,
                          opacity: awaiting ? 0.7 : 1,
                        }}
                      >
                        {ticker.ticker}
                      </div>
                      <div
                        style={{
                          fontFamily: 'DM Sans, sans-serif',
                          fontSize: 11,
                          color: '#4a4e63',
                          marginTop: 1,
                        }}
                      >
                        {ticker.name}
                      </div>
                    </div>
                  </div>
                </td>

                {/* Sectors */}
                <td className="px-3 py-2.5" style={{ minWidth: 80 }}>
                  <SectorPills sectors={ticker.sectors} />
                </td>

                {/* Price */}
                <td className="px-3 py-2.5 text-right">
                  {price?.fetchError ? (
                    <span style={{ fontFamily: 'Space Mono, monospace', fontSize: 11, color: '#ef4444' }}>ERR</span>
                  ) : price ? (
                    <span style={{ fontFamily: 'Space Mono, monospace', fontSize: 12, color: '#c8cde0', fontWeight: 700 }}>
                      {fmtPrice(price.price)}
                    </span>
                  ) : isLoading ? (
                    <span style={{ fontFamily: 'Space Mono, monospace', fontSize: 10, color: '#3b82f6', letterSpacing: '0.05em' }}>
                      ···
                    </span>
                  ) : (
                    <span style={{ fontFamily: 'Space Mono, monospace', fontSize: 12, color: '#2e3249' }}>—</span>
                  )}
                </td>

                {/* 1D % */}
                <td className="px-3 py-2.5 text-right">
                  {price && !price.fetchError ? (
                    <span style={{
                      fontFamily: 'Space Mono, monospace',
                      fontSize: 12,
                      color: price.changePercent >= 0 ? '#22c55e' : '#ef4444',
                    }}>
                      {fmtPct(price.changePercent)}
                    </span>
                  ) : (
                    <span style={{ fontFamily: 'Space Mono, monospace', fontSize: 12, color: '#2e3249' }}>—</span>
                  )}
                </td>

                {/* 1W % */}
                <td className="px-3 py-2.5 text-right">
                  {price?.weekChangePercent != null ? (
                    <span style={{
                      fontFamily: 'Space Mono, monospace',
                      fontSize: 12,
                      color: price.weekChangePercent >= 0 ? '#22c55e' : '#ef4444',
                    }}>
                      {fmtPct(price.weekChangePercent)}
                    </span>
                  ) : (
                    <span style={{ fontFamily: 'Space Mono, monospace', fontSize: 12, color: '#2e3249' }}>—</span>
                  )}
                </td>

                {/* 52W Range */}
                <td className="px-3 py-2.5 text-right" style={{ minWidth: 110 }}>
                  {price?.fiftyTwoWeekLow != null && price?.fiftyTwoWeekHigh != null ? (
                    <div className="flex flex-col items-end gap-1">
                      <div className="rounded-full" style={{ width: '100%', height: 3, backgroundColor: '#0d0e17' }}>
                        <div
                          className="rounded-full"
                          style={{
                            height: 3,
                            background: 'linear-gradient(90deg, #00c8ff 0%, #a259ff 100%)',
                            width: `${Math.min(100, Math.max(0, ((price.price - price.fiftyTwoWeekLow) / (price.fiftyTwoWeekHigh - price.fiftyTwoWeekLow)) * 100))}%`,
                          }}
                        />
                      </div>
                      <div
                        className="flex items-center justify-between w-full"
                        style={{ fontFamily: 'Space Mono, monospace', fontSize: 9, color: '#3d4259' }}
                      >
                        <span>{fmtPrice(price.fiftyTwoWeekLow)}</span>
                        <span>{fmtPrice(price.fiftyTwoWeekHigh)}</span>
                      </div>
                    </div>
                  ) : (
                    <span style={{ fontFamily: 'Space Mono, monospace', fontSize: 12, color: '#2e3249' }}>—</span>
                  )}
                </td>

                {/* Mkt Cap */}
                <td className="px-3 py-2.5 text-right">
                  <span style={{ fontFamily: 'Space Mono, monospace', fontSize: 12, color: '#6b7190' }}>
                    {fmtMktCap(price?.marketCap)}
                  </span>
                </td>

                {/* Upside */}
                <td className="px-3 py-2.5 text-right">
                  {upside != null ? (
                    <span style={{
                      fontFamily: 'Space Mono, monospace',
                      fontSize: 12,
                      color: upside >= 0 ? '#22c55e' : '#ef4444',
                    }}>
                      {fmtPct(upside)}
                    </span>
                  ) : (
                    <span style={{ fontFamily: 'Space Mono, monospace', fontSize: 12, color: '#2e3249' }}>—</span>
                  )}
                </td>

                {/* Analyst Rating (Yahoo Finance consensus) */}
                <td className="px-3 py-2.5 text-right">
                  <AnalystRatingBadge mean={price?.recommendationMean} />
                </td>

                {/* Analysis status */}
                <td className="px-3 py-2.5 text-right">
                  <AnalysisStatus
                    isStreaming={analysis?.isStreaming}
                    stale={stale}
                    hasAnalysis={hasAnalysis}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}