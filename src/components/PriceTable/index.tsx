import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../../store/useStore';
import { TICKERS, TICKER_MAP } from '../../config/tickers';
import {
  computeImpliedUpside,
  isAnalysisStale,
  SECTOR_COLORS,
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
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(0)}M`;
  return `$${n.toLocaleString()}`;
}

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
      className={`px-3 py-2 text-xs cursor-pointer select-none whitespace-nowrap ${align === 'right' ? 'text-right' : 'text-left'}`}
      style={{
        fontFamily: 'Space Mono, monospace',
        color: active ? '#e2e4ef' : '#4a4e63',
        userSelect: 'none',
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

// ─── Guidance badge ───────────────────────────────────────────────────────────

function GuidanceBadge({ direction }: { direction?: string }) {
  if (!direction) return <span style={{ color: '#4a4e63' }}>—</span>;
  const colors: Record<string, { bg: string; text: string }> = {
    Raised:     { bg: '#22c55e18', text: '#22c55e' },
    Maintained: { bg: '#8b8fa818', text: '#8b8fa8' },
    Lowered:    { bg: '#ef444418', text: '#ef4444' },
    Initiated:  { bg: '#3b82f618', text: '#3b82f6' },
  };
  const c = colors[direction] ?? colors.Maintained;
  return (
    <span
      className="px-1.5 py-0.5 rounded text-xs"
      style={{ backgroundColor: c.bg, color: c.text, fontFamily: 'Space Mono, monospace', fontSize: 10 }}
    >
      {direction.toUpperCase()}
    </span>
  );
}

// ─── Sector pills ─────────────────────────────────────────────────────────────

function SectorPills({ sectors }: { sectors: string[] }) {
  return (
    <div className="flex gap-1 flex-wrap">
      {sectors.slice(0, 2).map((s) => (
        <span
          key={s}
          className="px-1 py-0.5 rounded text-xs"
          style={{
            backgroundColor: `${SECTOR_COLORS[s as keyof typeof SECTOR_COLORS] ?? '#8b8fa8'}18`,
            color: SECTOR_COLORS[s as keyof typeof SECTOR_COLORS] ?? '#8b8fa8',
            fontFamily: 'Space Mono, monospace',
            fontSize: 9,
            letterSpacing: '0.03em',
          }}
        >
          {s.replace('_', ' ').toUpperCase()}
        </span>
      ))}
    </div>
  );
}

// ─── Main table ───────────────────────────────────────────────────────────────

export function PriceTable() {
  const navigate = useNavigate();
  const prices = useStore((s) => s.prices);
  const pricesLoadingState = useStore((s) => s.pricesLoadingState);
  const analyses = useStore((s) => s.analyses);
  const sectorFilter = useStore((s) => s.sectorFilter);
  const sortBy = useStore((s) => s.sortBy);
  const sortDir = useStore((s) => s.sortDir);
  const toggleSort = useStore((s) => s.toggleSort);

  const isLoading = pricesLoadingState === 'loading';

  const rows = useMemo(() => {
    let list = TICKERS.filter((t) =>
      sectorFilter ? t.sectors.includes(sectorFilter) : true,
    );

    list = [...list].sort((a, b) => {
      const pa = prices[a.ticker];
      const pb = prices[b.ticker];
      const aa = analyses[a.ticker];
      const ab = analyses[b.ticker];

      let va: number | string = 0;
      let vb: number | string = 0;

      switch (sortBy) {
        case 'ticker':     va = a.ticker;   vb = b.ticker;   break;
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
        return sortDir === 'asc' ? va.localeCompare(vb as string) : (vb as string).localeCompare(va);
      }
      return sortDir === 'asc' ? (va as number) - (vb as number) : (vb as number) - (va as number);
    });

    return list;
  }, [prices, analyses, sectorFilter, sortBy, sortDir]);

  return (
    <div className="w-full overflow-x-auto">
      {isLoading && (
        <div
          className="mb-3 px-4 py-2 rounded text-xs"
          style={{
            fontFamily: 'Space Mono, monospace',
            backgroundColor: '#0f172a',
            color: '#60a5fa',
            border: '1px solid #1e293b',
          }}
        >
          Fetching live prices…
        </div>
      )}
      <table className="w-full border-collapse" style={{ minWidth: 980 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #1e2030' }}>
            <SortTh field="ticker"     label="TICKER"     currentSort={sortBy} currentDir={sortDir} onSort={toggleSort} align="left" />
            <th className="px-3 py-2 text-left text-xs" style={{ fontFamily: 'Space Mono, monospace', color: '#4a4e63' }}>SECTORS</th>
            <SortTh field="price"      label="PRICE"      currentSort={sortBy} currentDir={sortDir} onSort={toggleSort} />
            <SortTh field="dayChange"  label="1D %"       currentSort={sortBy} currentDir={sortDir} onSort={toggleSort} />
            <SortTh field="weekChange" label="1W %"       currentSort={sortBy} currentDir={sortDir} onSort={toggleSort} />
            <th className="px-3 py-2 text-right text-xs" style={{ fontFamily: 'Space Mono, monospace', color: '#4a4e63' }}>52W</th>
            <SortTh field="marketCap"  label="MKT CAP"    currentSort={sortBy} currentDir={sortDir} onSort={toggleSort} />
            <SortTh field="upside"     label="UPSIDE"     currentSort={sortBy} currentDir={sortDir} onSort={toggleSort} />
            <th className="px-3 py-2 text-right text-xs" style={{ fontFamily: 'Space Mono, monospace', color: '#4a4e63' }}>GUIDANCE</th>
            <th className="px-3 py-2 text-right text-xs" style={{ fontFamily: 'Space Mono, monospace', color: '#4a4e63' }}>ANALYSIS</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((ticker) => {
            const price = prices[ticker.ticker];
            const analysis = analyses[ticker.ticker];
            const cfg = TICKER_MAP[ticker.ticker];

            const hasAnalysis = !!analysis;
            const stale = hasAnalysis && isAnalysisStale(analysis);
            const awaiting = !hasAnalysis;
            const upside = computeImpliedUpside(price?.price, analysis?.analystTarget);

            const rowBorderColor = stale
              ? '#f59e0b40'
              : awaiting
              ? 'transparent'
              : '#1e2030';

            const accentColor = cfg.color ?? '#8b8fa8';
            const priceError = price?.fetchError === true;

            return (
              <tr
                key={ticker.ticker}
                onClick={() => navigate(`/stock/${ticker.ticker}`)}
                className="cursor-pointer transition-colors"
                style={{
                  borderBottom: `1px solid #14151c`,
                  backgroundColor: priceError ? '#2e121e' : 'transparent',
                  opacity: priceError ? 0.92 : awaiting ? 0.55 : 1,
                  outline: stale ? `1px solid ${rowBorderColor}` : undefined,
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLTableRowElement).style.backgroundColor = '#0f1117';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLTableRowElement).style.backgroundColor = 'transparent';
                }}
              >
                {/* Ticker + Name */}
                <td className="px-3 py-3">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-0.5 h-8 rounded-full shrink-0"
                      style={{ backgroundColor: accentColor }}
                    />
                    <div>
                      <div
                        className="font-bold text-sm"
                        style={{ fontFamily: 'Space Mono, monospace', color: accentColor }}
                      >
                        {ticker.ticker}
                      </div>
                      <div className="text-xs" style={{ color: '#8b8fa8' }}>
                        {ticker.name}
                      </div>
                    </div>
                  </div>
                </td>

                {/* Sectors */}
                <td className="px-3 py-3">
                  <SectorPills sectors={ticker.sectors} />
                </td>

                {/* Price */}
                <td className="px-3 py-3 text-right">
                  {price?.fetchError ? (
                    <span style={{ color: '#ef4444', fontFamily: 'Space Mono, monospace', fontSize: 12 }}>ERR</span>
                  ) : price ? (
                    <span className="text-sm font-bold" style={{ fontFamily: 'Space Mono, monospace', color: '#e2e4ef' }}>
                      {fmtPrice(price.price)}
                    </span>
                  ) : isLoading ? (
                    <span style={{ color: '#60a5fa', fontFamily: 'Space Mono, monospace', fontSize: 12 }}>LOADING</span>
                  ) : (
                    <span style={{ color: '#4a4e63', fontFamily: 'Space Mono, monospace', fontSize: 12 }}>—</span>
                  )}
                </td>

                {/* 1D % */}
                <td className="px-3 py-3 text-right">
                  {price && !price.fetchError ? (
                    <span
                      className="text-sm"
                      style={{
                        fontFamily: 'Space Mono, monospace',
                        color: price.changePercent >= 0 ? '#22c55e' : '#ef4444',
                      }}
                    >
                      {fmtPct(price.changePercent)}
                    </span>
                  ) : (
                    <span style={{ color: '#4a4e63', fontFamily: 'Space Mono, monospace', fontSize: 12 }}>—</span>
                  )}
                </td>

                {/* 1W % */}
                <td className="px-3 py-3 text-right">
                  {price?.weekChangePercent != null ? (
                    <span
                      className="text-sm"
                      style={{
                        fontFamily: 'Space Mono, monospace',
                        color: price.weekChangePercent >= 0 ? '#22c55e' : '#ef4444',
                      }}
                    >
                      {fmtPct(price.weekChangePercent)}
                    </span>
                  ) : (
                    <span style={{ color: '#4a4e63', fontFamily: 'Space Mono, monospace', fontSize: 12 }}>—</span>
                  )}
                </td>

                {/* 52W Range */}
                <td className="px-3 py-3 text-right">
                  {price?.fiftyTwoWeekLow != null && price?.fiftyTwoWeekHigh != null ? (
                    <div className="flex flex-col items-end gap-1">
                      <div className="h-2 w-full rounded-full" style={{ backgroundColor: '#121827' }}>
                        <div
                          className="h-2 rounded-full"
                          style={{
                            background: 'linear-gradient(90deg, #00c8ff 0%, #a259ff 100%)',
                            width: `${Math.min(100, Math.max(0, ((price.price - price.fiftyTwoWeekLow) / (price.fiftyTwoWeekHigh - price.fiftyTwoWeekLow)) * 100))}%`,
                          }}
                        />
                      </div>
                      <div className="flex items-center justify-between w-full text-[10px]" style={{ fontFamily: 'Space Mono, monospace', color: '#8b8fa8' }}>
                        <span>{fmtPrice(price.fiftyTwoWeekLow)}</span>
                        <span>{fmtPrice(price.fiftyTwoWeekHigh)}</span>
                      </div>
                    </div>
                  ) : (
                    <span style={{ color: '#4a4e63', fontFamily: 'Space Mono, monospace', fontSize: 12 }}>—</span>
                  )}
                </td>

                {/* Mkt Cap */}
                <td className="px-3 py-3 text-right">
                  <span className="text-sm" style={{ fontFamily: 'Space Mono, monospace', color: '#8b8fa8' }}>
                    {fmtMktCap(price?.marketCap)}
                  </span>
                </td>

                {/* Upside */}
                <td className="px-3 py-3 text-right">
                  {upside != null ? (
                    <span
                      className="text-sm"
                      style={{
                        fontFamily: 'Space Mono, monospace',
                        color: upside >= 0 ? '#22c55e' : '#ef4444',
                      }}
                    >
                      {fmtPct(upside)}
                    </span>
                  ) : (
                    <span style={{ color: '#4a4e63', fontFamily: 'Space Mono, monospace', fontSize: 12 }}>—</span>
                  )}
                </td>

                {/* Guidance */}
                <td className="px-3 py-3 text-right">
                  <GuidanceBadge direction={analysis?.guidanceDirection} />
                </td>

                {/* Analysis status */}
                <td className="px-3 py-3 text-right">
                  {analysis?.isStreaming ? (
                    <span className="text-xs animate-pulse" style={{ fontFamily: 'Space Mono, monospace', color: '#a259ff' }}>
                      STREAMING
                    </span>
                  ) : stale ? (
                    <span className="text-xs" style={{ fontFamily: 'Space Mono, monospace', color: '#f59e0b' }}>
                      STALE
                    </span>
                  ) : hasAnalysis ? (
                    <span className="text-xs" style={{ fontFamily: 'Space Mono, monospace', color: '#22c55e' }}>
                      ✓ ANALYZED
                    </span>
                  ) : (
                    <span className="text-xs" style={{ fontFamily: 'Space Mono, monospace', color: '#4a4e63' }}>
                      AWAITING
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
