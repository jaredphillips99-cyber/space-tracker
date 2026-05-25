import type { VercelRequest, VercelResponse } from '@vercel/node';

// ---------------------------------------------------------------------------
// Rate limiting — 10 calls per IP per hour (in-memory, resets on cold start)
// ---------------------------------------------------------------------------
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now   = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + 3_600_000 });
    return true;
  }
  if (entry.count >= 10) return false;
  entry.count++;
  return true;
}

// ---------------------------------------------------------------------------
// Fetch the EX-99.1 text from our own /api/edgar endpoint
// ---------------------------------------------------------------------------
async function fetchEdgarText(ticker: string, host: string): Promise<{
  text: string;
  filingDate: string;
  period: string;
  documentUrl: string;
}> {
  const protocol = host.includes('localhost') ? 'http' : 'https';
  const url = `${protocol}://${host}/api/edgar?ticker=${encodeURIComponent(ticker)}`;
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      (body as any)?.error ?? `EDGAR proxy returned ${res.status}`
    );
  }
  const data: any = await res.json();
  return {
    text:        data.documentText,
    filingDate:  data.filingDate,
    period:      data.period,
    documentUrl: data.documentUrl,
  };
}

// ---------------------------------------------------------------------------
// Speculative tickers get a different analysis focus
// ---------------------------------------------------------------------------
const SPECULATIVE = new Set(['OKLO', 'NNE', 'NXE']);
const MINERS      = new Set(['CIFR', 'RIOT']);
const RESTRUCTURE = new Set(['SATS']);

function analysisPersona(ticker: string): string {
  if (SPECULATIVE.has(ticker))
    return 'This is a pre-revenue / pre-production company. Focus on milestones, regulatory progress, partnerships, burn rate, and total addressable market. Do NOT invent financial metrics that do not exist yet.';
  if (MINERS.has(ticker))
    return 'This company is primarily a Bitcoin miner with an early-stage AI infrastructure pivot. Be explicit about how far along the AI pivot actually is vs peers like IREN. Distinguish BTC mining revenues from any AI/HPC revenues.';
  if (RESTRUCTURE.has(ticker))
    return 'This is a satellite broadband restructuring story. Focus on debt, operational progress, subscriber trends, and the strategic direction — not pure-play space infrastructure metrics.';
  return '';
}

// ---------------------------------------------------------------------------
// System prompts
// ---------------------------------------------------------------------------

function jsonSystemPrompt(ticker: string, filingDate: string, period: string): string {
  const persona = analysisPersona(ticker);
  return `You are a senior equity analyst specializing in space economy, AI infrastructure, defense, and clean energy / nuclear sectors. You extract structured financial data from SEC earnings releases (8-K EX-99.1).

Today's filing: ${ticker}, filed ${filingDate}, covering period ${period}.
${persona ? `\nSpecial context: ${persona}` : ''}

Return ONLY valid JSON — no markdown fences, no preamble, no explanation. Missing fields must be null. Numbers are plain numbers (not strings). Percentages are decimals (0.05 = 5%).

Schema:
{
  "revenue":                      number | null,      // most recent quarter, USD millions
  "revenueGrowthYoY":             number | null,      // decimal, e.g. 0.635 for 63.5%
  "grossMarginPercent":           number | null,      // decimal
  "operatingMarginPercent":       number | null,      // decimal (GAAP)
  "adjustedEbitdaMarginPercent":  number | null,      // decimal (non-GAAP if disclosed)
  "netIncomeLoss":                number | null,      // USD millions, negative = loss
  "eps":                          number | null,      // diluted GAAP EPS
  "epsAdjusted":                  number | null,      // adjusted / non-GAAP EPS
  "cashAndEquivalents":           number | null,      // USD millions, end of period
  "backlog":                      number | null,      // USD millions if disclosed
  "guidanceRevenueLow":           number | null,      // next quarter or FY low, USD millions
  "guidanceRevenueHigh":          number | null,      // next quarter or FY high, USD millions
  "guidancePeriod":               string | null,      // e.g. "Q2 2026" or "FY 2026"
  "guidanceDirection":            "raised" | "maintained" | "lowered" | "initiated" | null,
  "analystConsensusTargetPrice":  number | null,      // USD, from filing if mentioned else null
  "segments": [                                       // null if not disclosed
    { "name": string, "revenue": number | null, "growthYoY": number | null }
  ] | null,

  "convictionRating":    "strong_buy" | "buy" | "hold" | "sell" | "strong_sell",
  "convictionRationale": string        // 2-3 sentences max, plain text
}

For convictionRating, weigh: revenue growth trajectory, margin expansion or compression, guidance direction (raised = bullish signal), backlog visibility, balance sheet strength, and any major risks flagged in the release. Be decisive. Use strong_buy or strong_sell when the evidence clearly supports it. This is a personal research tool, not a regulated advisory service.`;
}

function narrativeSystemPrompt(ticker: string, filingDate: string, period: string): string {
  const persona = analysisPersona(ticker);
  return `You are a senior equity analyst writing a concise deep-dive for a sophisticated investor tracking the space economy, AI infrastructure, defense, and clean energy / nuclear sectors.

Ticker: ${ticker} | Filing: ${filingDate} | Period: ${period}
${persona ? `\nSpecial context: ${persona}` : ''}

Write in plain prose using DM Sans–friendly language (no heavy jargon). Structure your response with these exact section headers:

## Management Commentary
Synthesize the most important things management said — strategy, product milestones, partnerships, key wins. Quote sparingly and only where the exact wording matters. 3–5 bullet points or short paragraphs.

## Key Risks
What could derail the thesis? 3 risks maximum, ordered by severity. Be specific to what this filing reveals — not generic sector risks.

## 5-Year Scenarios
Three scenarios (Bull / Base / Bear). For each: the key assumption, likely revenue trajectory, and qualitative stock implication. Keep each scenario to 2–3 sentences.

## Analyst Take
One paragraph. Your honest, opinionated synthesis of what this quarter means for the long-term thesis. Reference the conviction rating from the structured data. End with the single most important thing to watch next quarter.

Keep the entire response under 800 words.`;
}

// ---------------------------------------------------------------------------
// Main handler — streaming
// ---------------------------------------------------------------------------
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Rate limiting
  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ?? '127.0.0.1';
  if (!checkRateLimit(ip)) {
    return res.status(429).json({ error: 'Rate limit exceeded. 10 analyses per hour per IP.' });
  }

  const { ticker } = req.body as { ticker?: string };
  if (!ticker) {
    return res.status(400).json({ error: 'Missing ticker in request body' });
  }

  const host = req.headers.host ?? 'localhost:3000';

  // --- Step 1: Fetch earnings release from EDGAR ---
  let earningsText: string;
  let filingDate:   string;
  let period:       string;
  let documentUrl:  string;

  try {
    const edgar = await fetchEdgarText(ticker.toUpperCase(), host);
    earningsText = edgar.text;
    filingDate   = edgar.filingDate;
    period       = edgar.period;
    documentUrl  = edgar.documentUrl;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return res.status(502).json({ error: `Failed to fetch EDGAR filing: ${msg}` });
  }

  // --- Step 2: Two Claude calls, streamed back as SSE ---
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const sendEvent = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  // Emit metadata the client can display immediately
  sendEvent('meta', { ticker, filingDate, period, documentUrl });

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) {
    sendEvent('error', { message: 'ANTHROPIC_API_KEY not configured' });
    return res.end();
  }

  const earningsPrompt = `Here is the ${ticker} earnings release (8-K EX-99.1) filed ${filingDate}:\n\n${earningsText}`;

  // ---- Call 1: Structured JSON ----
  try {
    sendEvent('status', { step: 'json', message: 'Extracting financial data…' });

    const jsonResp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      'claude-sonnet-4-20250514',
        max_tokens: 1200,
        system:     jsonSystemPrompt(ticker.toUpperCase(), filingDate, period),
        messages:   [{ role: 'user', content: earningsPrompt }],
      }),
    });

    if (!jsonResp.ok) {
      const errBody = await jsonResp.text();
      throw new Error(`Anthropic API error ${jsonResp.status}: ${errBody}`);
    }

    const jsonData: any = await jsonResp.json();
    const rawJson = jsonData.content?.[0]?.text ?? '';

    // Parse and validate — send even if partial
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(rawJson);
    } catch {
      // Try stripping markdown fences if model added them despite instructions
      const cleaned = rawJson.replace(/^```json?\s*/i, '').replace(/\s*```$/, '').trim();
      try { parsed = JSON.parse(cleaned); } catch { /* send raw */ }
    }

    sendEvent('json', { raw: rawJson, parsed });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    sendEvent('error', { step: 'json', message: msg });
    return res.end();
  }

  // ---- Call 2: Narrative (streaming) ----
  try {
    sendEvent('status', { step: 'narrative', message: 'Writing analysis…' });

    const narrativeResp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-beta':    'messages-2023-12-15',
      },
      body: JSON.stringify({
        model:      'claude-sonnet-4-20250514',
        max_tokens: 1200,
        stream:     true,
        system:     narrativeSystemPrompt(ticker.toUpperCase(), filingDate, period),
        messages:   [{ role: 'user', content: earningsPrompt }],
      }),
    });

    if (!narrativeResp.ok || !narrativeResp.body) {
      const errBody = await narrativeResp.text();
      throw new Error(`Anthropic API error ${narrativeResp.status}: ${errBody}`);
    }

    // Forward the SSE stream chunks directly as 'narrative_chunk' events
    const reader = narrativeResp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const payload = line.slice(6);
        if (payload === '[DONE]') continue;
        try {
          const msg: any = JSON.parse(payload);
          if (msg.type === 'content_block_delta' && msg.delta?.type === 'text_delta') {
            sendEvent('narrative_chunk', { text: msg.delta.text });
          }
        } catch { /* skip malformed chunk */ }
      }
    }

    sendEvent('done', { ticker, filingDate });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    sendEvent('error', { step: 'narrative', message: msg });
  }

  res.end();
}
