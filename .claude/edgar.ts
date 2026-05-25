import type { VercelRequest, VercelResponse } from '@vercel/node';

// ---------------------------------------------------------------------------
// Hardcoded CIK map — all 31 tickers. Avoids a live lookup round-trip and
// prevents mismatch from SEC's company_tickers.json ambiguities.
// Always zero-padded to 10 digits as EDGAR expects.
// ---------------------------------------------------------------------------
const CIK_MAP: Record<string, string> = {
  // Space
  RKLB: '0001819994',
  PL:   '0001836833',
  RDW:  '0001819810',
  LUNR: '0001844452',
  ASTS: '0001780312',
  KTOS: '0001069258',
  BKSY: '0001753539',
  FLY:  '0001860160',
  SATS: '0001415404',
  // AI Infrastructure
  NVDA: '0001045810',
  PLTR: '0001321655',
  CRWV: '0001769628',
  IREN: '0001878848',
  NBIS: '0001513845',
  CIFR: '0001819989',
  RIOT: '0001167419',
  VRT:  '0001674101',
  MOD:  '0000067347',
  // Clean Energy / Nuclear
  CEG:  '0001868275',
  VST:  '0001692819',
  BWXT: '0001486957',
  GEV:  '0001996810',
  BE:   '0001664703',
  CCJ:  '0001009001',
  LEU:  '0001065059',
  NXE:  '0001698535',
  OKLO: '0001849056',
  NNE:  '0001923891',
  // Defense
  LHX:  '0000202058',
  AVAV: '0001368622',
};

const EDGAR_BASE = 'https://www.sec.gov';
const DATA_BASE  = 'https://data.sec.gov';

// SEC requires a declared User-Agent. Format: AppName contact@email
const UA = 'SpaceTracker space-tracker@users.noreply.github.com';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface EdgarFilingResult {
  ticker: string;
  cik: string;
  filingDate: string;
  accessionNumber: string;
  period: string;
  items: string;
  documentUrl: string;
  documentText: string;
  wordCount: number;
}

interface ErrorResult {
  error: string;
  ticker?: string;
  detail?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function edgarFetch(url: string): Promise<Response> {
  return fetch(url, {
    headers: {
      'User-Agent': UA,
      'Accept': 'application/json, text/html, */*',
    },
  });
}

/**
 * Strip HTML tags and collapse whitespace.
 * EDGAR EX-99.1 files are usually HTML with inline CSS — we only want the text.
 */
function stripHtml(html: string): string {
  // Remove script / style blocks entirely
  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    // Remove all remaining tags
    .replace(/<[^>]+>/g, ' ')
    // Decode common HTML entities
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#160;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#8211;/g, '–')
    .replace(/&#8212;/g, '—')
    .replace(/&#8216;|&#8217;/g, "'")
    .replace(/&#8220;|&#8221;/g, '"')
    // Collapse runs of whitespace / newlines
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return text;
}

/**
 * Find the most recent earnings 8-K from a CIK's submissions JSON.
 * Earnings 8-Ks carry item "2.02" (Results of Operations and Financial Condition).
 * We also accept item "2.02,9.01" etc.
 */
async function findLatestEarnings8K(cik: string): Promise<{
  filingDate: string;
  accessionNumber: string;
  period: string;
  items: string;
} | null> {
  const url = `${DATA_BASE}/submissions/CIK${cik}.json`;
  const res = await edgarFetch(url);
  if (!res.ok) throw new Error(`EDGAR submissions fetch failed: ${res.status}`);

  const data: any = await res.json();
  const recent = data?.filings?.recent;
  if (!recent) throw new Error('No recent filings in EDGAR response');

  const forms   = recent.form          as string[];
  const dates   = recent.filingDate    as string[];
  const accnums = recent.accessionNumber as string[];
  const items   = recent.items         as string[];
  const periods = recent.reportDate    as string[];

  // Walk most-recent-first (EDGAR returns newest first)
  for (let i = 0; i < forms.length; i++) {
    if (forms[i] !== '8-K') continue;
    const itemStr = items[i] ?? '';
    if (!itemStr.includes('2.02')) continue;

    return {
      filingDate:      dates[i],
      accessionNumber: accnums[i],
      period:          periods?.[i] ?? dates[i],
      items:           itemStr,
    };
  }

  return null; // no earnings 8-K in the recent batch
}

/**
 * Given an accession number and numeric CIK, find the EX-99.1 document URL
 * by scraping the filing index page.
 *
 * EDGAR filing index URL pattern:
 *   https://www.sec.gov/Archives/edgar/data/{numericCIK}/{accNoNoDashes}/
 */
async function findEx991Url(cik: string, accessionNumber: string): Promise<string | null> {
  // CIK with leading zeros → strip for the Archives path
  const numericCik = String(parseInt(cik, 10));
  const accNoDashes = accessionNumber.replace(/-/g, '');
  const indexUrl = `${EDGAR_BASE}/Archives/edgar/data/${numericCik}/${accNoDashes}/`;

  const res = await edgarFetch(indexUrl);
  if (!res.ok) throw new Error(`Filing index fetch failed: ${res.status} — ${indexUrl}`);
  const html = await res.text();

  // Find links to EX-99.1 (press release / earnings release)
  // Pattern: href="/Archives/edgar/data/.../something-ex991.htm"
  // Also matches: ex99_1.htm, ex99-1.htm, exhibit991.htm, etc.
  const linkPattern = /href="([^"]*(?:ex[-_]?99[-_.]?1|exhibit[-_]?99[-_.]?1)[^"]*)"/gi;
  const matches: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = linkPattern.exec(html)) !== null) {
    const href = m[1];
    // Exclude .txt wrappers and the index itself
    if (href.endsWith('.htm') || href.endsWith('.html')) {
      matches.push(href);
    }
  }

  if (matches.length === 0) return null;

  // Prefer the shortest match (avoids picking up amended versions like ex99-1a.htm)
  matches.sort((a, b) => a.length - b.length);
  const href = matches[0];

  // href may be relative (/Archives/...) or absolute
  return href.startsWith('http') ? href : `${EDGAR_BASE}${href}`;
}

/**
 * Fetch the EX-99.1 HTML and return clean plain text.
 * Truncates at ~80 000 characters to stay within Claude's context safely.
 */
async function fetchDocumentText(url: string): Promise<string> {
  const res = await edgarFetch(url);
  if (!res.ok) throw new Error(`EX-99.1 fetch failed: ${res.status} — ${url}`);
  const html = await res.text();
  const text = stripHtml(html);
  // 80 k chars ≈ ~20 k tokens — plenty for an earnings release
  return text.length > 80_000 ? text.slice(0, 80_000) + '\n\n[truncated]' : text;
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only allow GET
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const ticker = (req.query.ticker as string | undefined)?.toUpperCase().trim();

  if (!ticker) {
    return res.status(400).json({ error: 'Missing ?ticker= query param' });
  }

  const cik = CIK_MAP[ticker];
  if (!cik) {
    return res.status(404).json({
      error: `Ticker ${ticker} not in the Space Tracker universe`,
      ticker,
    } satisfies ErrorResult);
  }

  try {
    // 1. Find the latest earnings 8-K
    const filing = await findLatestEarnings8K(cik);
    if (!filing) {
      return res.status(404).json({
        error: `No earnings 8-K (item 2.02) found for ${ticker} in EDGAR's recent filings`,
        ticker,
        detail: 'Some companies may report via different items or the filing may be in older batches.',
      } satisfies ErrorResult);
    }

    // 2. Locate the EX-99.1 press release within that filing
    const docUrl = await findEx991Url(cik, filing.accessionNumber);
    if (!docUrl) {
      return res.status(404).json({
        error: `Found earnings 8-K for ${ticker} (${filing.filingDate}) but could not locate EX-99.1`,
        ticker,
        detail: `Accession: ${filing.accessionNumber}`,
      } satisfies ErrorResult);
    }

    // 3. Fetch and clean the document text
    const documentText = await fetchDocumentText(docUrl);

    const result: EdgarFilingResult = {
      ticker,
      cik,
      filingDate:      filing.filingDate,
      accessionNumber: filing.accessionNumber,
      period:          filing.period,
      items:           filing.items,
      documentUrl:     docUrl,
      documentText,
      wordCount:       documentText.split(/\s+/).length,
    };

    // Cache for 1 hour — earnings releases don't change
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=300');
    return res.status(200).json(result);

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[edgar] ${ticker} error:`, message);
    return res.status(502).json({
      error: 'EDGAR fetch failed',
      ticker,
      detail: message,
    } satisfies ErrorResult);
  }
}