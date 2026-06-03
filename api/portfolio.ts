import type { VercelRequest, VercelResponse } from '@vercel/node';

// ─── Rate limiting ────────────────────────────────────────────────────────────

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60 * 60 * 1000;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  return true;
}

// ─── Account block ────────────────────────────────────────────────────────────

function buildAccountBlock(accountType?: string, accountContext?: string): string {
  if (!accountType || accountType === 'unspecified' || !accountContext) return '';

  const wholeSharesTypes = ['roth_ira', '401k_roth', 'traditional_ira', 'sep_ira', '401k_traditional', 'hsa'];
  const noTaxTypes = ['roth_ira', '401k_roth'];

  let rules = `\nACCOUNT TYPE: ${accountType}\nCONTEXT: ${accountContext}\n\nHARD RULES FOR THIS ACCOUNT:\n`;

  if (wholeSharesTypes.includes(accountType)) {
    rules += '- Express all trim amounts as whole share counts (e.g. "sell 3 shares of IREN"), NOT dollar amounts or percentages.\n';
  }
  if (noTaxTypes.includes(accountType)) {
    rules += '- Do NOT mention tax-loss harvesting, capital gains taxes, or tax efficiency. These do not apply.\n';
    rules += '- Focus on position sizing, long-term growth fit, and sector balance.\n';
  }
  if (accountType === 'taxable') {
    rules += '- Explicitly distinguish short-term (<1yr held) vs long-term (>1yr held) gains when relevant.\n';
    rules += '- Mention tax-loss harvesting opportunities where positions are at a loss.\n';
  }
  if (['traditional_ira', 'sep_ira', '401k_traditional'].includes(accountType)) {
    rules += '- Note that all gains will eventually be taxed as ordinary income on withdrawal.\n';
    rules += '- Reference RMD implications for highly volatile or illiquid concentrated positions.\n';
  }
  if (accountType === 'hsa') {
    rules += '- Tax-free for medical use; tax-loss harvesting has limited benefit.\n';
    rules += '- Prefer whole share amounts where possible.\n';
  }

  return rules + '\n';
}

// ─── Prompt builders ──────────────────────────────────────────────────────────

function buildMacroRiskPrompt(body: RequestBody): string {
  const { positions, sectorTargets, sectorActuals, subSectorActuals } = body;

  const posTable = positions.map(p =>
    `${p.ticker} | ${p.sector}${p.subSector ? ' / ' + p.subSector : ''} | ${p.weightPct}% | gain: ${p.gainPct >= 0 ? '+' : ''}${p.gainPct}%${p.inUniverse ? ' | in-universe' : ' | external'}`
  ).join('\n');

  let targetSection = '';
  if (sectorTargets && sectorActuals) {
    const rows = Object.entries(sectorActuals).map(([sector, actual]) => {
      const target = sectorTargets[sector];
      const delta = target != null ? (actual! - target).toFixed(1) : null;
      return `  ${sector}: actual ${actual?.toFixed(1)}%${target != null ? ` | target ${target}% | delta ${Number(delta) > 0 ? '+' : ''}${delta}pp` : ' | no target'}`;
    }).join('\n');
    targetSection = `\nSECTOR TARGET ALIGNMENT:\n${rows}\n`;
  }

  let subSectorSection = '';
  if (subSectorActuals && Object.keys(subSectorActuals).length > 0) {
    subSectorSection = '\nSUB-SECTOR BREAKDOWN:\n' + Object.entries(subSectorActuals)
      .sort(([, a], [, b]) => (b ?? 0) - (a ?? 0))
      .map(([ss, pct]) => `  ${ss}: ${pct?.toFixed(1)}%`)
      .join('\n') + '\n';
  }

  return `${buildAccountBlock(body.accountType, body.accountContext)}
You are a portfolio risk analyst. Analyze the following portfolio and provide a structured macro risk assessment. Do not include a top-level heading — start directly with the first section.

PORTFOLIO:
${posTable}
${targetSection}${subSectorSection}
Format your response with these sections using ### headings:

### Concentration Risks
Identify sector, sub-sector, or thematic overlap risks. Be specific about tickers and percentages.

### Macro Sensitivities
2-3 key macro factors this portfolio is exposed to (interest rates, AI capex cycle, defense budgets, energy policy, etc.). Name specific tickers affected.

### Tail Risks
2-3 specific scenarios that could materially hurt this portfolio. One sentence each.

### Rebalancing Priority
One concrete, actionable rebalancing recommendation. Specific tickers and direction.

### Sector Opportunity Watchlist
For any sector that is significantly underweight (gap ≥ 3pp vs target), suggest 2-3 specific stocks the investor could consider to close the gap. Format each as:
**TICKER** — one-sentence rationale · Risk: Low/Medium/High

If no sectors are significantly underweight, write: "Portfolio is reasonably aligned with targets — no major gaps to fill."

Keep total response under 350 words. Be specific about tickers and percentages. No generic disclaimers.`;
}

function buildMacroScenarioPrompt(body: RequestBody): string {
  const { positions, sectorTargets, sectorActuals, projectedTargets } = body;

  const posTable = positions.map(p =>
    `${p.ticker} | ${p.sector}${p.subSector ? ' / ' + p.subSector : ''} | ${p.weightPct}% | gain: ${p.gainPct >= 0 ? '+' : ''}${p.gainPct}%`
  ).join('\n');

  const currentRows = sectorActuals ? Object.entries(sectorActuals).map(([sector, actual]) => {
    const currentTarget = sectorTargets?.[sector];
    const projTarget = projectedTargets?.[sector];
    return `  ${sector}: current ${actual?.toFixed(1)}%${currentTarget != null ? ` (current target ${currentTarget}%)` : ''}${projTarget != null ? ` → proposed target ${projTarget}%` : ''}`;
  }).join('\n') : '';

  const projRows = projectedTargets ? Object.entries(projectedTargets)
    .filter(([, v]) => v != null)
    .map(([sector, target]) => {
      const actual = sectorActuals?.[sector] ?? 0;
      const currentTarget = sectorTargets?.[sector];
      const delta = target! - actual;
      return `  ${sector}: actual ${actual.toFixed(1)}% | proposed target ${target}%${currentTarget != null ? ` (was ${currentTarget}%)` : ''} | gap ${delta >= 0 ? '+' : ''}${delta.toFixed(1)}pp`;
    }).join('\n') : '';

  return `${buildAccountBlock(body.accountType, body.accountContext)}
You are a portfolio strategist. The investor is considering changing their sector target weightings. Analyze how the proposed new targets would affect their portfolio's risk/return profile in the current macro environment.

CURRENT PORTFOLIO:
${posTable}

SECTOR POSITIONS VS PROPOSED TARGETS:
${currentRows || projRows}

Do not include a top-level heading — start directly with the first section.

Format your response with these sections using ### headings:

### What Changes
Summarize the key shifts in sector emphasis the investor is proposing (e.g. reducing AI infra from X% to Y%, increasing energy from A% to B%). Be specific.

### Macro Fit
How well do the proposed weightings fit the current macro environment? Which sectors in the new mix are well-positioned vs. which carry timing risk? Name tickers.

### Execution Path
2-4 specific trades or trims that would move the portfolio toward the proposed targets. Whole share amounts if account type requires it.

### Risks of This Shift
What are 2 key risks of moving toward these new targets? One sentence each.

Keep total response under 300 words. Specific tickers and numbers only. No generic disclaimers.`;
}

function buildTrimPrompt(body: RequestBody): string {
  const { positions, candidate, sectorTargets, sectorActuals } = body;

  const posTable = positions.map(p =>
    `${p.ticker} | ${p.sector}${p.subSector ? ' / ' + p.subSector : ''} | ${p.weightPct}% | gain: ${p.gainPct >= 0 ? '+' : ''}${p.gainPct}%`
  ).join('\n');

  let targetSection = '';
  if (sectorTargets && sectorActuals && candidate) {
    const candidateSectorActual = sectorActuals[candidate.sector] ?? 0;
    const afterActual = candidateSectorActual * ((100 - candidate.targetWeightPct) / 100) + candidate.targetWeightPct;
    targetSection = `\nSECTOR TARGETS (use these to guide which positions to trim):
${Object.entries(sectorActuals).map(([sector, actual]) => {
  const target = sectorTargets[sector];
  const delta = target != null ? ((actual ?? 0) - target).toFixed(1) : null;
  return `  ${sector}: actual ${(actual ?? 0).toFixed(1)}%${target != null ? ` | target ${target}% | ${Number(delta) > 0 ? 'OVERWEIGHT +' : 'underweight '}${delta}pp` : ''}`;
}).join('\n')}

Adding ${candidate.ticker} at ${candidate.targetWeightPct}% would bring ${candidate.sector} from ${candidateSectorActual.toFixed(1)}% to ~${afterActual.toFixed(1)}%${sectorTargets[candidate.sector] != null ? ` (target: ${sectorTargets[candidate.sector]}%)` : ''}.
Prioritize trimming from overweight sectors to fund this addition.\n`;
  }

  return `${buildAccountBlock(body.accountType, body.accountContext)}
You are a portfolio analyst helping rebalance toward a new position. Do not include a top-level heading — start directly with your recommendation.

CURRENT PORTFOLIO:
${posTable}
${targetSection}
CANDIDATE TO ADD: ${candidate?.ticker} | ${candidate?.sector}${candidate?.subSector ? ' / ' + candidate.subSector : ''} | target weight: ${candidate?.targetWeightPct}%

### Trim Plan to Fund ${candidate?.ticker} (${candidate?.targetWeightPct}%)
Suggest 1-3 specific positions to reduce, with exact share counts or dollar-equivalent percentages. For each trim explain: why this position (overweight sector, high gain, thematic overlap, or target alignment).

### Post-Rebalance Sector Weights
A compact table showing: Sector | Before | After for the sectors that change meaningfully.

Under 150 words total. Specific tickers and numbers only.`;
}

function buildSectorExplorePrompt(body: RequestBody): string {
  const { positions, exploreSector, sectorTargets, sectorActuals } = body;

  const heldTickers = positions.map(p => p.ticker).join(', ');
  const actual = sectorActuals?.[exploreSector!] ?? 0;
  const target = sectorTargets?.[exploreSector!] ?? null;
  const gap = target != null ? (target - actual).toFixed(1) : null;

  return `${buildAccountBlock(body.accountType, body.accountContext)}
You are a growth-oriented equity research analyst. A portfolio investor wants to increase exposure to the "${exploreSector}" GICS sector.

CURRENT PORTFOLIO HOLDINGS: ${heldTickers || 'none yet'}
SECTOR EXPOSURE: ${actual.toFixed(1)}% actual${target != null ? ` | ${target}% target | ${gap}pp gap to close` : ''}

Suggest exactly 3-4 publicly traded stocks in the ${exploreSector} sector that:
1. Do NOT duplicate tickers already held above
2. Fit a growth-oriented, long-duration investment style
3. Have meaningful market cap (not micro-cap speculation unless highly relevant)
4. Would meaningfully increase ${exploreSector} exposure

Respond ONLY with a valid JSON array, no markdown, no explanation outside the array:
[
  {
    "ticker": "TICKER",
    "rationale": "One concise sentence explaining why this fits the portfolio and sector gap.",
    "marketCapRange": "e.g. $5B–$15B mid-cap"
  }
]`;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface PositionPayload {
  ticker: string;
  sector: string;
  subSector?: string;
  weightPct: number;
  gainPct: number;
  inUniverse: boolean;
}

interface CandidatePayload {
  ticker: string;
  sector: string;
  subSector?: string;
  targetWeightPct: number;
  inUniverse: boolean;
}

interface RequestBody {
  type: 'macro_risk' | 'macro_scenario' | 'trim' | 'sector_explore';
  positions: PositionPayload[];
  candidate?: CandidatePayload;
  accountType?: string;
  accountContext?: string;
  sectorTargets?: Record<string, number | null>;
  sectorActuals?: Record<string, number>;
  subSectorActuals?: Record<string, number>;
  projectedTargets?: Record<string, number | null>;
  exploreSector?: string;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ?? 'unknown';
  if (!checkRateLimit(ip)) return res.status(429).json({ error: 'Rate limit exceeded. Try again later.' });

  const body = req.body as RequestBody;
  const { type } = body;

  if (!type || !['macro_risk', 'macro_scenario', 'trim', 'sector_explore'].includes(type)) {
    return res.status(400).json({ error: 'Invalid request type' });
  }

  if (type === 'sector_explore' && !body.exploreSector) {
    return res.status(400).json({ error: 'exploreSector is required for sector_explore' });
  }

  let prompt: string;
  let max_tokens: number;

  if (type === 'macro_risk') {
    prompt = buildMacroRiskPrompt(body);
    max_tokens = 1200;
  } else if (type === 'macro_scenario') {
    prompt = buildMacroScenarioPrompt(body);
    max_tokens = 1000;
  } else if (type === 'trim') {
    prompt = buildTrimPrompt(body);
    max_tokens = 800;
  } else {
    prompt = buildSectorExplorePrompt(body);
    max_tokens = 600;
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY ?? '',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.json();
      return res.status(500).json({ error: err.error?.message ?? 'Anthropic API error' });
    }

    const data = await response.json();
    const result = data.content?.[0]?.text ?? '';

    if (type === 'sector_explore') {
      try {
        JSON.parse(result);
      } catch {
        return res.status(500).json({ error: 'Model returned invalid JSON. Try again.' });
      }
    }

    return res.status(200).json({ result });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return res.status(500).json({ error: msg });
  }
}