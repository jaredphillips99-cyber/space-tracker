import { useParams, useNavigate } from 'react-router-dom';
import { useCallback, useState } from 'react';
import { useAnalysis, type AnalysisCompletePayload, type RunPayload } from '../hooks/useAnalysis';
import type { AnalysisMeta, AnalysisJson } from '../hooks/useAnalysis';
import { useStore } from '../store/useStore';
import { ConvictionBadge } from './ConvictionBadge';
import ReactMarkdown from 'react-markdown';
import type { StockAnalysis, AnalystRating } from '../types';
import { TICKERS } from '../config/tickers';

// Re-import constants directly to avoid circular issues
const SECTOR_COLOR_MAP: Record<string, string> = {
  space:             '#00c8ff',
  ai_infrastructure: '#a259ff',
  defense:           '#f97316',
  clean_energy:      '#00e676',
};
const SECTOR_LABEL_MAP: Record<string, string> = {
  space:             'Space',
  ai_infrastructure: 'AI Infra',
  defense:           'Defense',
  clean_energy:      'Clean Energy',
};

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

const SPECULATIVE          = new Set(['OKLO', 'NNE', 'NXE', 'SATS']);
const SEDAR_ONLY           = new Set(['NXE']);
const TRAINING_ONLY        = new Set(['SATS']);  // no usable EDGAR filings; use training knowledge

// ─── EDGAR types ──────────────────────────────────────────────────────────────

interface EdgarSubmission {
  cik: string;
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

async function secFetch(url: string): Promise<string | null> {
  try {
    const proxyUrl = url.includes('data.sec.gov')
      ? url
      : `/api/edgar-proxy?url=${encodeURIComponent(url)}`;
    const res = await fetch(proxyUrl);
    return res.ok ? res.text() : null;
  } catch { return null; }
}

async function resolveExhibitUrl(
  cikNum: number,
  accessionNumber: string,
): Promise<string | null> {
  const SEC_ROOT  = 'https://www.sec.gov';
  const accNodash = accessionNumber.replace(/-/g, '');
  const indexUrl  = `${SEC_ROOT}/Archives/edgar/data/${cikNum}/${accNodash}/${accessionNumber}-index.htm`;

  const html = await secFetch(indexUrl);
  if (!html) return null;

  const archiveHrefs = Array.from(
    html.matchAll(/href\s*=\s*["']([^"']+\.htm[l]?)["']/gi),
  )
    .map(m => m[1])
    .filter(h => h.includes('/Archives/'))
    .map(h => (h.startsWith('/') ? SEC_ROOT + h : h));

  if (archiveHrefs.length === 0) return null;

  const ex99 = archiveHrefs.find(h =>
    /ex-?99[._d]?1|ex99[._d]?1|ex-?991\b/i.test(h.split('/').pop() ?? ''),
  );
  if (ex99) return ex99;

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

  if (TRAINING_ONLY.has(ticker)) {
    return {
      ticker,
      earningsText:  'SATS (EchoStar) is a satellite broadband restructuring story. The company filed for Chapter 11 bankruptcy in 2023 and emerged as a reorganized entity in 2024. Its most recent EDGAR 8-K item 2.02 dates from 2017 and is not useful for current analysis. Use your training knowledge to analyze EchoStar post-emergence: debt reduction achieved through restructuring, the DISH Network merger history and spectrum assets retained, Hughes broadband subscriber trends and competitive pressure from Starlink, cash runway, and strategic path forward. Focus on milestones, key risks, and catalysts.',
      isSpeculative: true,
      filingMeta: {
        filingDate: null, period: null, documentUrl: null,
        isSedarOnly: false, sources: null,
        note: 'SATS has no recent earnings 8-K on EDGAR (last filing 2017). Analysis based on training knowledge of post-bankruptcy restructuring.',
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
  const isAdmin        = useStore(s => s.isAdmin);

  const [edgarError, setEdgarError]            = useState<string | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  const handleComplete = useCallback(
    (payload: AnalysisCompletePayload) => {
      if (!ticker) return;
      const { meta, jsonData, narrative } = payload;
      setAnalysis({
        ticker,
        analyzedAt:        Date.now(),
        analystTarget:     jsonData.analystConsensusTargetPrice ?? undefined,
        analystRating:     mapConvictionToRating(jsonData.convictionRating),
        revenueGrowthYoY:  jsonData.revenueGrowthYoY ?? undefined,
        grossMargin:       jsonData.grossMarginPercent ?? undefined,
        recentRevenue:     jsonData.revenue ?? undefined,
        recentEPS:         jsonData.epsAdjusted ?? undefined,
        summary:           narrative,
        keyMetrics:        (jsonData as any).snapshot ?? undefined,
        earningsText:      meta.documentUrl ?? undefined,
        streamedContent:   JSON.stringify({ meta, jsonData }),
      });
    },
    [ticker, setAnalysis],
  );

  const { run, cancel, status, meta, jsonData, narrative, error, convictionRating } =
    useAnalysis({ onComplete: handleComplete });

  if (!ticker) return <div>Invalid ticker</div>;

  const executeAnalysis = async () => {
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

  const handleRunAnalysis = () => {
    if (hasCached) {
      setShowConfirmModal(true);
    } else {
      executeAnalysis();
    }
  };

  const isRunning    = status === 'extracting_json' || status === 'writing_narrative';
  const isBusy       = isRunning;
  const isLiveOrDone = isRunning || status === 'done';

  let displayMeta:       AnalysisMeta | null = null;
  let displayJsonData:   AnalysisJson | null = null;
  let displayNarrative:  string             = '';
  let displayConviction: string | null      = null;
  let displaySnapshot:   string | null      = null;

  if (isLiveOrDone) {
    displayMeta       = meta     ?? null;
    displayJsonData   = jsonData ?? null;
    displayNarrative  = narrative ?? '';
    displayConviction = convictionRating ?? null;
    displaySnapshot   = (jsonData as any)?.snapshot ?? null;
  } else if (storedAnalysis) {
    const recovered   = recoverFromStore(storedAnalysis);
    displayMeta       = recovered.meta;
    displayJsonData   = recovered.jsonData;
    displayNarrative  = storedAnalysis.summary ?? '';
    displayConviction = storedAnalysis.analystRating
      ? ratingToConviction(storedAnalysis.analystRating)
      : null;
    // keyMetrics stores the snapshot string (set in handleComplete above)
    displaySnapshot   = storedAnalysis.keyMetrics ?? (recovered.jsonData as any)?.snapshot ?? null;
  }

  const hasCached  = !!storedAnalysis;
  const displayErr = edgarError ?? error;

  // ── Ticker metadata ───────────────────────────────────────────────────────
  const tickerConfig  = TICKERS.find(t => t.ticker === ticker?.toUpperCase());
  const sectors       = tickerConfig?.sectors ?? [];
  const companyName   = tickerConfig?.name ?? '';

  // ── Yahoo Finance-sourced numbers ─────────────────────────────────────────
  const yahooTarget   = livePrice?.analystTargetPrice;
  const yahooMarketCap = livePrice?.marketCap;
  const currentPrice  = livePrice?.price;

  const impliedUpside = yahooTarget && currentPrice && currentPrice > 0
    ? ((yahooTarget - currentPrice) / currentPrice) * 100
    : null;

  const fiftyTwoLow  = livePrice?.fiftyTwoWeekLow;
  const fiftyTwoHigh = livePrice?.fiftyTwoWeekHigh;

  // Position of current price within the 52-week range (0–100%)
  const rangePosition = fiftyTwoLow && fiftyTwoHigh && currentPrice && fiftyTwoHigh > fiftyTwoLow
    ? Math.min(100, Math.max(0, ((currentPrice - fiftyTwoLow) / (fiftyTwoHigh - fiftyTwoLow)) * 100))
    : null;

  // ── Guidance direction from stored/live analysis ──────────────────────────
  const guidanceDir = storedAnalysis?.guidanceDirection ?? (displayJsonData as any)?.guidanceDirection ?? null;

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#08090d', color: '#e2e6f0', fontFamily: 'DM Sans, sans-serif' }}>
      <div style={{ maxWidth: '860px', margin: '0 auto', padding: '32px 24px 80px' }}>

        {/* ── Back nav ───────────────────────────────────────────────────── */}
        <button
          onClick={() => navigate('/')}
          style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            background: 'none', border: 'none', cursor: 'pointer',
            fontFamily: 'Space Mono, monospace', fontSize: '11px',
            color: '#8b93a8', textTransform: 'uppercase', letterSpacing: '0.08em',
            marginBottom: '28px', padding: 0,
          }}
        >
          ← All Stocks
        </button>

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {/* Ticker + sector pills */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <span style={{ fontFamily: 'Space Mono, monospace', fontSize: '28px', fontWeight: 700, letterSpacing: '0.04em' }}>
                {ticker?.toUpperCase()}
              </span>
              {sectors.map(sector => (
                <span
                  key={sector}
                  style={{
                    fontFamily: 'Space Mono, monospace', fontSize: '10px', fontWeight: 700,
                    textTransform: 'uppercase', letterSpacing: '0.1em',
                    padding: '3px 10px', borderRadius: '100px',
                    color: SECTOR_COLOR_MAP[sector] ?? '#8b93a8',
                    border: `1px solid ${(SECTOR_COLOR_MAP[sector] ?? '#8b93a8') + '40'}`,
                    background: (SECTOR_COLOR_MAP[sector] ?? '#8b93a8') + '15',
                  }}
                >
                  {SECTOR_LABEL_MAP[sector] ?? sector}
                </span>
              ))}
            </div>
            {/* Company name */}
            {companyName && (
              <div style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '14px', color: '#8b93a8' }}>
                {companyName}
              </div>
            )}
          </div>

          {/* Price + conviction */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
            {livePrice && (
              <>
                <span style={{ fontFamily: 'Space Mono, monospace', fontSize: '28px', fontWeight: 700 }}>
                  ${livePrice.price.toFixed(2)}
                </span>
                <span style={{
                  fontFamily: 'Space Mono, monospace', fontSize: '13px', fontWeight: 700,
                  color: livePrice.changePercent >= 0 ? '#00e676' : '#ff4b6e',
                }}>
                  {livePrice.changePercent >= 0 ? '▲' : '▼'} {livePrice.changePercent >= 0 ? '+' : ''}{livePrice.changePercent.toFixed(2)}% today
                </span>
              </>
            )}
            {displayConviction && (
              <div style={{ marginTop: '4px' }}>
                <ConvictionBadge rating={displayConviction as any} size="lg" />
              </div>
            )}
          </div>
        </div>

        {/* ── Yahoo Finance stats strip (Option B) ───────────────────────── */}
        <div style={{
          display: 'flex', alignItems: 'stretch',
          background: '#0f1117', border: '1px solid #1e2230',
          borderRadius: '10px', overflow: 'hidden', marginBottom: '20px',
        }}>
          {/* Analyst Target */}
          <div style={{ flex: 1, padding: '14px 20px', borderRight: '1px solid #1e2230' }}>
            <div style={{ fontFamily: 'Space Mono, monospace', fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.12em', color: '#8b93a8', marginBottom: '4px' }}>
              Analyst Target
            </div>
            <div style={{ fontFamily: 'Space Mono, monospace', fontSize: '15px', fontWeight: 700, color: '#e2e6f0' }}>
              {yahooTarget != null ? `$${yahooTarget.toFixed(2)}` : '—'}
            </div>
            <div style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '11px', color: '#8b93a8', marginTop: '2px' }}>
              Consensus
            </div>
          </div>

          {/* Implied Upside */}
          <div style={{ flex: 1, padding: '14px 20px', borderRight: '1px solid #1e2230' }}>
            <div style={{ fontFamily: 'Space Mono, monospace', fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.12em', color: '#8b93a8', marginBottom: '4px' }}>
              Implied Upside
            </div>
            <div style={{
              fontFamily: 'Space Mono, monospace', fontSize: '15px', fontWeight: 700,
              color: impliedUpside == null ? '#4a4e63' : impliedUpside >= 0 ? '#00e676' : '#ff4b6e',
            }}>
              {impliedUpside == null ? '—' : `${impliedUpside >= 0 ? '+' : ''}${impliedUpside.toFixed(1)}%`}
            </div>
            <div style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '11px', color: '#8b93a8', marginTop: '2px' }}>
              vs. current price
            </div>
          </div>

          {/* Market Cap */}
          <div style={{ flex: 1, padding: '14px 20px', borderRight: '1px solid #1e2230' }}>
            <div style={{ fontFamily: 'Space Mono, monospace', fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.12em', color: '#8b93a8', marginBottom: '4px' }}>
              Market Cap
            </div>
            <div style={{ fontFamily: 'Space Mono, monospace', fontSize: '15px', fontWeight: 700, color: '#e2e6f0' }}>
              {yahooMarketCap != null ? fmtMarketCap(yahooMarketCap) : '—'}
            </div>
            <div style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '11px', color: '#8b93a8', marginTop: '2px' }}>
              &nbsp;
            </div>
          </div>

          {/* 52-Week Range */}
          <div style={{ flex: 1, padding: '14px 20px' }}>
            <div style={{ fontFamily: 'Space Mono, monospace', fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.12em', color: '#8b93a8', marginBottom: '4px' }}>
              52-Week Range
            </div>
            <div style={{ fontFamily: 'Space Mono, monospace', fontSize: '12px', fontWeight: 700, color: '#e2e6f0' }}>
              {fiftyTwoLow && fiftyTwoHigh
                ? `$${fiftyTwoLow.toFixed(2)} – $${fiftyTwoHigh.toFixed(2)}`
                : '—'}
            </div>
            {rangePosition != null && (
              <div style={{ marginTop: '6px' }}>
                <div style={{ width: '100%', height: '4px', background: '#1e2230', borderRadius: '2px', position: 'relative' }}>
                  <div style={{
                    position: 'absolute',
                    left: `${rangePosition}%`,
                    transform: 'translateX(-50%)',
                    width: '7px', height: '7px',
                    background: '#00c8ff', borderRadius: '50%',
                    top: '-1.5px',
                  }} />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Analysis meta row ──────────────────────────────────────────── */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap',
          fontFamily: 'Space Mono, monospace', fontSize: '10px',
          color: '#8b93a8', marginBottom: '24px',
          textTransform: 'uppercase', letterSpacing: '0.06em',
        }}>
          {(isLiveOrDone || hasCached) && (
            <>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#00e676', flexShrink: 0, display: 'inline-block' }} />
              {displayMeta?.period    && <span>{displayMeta.period} Earnings</span>}
              {displayMeta?.filingDate && <span style={{ color: '#3d4259' }}>·</span>}
              {displayMeta?.filingDate && <span>Filed {displayMeta.filingDate}</span>}
              {displayMeta?.documentUrl && (
                <>
                  <span style={{ color: '#3d4259' }}>·</span>
                  <a href={displayMeta.documentUrl} target="_blank" rel="noopener noreferrer"
                    style={{ color: '#00c8ff', textDecoration: 'none' }}>
                    SEC Filing ↗
                  </a>
                </>
              )}
              {guidanceDir && (
                <>
                  <span style={{ color: '#3d4259' }}>·</span>
                  <span>Guidance</span>
                  <GuidanceBadge dir={guidanceDir} />
                </>
              )}
              {hasCached && !isBusy && storedAnalysis?.analyzedAt && (
                <>
                  <span style={{ color: '#3d4259' }}>·</span>
                  <span style={{ color: '#3d4259' }}>Cached {formatAge(storedAnalysis.analyzedAt)}</span>
                </>
              )}
            </>
          )}
        </div>

        {/* ── Run / cancel / status controls (admin only) ─────────────────── */}
        {isAdmin && (
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap' }}>
            <button
              onClick={handleRunAnalysis}
              disabled={isBusy}
              style={{
                backgroundColor: isBusy ? '#1e2230' : '#00c8ff',
                color: isBusy ? '#8b93a8' : '#08090d',
                padding: '8px 18px', borderRadius: '6px', border: 'none',
                fontFamily: 'Space Mono, monospace', fontSize: '11px',
                fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                cursor: isBusy ? 'not-allowed' : 'pointer',
                transition: 'all 0.15s',
              }}
            >
              {isBusy ? '⏳ Running…' : hasCached ? '↺ Re-run Analysis' : 'Run Analysis'}
            </button>
            {isBusy && (
              <button
                onClick={cancel}
                style={{
                  backgroundColor: 'transparent', color: '#ff4b6e',
                  padding: '8px 16px', borderRadius: '6px',
                  border: '1px solid #ff4b6e40',
                  fontFamily: 'Space Mono, monospace', fontSize: '11px',
                  fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            )}
          </div>
        )}

        {/* ── Loading indicator ──────────────────────────────────────────── */}
        {isBusy && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '10px',
            padding: '12px 16px', borderRadius: '8px', marginBottom: '24px',
            background: '#0f1117', border: '1px solid #1e2230',
          }}>
            <span style={{
              display: 'inline-block', width: '8px', height: '8px',
              backgroundColor: '#00c8ff', borderRadius: '50%',
              animation: 'pulse 1.5s infinite',
            }} />
            <span style={{ color: '#8b93a8', fontFamily: 'DM Sans, sans-serif', fontSize: '14px' }}>
              {status === 'extracting_json'   && 'Extracting financial data from filing…'}
              {status === 'writing_narrative' && 'Writing analysis…'}
            </span>
          </div>
        )}

        {/* ── Error ──────────────────────────────────────────────────────── */}
        {displayErr && (
          <div style={{
            padding: '12px 16px', borderRadius: '8px', marginBottom: '24px',
            background: '#ff4b6e18', border: '1px solid #ff4b6e40',
            color: '#ff4b6e', fontFamily: 'DM Sans, sans-serif', fontSize: '14px',
          }}>
            {displayErr}
          </div>
        )}

        {/* ── Snapshot block (Option C) ───────────────────────────────────── */}
        {displaySnapshot && (
          <div style={{
            background: '#0f1117',
            border: '1px solid #1e2230',
            borderLeft: '3px solid #a259ff',
            borderRadius: '0 8px 8px 0',
            padding: '16px 20px',
            marginBottom: '32px',
          }}>
            <div style={{
              fontFamily: 'Space Mono, monospace', fontSize: '9px',
              textTransform: 'uppercase', letterSpacing: '0.14em',
              color: '#a259ff', marginBottom: '10px',
            }}>
              {displayMeta?.period ? `${displayMeta.period} Snapshot` : 'Quarter Snapshot'}
            </div>
            <div style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '14px', color: '#c8cedd', lineHeight: 1.65 }}>
              <ReactMarkdown
                components={{
                  p: ({ ...props }) => <span {...props} />,
                  strong: ({ ...props }) => (
                    <strong style={{ color: '#e2e6f0', fontWeight: 600 }} {...props} />
                  ),
                }}
              >
                {displaySnapshot}
              </ReactMarkdown>
            </div>
          </div>
        )}

        {/* ── Divider before narrative ────────────────────────────────────── */}
        {(displaySnapshot || displayNarrative) && (
          <div style={{ height: '1px', background: '#1e2230', marginBottom: '32px' }} />
        )}

        {/* ── Narrative ──────────────────────────────────────────────────── */}
        {displayNarrative && (
          <div style={{ fontFamily: 'DM Sans, sans-serif' }}>
            <ReactMarkdown
              components={{
                h2: ({ children, ...props }) => {
                  const text = String(children ?? '');
                  const isBull = text.toLowerCase().includes('bull');
                  const isBear = text.toLowerCase().includes('bear');
                  const color  = isBull ? '#00e676' : isBear ? '#ff4b6e' : '#e2e6f0';
                  const bgTint = isBull ? '#00e67608' : isBear ? '#ff4b6e08' : 'transparent';
                  const borderTint = isBull ? '1px solid #00e67620' : isBear ? '1px solid #ff4b6e20' : '1px solid #1e2230';

                  return (
                    <div style={{
                      background: bgTint, border: borderTint,
                      borderRadius: '8px', padding: '14px 18px',
                      marginTop: '28px', marginBottom: '14px',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '13px' }}>
                          {isBull ? '📈' : isBear ? '📉' : text.toLowerCase().includes('catalyst') ? '⚡' : '📋'}
                        </span>
                        <h2 style={{
                          fontFamily: 'Space Mono, monospace', fontSize: '11px',
                          fontWeight: 700, textTransform: 'uppercase',
                          letterSpacing: '0.12em', color, margin: 0,
                        }} {...props}>
                          {children}
                        </h2>
                      </div>
                    </div>
                  );
                },
                p: ({ ...props }) => (
                  <p style={{ marginBottom: '14px', lineHeight: 1.75, fontSize: '14.5px', color: '#c8cedd' }} {...props} />
                ),
                strong: ({ ...props }) => (
                  <strong style={{ color: '#e2e6f0', fontWeight: 600 }} {...props} />
                ),
                li: ({ ...props }) => (
                  <li style={{ marginBottom: '8px', marginLeft: '20px', lineHeight: 1.6, fontSize: '14px', color: '#c8cedd' }} {...props} />
                ),
              }}
            >
              {displayNarrative}
            </ReactMarkdown>
            {isRunning && (
              <span style={{
                display: 'inline-block', width: '8px', height: '16px',
                backgroundColor: '#00c8ff', marginLeft: '4px',
                animation: 'blink 1s infinite',
              }} />
            )}
          </div>
        )}

        {/* ── Empty state ─────────────────────────────────────────────────── */}
        {!displayNarrative && !isBusy && (
          <div style={{ textAlign: 'center', color: '#8b93a8', padding: '60px 20px', fontFamily: 'DM Sans, sans-serif' }}>
            {displayErr
              ? 'Analysis failed — check the error above and try again.'
              : 'Click "Run Analysis" to generate an AI-powered earnings breakdown.'}
          </div>
        )}

        {/* ── Re-run button (bottom) ──────────────────────────────────────── */}
        {isAdmin && hasCached && !isBusy && (
          <div style={{
            display: 'flex', justifyContent: 'flex-end',
            marginTop: '48px', paddingTop: '20px',
            borderTop: '1px solid #1e2230',
          }}>
            <button
              onClick={handleRunAnalysis}
              style={{
                fontFamily: 'Space Mono, monospace', fontSize: '11px',
                fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em',
                padding: '10px 20px', background: 'transparent',
                border: '1px solid #1e2230', borderRadius: '6px',
                color: '#8b93a8', cursor: 'pointer', transition: 'all 0.15s',
              }}
              onMouseEnter={e => {
                (e.target as HTMLButtonElement).style.borderColor = '#a259ff';
                (e.target as HTMLButtonElement).style.color = '#a259ff';
              }}
              onMouseLeave={e => {
                (e.target as HTMLButtonElement).style.borderColor = '#1e2230';
                (e.target as HTMLButtonElement).style.color = '#8b93a8';
              }}
            >
              ↺ Re-run Analysis
            </button>
          </div>
        )}
      </div>

      {/* ── Re-run confirmation modal ─────────────────────────────────────── */}
      {isAdmin && showConfirmModal && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 50,
            backgroundColor: 'rgba(0,0,0,0.75)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '24px',
          }}
          onClick={() => setShowConfirmModal(false)}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              backgroundColor: '#0f1117',
              border: '1px solid #1e2230',
              borderRadius: '8px',
              padding: '28px 32px',
              maxWidth: '420px',
              width: '100%',
            }}
          >
            <div style={{ fontFamily: 'Space Mono, monospace', fontSize: '13px', letterSpacing: '0.08em', color: '#e2e4ef', marginBottom: '12px' }}>
              RE-RUN ANALYSIS?
            </div>
            <p style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '14px', color: '#8b93a8', lineHeight: 1.6, margin: '0 0 8px 0' }}>
              This will fetch the latest SEC filing and run two AI calls, overwriting the cached analysis.
            </p>
            <p style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '14px', color: '#8b93a8', lineHeight: 1.6, margin: '0 0 24px 0' }}>
              Earnings are reported quarterly — if no new report has been filed since the last run, the output will not change.
            </p>
            {storedAnalysis?.analyzedAt && (
              <div style={{ fontFamily: 'Space Mono, monospace', fontSize: '10px', letterSpacing: '0.06em', color: '#3d4259', marginBottom: '20px' }}>
                LAST RUN: {formatAge(storedAnalysis.analyzedAt).toUpperCase()}
              </div>
            )}
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => { setShowConfirmModal(false); executeAnalysis(); }}
                style={{
                  flex: 1,
                  backgroundColor: '#00c8ff', color: '#08090d',
                  padding: '9px 16px', borderRadius: '6px', border: 'none',
                  fontFamily: 'Space Mono, monospace', fontSize: '11px',
                  letterSpacing: '0.07em', fontWeight: 700, cursor: 'pointer',
                }}
              >
                YES, RE-RUN
              </button>
              <button
                onClick={() => setShowConfirmModal(false)}
                style={{
                  flex: 1,
                  backgroundColor: 'transparent', color: '#8b93a8',
                  padding: '9px 16px', borderRadius: '6px',
                  border: '1px solid #1e2230',
                  fontFamily: 'Space Mono, monospace', fontSize: '11px',
                  letterSpacing: '0.07em', cursor: 'pointer',
                }}
              >
                CANCEL
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
        @keyframes blink  { 0%, 49% { opacity: 1; } 50%, 100% { opacity: 0; } }
      `}</style>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function GuidanceBadge({ dir }: { dir: string }) {
  const styles: Record<string, { color: string; bg: string; border: string; label: string }> = {
    Raised:     { color: '#00e676', bg: '#00e67618', border: '#00e67630', label: '▲ Raised' },
    Maintained: { color: '#8b93a8', bg: '#8b93a818', border: '#8b93a830', label: '→ Maintained' },
    Lowered:    { color: '#ff4b6e', bg: '#ff4b6e18', border: '#ff4b6e30', label: '▼ Lowered' },
    Initiated:  { color: '#00c8ff', bg: '#00c8ff18', border: '#00c8ff30', label: '● Initiated' },
  };
  const s = styles[dir] ?? styles['Maintained'];
  return (
    <span style={{
      fontFamily: 'Space Mono, monospace', fontSize: '9px', fontWeight: 700,
      textTransform: 'uppercase', letterSpacing: '0.1em',
      padding: '2px 8px', borderRadius: '4px',
      color: s.color, background: s.bg, border: `1px solid ${s.border}`,
    }}>
      {s.label}
    </span>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtMarketCap(val: number): string {
  if (val >= 1e12) return `$${(val / 1e12).toFixed(2)}T`;
  if (val >= 1e9)  return `$${(val / 1e9).toFixed(1)}B`;
  if (val >= 1e6)  return `$${(val / 1e6).toFixed(0)}M`;
  return `$${val.toLocaleString()}`;
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

function mapConvictionToRating(c: string | null): AnalystRating | undefined {
  if (!c) return undefined;
  const map: Record<string, AnalystRating> = {
    strong_buy: 'Strong Buy', buy: 'Buy', hold: 'Hold', sell: 'Sell', strong_sell: 'Strong Sell',
  };
  return map[c];
}

function ratingToConviction(r: AnalystRating): string {
  const map: Record<AnalystRating, string> = {
    'Strong Buy': 'strong_buy', 'Buy': 'buy', 'Hold': 'hold', 'Sell': 'sell', 'Strong Sell': 'strong_sell',
  };
  return map[r] ?? 'hold';
}