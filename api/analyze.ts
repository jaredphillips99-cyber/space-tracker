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

Revenue values in thousands USD. Margins as decimals (0.63 = 63%). Guidance revenue in millions.

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

Keep total length under 600 words. Write in clear, direct prose — no bullet lists.

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
      max_tokens: 1200,
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
      max_tokens: 1000,
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