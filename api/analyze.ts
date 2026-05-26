import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';

// ─── Rate limiting (10 calls / IP / hour) ────────────────────────────────────

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + 60 * 60 * 1000 });
    return true;
  }
  if (entry.count >= 10) return false;
  entry.count++;
  return true;
}

// ─── EDGAR types (inlined so this file is self-contained) ────────────────────

interface EdgarSubmission {
  cik_str: number;
  filings: {
    recent: {
      accessionNumber: string[];
      filingDate: string[];
      reportDate: string[];
      items: string[];
      form: string[];
    };
  };
}

interface FilingInfo {
  filingDate: string;
  accessionNumber: string;
  period: string;
  items: string;
}

interface EdgarResult {
  ticker: string;
  filingDate: string | null;
  period: string | null;
  documentUrl: string;
  documentText: string;
  isSpeculative: boolean;
  isSedarOnly: boolean;
  sources: { hasEightK: boolean; hasTenQ: boolean } | null;
  note: string | null;
}

// ─── CIK map ─────────────────────────────────────────────────────────────────

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
const EDGAR_UA    = 'SpaceTracker space-tracker@users.noreply.github.com';

// ─── EDGAR helpers ────────────────────────────────────────────────────────────

function stripHtml(html: string): string {
  let t = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  return t.replace(/\s+/g, ' ').trim();
}

function findFilingByType(
  sub: EdgarSubmission,
  formType: string,
  requireItem?: string,
): FilingInfo | null {
  const r = sub.filings.recent;
  for (let i = 0; i < r.form.length; i++) {
    if (r.form[i] !== formType) continue;
    if (requireItem && !(r.items[i] ?? '').includes(requireItem)) continue;
    return {
      filingDate:      r.filingDate[i],
      accessionNumber: r.accessionNumber[i],
      period:          r.reportDate[i],
      items:           r.items[i] ?? '',
    };
  }
  return null;
}

async function fetchIndexHtml(cikNum: number, accNo: string): Promise<string | null> {
  const url = `https://www.sec.gov/Archives/edgar/data/${cikNum}/${accNo.replace(/-/g, '')}/`;
  const res = await fetch(url, { headers: { 'User-Agent': EDGAR_UA } });
  return res.ok ? res.text() : null;
}

async function resolveDocUrl(indexHtml: string, accNo: string): Promise<string | null> {
  // Prefer EX-99.1
  const ex99 = Array.from(indexHtml.matchAll(/(ex-?99\.?\d?|exhibit\s*99)[^\s>]*/gi));
  for (const m of ex99) {
    const h = m[0];
    if (h.endsWith('.htm') || h.endsWith('.html')) return h;
  }
  // Fall back to primary htm
  const hrefs = Array.from(indexHtml.matchAll(/href\s*=\s*["']([^"']+\.htm[l]?)["']/gi));
  const accBase = accNo.replace(/-/g, '');
  for (const m of hrefs) {
    const h = m[1];
    if (/-10q\.htm/i.test(h) && !/ex/i.test(h)) return h;
    if (h.includes(accBase) && !/ex/i.test(h)) return h;
  }
  return null;
}

async function fetchAndStrip(url: string): Promise<string | null> {
  const res = await fetch(url, { headers: { 'User-Agent': EDGAR_UA } });
  if (!res.ok) return null;
  const raw = await res.text();
  const stripped = stripHtml(raw);
  return stripped.substring(0, 80000);
}

function extractMDA(text: string): string {
  const start = text.search(/management'?s?\s+discussion\s+and\s+analysis|item\s+2\.?\s*$/mi);
  if (start === -1) return text.substring(0, 15000);
  const slice = text.substring(start);
  const end = slice.search(/item\s+3[^a-z0-9]|quantitative\s+and\s+qualitative|controls\s+and\s+procedures/i);
  return slice.substring(0, end === -1 ? 15000 : Math.min(end + 1000, 20000));
}

// ─── Main EDGAR fetch ─────────────────────────────────────────────────────────

async function fetchEdgar(ticker: string): Promise<EdgarResult> {
  if (SEDAR_ONLY.has(ticker)) {
    return {
      ticker, filingDate: null, period: null,
      documentUrl: 'https://www.sedar.com', documentText: '',
      isSpeculative: true, isSedarOnly: true, sources: null,
      note: 'NXE files on SEDAR (Canadian). Analysis based on Claude training knowledge only.',
    };
  }

  const cik = CIK_MAP[ticker];
  const subRes = await fetch(`https://data.sec.gov/submissions/CIK${cik}.json`, {
    headers: { 'User-Agent': EDGAR_UA },
  });
  if (!subRes.ok) throw new Error(`SEC submissions fetch failed: ${subRes.status}`);
  const sub = await subRes.json() as EdgarSubmission;
  const cikNum = sub.cik_str;

  // ── Speculative: combine latest 8-K + 10-Q ───────────────────────────────
  if (SPECULATIVE.has(ticker)) {
    const [eightKFiling, tenQFiling] = [
      findFilingByType(sub, '8-K'),
      findFilingByType(sub, '10-Q'),
    ];

    const [eightKText, tenQText] = await Promise.all([
      eightKFiling
        ? fetchIndexHtml(cikNum, eightKFiling.accessionNumber).then(async idx => {
            if (!idx) return null;
            const rel = await resolveDocUrl(idx, eightKFiling.accessionNumber);
            if (!rel) return null;
            const base = `https://www.sec.gov/Archives/edgar/data/${cikNum}/${eightKFiling.accessionNumber.replace(/-/g, '')}/`;
            return fetchAndStrip(base + rel);
          })
        : Promise.resolve(null),
      tenQFiling
        ? fetchIndexHtml(cikNum, tenQFiling.accessionNumber).then(async idx => {
            if (!idx) return null;
            const rel = await resolveDocUrl(idx, tenQFiling.accessionNumber);
            if (!rel) return null;
            const base = `https://www.sec.gov/Archives/edgar/data/${cikNum}/${tenQFiling.accessionNumber.replace(/-/g, '')}/`;
            const full = await fetchAndStrip(base + rel);
            return full ? extractMDA(full) : null;
          })
        : Promise.resolve(null),
    ]);

    let combined = '';
    if (eightKText) combined += `=== MOST RECENT 8-K ===\nFiled: ${eightKFiling!.filingDate}\n\n${eightKText}`;
    if (tenQText)  combined += `${combined ? '\n\n' : ''}=== MOST RECENT 10-Q (MD&A) ===\nFiled: ${tenQFiling!.filingDate}\n\n${tenQText}`;

    return {
      ticker,
      filingDate:    eightKFiling?.filingDate ?? tenQFiling?.filingDate ?? null,
      period:        tenQFiling?.period ?? eightKFiling?.period ?? null,
      documentUrl:   '',
      documentText:  combined,
      isSpeculative: true,
      isSedarOnly:   false,
      sources:       { hasEightK: !!eightKText, hasTenQ: !!tenQText },
      note:          null,
    };
  }

  // ── Normal ticker: latest 8-K item 2.02 (earnings release) ───────────────
  const filing = findFilingByType(sub, '8-K', '2.02');
  if (!filing) throw new Error(`No 8-K earnings release (item 2.02) found for ${ticker}`);

  const indexHtml = await fetchIndexHtml(cikNum, filing.accessionNumber);
  if (!indexHtml) throw new Error('Failed to fetch SEC filing index');

  const rel = await resolveDocUrl(indexHtml, filing.accessionNumber);
  if (!rel) throw new Error('Could not find EX-99.1 or primary document');

  const base = `https://www.sec.gov/Archives/edgar/data/${cikNum}/${filing.accessionNumber.replace(/-/g, '')}/`;
  const docUrl  = base + rel;
  const docText = await fetchAndStrip(docUrl);
  if (!docText) throw new Error('Failed to fetch earnings document');

  return {
    ticker,
    filingDate:    filing.filingDate,
    period:        filing.period,
    documentUrl:   docUrl,
    documentText:  docText,
    isSpeculative: false,
    isSedarOnly:   false,
    sources:       null,
    note:          null,
  };
}

// ─── Claude prompts ───────────────────────────────────────────────────────────

function buildJsonPrompt(ticker: string, isSpeculative: boolean, earningsText: string): string {
  const speculativeNote = isSpeculative
    ? `NOTE: ${ticker} is a pre-revenue or early-stage company. Focus on milestones, partnerships, burn rate, cash runway, and TAM. Set revenue/margin fields to null if not applicable.`
    : '';

  return `You are a financial analyst. Extract structured data from the earnings filing below.

${speculativeNote}

Return ONLY valid JSON matching this exact schema (no markdown, no commentary):
{
  "revenue": number | null,                        // most recent quarter revenue in thousands USD
  "revenueGrowthYoY": number | null,               // e.g. 0.42 for +42%
  "grossMarginPercent": number | null,             // e.g. 0.63 for 63%
  "operatingMarginPercent": number | null,
  "adjustedEbitdaMarginPercent": number | null,
  "netIncomeLoss": number | null,                  // in thousands
  "eps": number | null,
  "epsAdjusted": number | null,
  "cashAndEquivalents": number | null,             // in thousands
  "backlog": number | null,                        // in thousands, if disclosed
  "guidanceRevenueLow": number | null,             // in millions
  "guidanceRevenueHigh": number | null,            // in millions
  "guidancePeriod": string | null,                 // e.g. "FY2025"
  "guidanceDirection": "raised" | "maintained" | "lowered" | "initiated" | null,
  "analystConsensusTargetPrice": number | null,    // if mentioned in filing
  "segments": [{ "name": string, "revenue": number | null, "growthYoY": number | null }] | null,
  "convictionRating": "strong_buy" | "buy" | "hold" | "sell" | "strong_sell",
  "convictionRationale": string                    // 1-2 sentences
}

EARNINGS FILING — ${ticker}:
${earningsText.substring(0, 60000)}`;
}

function buildNarrativePrompt(
  ticker: string,
  isSpeculative: boolean,
  earningsText: string,
  jsonData: string,
): string {
  const focus = isSpeculative
    ? 'Focus on: milestone progress, cash runway, regulatory/partnership developments, and what success looks like in 2-3 years. Avoid dwelling on lack of revenue.'
    : 'Focus on: business momentum, margin trajectory, guidance quality, and management credibility.';

  return `You are a senior equity research analyst writing for a sophisticated investor dashboard.

Write a concise but insightful analysis of ${ticker}'s most recent earnings. ${focus}

Structure your response with these exact markdown headings:
## What Happened
## Management Tone
## Bull Case
## Bear Case
## Key Risks

Keep total length under 600 words. Write in clear, direct prose — no bullet lists. Use DM Sans-friendly sentences.

STRUCTURED DATA EXTRACTED:
${jsonData}

EARNINGS FILING:
${earningsText.substring(0, 40000)}`;
}

// ─── SSE helpers ─────────────────────────────────────────────────────────────

function sseEvent(res: VercelResponse, event: string, data: unknown): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  // Rate limit
  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ?? 'unknown';
  if (!checkRateLimit(ip)) {
    res.status(429).json({ error: 'Rate limit exceeded — 10 analyses per hour per IP.' });
    return;
  }

  const { ticker } = req.body as { ticker?: string };
  if (!ticker || typeof ticker !== 'string') {
    res.status(400).json({ error: 'ticker is required' });
    return;
  }

  const upperTicker = ticker.toUpperCase();
  if (!CIK_MAP[upperTicker] && !SEDAR_ONLY.has(upperTicker)) {
    res.status(400).json({ error: `Unknown ticker: ${ticker}` });
    return;
  }

  // Set up SSE stream
  res.setHeader('Content-Type',  'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection',    'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  try {
    // ── Step 1: Fetch EDGAR ────────────────────────────────────────────────
    let edgar: EdgarResult;
    try {
      edgar = await fetchEdgar(upperTicker);
    } catch (err) {
      sseEvent(res, 'error', { message: `EDGAR fetch failed: ${err instanceof Error ? err.message : String(err)}` });
      res.end();
      return;
    }

    // Emit meta so the UI can show filing info immediately
    sseEvent(res, 'meta', {
      ticker:        upperTicker,
      filingDate:    edgar.filingDate,
      period:        edgar.period,
      documentUrl:   edgar.documentUrl,
      isSpeculative: edgar.isSpeculative,
      isSedarOnly:   edgar.isSedarOnly,
      sources:       edgar.sources,
      note:          edgar.note,
    });

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    // ── Step 2: JSON extraction call ───────────────────────────────────────
    sseEvent(res, 'status', { step: 'json' });

    const jsonPrompt = buildJsonPrompt(upperTicker, edgar.isSpeculative, edgar.documentText);

    const jsonRes = await anthropic.messages.create({
      model:      'claude-sonnet-4-20250514',
      max_tokens: 1200,
      messages:   [{ role: 'user', content: jsonPrompt }],
    });

    const rawJson = jsonRes.content[0]?.type === 'text' ? jsonRes.content[0].text.trim() : '';

    let parsedJson: unknown = null;
    try {
      // Strip any accidental markdown fences
      const cleaned = rawJson.replace(/^```json\s*/i, '').replace(/\s*```$/, '');
      parsedJson = JSON.parse(cleaned);
    } catch {
      sseEvent(res, 'error', { message: 'Failed to parse structured JSON from Claude response' });
      res.end();
      return;
    }

    sseEvent(res, 'json', { parsed: parsedJson });

    // ── Step 3: Narrative call (streaming) ────────────────────────────────
    sseEvent(res, 'status', { step: 'narrative' });

    const narrativePrompt = buildNarrativePrompt(
      upperTicker,
      edgar.isSpeculative,
      edgar.documentText,
      JSON.stringify(parsedJson, null, 2),
    );

    const stream = await anthropic.messages.stream({
      model:      'claude-sonnet-4-20250514',
      max_tokens: 1000,
      messages:   [{ role: 'user', content: narrativePrompt }],
    });

    for await (const chunk of stream) {
      if (
        chunk.type === 'content_block_delta' &&
        chunk.delta.type === 'text_delta'
      ) {
        sseEvent(res, 'narrative_chunk', { text: chunk.delta.text });
      }
    }

    sseEvent(res, 'done', { ticker: upperTicker });

  } catch (err) {
    sseEvent(res, 'error', {
      message: err instanceof Error ? err.message : String(err),
    });
  } finally {
    res.end();
  }
}