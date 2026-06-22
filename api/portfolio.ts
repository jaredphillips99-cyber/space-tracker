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
    rules += '- Express all buy amounts as whole share counts (e.g. "buy 3 shares of IREN"), NOT dollar amounts or percentages.\n';
    rules += '- For cash deployment, calculate and state the exact whole share count purchasable and any leftover cash.\n';
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
  const { positions, sectorTargets, sectorActuals, subSectorActuals, cashContext } = body;

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

  // Cash dry powder context
  let cashSection = '';
  if (cashContext && cashContext.cashWeightPct > 0) {
    cashSection = `\nAVAILABLE CASH (DRY POWDER): ${cashContext.cashWeightPct.toFixed(1)}% of expanded portfolio`;
    if (cashContext.shareExamples && cashContext.shareExamples.length > 0) {
      cashSection += '\nSHARE PURCHASE ESTIMATES AT CURRENT PRICES:\n';
      cashSection += cashContext.shareExamples.map(e =>
        `  ${e.ticker}: ~${e.shares} shares (${e.leftover > 0 ? `$${e.leftover} leftover` : 'exact'})`
      ).join('\n');
    }
    cashSection += '\n';
  }

  const hasCash = cashContext && cashContext.cashWeightPct > 0;

  return `${buildAccountBlock(body.accountType, body.accountContext)}
You are a portfolio risk analyst. Analyze the following portfolio and provide a structured macro risk assessment. Do not include a top-level heading — start directly with the first section.

PORTFOLIO:
${posTable}
${targetSection}${subSectorSection}${cashSection}
Format your response with these sections using ### headings:

### Concentration Risks
Identify sector, sub-sector, or thematic overlap risks. Be specific about tickers and percentages.

### Macro Sensitivities
2-3 key macro factors this portfolio is exposed to (interest rates, AI capex cycle, defense budgets, energy policy, etc.). Name specific tickers affected.

### Tail Risks
2-3 specific scenarios that could materially hurt this portfolio. One sentence each.

### Rebalancing Priority
One concrete, actionable rebalancing recommendation. Specific tickers and direction.
${hasCash ? `
### Cash Deployment
The portfolio has ${cashContext!.cashWeightPct.toFixed(1)}% dry powder available. Recommend 2-3 specific stocks to deploy it into, prioritizing positions that reduce concentration risk or fill underweight sectors. For each: ticker, rationale, and approximate allocation of the cash (as % of the cash itself, summing to 100%). If account type requires whole shares, state the share count.
` : ''}
${!hasCash && sectorTargets && sectorActuals ? `### Sector Opportunity Watchlist
For any sector that is significantly underweight (gap ≥ 3pp vs target), suggest 2-3 specific stocks the investor could consider to close the gap. Format each as:
**TICKER** — one-sentence rationale · Risk: Low/Medium/High

If no sectors are significantly underweight, write: "Portfolio is reasonably aligned with targets — no major gaps to fill."
` : ''}
Keep total response under ${hasCash ? '420' : '350'} words. Be specific about tickers and percentages. No generic disclaimers.`;
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
  const { positions, candidate, sectorTargets, sectorActuals, cashContext } = body;
  const isTrimMode = candidate?.isTrimMode ?? false;
  const isFullExit = isTrimMode && candidate?.targetWeightPct === 0;
  const isCashFunded = candidate?.isCashFunded ?? false;

  const posTable = positions.map(p =>
    `${p.ticker} | ${p.sector}${p.subSector ? ' / ' + p.subSector : ''} | ${p.weightPct}% | gain: ${p.gainPct >= 0 ? '+' : ''}${p.gainPct}%`
  ).join('\n');

  let targetSection = '';
  if (sectorTargets && sectorActuals && candidate) {
    if (isTrimMode) {
      const freedPct = (candidate.currentWeightPct ?? 0) - candidate.targetWeightPct;
      targetSection = `\nSECTOR TARGETS (use to guide redeployment of freed capital):
${Object.entries(sectorActuals).map(([sector, actual]) => {
  const target = sectorTargets[sector];
  const delta = target != null ? ((actual ?? 0) - target).toFixed(1) : null;
  return `  ${sector}: actual ${(actual ?? 0).toFixed(1)}%${target != null ? ` | target ${target}% | ${Number(delta) > 0 ? 'OVERWEIGHT +' : 'underweight '}${delta}pp` : ''}`;
}).join('\n')}

Trimming ${candidate.ticker} from ${candidate.currentWeightPct?.toFixed(1)}% to ${candidate.targetWeightPct}% frees ~${freedPct.toFixed(1)}pp of portfolio weight.
`;
    } else {
      const candidateSectorActual = sectorActuals[candidate.sector] ?? 0;
      const afterActual = candidateSectorActual * ((100 - candidate.targetWeightPct) / 100) + candidate.targetWeightPct;
      targetSection = `\nSECTOR TARGETS (use these to guide which positions to trim):
${Object.entries(sectorActuals).map(([sector, actual]) => {
  const target = sectorTargets[sector];
  const delta = target != null ? ((actual ?? 0) - target).toFixed(1) : null;
  return `  ${sector}: actual ${(actual ?? 0).toFixed(1)}%${target != null ? ` | target ${target}% | ${Number(delta) > 0 ? 'OVERWEIGHT +' : 'underweight '}${delta}pp` : ''}`;
}).join('\n')}

Adding ${candidate.ticker} at ${candidate.targetWeightPct}% would bring ${candidate.sector} from ${candidateSectorActual.toFixed(1)}% to ~${afterActual.toFixed(1)}%${sectorTargets[candidate.sector] != null ? ` (target: ${sectorTargets[candidate.sector]}%)` : ''}.
${isCashFunded ? `\nFUNDING SOURCE: New cash (${cashContext?.cashWeightPct.toFixed(1)}% of expanded portfolio). No trim required — this is a new money injection.` : 'Prioritize trimming from overweight sectors to fund this addition.'}\n`;
    }
  }

  // Cash-funded new position — no trim needed
  if (isCashFunded && !isTrimMode) {
    const candidateSectorActual = sectorActuals?.[candidate?.sector ?? ''] ?? 0;
    const afterActual = candidateSectorActual + (candidate?.targetWeightPct ?? 0);
    const cashShareLine = cashContext?.shareExamples?.find(e => e.ticker === candidate?.ticker);
    const shareNote = cashShareLine
      ? `\nSHARE PURCHASE ESTIMATE: ~${cashShareLine.shares} shares${cashShareLine.leftover > 0 ? ` ($${cashShareLine.leftover} leftover cash)` : ' (uses cash fully)'}`
      : '';

    return `${buildAccountBlock(body.accountType, body.accountContext)}
You are a portfolio analyst. The investor has cash available and is considering deploying it into a new position. No existing position needs to be trimmed. Do not include a top-level heading.

CURRENT PORTFOLIO:
${posTable}
${targetSection}
CANDIDATE TO ADD WITH CASH: ${candidate?.ticker} | ${candidate?.sector}${candidate?.subSector ? ' / ' + candidate.subSector : ''} | target weight: ${candidate?.targetWeightPct}% of expanded portfolio${shareNote}

### Cash Deployment Plan — ${candidate?.ticker} at ${candidate?.targetWeightPct}%
Confirm this is a good use of the available cash. Explain what ${candidate?.ticker} adds to the portfolio from a sector and risk-diversification standpoint. No position needs to be sold.

### Sector Impact After Cash Injection
${candidate?.sector} goes from ${candidateSectorActual.toFixed(1)}% to ~${afterActual.toFixed(1)}%. Comment on whether this is a meaningful improvement in sector balance.

### Post-Addition Sector Weights
Compact table: Sector | Before | After for sectors that change meaningfully.

Under 160 words total. Specific tickers and numbers only. No generic disclaimers.`;
  }

  if (isTrimMode) {
    const freedPct = (candidate?.currentWeightPct ?? 0) - (candidate?.targetWeightPct ?? 0);
    return `${buildAccountBlock(body.accountType, body.accountContext)}
You are a portfolio analyst helping the investor reduce or exit a position. Do not include a top-level heading — start directly with your recommendation.

CURRENT PORTFOLIO:
${posTable}
${targetSection}
POSITION TO REDUCE: ${candidate?.ticker} | ${candidate?.sector} | ${isFullExit ? `FULL EXIT from ${candidate?.currentWeightPct?.toFixed(1)}%` : `reducing from ${candidate?.currentWeightPct?.toFixed(1)}% to ${candidate?.targetWeightPct}%`} | ~${freedPct.toFixed(1)}pp freed

### ${isFullExit ? `Exit Plan — ${candidate?.ticker}` : `Trim Plan — ${candidate?.ticker} (${candidate?.currentWeightPct?.toFixed(1)}% → ${candidate?.targetWeightPct}%)`}
${isFullExit
  ? `Explain how to execute the full exit. Consider lot selection, timing, and tax impact if relevant.`
  : `Explain how to execute the partial trim. Suggest specific share reduction if account type requires whole shares.`}

### Redeployment Suggestions
Given ${freedPct.toFixed(1)}pp of freed capital, suggest 2-3 specific sectors or positions to redeploy into. Prioritize underweight sectors vs targets. For each suggestion: ticker or sector, rationale, and approximate allocation.

### Post-Rebalance Sector Weights
Compact table: Sector | Before | After for sectors that change meaningfully.

Under 180 words total. Specific tickers and numbers only. No generic disclaimers.`;
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

function buildCashDeployPrompt(body: RequestBody): string {
  const { positions, sectorTargets, sectorActuals, cashContext } = body;

  const posTable = positions.map(p =>
    `${p.ticker} | ${p.sector}${p.subSector ? ' / ' + p.subSector : ''} | ${p.weightPct}% | gain: ${p.gainPct >= 0 ? '+' : ''}${p.gainPct}%${p.inUniverse ? ' | in-universe' : ' | external'}`
  ).join('\n');

  let targetSection = '';
  if (sectorTargets && sectorActuals) {
    const rows = Object.entries(sectorActuals).map(([sector, actual]) => {
      const target = sectorTargets[sector];
      const delta = target != null ? ((actual ?? 0) - target).toFixed(1) : null;
      return `  ${sector}: actual ${(actual ?? 0).toFixed(1)}%${target != null ? ` | target ${target}% | ${Number(delta) > 0 ? 'OVERWEIGHT +' : 'underweight '}${delta}pp` : ' | no target'}`;
    }).join('\n');
    targetSection = `\nSECTOR TARGET ALIGNMENT:\n${rows}\n`;
  }

  const cashPct = cashContext?.cashWeightPct ?? 0;
  let shareSection = '';
  if (cashContext?.shareExamples && cashContext.shareExamples.length > 0) {
    shareSection = '\nSHARE PURCHASE ESTIMATES AT CURRENT PRICES:\n' +
      cashContext.shareExamples.map(e =>
        `  ${e.ticker}: ~${e.shares} shares${e.leftover > 0 ? ` ($${e.leftover.toFixed(0)} leftover)` : ' (uses cash fully)'}`
      ).join('\n') + '\n';
  }

  return `${buildAccountBlock(body.accountType, body.accountContext)}
You are a portfolio analyst. The investor has uninvested cash representing ${cashPct.toFixed(1)}% of their expanded portfolio and wants to know the best way to deploy it to improve their risk profile and sector balance.

CURRENT PORTFOLIO (excluding cash):
${posTable}
${targetSection}${shareSection}
Do not include a top-level heading — start directly with the first section.

### Best Deployment Options
Recommend 2-3 specific stocks to buy with the available cash. For each pick:
- Ticker and sector
- Why it reduces portfolio risk or fills a meaningful gap
- Approximate portion of the cash to allocate (as % of available cash, must sum to ~100%)
- If account type requires whole shares, state the exact share count and any leftover cash

Prioritize: filling underweight sectors, reducing concentration, and adding defensive diversification where appropriate.

### Sector Impact
Which sector gaps this deployment would close. Be specific about before/after percentages.

### Timing Consideration
One sentence: deploy now vs. stage over time? Consider current macro conditions.

Under 250 words. Specific tickers and numbers only. No generic disclaimers.`;
}

function buildTrimMemoPrompt(body: RequestBody): string {
  const { positions, candidate, sectorTargets, sectorActuals, cashContext } = body;
  const isTrimMode = candidate?.isTrimMode ?? false;
  const isFullExit = isTrimMode && candidate?.targetWeightPct === 0;
  const isCashFunded = candidate?.isCashFunded ?? false;

  const posTable = positions.map(p => {
    const metrics = (p as any).keyMetrics ? `\n    Key metrics: ${(p as any).keyMetrics}` : '';
    return `${p.ticker} | ${p.sector}${p.subSector ? ' / ' + p.subSector : ''} | ${p.weightPct}% | gain: ${p.gainPct >= 0 ? '+' : ''}${p.gainPct}%${metrics}`;
  }).join('\n');

  let targetSection = '';
  if (sectorTargets && sectorActuals && candidate) {
    if (isTrimMode) {
      const freedPct = (candidate.currentWeightPct ?? 0) - candidate.targetWeightPct;
      targetSection = `\nSECTOR TARGETS:\n${Object.entries(sectorActuals).map(([sector, actual]) => {
        const target = sectorTargets[sector];
        const delta = target != null ? ((actual ?? 0) - target).toFixed(1) : null;
        return `  ${sector}: actual ${(actual ?? 0).toFixed(1)}%${target != null ? ` | target ${target}% | ${Number(delta) > 0 ? 'OVERWEIGHT +' : 'underweight '}${delta}pp` : ''}`;
      }).join('\n')}\n\nTrimming ${candidate.ticker} from ${candidate.currentWeightPct?.toFixed(1)}% to ${candidate.targetWeightPct}% frees ~${freedPct.toFixed(1)}pp.\n`;
    } else {
      const candidateSectorActual = sectorActuals[candidate.sector] ?? 0;
      const afterActual = isCashFunded
        ? candidateSectorActual + candidate.targetWeightPct
        : candidateSectorActual * ((100 - candidate.targetWeightPct) / 100) + candidate.targetWeightPct;
      targetSection = `\nSECTOR TARGETS:\n${Object.entries(sectorActuals).map(([sector, actual]) => {
        const target = sectorTargets[sector];
        const delta = target != null ? ((actual ?? 0) - target).toFixed(1) : null;
        return `  ${sector}: actual ${(actual ?? 0).toFixed(1)}%${target != null ? ` | target ${target}% | ${Number(delta) > 0 ? 'OVERWEIGHT +' : 'underweight '}${delta}pp` : ''}`;
      }).join('\n')}\n\nAdding ${candidate.ticker} at ${candidate.targetWeightPct}% would bring ${candidate.sector} from ${candidateSectorActual.toFixed(1)}% to ~${afterActual.toFixed(1)}%${sectorTargets[candidate.sector] != null ? ` (target: ${sectorTargets[candidate.sector]}%)` : ''}.\n`;
    }
  }

  const candidateMetrics = (candidate as any)?.keyMetrics ? `\nRECENT EARNINGS SNAPSHOT:\n${(candidate as any).keyMetrics}\n` : '';

  // Cash-funded add: investment thesis memo, no trim angle
  if (isCashFunded && !isTrimMode) {
    const cashShareLine = cashContext?.shareExamples?.find(e => e.ticker === candidate?.ticker);
    const shareNote = cashShareLine
      ? `~${cashShareLine.shares} shares${cashShareLine.leftover > 0 ? ` ($${cashShareLine.leftover.toFixed(0)} leftover)` : ''}`
      : `${candidate?.targetWeightPct}% of expanded portfolio`;

    return `${buildAccountBlock(body.accountType, body.accountContext)}
You are a portfolio analyst writing a concise investment decision memo. The investor has cash available and is considering deploying ${shareNote} into ${candidate?.ticker}. Write a structured memo on whether this is a good use of that cash.

CURRENT PORTFOLIO:
${posTable}
${targetSection}${candidateMetrics}
CANDIDATE: ${candidate?.ticker} | ${candidate?.sector}${candidate?.subSector ? ' / ' + candidate.subSector : ''} | target weight: ${candidate?.targetWeightPct}% of expanded portfolio

Do not include a top-level heading — start directly with the first section.

### The Case For
2-3 specific reasons why deploying cash into ${candidate?.ticker} makes sense right now. Consider: sector gap it fills, business quality, and how it reduces portfolio risk or concentration.

### The Case Against
2-3 honest concerns: valuation, overlap with existing positions, timing, or whether a different stock would be a better use of this cash.

### Verdict
One clear sentence: Deploy / Hold Cash / Consider Alternative. Then 1 sentence on what conditions would change the verdict.

Under 200 words total. No generic disclaimers. Be opinionated.`;
  }

  if (isTrimMode) {
    const freedPct = (candidate?.currentWeightPct ?? 0) - (candidate?.targetWeightPct ?? 0);
    return `${buildAccountBlock(body.accountType, body.accountContext)}
You are a portfolio analyst writing a concise decision memo. The investor is considering ${isFullExit ? `fully exiting ${candidate?.ticker}` : `reducing ${candidate?.ticker} from ${candidate?.currentWeightPct?.toFixed(1)}% to ${candidate?.targetWeightPct}%`}. Write a structured memo on whether to proceed.

CURRENT PORTFOLIO:
${posTable}
${targetSection}${candidateMetrics}
POSITION: ${candidate?.ticker} | ${candidate?.sector}${candidate?.subSector ? ' / ' + candidate.subSector : ''} | current weight: ${candidate?.currentWeightPct?.toFixed(1)}% | target: ${candidate?.targetWeightPct}% | frees ~${freedPct.toFixed(1)}pp

Do not include a top-level heading — start directly with the first section.

### The Case For ${isFullExit ? 'Exiting' : 'Trimming'}
2-3 specific reasons to reduce or exit now. Consider: thesis change, overweight sector, high gain realization, or better alternatives. Be direct.

### The Case Against
2-3 honest reasons to hold or hold more. Consider: thesis still intact, undervalued, sector alignment, or upcoming catalysts.

### Verdict
One clear sentence: ${isFullExit ? 'Exit / Hold' : 'Trim / Hold'}. Then 1-2 sentences on what conditions would change the verdict. If trimming, suggest where to redeploy the ~${freedPct.toFixed(1)}pp.

Under 200 words total. No generic disclaimers. Be opinionated.`;
  }

  return `${buildAccountBlock(body.accountType, body.accountContext)}
You are a portfolio analyst writing a concise investment decision memo. The investor is considering adding ${candidate?.ticker} at ${candidate?.targetWeightPct}% of their portfolio. Write a structured memo covering whether this makes sense given the current portfolio context.

CURRENT PORTFOLIO:
${posTable}
${targetSection}${candidateMetrics}
CANDIDATE: ${candidate?.ticker} | ${candidate?.sector}${candidate?.subSector ? ' / ' + candidate.subSector : ''} | target weight: ${candidate?.targetWeightPct}%

Do not include a top-level heading — start directly with the first section.

### The Case For
2-3 specific reasons why ${candidate?.ticker} fits this portfolio right now. Consider sector gap, business quality, and thematic alignment. Reference actual portfolio holdings and sector weights.

### The Case Against
2-3 honest concerns: concentration, valuation risk, overlap with existing positions, or timing. Be direct.

### Verdict
One clear sentence: Buy / Pass / Watch and why. Then 1-2 sentences on what conditions would change the verdict.

Under 200 words total. No generic disclaimers. Be opinionated.`;
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
  currentWeightPct?: number;
  isTrimMode?: boolean;
  isCashFunded?: boolean;    // NEW: true when cash is the funding source, no trim needed
  inUniverse: boolean;
}

interface ShareExample {
  ticker: string;
  shares: number;
  leftover: number;
}

interface CashContext {
  cashWeightPct: number;          // cash as % of expanded portfolio (safe to send)
  shareExamples?: ShareExample[]; // pre-computed share counts (computed client-side)
}

interface RequestBody {
  type: 'macro_risk' | 'macro_scenario' | 'trim' | 'trim_memo' | 'sector_explore' | 'cash_deploy';
  positions: PositionPayload[];
  candidate?: CandidatePayload;
  accountType?: string;
  accountContext?: string;
  sectorTargets?: Record<string, number | null>;
  sectorActuals?: Record<string, number>;
  subSectorActuals?: Record<string, number>;
  projectedTargets?: Record<string, number | null>;
  exploreSector?: string;
  cashContext?: CashContext;      // NEW: present whenever cash is set
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ?? 'unknown';
  if (!checkRateLimit(ip)) return res.status(429).json({ error: 'Rate limit exceeded. Try again later.' });

  const body = req.body as RequestBody;
  const { type } = body;

  if (!type || !['macro_risk', 'macro_scenario', 'trim', 'trim_memo', 'sector_explore', 'cash_deploy'].includes(type)) {
    return res.status(400).json({ error: 'Invalid request type' });
  }

  if (type === 'sector_explore' && !body.exploreSector) {
    return res.status(400).json({ error: 'exploreSector is required for sector_explore' });
  }

  let prompt: string;
  let max_tokens: number;

  if (type === 'macro_risk') {
    prompt = buildMacroRiskPrompt(body);
    max_tokens = body.cashContext?.cashWeightPct ? 1400 : 1200;
  } else if (type === 'macro_scenario') {
    prompt = buildMacroScenarioPrompt(body);
    max_tokens = 1000;
  } else if (type === 'trim') {
    prompt = buildTrimPrompt(body);
    max_tokens = 800;
  } else if (type === 'trim_memo') {
    prompt = buildTrimMemoPrompt(body);
    max_tokens = 800;
  } else if (type === 'cash_deploy') {
    prompt = buildCashDeployPrompt(body);
    max_tokens = 900;
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