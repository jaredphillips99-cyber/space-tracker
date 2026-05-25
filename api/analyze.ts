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

  if (ipTimestamps[ip].length >= RATE_LIMIT) {
    return false;
  }

  ipTimestamps[ip].push(now);
  return true;
}

// ---------------------------------------------------------------------------
// Fetch the EX-99.1 text from our own /api/edgar endpoint
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

function getSpecialPromptAddition(ticker: string): string {
  const upper = ticker.toUpperCase();
  if (['OKLO', 'NNE', 'NXE'].includes(upper)) {
    return '\nPre-revenue company. Focus on milestones, burn rate, partnerships, regulatory progress. Do not invent financial metrics.';
  }
  if (['CIFR', 'RIOT'].includes(upper)) {
    return '\nBitcoin miner with early-stage AI pivot. Be explicit about how far along the pivot is vs peers like IREN.';
  }
  if (upper === 'SATS') {
    return '\nSatellite broadband restructuring story. Focus on debt, subscriber trends, strategic direction.';
  }
  return '';
}

// ---------------------------------------------------------------------------
// Main handler — streaming
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
    res.status(429).json({
      error: 'Rate limit exceeded — 10 analyses per IP per hour',
    });
    return;
  }

  const { ticker } = req.body as { ticker?: string };
  if (!ticker) {
    res.status(400).json({ error: 'Missing ticker in request body' });
    return;
  }

  const host = req.headers.host ?? 'localhost:3000';

  // Fetch EDGAR data
  let edgarData: any;
  try {
    edgarData = await fetchEdgarData(ticker.toUpperCase(), host);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(502).json({
      error: 'Failed to fetch EDGAR data',
      detail: msg,
    });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const sendEvent = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const { filingDate, period, documentUrl, documentText } = edgarData;

    // Send meta event
    sendEvent('meta', {
      ticker,
      filingDate,
      period,
      documentUrl,
    });

    // Send status: extracting JSON
    sendEvent('status', {
      step: 'json',
      message: 'Extracting financial data…',
    });

    // Initialize Anthropic client
    const client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    const specialPrompt = getSpecialPromptAddition(ticker);

    // Call Claude for JSON extraction
    const jsonResponse = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1200,
      system: `You are a senior equity analyst. Extract financial data from this earnings document and return ONLY valid JSON (no explanation).${specialPrompt}

Schema:
{
  "revenue": number | null,
  "revenueGrowthYoY": number (as decimal, e.g. 0.05 for 5%) | null,
  "grossMarginPercent": number (as decimal) | null,
  "operatingMarginPercent": number (as decimal) | null,
  "adjustedEbitdaMarginPercent": number (as decimal) | null,
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
  "convictionRationale": string (2-3 sentences)
}

Weigh: revenue growth, margin direction, guidance direction, backlog, balance sheet. Be decisive.`,
      messages: [
        {
          role: 'user',
          content: documentText,
        },
      ],
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
        convictionRationale: 'Unable to extract structured data',
      };
    }

    // Send JSON event
    sendEvent('json', {
      raw: jsonRaw,
      parsed,
    });

    // Send status: narrative
    sendEvent('status', {
      step: 'narrative',
      message: 'Writing analysis…',
    });

    // Call Claude for narrative (streaming)
    const stream = client.messages.stream({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      system: `You are a senior equity analyst writing concise research for sophisticated investors. Write markdown with these exact headers:

## Management Commentary
## Key Risks
## 5-Year Scenarios
## Analyst Take

Keep it under 800 words total.${specialPrompt}`,
      messages: [
        {
          role: 'user',
          content: `Write an analysis of this earnings report:\n\n${documentText}`,
        },
      ],
    });

    for await (const event of stream) {
      if (
        event.type === 'content_block_delta' &&
        event.delta.type === 'text_delta'
      ) {
        sendEvent('narrative_chunk', {
          text: event.delta.text,
        });
      }
    }

    // Send done event
    sendEvent('done', {
      ticker,
      filingDate,
    });

    res.end();
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    sendEvent('error', {
      step: 'analysis',
      message: msg,
    });
    res.end();
  }
}