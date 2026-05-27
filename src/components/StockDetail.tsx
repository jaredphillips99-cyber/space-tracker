import { useParams, useNavigate } from 'react-router-dom';
import { useCallback, useState } from 'react';
import { useAnalysis, type AnalysisCompletePayload, type RunPayload } from '../hooks/useAnalysis';
import type { AnalysisMeta, AnalysisJson } from '../hooks/useAnalysis';
import { useStore } from '../store/useStore';
import { ConvictionBadge } from './ConvictionBadge';
import ReactMarkdown from 'react-markdown';
import type { StockAnalysis, GuidanceDirection, AnalystRating } from '../types';

// ─── CIK map ──────────────────────────────────────────────────────────────────

const CIK_MAP: Record<string, string> = {
  RKLB: '0001819994', PL:   '0001836833', RDW:  '0001819810',
  LUNR: '0001844452', ASTS: '0001780312', KTOS: '0001069258',
  BKSY: '0001753539', FLY:  '0001860160', SATS: '0001415404',
  NVDA: '0001045810', PLTR: '0001321655', CRWV: '0001769628',
  IREN: '0001878848', NBIS: '0001513845', CIFR: '0001819989',
  RIOT: '0001167419', VRT:  '0001674101', MOD:  '0000067347',
  CEG:  '0001868275', VST:  '0001692819', BWXT: '0001486957',
  GEV:  '0001996810', BE:   '0001664703', CCJ:  '0001009001',
  LEU:  '0001065059', NXE:  '0001698535', OKLO: '0001849056',
  NNE:  '0001923891', LHX:  '0000202058', AVAV: '0001368622',
};

const SPECULATIVE = new Set(['OKLO', 'NNE', 'NXE']);
const SEDAR_ONLY  = new Set(['NXE']);

// ─── EDGAR types ──────────────────────────────────────────────────────────────

interface EdgarSubmission {
  cik: string;  // zero-padded string e.g. "0001819810"
  filings: {
    recent: {
      accessionNumber: string[];
      filingDate:      string[];
      reportDate:      string[];
      items:           string[];
      form:            string[];
      primaryDocument: string[];
    };
  };
}

// ─── EDGAR helpers ────────────────────────────────────────────────────────────

function stripHtml(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ').trim();
}

function findFiling(sub: EdgarSubmission, form: string, requireItem?: string) {
  const r = sub.filings.recent;
  for (let i = 0; i < r.form.length; i++) {
    if (r.form[i] !== form) continue;
    if (requireItem && !(r.items[i] ?? '').includes(requireItem)) continue;
    return {
      filingDate:      r.filingDate[i],
      accessionNumber: r.accessionNumber[i],
      period:          r.reportDate[i],
      items:           r.items[i] ?? '',
      primaryDocument: (r.primaryDocument ?? [])[i] ?? '',
    };
  }
  return null;
}

function extractMDA(text: string): string {
  const start = text.search(/management'?s?\s+discussion\s+and\s+analysis|item\s+2\.?\s*$/mi);
  if (start === -1) return text.substring(0, 15000);
  const slice = text.substring(start);
  const end = slice.search(/item\s+3[^a-z0-9]|quantitative\s+and\s+qualitative|controls\s+and\s+procedures/i);
  return slice.substring(0, end === -1 ? 15000 : Math.min(end + 1000, 20000));
}

// Route /Archives/ fetches through the Vercel proxy (no CORS headers on www.sec.gov).
// data.sec.gov has CORS — fetch directly.
async function secFetch(url: string): Promise<string | null> {
  try {
    const proxyUrl = url.includes('data.sec.gov')
      ? url
      : `/api/edgar-proxy?url=${encodeURIComponent(url)}`;
    const res = await fetch(proxyUrl);
    return res.ok ? res.text() : null;
  } catch { return null; }
}

// Fetch the filing's -index.htm page and return the URL of the earnings exhibit.
// Strategy:
//   1. Prefer any file whose name matches an EX-99.1 pattern (ex99, ex-99, ex991, ex99d1, ex99_1)
//   2. Fall back to the second /Archives/ .htm file — SEC always lists cover first, exhibits after
// This correctly handles tickers like NVDA where the press release is named q1fy27pr.htm.
async function resolveExhibitUrl(
  cikNum: number,
  accessionNumber: string,
): Promise<string | null> {
  const SEC_ROOT  = 'https://www.sec.gov';
  const accNodash = accessionNumber.replace(/-/g, '');
  const indexUrl  = `${SEC_ROOT}/Archives/edgar/data/${cikNum}/${accNodash}/${accessionNumber}-index.htm`;

  const html = await secFetch(indexUrl);
  if (!html) return null;

  // Collect all /Archives/ .htm hrefs in document order
  const archiveHrefs = Array.from(
    html.matchAll(/href\s*=\s*["']([^"']+\.htm[l]?)["']/gi),
  )
    .map(m => m[1])
    .filter(h => h.includes('/Archives/'))
    .map(h => (h.startsWith('/') ? SEC_ROOT + h : h));

  if (archiveHrefs.length === 0) return null;

  // Prefer EX-99.1 by name pattern
  const ex99 = archiveHrefs.find(h =>
    /ex-?99[._d]?1|ex99[._d]?1|ex-?991\b/i.test(h.split('/').pop() ?? ''),
  );
  if (ex99) return ex99;

  // Fallback: position [1] = first exhibit (cover is always [0])
  return archiveHrefs[1] ?? archiveHrefs[0];
}

async function fetchEdgarInBrowser(ticker: string): Promise<RunPayload> {
  if (SEDAR_ONLY.has(ticker)) {
    return {
      ticker,
      earningsText:  `${ticker} is a Canadian company that files on SEDAR, not SEC EDGAR. Use your training knowledge for analysis.`,
      isSpeculative: true,
      filingMeta: {
        filingDate: null, period: null, documentUrl: null,
        isSedarOnly: true, sources: null,
        note: 'NXE files on SEDAR. Analysis based on training knowledge only.',
      },
    };
  }

  const cik = CIK_MAP[ticker];
  if (!cik) throw new Error(`Unknown ticker: ${ticker}`);

  const subJson = await secFetch(`https://data.sec.gov/submissions/CIK${cik}.json`);
  if (!subJson) throw new Error('Failed to fetch SEC submission index');
  const sub = JSON.parse(subJson) as EdgarSubmission;

  const cikNum = parseInt(sub.cik, 10);
  if (!cikNum) throw new Error(`Invalid CIK in submission response: ${sub.cik}`);

  const isSpeculative = SPECULATIVE.has(ticker);

  // ── Speculative tickers: combine 8-K exhibit + 10-Q MD&A ────────────────
  if (isSpeculative) {
    const [eightKFiling, tenQFiling] = [
      findFiling(sub, '8-K'),
      findFiling(sub, '10-Q'),
    ];

    const fetchExhibit = async (
      filing: NonNullable<ReturnType<typeof findFiling>>,
      mda = false,
    ) => {
      const docUrl = await resolveExhibitUrl(cikNum, filing.accessionNumber);
      if (!docUrl) return null;
      const raw = await secFetch(docUrl);
      if (!raw) return null;
      const text = stripHtml(raw).substring(0, 80000);
      return mda ? extractMDA(text) : text;
    };

    const [eightKText, tenQText] = await Promise.all([
      eightKFiling ? fetchExhibit(eightKFiling, false) : Promise.resolve(null),
      tenQFiling   ? fetchExhibit(tenQFiling,   true)  : Promise.resolve(null),
    ]);

    let combined = '';
    if (eightKText) combined += `=== MOST RECENT 8-K ===\nFiled: ${eightKFiling!.filingDate}\n\n${eightKText}`;
    if (tenQText)   combined += `${combined ? '\n\n' : ''}=== MOST RECENT 10-Q (MD&A) ===\nFiled: ${tenQFiling!.filingDate}\n\n${tenQText}`;
    if (!combined)  throw new Error('Could not retrieve any EDGAR filings');

    return {
      ticker,
      earningsText:  combined,
      isSpeculative: true,
      filingMeta: {
        filingDate:  eightKFiling?.filingDate ?? tenQFiling?.filingDate ?? null,
        period:      tenQFiling?.period ?? eightKFiling?.period ?? null,
        documentUrl: null,
        isSedarOnly: false,
        sources:     { hasEightK: !!eightKText, hasTenQ: !!tenQText },
        note:        null,
      },
    };
  }

  // ── Normal ticker: EX-99.1 from earnings 8-K (item 2.02) ────────────────
  const filing = findFiling(sub, '8-K', '2.02');
  if (!filing) throw new Error(`No earnings 8-K (item 2.02) found for ${ticker}`);

  const docUrl = await resolveExhibitUrl(cikNum, filing.accessionNumber);
  if (!docUrl) throw new Error('Could not resolve earnings exhibit URL');

  const rawDoc = await secFetch(docUrl);
  if (!rawDoc) throw new Error('Failed to fetch earnings document from SEC');

  const docText = stripHtml(rawDoc).substring(0, 80000);

  return {
    ticker,
    earningsText:  docText,
    isSpeculative: false,
    filingMeta: {
      filingDate:  filing.filingDate,
      period:      filing.period,
      documentUrl: docUrl,
      isSedarOnly: false,
      sources:     null,
      note:        null,
    },
  };
}

// ─── Component ────────────────────────────────────────────────────────────────

export function StockDetail() {
  const { ticker } = useParams<{ ticker: string }>();
  const navigate   = useNavigate();

  const setAnalysis    = useStore(s => s.setAnalysis);
  const storedAnalysis = useStore(s => ticker ? s.analyses[ticker] : undefined);
  const livePrice      = useStore(s => ticker ? s.prices[ticker] : undefined);

  const [edgarError, setEdgarError] = useState<string | null>(null);

  const handleComplete = useCallback(
    (payload: AnalysisCompletePayload) => {
      if (!ticker) return;
      const { meta, jsonData, narrative } = payload;
      setAnalysis({
        ticker,
        analyzedAt:        Date.now(),
        analystTarget:     jsonData.analystConsensusTargetPrice ?? undefined,
        guidanceDirection: mapGuidanceDirection(jsonData.guidanceDirection),
        analystRating:     mapConvictionToRating(jsonData.convictionRating),
        revenueGrowthYoY:  jsonData.revenueGrowthYoY ?? undefined,
        grossMargin:       jsonData.grossMarginPercent ?? undefined,
        recentRevenue:     jsonData.revenue ?? undefined,
        recentEPS:         jsonData.epsAdjusted ?? undefined,
        summary:           narrative,
        earningsText:      meta.documentUrl ?? undefined,
        streamedContent:   JSON.stringify({ meta, jsonData }),
      });
    },
    [ticker, setAnalysis],
  );

  const { run, cancel, status, meta, jsonData, narrative, error, convictionRating } =
    useAnalysis({ onComplete: handleComplete });

  if (!ticker) return <div>Invalid ticker</div>;

  const handleRunAnalysis = async () => {
    setEdgarError(null);
    let payload: RunPayload;
    try {
      payload = await fetchEdgarInBrowser(ticker.toUpperCase());
    } catch (err) {
      setEdgarError(err instanceof Error ? err.message : String(err));
      return;
    }
    await run(payload);
  };

  const isRunning = status === 'extracting_json' || status === 'writing_narrative';
  const isBusy    = isRunning;
  const isLiveOrDone = isRunning || status === 'done';

  let displayMeta:       AnalysisMeta | null = null;
  let displayJsonData:   AnalysisJson | null = null;
  let displayNarrative:  string             = '';
  let displayConviction: string | null      = null;

  if (isLiveOrDone) {
    displayMeta       = meta     ?? null;
    displayJsonData   = jsonData ?? null;
    displayNarrative  = narrative ?? '';
    displayConviction = convictionRating ?? null;
  } else if (storedAnalysis) {
    const recovered   = recoverFromStore(storedAnalysis);
    displayMeta       = recovered.meta;
    displayJsonData   = recovered.jsonData;
    displayNarrative  = storedAnalysis.summary ?? '';
    displayConviction = storedAnalysis.analystRating
      ? ratingToConviction(storedAnalysis.analystRating)
      : null;
  }

  const hasCached  = !!storedAnalysis;
  const displayErr = edgarError ?? error;

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#08090d', color: '#e2e6f0' }}>
      <div className="max-w-4xl mx-auto p-6">

        <button
          onClick={() => navigate('/')}
          className="mb-6 px-3 py-1.5 rounded text-sm"
          style={{ backgroundColor: '#161922', border: '1px solid #1e2230', color: '#00c8ff', fontFamily: 'Space Mono, monospace', cursor: 'pointer' }}
        >
          ← DASHBOARD
        </button>

        <div className="flex items-start justify-between mb-4">
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '16px' }}>
              <h1 style={{ fontFamily: 'Space Mono, monospace', fontSize: '32px', margin: 0 }}>{ticker}</h1>
              {livePrice && (
                <span style={{ fontFamily: 'Space Mono, monospace', fontSize: '20px', color: '#e2e6f0' }}>
                  ${livePrice.price.toFixed(2)}
                  <span style={{ fontSize: '14px', marginLeft: '8px', color: livePrice.changePercent >= 0 ? '#00e676' : '#ff4b6e' }}>
                    {livePrice.changePercent >= 0 ? '+' : ''}{livePrice.changePercent.toFixed(2)}%
                  </span>
                </span>
              )}
            </div>
            {displayMeta && (
              <p style={{ color: '#8b93a8', marginTop: '4px', fontSize: '14px' }}>
                {displayMeta.period    && <span>{displayMeta.period} earnings · </span>}
                {displayMeta.filingDate && <span>filed {displayMeta.filingDate} · </span>}
                {displayMeta.documentUrl && (
                  <a href={displayMeta.documentUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#00c8ff', textDecoration: 'none' }}>
                    SEC filing ↗
                  </a>
                )}
                {displayMeta.note && <span style={{ color: '#ffd166', marginLeft: '8px' }}>⚠ {displayMeta.note}</span>}
              </p>
            )}
          </div>
          {displayConviction && <ConvictionBadge rating={displayConviction as any} size="lg" />}
        </div>

        <div className="mb-6 flex gap-2 items-center">
          <button
            onClick={handleRunAnalysis}
            disabled={isBusy}
            style={{
              backgroundColor: '#00c8ff', color: '#08090d',
              padding: '8px 16px', borderRadius: '4px', border: 'none',
              fontFamily: 'Space Mono, monospace', fontWeight: 600,
              cursor: isBusy ? 'not-allowed' : 'pointer', opacity: isBusy ? 0.5 : 1,
            }}
          >
            {isBusy ? '⏳ RUNNING…' : hasCached ? '↺ RE-RUN ANALYSIS' : 'RUN ANALYSIS'}
          </button>
          {isBusy && (
            <button onClick={cancel} style={{ backgroundColor: '#ff4b6e', color: '#fff', padding: '8px 16px', borderRadius: '4px', border: 'none', fontFamily: 'Space Mono, monospace', fontWeight: 600, cursor: 'pointer' }}>
              CANCEL
            </button>
          )}
          {hasCached && !isBusy && storedAnalysis?.analyzedAt && (
            <span style={{ fontFamily: 'Space Mono, monospace', fontSize: '11px', color: '#4a4e63' }}>
              cached {formatAge(storedAnalysis.analyzedAt)}
            </span>
          )}
        </div>

        {isBusy && (
          <div className="mb-6 px-4 py-3 rounded" style={{ backgroundColor: '#161922', border: '1px solid #1e2230', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ display: 'inline-block', width: '8px', height: '8px', backgroundColor: '#00c8ff', borderRadius: '50%', animation: 'pulse 1.5s infinite' }} />
            <span style={{ color: '#8b93a8', fontFamily: 'DM Sans, sans-serif' }}>
              {status === 'extracting_json'   && 'Extracting financial data…'}
              {status === 'writing_narrative' && 'Writing analysis…'}
            </span>
          </div>
        )}

        {displayErr && (
          <div className="mb-6 px-4 py-3 rounded" style={{ backgroundColor: '#ff4b6e20', border: '1px solid #ff4b6e', color: '#ff4b6e', fontFamily: 'DM Sans, sans-serif' }}>
            {displayErr}
          </div>
        )}

        {displayJsonData && (
          <>
            <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
              <MetricCard label="REVENUE"      value={fmt.dollars(displayJsonData.revenue)} />
              <MetricCard label="REV GROWTH"   value={fmt.percent(displayJsonData.revenueGrowthYoY)} />
              <MetricCard label="GROSS MARGIN" value={fmt.percent(displayJsonData.grossMarginPercent)} />
              <MetricCard label="ADJ EBITDA"   value={fmt.percent(displayJsonData.adjustedEbitdaMarginPercent)} />
              <MetricCard label="CASH"         value={fmt.dollars(displayJsonData.cashAndEquivalents)} />
              <MetricCard label="BACKLOG"      value={fmt.dollars(displayJsonData.backlog)} />
              <MetricCard label="EPS (ADJ)"    value={displayJsonData.epsAdjusted != null ? `$${displayJsonData.epsAdjusted.toFixed(2)}` : '—'} />
              <MetricCard
                label="ANALYST TARGET"
                value={displayJsonData.analystConsensusTargetPrice != null ? `$${displayJsonData.analystConsensusTargetPrice.toFixed(2)}` : '—'}
                sub={displayJsonData.analystConsensusTargetPrice && livePrice?.price
                  ? computeUpside(livePrice.price, displayJsonData.analystConsensusTargetPrice)
                  : undefined}
              />
            </div>

            {displayJsonData.guidanceDirection && (
              <div className="mb-6 p-4 rounded" style={{ backgroundColor: '#161922', border: '1px solid #1e2230' }}>
                <div style={{ fontFamily: 'Space Mono, monospace', fontSize: '12px', color: '#8b93a8', marginBottom: '8px' }}>FY GUIDANCE</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontFamily: 'Space Mono, monospace' }}>
                  {(displayJsonData.guidanceRevenueLow != null || displayJsonData.guidanceRevenueHigh != null) && (
                    <span>${displayJsonData.guidanceRevenueLow ?? '?'}–${displayJsonData.guidanceRevenueHigh ?? '?'}M{displayJsonData.guidancePeriod && ` (${displayJsonData.guidancePeriod})`}</span>
                  )}
                  <GuidanceBadge direction={displayJsonData.guidanceDirection} />
                </div>
              </div>
            )}

            {displayJsonData.segments && displayJsonData.segments.length > 0 && (
              <div className="mb-6">
                <div style={{ fontFamily: 'Space Mono, monospace', fontSize: '12px', color: '#8b93a8', marginBottom: '8px' }}>SEGMENTS</div>
                <div className="flex flex-wrap gap-2">
                  {displayJsonData.segments.map((seg, i) => (
                    <div key={i} className="px-2 py-1 rounded" style={{ backgroundColor: '#161922', border: '1px solid #1e2230', fontFamily: 'Space Mono, monospace', fontSize: '12px' }}>
                      {seg.name}: {seg.revenue != null ? `$${(seg.revenue / 1000).toFixed(1)}M` : '?'}
                      {seg.growthYoY != null && (
                        <span style={{ marginLeft: '4px', color: seg.growthYoY >= 0 ? '#00e676' : '#ff4b6e' }}>
                          {seg.growthYoY >= 0 ? '+' : ''}{(seg.growthYoY * 100).toFixed(1)}%
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {displayNarrative && (
          <div className="prose prose-invert max-w-none" style={{ fontFamily: 'DM Sans, sans-serif' }}>
            <ReactMarkdown
              components={{
                h2: ({ ...props }) => <h2 style={{ fontSize: '18px', fontWeight: 600, marginTop: '20px', marginBottom: '12px', color: '#00c8ff' }} {...props} />,
                p:  ({ ...props }) => <p  style={{ marginBottom: '12px', lineHeight: 1.6 }} {...props} />,
                li: ({ ...props }) => <li style={{ marginBottom: '6px', marginLeft: '20px' }} {...props} />,
              }}
            >
              {displayNarrative}
            </ReactMarkdown>
            {isRunning && <span style={{ display: 'inline-block', width: '8px', height: '16px', backgroundColor: '#00c8ff', marginLeft: '4px', animation: 'blink 1s infinite' }} />}
          </div>
        )}

        {!displayNarrative && !isBusy && (
          <div style={{ textAlign: 'center', color: '#8b93a8', padding: '40px 20px' }}>
            {displayErr ? 'Analysis failed. Try again.' : 'Click "RUN ANALYSIS" to generate an AI-powered earnings breakdown.'}
          </div>
        )}
      </div>

      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
        @keyframes blink  { 0%, 49% { opacity: 1; } 50%, 100% { opacity: 0; } }
      `}</style>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = {
  dollars: (val: number | null | undefined): string =>
    val == null ? '—' : `$${(val / 1000).toFixed(1)}M`,
  percent: (val: number | null | undefined): string =>
    val == null ? '—' : `${(val * 100).toFixed(1)}%`,
};

function computeUpside(price: number, target: number): string {
  const pct = ((target - price) / price) * 100;
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}% upside`;
}

function formatAge(ts: number): string {
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 60)  return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function recoverFromStore(stored: StockAnalysis): { meta: AnalysisMeta | null; jsonData: AnalysisJson | null } {
  if (!stored.streamedContent) return { meta: null, jsonData: null };
  try {
    const p = JSON.parse(stored.streamedContent) as { meta: AnalysisMeta; jsonData: AnalysisJson };
    return { meta: p.meta ?? null, jsonData: p.jsonData ?? null };
  } catch { return { meta: null, jsonData: null }; }
}

function mapGuidanceDirection(d: 'raised' | 'maintained' | 'lowered' | 'initiated' | null): GuidanceDirection | undefined {
  if (!d) return undefined;
  const map: Record<string, GuidanceDirection> = { raised: 'Raised', maintained: 'Maintained', lowered: 'Lowered', initiated: 'Raised' };
  return map[d];
}

function mapConvictionToRating(c: string | null): AnalystRating | undefined {
  if (!c) return undefined;
  const map: Record<string, AnalystRating> = { strong_buy: 'Strong Buy', buy: 'Buy', hold: 'Hold', sell: 'Sell', strong_sell: 'Strong Sell' };
  return map[c];
}

function ratingToConviction(r: AnalystRating): string {
  const map: Record<AnalystRating, string> = { 'Strong Buy': 'strong_buy', 'Buy': 'buy', 'Hold': 'hold', 'Sell': 'sell', 'Strong Sell': 'strong_sell' };
  return map[r] ?? 'hold';
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function MetricCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="p-3 rounded" style={{ backgroundColor: '#161922', border: '1px solid #1e2230' }}>
      <div style={{ fontFamily: 'Space Mono, monospace', fontSize: '10px', color: '#4a4e63', marginBottom: '4px' }}>{label}</div>
      <div style={{ fontFamily: 'Space Mono, monospace', fontSize: '14px', fontWeight: 600, color: '#e2e4ef' }}>{value}</div>
      {sub && <div style={{ fontFamily: 'Space Mono, monospace', fontSize: '10px', marginTop: '2px', color: sub.startsWith('+') ? '#00e676' : '#ff4b6e' }}>{sub}</div>}
    </div>
  );
}

function GuidanceBadge({ direction }: { direction: 'raised' | 'maintained' | 'lowered' | 'initiated' | null }) {
  const colors: Record<string, string> = { raised: '#00e676', maintained: '#8b93a8', lowered: '#ff4b6e', initiated: '#00c8ff' };
  const labels: Record<string, string> = { raised: 'RAISED', maintained: 'MAINTAINED', lowered: 'LOWERED', initiated: 'INITIATED' };
  const key   = direction ?? 'maintained';
  const color = colors[key];
  return (
    <span style={{ backgroundColor: `${color}18`, color, padding: '4px 8px', borderRadius: '3px', fontSize: '11px', fontWeight: 600, fontFamily: 'Space Mono, monospace', border: `1px solid ${color}66` }}>
      {labels[key]}
    </span>
  );
}