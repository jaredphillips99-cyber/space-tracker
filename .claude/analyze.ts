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

// ─── Request body type ────────────────────────────────────────────────────────
// EDGAR is fetched browser-side (avoids Vercel IP blocks from SEC).
// This endpoint receives the already-fetched text and just runs Claude.

interface AnalyzeRequestBody {
  ticker:       string;
  earningsText: string;       // raw text from EDGAR, fetched by the browser
  isSpeculative: boolean;
  filingMeta: {
    filingDate:  string | null;
    period:      string | null;
    documentUrl: string | null;
    isSedarOnly: boolean;
    sources:     { hasEightK: boolean; hasTenQ: boolean } | null;
    note:        string | null;
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
  "revenue": number | null,
  "revenueGrowthYoY": number | null,
  "grossMarginPercent": number | null,
  "operatingMarginPercent": number | null,
  "adjustedEbitdaMarginPercent": number | null,
  "netIncomeLoss": number | null,
  "eps": number | null,
  "epsAdjusted": number | null,
  "cashAndEquivalents": number | null,
  "backlog": number | null,
  "guidanceRevenueLow": number | null,
  "guidanceRevenueHigh": number | null,
  "guidancePeriod": string | null,
  "guidanceDirection": "raised" | "maintained" | "lowered" | "initiated" | null,
  "analystConsensusTargetPrice": number | null,
  "segments": [{ "name": string, "revenue": number | null, "growthYoY": number | null }] | null,
  "convictionRating": "strong_buy" | "buy" | "hold" | "sell" | "strong_sell",
  "convictionRationale": string
}

ALL dollar values (revenue, cash, backlog, guidanceRevenueLow, guidanceRevenueHigh, segments.revenue) in thousands USD — e.g. $1.2B = 1200000, $408M = 408000, $74M = 74000. Margins as decimals (0.63 = 63%). No exceptions.

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
    ? `Focus on milestone progress, cash runway, regulatory and partnership developments. Management tone and credibility should inform how confidently you frame the bull and bear cases. Avoid dwelling on lack of revenue.`
    : `Business momentum, margin trajectory, and guidance quality are the core. Management tone and credibility — how candid they were, whether they hedged, whether the numbers matched their words — should directly shape how you frame the bull and bear cases, not appear as a separate section.`;

  return `You are a senior equity research analyst writing for a sophisticated investor dashboard.

Write a concise but insightful analysis of ${ticker}'s most recent earnings. ${focus}

Structure your response with EXACTLY these four markdown headings, in this order:
## What Happened
## Bull Case
## Bear Case
## Key Catalysts

SECTION GUIDANCE:
- ## What Happened: 2-3 paragraphs. Summarize the quarter's key results, how they compared to expectations, and any meaningful shift in the business. Weave in management tone — if executives were unusually cautious, defensive, or unusually confident, say so and explain what that signals.
- ## Bull Case: 1-2 paragraphs. The strongest credible argument for owning this stock. Factor in management credibility when assessing how achievable the upside is.
- ## Bear Case: 1-2 paragraphs. The most serious risks to the thesis. Include execution risks, competitive threats, and any concerns raised by management tone or guidance quality.
- ## Key Catalysts: List 3-4 specific upcoming events or milestones explicitly mentioned in the filing or earnings commentary — things that will confirm or break the thesis. For each, give a short label, approximate timing if stated, and one sentence on what a positive or negative outcome means for the stock. Format like:
  **[Catalyst name] (timing if known)** — [what to watch for and why it matters]
  Close with one sentence framing what the next 6-12 months are really about for this stock.

Only include catalysts grounded in the document — do not invent milestones not referenced in the filing. Write in clear, direct prose — no bullet lists except in the Key Catalysts items. Keep total length under 700 words.

STRUCTURED DATA EXTRACTED:
${jsonData}

EARNINGS FILING:
${earningsText.substring(0, 40000)}`;
}

// ─── SSE helper ───────────────────────────────────────────────────────────────

function sseEvent(res: VercelResponse, event: string, data: unknown): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ?? 'unknown';
  if (!checkRateLimit(ip)) {
    res.status(429).json({ error: 'Rate limit exceeded — 10 analyses per hour per IP.' });
    return;
  }

  const body = req.body as Partial<AnalyzeRequestBody>;
  const { ticker, earningsText, isSpeculative, filingMeta } = body;

  if (!ticker || typeof ticker !== 'string') {
    res.status(400).json({ error: 'ticker is required' });
    return;
  }
  if (!earningsText || typeof earningsText !== 'string') {
    res.status(400).json({ error: 'earningsText is required — fetch EDGAR in the browser first' });
    return;
  }

  const upperTicker = ticker.toUpperCase();

  // Set up SSE stream
  res.setHeader('Content-Type',      'text/event-stream');
  res.setHeader('Cache-Control',     'no-cache');
  res.setHeader('Connection',        'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  try {
    // Emit meta immediately so the UI can show filing info
    sseEvent(res, 'meta', {
      ticker:        upperTicker,
      filingDate:    filingMeta?.filingDate    ?? null,
      period:        filingMeta?.period        ?? null,
      documentUrl:   filingMeta?.documentUrl   ?? null,
      isSpeculative: isSpeculative             ?? false,
      isSedarOnly:   filingMeta?.isSedarOnly   ?? false,
      sources:       filingMeta?.sources       ?? null,
      note:          filingMeta?.note          ?? null,
    });

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    // ── Call 1: JSON extraction ────────────────────────────────────────────
    sseEvent(res, 'status', { step: 'json' });

    const jsonRes = await anthropic.messages.create({
      model:     'claude-sonnet-4-6',
      max_tokens: 2000,
      messages:  [{ role: 'user', content: buildJsonPrompt(upperTicker, isSpeculative ?? false, earningsText) }],
    });

    const rawJson = jsonRes.content[0]?.type === 'text' ? jsonRes.content[0].text.trim() : '';

    let parsedJson: unknown = null;
    try {
      const cleaned = rawJson.replace(/^```json\s*/i, '').replace(/\s*```$/, '');
      parsedJson = JSON.parse(cleaned);
    } catch {
      sseEvent(res, 'error', { message: 'Failed to parse structured JSON from Claude response' });
      res.end();
      return;
    }

    sseEvent(res, 'json', { parsed: parsedJson });

    // ── Call 2: Narrative (streaming) ─────────────────────────────────────
    sseEvent(res, 'status', { step: 'narrative' });

    const stream = await anthropic.messages.stream({
      model:     'claude-sonnet-4-6',
      max_tokens: 2500,
      messages:  [{ role: 'user', content: buildNarrativePrompt(upperTicker, isSpeculative ?? false, earningsText, JSON.stringify(parsedJson, null, 2)) }],
    });

    for await (const chunk of stream) {
      if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
        sseEvent(res, 'narrative_chunk', { text: chunk.delta.text });
      }
    }

    sseEvent(res, 'done', { ticker: upperTicker });

  } catch (err) {
    sseEvent(res, 'error', { message: err instanceof Error ? err.message : String(err) });
  } finally {
    res.end();
  }
}