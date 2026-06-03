import type { VercelRequest, VercelResponse } from '@vercel/node';

// ---------------------------------------------------------------------------
// Rate limiter — 20 calls / IP / hour (separate bucket from api/analyze.ts)
// ---------------------------------------------------------------------------
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60 * 60 * 1000;

function checkRateLimit(ip: string): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return { allowed: true, remaining: RATE_LIMIT - 1 };
  }

  if (entry.count >= RATE_LIMIT) {
    return { allowed: false, remaining: 0 };
  }

  entry.count += 1;
  return { allowed: true, remaining: RATE_LIMIT - entry.count };
}

// ---------------------------------------------------------------------------
// Types (mirrored from PortfolioTab — kept lean for API boundary)
// ---------------------------------------------------------------------------
interface PositionPayload {
  ticker: string;
  sector: string;           // 'space' | 'ai_infrastructure' | 'defense' | 'clean_energy' | 'other'
  weightPct: number;        // current portfolio weight %
  gainPct: number;          // unrealized gain % (no dollar amounts)
  targetWeightPct?: number; // per-position target (optional)
  inUniverse: boolean;      // whether it's in the 31-stock universe
}

interface SectorTargets {
  space?: number;
  ai_infrastructure?: number;
  defense?: number;
  clean_energy?: number;
  other?: number;
}

interface SectorActuals {
  space: number;
  ai_infrastructure: number;
  defense: number;
  clean_energy: number;
  other: number;
}

interface MacroRiskRequest {
  type: 'macro_risk';
  positions: PositionPayload[];
  sectorTargets?: SectorTargets;
  sectorActuals?: SectorActuals;
}

interface TrimRequest {
  type: 'trim';
  positions: PositionPayload[];
  candidate: { ticker: string; sector: string; targetWeightPct: number; inUniverse: boolean };
  sectorTargets?: SectorTargets;
  sectorActuals?: SectorActuals;
}

type PortfolioRequest = MacroRiskRequest | TrimRequest;

// ---------------------------------------------------------------------------
// Prompt builders
// ---------------------------------------------------------------------------
function buildMacroRiskPrompt(
  positions: PositionPayload[],
  sectorTargets?: SectorTargets,
  sectorActuals?: SectorActuals,
): string {
  const positionLines = positions
    .map(p => {
      const target = p.targetWeightPct != null ? ` | target: ${p.targetWeightPct.toFixed(1)}%` : '';
      return `  ${p.ticker} (${p.sector}): weight ${p.weightPct.toFixed(1)}%, gain ${p.gainPct > 0 ? '+' : ''}${p.gainPct.toFixed(1)}%${target}`;
    })
    .join('\n');

  let sectorContext = '';
  if (sectorActuals) {
    const rows = Object.entries(sectorActuals)
      .filter(([, v]) => v > 0)
      .map(([sector, actual]) => {
        const target = sectorTargets?.[sector as keyof SectorTargets];
        const delta = target != null ? ` (target ${target}%, delta ${(actual - target) > 0 ? '+' : ''}${(actual - target).toFixed(1)}pp)` : '';
        return `  ${sector}: ${actual.toFixed(1)}%${delta}`;
      })
      .join('\n');
    sectorContext = `\nSector actuals vs targets:\n${rows}`;
  }

  return `You are a portfolio risk analyst for a self-directed investor focused on space economy, AI infrastructure, defense, and clean energy/nuclear sectors.

Analyze this portfolio and write a concise macro risk narrative (250–350 words). Cover:
1. Concentration risks — flag any sector >35% of portfolio, note distance from target if targets are set
2. Correlation risks — positions likely to move together in a risk-off environment
3. Missing exposures — gaps in the stated thematic thesis
4. Overall positioning characterization (aggressive growth, balanced, defensive, etc.)

If sector targets are provided, frame observations relative to those targets (e.g. "AI Infrastructure is 8pp above your 30% target").

Be direct and specific. Name tickers. No generic disclaimers. No investment advice boilerplate. Write as a knowledgeable peer, not a compliance officer.

Portfolio positions:
${positionLines}
${sectorContext}

Respond with prose only — no headers, no bullet points, no markdown. One cohesive paragraph per theme, 3–4 paragraphs total.`;
}

function buildTrimPrompt(
  positions: PositionPayload[],
  candidate: TrimRequest['candidate'],
  sectorTargets?: SectorTargets,
  sectorActuals?: SectorActuals,
): string {
  const positionLines = positions
    .map(p => {
      const target = p.targetWeightPct != null ? ` | target: ${p.targetWeightPct.toFixed(1)}%` : '';
      return `  ${p.ticker} (${p.sector}): weight ${p.weightPct.toFixed(1)}%, gain ${p.gainPct > 0 ? '+' : ''}${p.gainPct.toFixed(1)}%${target}`;
    })
    .join('\n');

  let sectorContext = '';
  if (sectorActuals) {
    const rows = Object.entries(sectorActuals)
      .filter(([, v]) => v > 0)
      .map(([sector, actual]) => {
        const target = sectorTargets?.[sector as keyof SectorTargets];
        const delta = target != null ? ` (target ${target}%, delta ${(actual - target) > 0 ? '+' : ''}${(actual - target).toFixed(1)}pp)` : '';
        return `  ${sector}: ${actual.toFixed(1)}%${delta}`;
      })
      .join('\n');
    sectorContext = `\nSector actuals vs targets:\n${rows}`;
  }

  return `You are a portfolio analyst helping a self-directed investor decide which position to trim to fund a new addition.

The investor wants to add ${candidate.ticker} (${candidate.sector}) at ${candidate.targetWeightPct.toFixed(1)}% of portfolio.

Current positions:
${positionLines}
${sectorContext}

Write a trim suggestion (200–300 words) that:
1. Identifies the primary trim candidate with explicit reasoning — consider: largest unrealized gain, furthest above position target, highest sector concentration contribution
2. Explains how trimming that position changes sector weights, and whether it moves the portfolio toward or away from sector targets (if provided)
3. Identifies a secondary trim candidate only if the primary alone is clearly insufficient to fund the full addition
4. Adds one sentence on tax consideration — note that the investor should verify holding period (short vs long-term) before executing; do NOT estimate tax amounts

Hard rules:
- Never recommend specific dollar amounts or share counts
- You may say "trimming ~Xpp of TICKER" (percentage points of portfolio) but not "$Y worth"
- Never give investment advice or say "you should" — frame as analysis of tradeoffs
- Be specific: name tickers, cite their gain % and weight %, reference targets if set

Write as prose (2–3 short paragraphs). No headers, no bullet points.`;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ?? 'unknown';
  const { allowed, remaining } = checkRateLimit(ip);

  if (!allowed) {
    return res.status(429).json({ error: 'Rate limit exceeded. Portfolio analysis is limited to 20 calls per hour.' });
  }

  res.setHeader('X-RateLimit-Remaining', remaining);

  const body = req.body as PortfolioRequest;

  if (!body?.type || !['macro_risk', 'trim'].includes(body.type)) {
    return res.status(400).json({ error: 'Invalid request type. Must be "macro_risk" or "trim".' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured.' });
  }

  let prompt: string;
  let maxTokens: number;

  if (body.type === 'macro_risk') {
    if (!body.positions?.length) {
      return res.status(400).json({ error: 'positions array is required for macro_risk.' });
    }
    prompt = buildMacroRiskPrompt(body.positions, body.sectorTargets, body.sectorActuals);
    maxTokens = 1000;
  } else {
    if (!body.positions?.length || !body.candidate) {
      return res.status(400).json({ error: 'positions and candidate are required for trim.' });
    }
    prompt = buildTrimPrompt(body.positions, body.candidate, body.sectorTargets, body.sectorActuals);
    maxTokens = 800;
  }

  try {
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      console.error('Anthropic API error:', anthropicRes.status, errText);
      return res.status(502).json({ error: 'Upstream API error', detail: errText });
    }

    const data = await anthropicRes.json() as {
      content: Array<{ type: string; text?: string }>;
    };

    const text = data.content
      .filter(b => b.type === 'text')
      .map(b => b.text ?? '')
      .join('');

    return res.status(200).json({ result: text });
  } catch (err) {
    console.error('portfolio.ts error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
