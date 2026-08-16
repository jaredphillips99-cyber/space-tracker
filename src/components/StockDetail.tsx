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
  cyber:             '#ff4b6e',
};
const SECTOR_LABEL_MAP: Record<string, string> = {
  space:             'Space',
  ai_infrastructure: 'AI Infra',
  defense:           'Defense',
  clean_energy:      'Clean Energy',
  cyber:             'Cyber',
};

// ─── CIK map ──────────────────────────────────────────────────────────────────

const CIK_MAP: Record<string, string> = {
  RKLB: '0001819994', PL:   '0001836833', RDW:  '0001819810',
  LUNR: '0001844452', ASTS: '0001780312', KTOS: '0001069258',
  BKSY: '0001753539', FLY:  '0001860160',
  NVDA: '0001045810', PLTR: '0001321655', CRWV: '0001769628',
  IREN: '0001878848', NBIS: '0001513845', CIFR: '0001819989',
  RIOT: '0001167419', VRT:  '0001674101', MOD:  '0000067347',
  CEG:  '0001868275', VST:  '0001692819', BWXT: '0001486957',
  GEV:  '0001996810', BE:   '0001664703', CCJ:  '0001009001',
  LEU:  '0001065059', NXE:  '0001698535', OKLO: '0001849056',
  NNE:  '0001923891', LHX:  '0000202058', AVAV: '0001368622',
  SPCX: '0001181412', MSFT: '0000789019', GOOGL: '0001652044',
  AMZN: '0001018724', META: '0001326801', ANET: '0001596532',
  MU:   '0000723125', SMCI: '0001375365', AVGO: '0001730168',
  INTC: '0000050863', DELL: '0001571996', PWR:  '0001050915',
  ETN:  '0001551182', EQIX: '0001101239', GNRC: '0001474735',
  CRWD: '0001535527', PANW: '0001327567', NET:  '0001477333',
  ZS:   '0001713683', FTNT: '0001262039',
};

// SPECULATIVE = which filings to FETCH (both most-recent 8-K + most-recent 10-Q),
// NOT which prompt framing to use. Prompt framing (pre-revenue/milestone vs.
// standard earnings) is now auto-detected per analysis run via the
// filingShowsRevenue() heuristic → hasReportedRevenue flag, so a name never
// needs manual removal from this set once it starts reporting revenue.
const SPECULATIVE          = new Set(['OKLO', 'NNE', 'NXE']);
const SEDAR_ONLY           = new Set(['NXE']);

// ─── Filing regime ────────────────────────────────────────────────────────────
//
// Which SEC form carries a company's earnings release. Domestic issuers file an
// 8-K item 2.02; foreign private issuers file a 6-K and have no 8-K on EDGAR at
// all, so the domestic lookup finds nothing for them.
//
// This is a PARALLEL axis to SPECULATIVE / SEDAR_ONLY, not a replacement:
// SPECULATIVE controls how many filings to fetch, regime controls which form to
// look for. A ticker could be both — nothing here assumes exclusivity.
//
// To support a new foreign-domiciled ticker, add one FILING_REGIME entry and one
// FPI_CONFIG entry. No other file changes.

type FilingRegime = 'domestic' | 'foreign_private_issuer' | 'sedar_only';

interface FPIConfig {
  // The issuer's annual report form — fallback target when no 6-K is on file.
  annualForm: '20-F' | '40-F';
  // Case-insensitive substrings matched against each index row's description
  // and filename. EDGAR filers mangle exhibit filenames inconsistently
  // (nbis-…xex99d1.htm vs. d307413dex991.htm), so the index's "EX-99.1"
  // description is the reliable signal and filename variants are backup.
  exhibitHints: string[];
}

const FILING_REGIME: Record<string, FilingRegime> = {
  NBIS: 'foreign_private_issuer',  // Nebius Group N.V. — Dutch, 6-K + 20-F
  // future FPIs added here — single line each, no other file touched.
  // Note: CCJ (Cameco) is also a 6-K filer but is deliberately NOT enabled
  // here — it keeps its existing training-knowledge-only system prompt in
  // api/analyze.ts. Turning on automated fetch for it is a separate decision.
};

const FPI_EXHIBIT_HINTS = ['ex-99.1', 'ex99.1', 'ex99-1', 'ex99d1', 'ex991'];

const FPI_CONFIG: Record<string, FPIConfig> = {
  NBIS: { annualForm: '20-F', exhibitHints: FPI_EXHIBIT_HINTS },
};

// SEDAR_ONLY stays the authority for its own tickers so the two never diverge.
function filingRegimeFor(ticker: string): FilingRegime {
  if (SEDAR_ONLY.has(ticker)) return 'sedar_only';
  return FILING_REGIME[ticker] ?? 'domestic';
}

// Which form(s) the UI should say it pulled, derived from the regime rather
// than assuming 8-K.
function filingFormLabel(ticker: string): string | null {
  const regime = filingRegimeFor(ticker);
  if (regime === 'sedar_only') return null;
  if (regime === 'foreign_private_issuer') return '6-K';
  return SPECULATIVE.has(ticker) ? '8-K + 10-Q' : '8-K';
}

// Deterministic, zero-Claude-cost revenue detection against fetched filing text.
// Returns true when the filing reports a real (non-zero) revenue line — used to
// switch prompt framing away from pre-revenue/milestone automatically.
function filingShowsRevenue(text: string): boolean {
  // Look for a real reported revenue line: a dollar figure adjacent to
  // "revenue" / "total revenue" / "net sales" that is NOT explicitly zero /
  // "no revenue" / "pre-revenue" / "have not generated any revenue".
  const noRevenuePatterns = /have not generated (any )?revenue|no revenue to date|pre-revenue/i;
  if (noRevenuePatterns.test(text)) return false;
  const revenueLine = /(total revenue|net sales|revenues?)[^.\n]{0,80}\$[\d,]+(\.\d+)?\s*(million|billion|thousand)?/i;
  return revenueLine.test(text);
}

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
  return findFilings(sub, form, requireItem, 1)[0] ?? null;
}

// 6-Ks (unlike 8-Ks) carry no "items" code distinguishing an earnings release
// from a routine press release, so callers that need to tell them apart pull
// several and inspect the actual filed content.
function findFilings(sub: EdgarSubmission, form: string, requireItem?: string, limit = 1) {
  const r = sub.filings.recent;
  const out: {
    filingDate: string; accessionNumber: string; period: string;
    items: string; primaryDocument: string;
  }[] = [];
  for (let i = 0; i < r.form.length && out.length < limit; i++) {
    if (r.form[i] !== form) continue;
    if (requireItem && !(r.items[i] ?? '').includes(requireItem)) continue;
    out.push({
      filingDate:      r.filingDate[i],
      accessionNumber: r.accessionNumber[i],
      period:          r.reportDate[i],
      items:           r.items[i] ?? '',
      primaryDocument: (r.primaryDocument ?? [])[i] ?? '',
    });
  }
  return out;
}

// Distinguishes an earnings/financial-results 6-K from routine FPI press
// releases (deal announcements, executive changes, registration statements —
// all also filed as 6-K, interleaved with earnings on the same filer).
function looksLikeEarningsFiling(text: string): boolean {
  return /(three|six|nine|twelve)\s+months\s+ended|results of operations|financial (results|statements)|management'?s?\s+discussion|quarterly (report|results)|reports?\s+(first|second|third|fourth)\s+quarter|full\s+year\s+results/i.test(text);
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
    // Everything goes through the proxy — data.sec.gov included — so SEC always
    // receives the declared User-Agent it requires.
    const res = await fetch(`/api/edgar-proxy?url=${encodeURIComponent(url)}`);
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

// ─── Foreign private issuer path ──────────────────────────────────────────────

interface IndexEntry {
  description: string;
  filename:    string;
  url:         string;
}

// Parses a filing index page into its document rows. The table layout is
// Seq · Description · Document · Type · Size — both Description and Type carry
// the exhibit label (e.g. "EX-99.1"), so both feed the hint match.
function parseIndexEntries(html: string, root: string): IndexEntry[] {
  const entries: IndexEntry[] = [];
  for (const rowMatch of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const row  = rowMatch[1];
    const href = row.match(/href\s*=\s*["']([^"']+\.html?)["']/i)?.[1];
    if (!href || !href.includes('/Archives/')) continue;

    const cells = Array.from(row.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi))
      .map(c => stripHtml(c[1]));

    entries.push({
      description: [cells[1], cells[3]].filter(Boolean).join(' '),
      filename:    href.split('/').pop() ?? '',
      url:         href.startsWith('/') ? root + href : href,
    });
  }
  return entries;
}

async function resolveForeignExhibitUrl(
  cikNum: number,
  accessionNumber: string,
  exhibitHints: string[],
): Promise<string | null> {
  const SEC_ROOT  = 'https://www.sec.gov';
  const accNodash = accessionNumber.replace(/-/g, '');
  const indexUrl  = `${SEC_ROOT}/Archives/edgar/data/${cikNum}/${accNodash}/${accessionNumber}-index.htm`;

  const html = await secFetch(indexUrl);
  if (!html) return null;

  const entries = parseIndexEntries(html, SEC_ROOT);
  if (entries.length === 0) return null;

  const hints = exhibitHints.map(h => h.toLowerCase());
  const match = entries.find(e =>
    hints.some(h => `${e.description} ${e.filename}`.toLowerCase().includes(h)),
  );
  if (match) return match.url;

  // Entry 0 is the cover document (the 6-K shell itself), which carries no
  // financials — prefer the first attached exhibit when no hint matched.
  const fallback = entries[1] ?? entries[0];
  console.warn(
    `[edgar] No exhibit hint matched in ${accessionNumber} — falling back to ${fallback.filename}`,
  );
  return fallback.url;
}

// How many of the most recent 6-Ks to inspect before giving up on finding an
// earnings-shaped one. FPIs commonly interleave deal/exec/registration press
// releases with quarterly results under the same form, so "most recent 6-K"
// alone is not reliable — bounded to cap worst-case network round-trips.
const SIX_K_SCAN_LIMIT = 5;

// Shared across every foreign private issuer — no per-ticker logic. Scans the
// most recent 6-Ks for one that reads as an earnings release; the annual
// report (20-F/40-F) is the fallback when a filer has no 6-K on record at all.
async function fetchForeignIssuerFiling(
  ticker: string,
  cik: string,
  config: FPIConfig,
): Promise<RunPayload> {
  const subJson = await secFetch(`https://data.sec.gov/submissions/CIK${cik}.json`);
  if (!subJson) throw new Error(`Failed to fetch SEC submission index for ${ticker}`);

  let sub: EdgarSubmission;
  try {
    sub = JSON.parse(subJson) as EdgarSubmission;
  } catch {
    throw new Error(`Malformed SEC submission index for ${ticker}`);
  }

  const cikNum = parseInt(sub.cik, 10);
  if (!cikNum) throw new Error(`Invalid CIK in submission response: ${sub.cik}`);

  const candidates = findFilings(sub, '6-K', undefined, SIX_K_SCAN_LIMIT);
  const annual      = candidates.length === 0 ? findFiling(sub, config.annualForm) : null;
  if (candidates.length === 0 && !annual) {
    throw new Error(`No 6-K or ${config.annualForm} filing found for ${ticker}`);
  }

  let fallback: { filing: (typeof candidates)[number]; docUrl: string; text: string } | null = null;

  for (const filing of candidates) {
    const docUrl = await resolveForeignExhibitUrl(cikNum, filing.accessionNumber, config.exhibitHints);
    if (!docUrl) continue;
    const rawDoc = await secFetch(docUrl);
    if (!rawDoc) continue;
    const text = stripHtml(rawDoc).substring(0, 80000);
    if (!text) continue;

    if (!fallback) fallback = { filing, docUrl, text };
    if (looksLikeEarningsFiling(text)) {
      return buildFpiPayload(ticker, filing.filingDate, filing.period, docUrl, text);
    }
  }

  if (fallback) {
    console.warn(
      `[edgar] No earnings-shaped 6-K found in the last ${SIX_K_SCAN_LIMIT} filings for ${ticker} — using most recent 6-K (${fallback.filing.filingDate}) as-is.`,
    );
    return buildFpiPayload(ticker, fallback.filing.filingDate, fallback.filing.period, fallback.docUrl, fallback.text);
  }

  if (annual) {
    const docUrl = await resolveForeignExhibitUrl(cikNum, annual.accessionNumber, config.exhibitHints);
    const text = docUrl ? stripHtml((await secFetch(docUrl)) ?? '').substring(0, 80000) : '';
    if (docUrl && text) {
      return buildFpiPayload(ticker, annual.filingDate, annual.period, docUrl, text);
    }
  }

  throw new Error(`Could not retrieve a readable 6-K or ${config.annualForm} filing for ${ticker}`);
}

function buildFpiPayload(
  ticker: string,
  filingDate: string,
  period: string,
  docUrl: string,
  text: string,
): RunPayload {
  // Regimes are independent axes — an FPI can also be speculative.
  const isSpeculative = SPECULATIVE.has(ticker);
  return {
    ticker,
    earningsText:  text,
    isSpeculative,
    hasReportedRevenue: isSpeculative ? filingShowsRevenue(text) : false,
    filingMeta: {
      filingDate,
      period,
      documentUrl: docUrl,
      isSedarOnly: false,
      sources:     null,
      note:        null,
    },
  };
}

async function fetchEdgarInBrowser(ticker: string): Promise<RunPayload> {
  if (SEDAR_ONLY.has(ticker)) {
    return {
      ticker,
      earningsText:  `${ticker} is a Canadian company that files on SEDAR, not SEC EDGAR. Use your training knowledge for analysis.`,
      isSpeculative: true,
      hasReportedRevenue: false,
      filingMeta: {
        filingDate: null, period: null, documentUrl: null,
        isSedarOnly: true, sources: null,
        note: 'NXE files on SEDAR. Analysis based on training knowledge only.',
      },
    };
  }

  const cik = CIK_MAP[ticker];
  if (!cik) throw new Error(`Unknown ticker: ${ticker}`);

  // Foreign private issuers file no 8-K at all — route them before the
  // domestic item 2.02 lookup, which would otherwise always come up empty.
  if (filingRegimeFor(ticker) === 'foreign_private_issuer') {
    const config = FPI_CONFIG[ticker];
    if (!config) throw new Error(`Missing FPI config for ${ticker}`);
    return fetchForeignIssuerFiling(ticker, cik, config);
  }

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

    const [eightKTextRaw, tenQTextRaw] = await Promise.all([
      eightKFiling ? fetchExhibit(eightKFiling, false) : Promise.resolve(null),
      tenQFiling   ? fetchExhibit(tenQFiling,   true)  : Promise.resolve(null),
    ]);

    // Cap EACH section BEFORE concatenation so a large 8-K can never truncate
    // the 10-Q (or vice versa) once the combined text hits api/analyze.ts's
    // front-truncation ceiling. tenQText is already MD&A-extracted (≤20k), so
    // 40k is generous headroom.
    const EIGHT_K_CAP = 15000;
    const TEN_Q_CAP   = 40000;
    const eightKText = eightKTextRaw ? eightKTextRaw.substring(0, EIGHT_K_CAP) : null;
    const tenQText   = tenQTextRaw   ? tenQTextRaw.substring(0, TEN_Q_CAP)     : null;

    // Build the two labelled sections, then order them most-recent-first by
    // actual filing date so whichever filing is newest is never the one at
    // risk of front-truncation downstream.
    const eightKSection = eightKText
      ? `=== MOST RECENT 8-K ===\nFiled: ${eightKFiling!.filingDate}\n\n${eightKText}`
      : null;
    const tenQSection = tenQText
      ? `=== MOST RECENT 10-Q (MD&A) ===\nFiled: ${tenQFiling!.filingDate}\n\n${tenQText}`
      : null;

    const eightKNewer =
      !!eightKFiling && !!tenQFiling
        ? (eightKFiling.filingDate >= tenQFiling.filingDate)
        : !!eightKFiling; // if only one exists, it leads trivially

    const orderedSections = (eightKNewer
      ? [eightKSection, tenQSection]
      : [tenQSection, eightKSection]
    ).filter(Boolean) as string[];

    const combined = orderedSections.join('\n\n');
    if (!combined) throw new Error('Could not retrieve any EDGAR filings');

    // filingMeta reflects whichever filing is ACTUALLY most recent (not always
    // the 8-K), so the "Filed" date/period in the UI matches the newest filing.
    const mostRecent =
      !eightKFiling ? tenQFiling :
      !tenQFiling   ? eightKFiling :
      eightKFiling.filingDate >= tenQFiling.filingDate ? eightKFiling : tenQFiling;

    // Auto-detect revenue against the combined fetched text (post-cap). If the
    // most recent filing reports real revenue, the analysis run switches to
    // standard earnings framing — no manual SPECULATIVE-set edit required.
    const hasReportedRevenue = filingShowsRevenue(combined);

    return {
      ticker,
      earningsText:  combined,
      isSpeculative: true,
      hasReportedRevenue,
      filingMeta: {
        filingDate:  mostRecent?.filingDate ?? null,
        period:      mostRecent?.period ?? null,
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
    hasReportedRevenue: false, // not evaluated for non-speculative tickers
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
        // Record the filing we just analyzed so freshness tracking reflects
        // this earnings period immediately, without waiting on a Supabase
        // round-trip (rowToAnalysis maps filing_date → lastEarningsDate on sync).
        lastEarningsDate:  meta.filingDate ?? undefined,
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
  const filingForm    = filingFormLabel(ticker.toUpperCase());

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
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg-base)', color: 'var(--text-primary)', fontFamily: 'DM Sans, sans-serif' }}>
      <div style={{ maxWidth: '860px', margin: '0 auto', padding: '32px 24px 80px' }}>

        {/* ── Back nav ───────────────────────────────────────────────────── */}
        <button
          onClick={() => navigate('/dashboard')}
          style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            background: 'none', border: 'none', cursor: 'pointer',
            fontFamily: 'Space Mono, monospace', fontSize: '11px',
            color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em',
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
                    color: SECTOR_COLOR_MAP[sector] ?? 'var(--text-secondary)',
                    border: `1px solid ${(SECTOR_COLOR_MAP[sector] ?? 'var(--text-secondary)') + '40'}`,
                    background: (SECTOR_COLOR_MAP[sector] ?? 'var(--text-secondary)') + '15',
                  }}
                >
                  {SECTOR_LABEL_MAP[sector] ?? sector}
                </span>
              ))}
            </div>
            {/* Company name */}
            {companyName && (
              <div style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '14px', color: 'var(--text-secondary)' }}>
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
          background: 'var(--bg-surface)', border: '1px solid var(--border)',
          borderRadius: '10px', overflow: 'hidden', marginBottom: '20px',
        }}>
          {/* Analyst Target */}
          <div style={{ flex: 1, padding: '14px 20px', borderRight: '1px solid var(--border)' }}>
            <div style={{ fontFamily: 'Space Mono, monospace', fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-secondary)', marginBottom: '4px' }}>
              Analyst Target
            </div>
            <div style={{ fontFamily: 'Space Mono, monospace', fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
              {yahooTarget != null ? `$${yahooTarget.toFixed(2)}` : '—'}
            </div>
            <div style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
              Consensus
            </div>
          </div>

          {/* Implied Upside */}
          <div style={{ flex: 1, padding: '14px 20px', borderRight: '1px solid var(--border)' }}>
            <div style={{ fontFamily: 'Space Mono, monospace', fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-secondary)', marginBottom: '4px' }}>
              Implied Upside
            </div>
            <div style={{
              fontFamily: 'Space Mono, monospace', fontSize: '15px', fontWeight: 700,
              color: impliedUpside == null ? 'var(--text-muted)' : impliedUpside >= 0 ? '#00e676' : '#ff4b6e',
            }}>
              {impliedUpside == null ? '—' : `${impliedUpside >= 0 ? '+' : ''}${impliedUpside.toFixed(1)}%`}
            </div>
            <div style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
              vs. current price
            </div>
          </div>

          {/* Market Cap */}
          <div style={{ flex: 1, padding: '14px 20px', borderRight: '1px solid var(--border)' }}>
            <div style={{ fontFamily: 'Space Mono, monospace', fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-secondary)', marginBottom: '4px' }}>
              Market Cap
            </div>
            <div style={{ fontFamily: 'Space Mono, monospace', fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
              {yahooMarketCap != null ? fmtMarketCap(yahooMarketCap) : '—'}
            </div>
            <div style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
              &nbsp;
            </div>
          </div>

          {/* 52-Week Range */}
          <div style={{ flex: 1, padding: '14px 20px' }}>
            <div style={{ fontFamily: 'Space Mono, monospace', fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-secondary)', marginBottom: '4px' }}>
              52-Week Range
            </div>
            <div style={{ fontFamily: 'Space Mono, monospace', fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>
              {fiftyTwoLow && fiftyTwoHigh
                ? `$${fiftyTwoLow.toFixed(2)} – $${fiftyTwoHigh.toFixed(2)}`
                : '—'}
            </div>
            {rangePosition != null && (
              <div style={{ marginTop: '6px' }}>
                <div style={{ width: '100%', height: '4px', background: 'var(--border)', borderRadius: '2px', position: 'relative' }}>
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
          color: 'var(--text-secondary)', marginBottom: '24px',
          textTransform: 'uppercase', letterSpacing: '0.06em',
        }}>
          {(isLiveOrDone || hasCached) && (
            <>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#00e676', flexShrink: 0, display: 'inline-block' }} />
              {displayMeta?.period    && <span>{displayMeta.period} Earnings</span>}
              {displayMeta?.filingDate && <span style={{ color: 'var(--text-dim)' }}>·</span>}
              {displayMeta?.filingDate && filingForm && (
                <span style={{
                  color: 'var(--text-secondary)',
                  border: '1px solid var(--border)',
                  padding: '1px 6px', borderRadius: '4px',
                }}>
                  {filingForm}
                </span>
              )}
              {displayMeta?.filingDate && <span>Filed {displayMeta.filingDate}</span>}
              {displayMeta?.documentUrl && (
                <>
                  <span style={{ color: 'var(--text-dim)' }}>·</span>
                  <a href={displayMeta.documentUrl} target="_blank" rel="noopener noreferrer"
                    style={{ color: '#00c8ff', textDecoration: 'none' }}>
                    SEC Filing ↗
                  </a>
                </>
              )}
              {guidanceDir && (
                <>
                  <span style={{ color: 'var(--text-dim)' }}>·</span>
                  <span>Guidance</span>
                  <GuidanceBadge dir={guidanceDir} />
                </>
              )}
              {hasCached && !isBusy && storedAnalysis?.analyzedAt && (
                <>
                  <span style={{ color: 'var(--text-dim)' }}>·</span>
                  <span style={{ color: 'var(--text-dim)' }}>Cached {formatAge(storedAnalysis.analyzedAt)}</span>
                </>
              )}
              {displayMeta?.isSpeculative && displayMeta?.hasReportedRevenue && (
                <>
                  <span style={{ color: 'var(--text-dim)' }}>·</span>
                  <span style={{
                    color: '#00e676',
                    border: '1px solid #00e67640',
                    background: '#00e67615',
                    padding: '1px 8px', borderRadius: '4px',
                    textTransform: 'none', letterSpacing: 'normal',
                  }}>
                    Now reporting revenue — standard earnings framing applied
                  </span>
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
                backgroundColor: isBusy ? 'var(--border)' : '#00c8ff',
                color: isBusy ? 'var(--text-secondary)' : '#08090d',
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
            background: 'var(--bg-surface)', border: '1px solid var(--border)',
          }}>
            <span style={{
              display: 'inline-block', width: '8px', height: '8px',
              backgroundColor: '#00c8ff', borderRadius: '50%',
              animation: 'pulse 1.5s infinite',
            }} />
            <span style={{ color: 'var(--text-secondary)', fontFamily: 'DM Sans, sans-serif', fontSize: '14px' }}>
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
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
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
            <div style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '14px', color: 'var(--text-body)', lineHeight: 1.65 }}>
              <ReactMarkdown
                components={{
                  p: ({ ...props }) => <span {...props} />,
                  strong: ({ ...props }) => (
                    <strong style={{ color: 'var(--text-primary)', fontWeight: 600 }} {...props} />
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
          <div style={{ height: '1px', background: 'var(--border)', marginBottom: '32px' }} />
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
                  const color  = isBull ? '#00e676' : isBear ? '#ff4b6e' : 'var(--text-primary)';
                  const bgTint = isBull ? '#00e67608' : isBear ? '#ff4b6e08' : 'transparent';
                  const borderTint = isBull ? '1px solid #00e67620' : isBear ? '1px solid #ff4b6e20' : '1px solid var(--border)';

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
                  <p style={{ marginBottom: '14px', lineHeight: 1.75, fontSize: '14.5px', color: 'var(--text-body)' }} {...props} />
                ),
                strong: ({ ...props }) => (
                  <strong style={{ color: 'var(--text-primary)', fontWeight: 600 }} {...props} />
                ),
                li: ({ ...props }) => (
                  <li style={{ marginBottom: '8px', marginLeft: '20px', lineHeight: 1.6, fontSize: '14px', color: 'var(--text-body)' }} {...props} />
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
          <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '60px 20px', fontFamily: 'DM Sans, sans-serif' }}>
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
            borderTop: '1px solid var(--border)',
          }}>
            <button
              onClick={handleRunAnalysis}
              style={{
                fontFamily: 'Space Mono, monospace', fontSize: '11px',
                fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em',
                padding: '10px 20px', background: 'transparent',
                border: '1px solid var(--border)', borderRadius: '6px',
                color: 'var(--text-secondary)', cursor: 'pointer', transition: 'all 0.15s',
              }}
              onMouseEnter={e => {
                (e.target as HTMLButtonElement).style.borderColor = '#a259ff';
                (e.target as HTMLButtonElement).style.color = '#a259ff';
              }}
              onMouseLeave={e => {
                (e.target as HTMLButtonElement).style.borderColor = 'var(--border)';
                (e.target as HTMLButtonElement).style.color = 'var(--text-secondary)';
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
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              padding: '28px 32px',
              maxWidth: '420px',
              width: '100%',
            }}
          >
            <div style={{ fontFamily: 'Space Mono, monospace', fontSize: '13px', letterSpacing: '0.08em', color: 'var(--text-primary)', marginBottom: '12px' }}>
              RE-RUN ANALYSIS?
            </div>
            <p style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.6, margin: '0 0 8px 0' }}>
              This will fetch the latest SEC filing and run two AI calls, overwriting the cached analysis.
            </p>
            <p style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.6, margin: '0 0 24px 0' }}>
              Earnings are reported quarterly — if no new report has been filed since the last run, the output will not change.
            </p>
            {storedAnalysis?.analyzedAt && (
              <div style={{ fontFamily: 'Space Mono, monospace', fontSize: '10px', letterSpacing: '0.06em', color: 'var(--text-dim)', marginBottom: '20px' }}>
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
                  backgroundColor: 'transparent', color: 'var(--text-secondary)',
                  padding: '9px 16px', borderRadius: '6px',
                  border: '1px solid var(--border)',
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
    Maintained: { color: 'var(--text-secondary)', bg: '#8b93a818', border: '#8b93a830', label: '→ Maintained' },
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