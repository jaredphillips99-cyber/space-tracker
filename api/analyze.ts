import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── Simple in-memory rate limiter (per IP, resets hourly) ────────────────────

const rateLimits = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60 * 60 * 1000;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimits.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimits.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  return true;
}

// ─── System prompt ────────────────────────────────────────────────────────────

function buildSystemPrompt(ticker: string): string {
  return `You are a senior equity analyst specializing in space economy, AI infrastructure, defense, and clean energy stocks. You have deep knowledge of ${ticker}.

Your task: analyze the provided earnings materials and produce a structured research note.

RESPONSE FORMAT — output in exactly this order:
1. A JSON block wrapped in \`\`\`json ... \`\`\` containing the structured fields below
2. Followed by narrative prose sections

JSON SCHEMA (all fields optional, include only what you can support from the data):
{
  "analystTarget": <number — consensus 12-month price target in USD>,
  "guidanceDirection": <"Raised" | "Maintained" | "Lowered">,
  "analystRating": <"Strong Buy" | "Buy" | "Hold" | "Sell" | "Strong Sell">,
  "revenueGrowthYoY": <number — decimal, e.g. 0.42 for 42%>,
  "revenueGrowthQoQ": <number — decimal>,
  "grossMargin": <number — decimal, e.g. 0.63 for 63%>,
  "operatingMargin": <number — decimal>,
  "recentRevenue": <number — most recent quarter revenue in dollars>,
  "recentEPS": <number — most recent quarter EPS>,
  "nextEarningsDate": <string — "YYYY-MM-DD" format>,
  "lastEarningsDate": <string — "YYYY-MM-DD" format>,
  "summary": <string — 2-3 sentence executive summary>,
  "bullCase": <string — 2-3 sentence bull thesis>,
  "bearCase": <string — 2-3 sentence bear thesis>,
  "catalysts": <string[] — 3-5 near-term positive catalysts>,
  "risks": <string[] — 3-5 key risks>
}

After the JSON block, write a "KEY METRICS" section, a "BULL CASE" section, and a "BEAR CASE" section as readable prose. Keep each section to 3-4 sentences. Be specific and quantitative where possible. Do not hedge excessively.`;
}

// ─── Handler ─────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const ip =
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ??
    req.socket?.remoteAddress ??
    'unknown';

  if (!checkRateLimit(ip)) {
    return res.status(429).json({ error: 'Rate limit exceeded — max 10 requests per hour per IP' });
  }

  const { ticker, earningsText, transcriptText } = req.body ?? {};

  if (!ticker || typeof ticker !== 'string') {
    return res.status(400).json({ error: 'Missing ticker in request body' });
  }

  const userContent = [
    earningsText ? `## Earnings Release\n\n${earningsText}` : '',
    transcriptText ? `## Earnings Call Transcript\n\n${transcriptText}` : '',
    !earningsText && !transcriptText
      ? `No earnings materials provided. Use your training knowledge of ${ticker} to produce a best-effort analysis as of today's date.`
      : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  try {
    const stream = anthropic.messages.stream({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      system: buildSystemPrompt(ticker.toUpperCase()),
      messages: [{ role: 'user', content: userContent }],
    });

    for await (const event of stream) {
      if (
        event.type === 'content_block_delta' &&
        event.delta.type === 'text_delta'
      ) {
        const payload = JSON.stringify({ delta: { text: event.delta.text } });
        res.write(`data: ${payload}\n\n`);
      }
    }

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.write(`data: ${JSON.stringify({ error: message })}\n\n`);
    res.end();
  }
}
