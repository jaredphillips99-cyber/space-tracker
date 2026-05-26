import { VercelRequest, VercelResponse } from '@vercel/node';
import { Anthropic } from '@anthropic-ai/sdk';

// Rate limiting: 10 calls per IP per hour
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60 * 60 * 1000;
const ipTimestamps: Record<string, number[]> = {};

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  if (!ipTimestamps[ip]) ipTimestamps[ip] = [];
  ipTimestamps[ip] = ipTimestamps[ip].filter((ts) => now - ts < RATE_WINDOW_MS);
  if (ipTimestamps[ip].length >= RATE_LIMIT) return false;
  ipTimestamps[ip].push(now);
  return true;
}

// ---------------------------------------------------------------------------
// Fetch EDGAR data from our own /api/edgar endpoint
// ---------------------------------------------------------------------------
async function fetchEdgarData(ticker: string, host: string) {
  const protocol = host.includes('localhost') ? 'http' : 'https';
  const url = `${protocol}://${host}/api/edgar?ticker=${encodeURIComponent(ticker)}`;
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as any)?.error ?? `EDGAR proxy returned ${res.status}`);
  }
  return await res.json();
}

// ---------------------------------------------------------------------------
// Build the document text to send to Claude, handling all ticker types
// ---------------------------------------------------------------------------
function buildDocumentText(ticker: string, edgarData: any): string {
  if (edgarData.isSedarOnly) {
    return `NOTE: ${ticker} (NexGen Energy) files financial reports on SEDAR (Canadian securities regulator), not SEC EDGAR. Automated document retrieval is not available.

Please base this analysis on your training knowledge of NexGen Energy, covering:
- The Rook I uranium deposit: resource estimates, grade, and why it is considered the lowest-cost undeveloped uranium deposit globally
- Arrow deposit specifics and the Rook I Feasibility Study findings
- Saskatchewan regulatory timeline and permitting status
- Construction timeline, capex estimates, and production targets
- Uranium market dynamics and how NexGen is positioned
- Current cash position and runway from most recent public disclosures
- Key risks: regulatory, construction, uranium price, financing

Flag clearly in your analysis that this is based on training data, not a live filing, and note the approximate date of your knowledge.`;
  }

  return edgarData.documentText;
}

// ---------------------------------------------------------------------------
// System prompt additions per ticker type
// ---------------------------------------------------------------------------
function getSpecialPromptAddition(ticker: string): string {
  const upper = ticker.toUpperCase();
  if (['OKLO', 'NNE'].includes(upper)) {
    return '\nPre-revenue company. Focus on milestones, burn rate, partnerships, regulatory progress. Do not invent financial metrics that do not exist. For convictionRating, weigh milestone execution, cash runway, and TAM vs execution risk.';
  }
  if (upper === 'NXE') {
    return '\nPre-production uranium company (Canadian, SEDAR filer). Focus on deposit quality, regulatory timeline, uranium market positioning, and cash runway. Analysis is based on training data — flag this explicitly.';
  }
  if (['CIFR', 'RIOT'].includes(upper)) {
    return '\nBitcoin miner with early-stage AI pivot. Be explicit about how far along the pivot actually is vs peers like IREN. Distinguish BTC mining revenues from any AI/HPC revenues clearly.';
  }
  if (upper === 'SATS') {
    return '\nSatellite broadband restructuring story. Focus on debt levels, operational progress, subscriber trends, and strategic direction.';
  }
  return '';
}

// ---------------------------------------------------------------------------
// Main handler — streaming SSE
// ---------------------------------------------------------------------------
export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const ip =
    (req.headers['x-forwarded-for'] as string)?.split(',')[0] ||
    req.socket.remoteAddress ||
    'unknown';

  if (!checkRateLimit(ip)) {
    res.status(429).json({ error: 'Rate limit exceeded — 10 analyses per IP per hour' });
    return;
  }

  const { ticker } = req.body as { ticker?: string };
  if (!ticker) {
    res.status(400).json({ error: 'Missing ticker in request body' });
    return;
  }

  const TICKER = ticker.toUpperCase();
  const host = req.headers.host ?? 'localhost:3000';

  // --- Fetch EDGAR data ---
  let edgarData: any;
  try {
    edgarData = await fetchEdgarData(TICKER, host);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: 'Failed to fetch EDGAR data', detail: msg });
    return;
  }

  // --- Set up SSE stream ---
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const sendEvent = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const documentText = buildDocumentText(TICKER, edgarData);
    const specialPrompt = getSpecialPromptAddition(TICKER);

    // Emit meta — includes extra fields for speculative/SEDAR tickers
    sendEvent('meta', {
      ticker: TICKER,
      filingDate:    edgarData.filingDate   ?? null,
      period:        edgarData.period       ?? null,
      documentUrl:   edgarData.documentUrl  ?? null,
      isSpeculative: edgarData.isSpeculative ?? false,
      isSedarOnly:   edgarData.isSedarOnly  ?? false,
      sources:       edgarData.sources      ?? null,
      note:          edgarData.note         ?? null,
    });

    sendEvent('status', { step: 'json', message: 'Extracting financial data…' });

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    // --- Call 1: Structured JSON extraction ---
    const jsonResponse = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1200,
      system: `You are a senior equity analyst. Extract financial data from this earnings document and return ONLY valid JSON with no explanation, no markdown fences.${specialPrompt}

Schema (numbers are plain numbers, percentages as decimals e.g. 0.05 = 5%, missing = null):
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
  "segments": [{"name": string, "revenue": number | null, "growthYoY": number | null}] | null,
  "convictionRating": "strong_buy" | "buy" | "hold" | "sell" | "strong_sell",
  "convictionRationale": string
}

For convictionRating weigh: revenue growth trajectory, margin direction, guidance direction (raised = bullish), backlog visibility, balance sheet strength, execution risk. Be decisive.`,
      messages: [{ role: 'user', content: documentText }],
    });

    const jsonRaw =
      jsonResponse.content[0].type === 'text' ? jsonResponse.content[0].text : '';

    let parsed: any = {};
    try {
      const jsonMatch = jsonRaw.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : jsonRaw);
    } catch {
      parsed = {
        convictionRating: 'hold',
        convictionRationale: 'Unable to extract structured data from filing.',
      };
    }

    sendEvent('json', { raw: jsonRaw, parsed });
    sendEvent('status', { step: 'narrative', message: 'Writing analysis…' });

    // --- Call 2: Narrative (streaming) ---
    const stream = client.messages.stream({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1200,
      system: `You are a senior equity analyst writing concise deep-dive research for a sophisticated investor tracking space economy, AI infrastructure, defense, and clean energy/nuclear sectors.${specialPrompt}

Write in plain prose. Use these exact markdown headers:

## Management Commentary
Synthesize the most important things management communicated — strategy, milestones, partnerships, key wins. 3–5 bullet points or short paragraphs.

## Key Risks
3 risks maximum, ordered by severity. Be specific to what this filing reveals, not generic sector risks.

## 5-Year Scenarios
Three scenarios (Bull / Base / Bear). For each: the key assumption, likely trajectory, qualitative stock implication. 2–3 sentences each.

## Analyst Take
One honest paragraph synthesizing what this means for the long-term thesis. Reference the conviction rating. End with the single most important thing to watch next quarter.

Keep the entire response under 800 words.`,
      messages: [
        {
          role: 'user',
          content: `Write an analysis based on this filing:\n\n${documentText}`,
        },
      ],
    });

    for await (const event of stream) {
      if (
        event.type === 'content_block_delta' &&
        event.delta.type === 'text_delta'
      ) {
        sendEvent('narrative_chunk', { text: event.delta.text });
      }
    }

    sendEvent('done', { ticker: TICKER, filingDate: edgarData.filingDate ?? null });
    res.end();

  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    sendEvent('error', { step: 'analysis', message: msg });
    res.end();
  }
}