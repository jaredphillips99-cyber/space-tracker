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
    rules += '- Express all buy amounts as whole share counts (e.g. "buy 3 shares of IREN"), NOT dollar amounts or percentages, for any ticker where a share price is available to you.\n';
    rules += '- For cash deployment: state the exact whole share count and leftover cash ONLY for tickers that appear in a "SHARE PURCHASE ESTIMATES" list provided elsewhere in this prompt. For any ticker you recommend that is NOT in that list, express the allocation as a percentage of the available cash instead — do not ask the user for a share price or attempt to estimate one.\n';
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

// ─── Investor preferences block ────────────────────────────────────────────────
// Mirrors buildAccountBlock() — a standing profile injected into every prompt
// that recommends or evaluates positions. Unlike account type (tax rules),
// preferences shape *what* gets recommended, not just how it's phrased.
//
// Exclusions are written as a hard instruction ("do not recommend"), but this
// is a soft, prompt-level constraint — there is no code-level filter yet that
// removes excluded-sector candidates before they reach Claude. Worth adding
// if this needs to be airtight rather than best-effort.

interface InvestorPreferences {
  riskTolerance: 'conservative' | 'moderate' | 'aggressive';
  timeHorizon: 'short' | 'medium' | 'long';
  incomeGrowthTilt: number;          // 0 = income-focused, 100 = growth-focused
  diversificationPreference: number; // 0 = individual stocks, 100 = prefer funds
  maxPositionSizePct: number;        // e.g. 5 | 10 | 15 | 25
  newMoneyCadence: 'lump_sum' | 'dca';
  exclusions: string[];              // e.g. ['defense', 'fossil_fuels']
}

function buildPreferenceBlock(preferences?: InvestorPreferences): string {
  if (!preferences) return '';

  const riskLine: Record<InvestorPreferences['riskTolerance'], string> = {
    conservative: 'Conservative — prioritize capital preservation and lower volatility. Avoid pre-revenue or highly speculative names unless already held.',
    moderate: 'Moderate — balance growth and stability. Speculative names are acceptable in small doses, not as core positions.',
    aggressive: 'Aggressive — growth and upside take priority over volatility. Speculative and pre-revenue names are acceptable, even as meaningful positions.',
  };

  const horizonLine: Record<InvestorPreferences['timeHorizon'], string> = {
    short: 'Short horizon (<2 years) — favor liquidity and lower volatility; avoid illiquid or highly speculative names.',
    medium: 'Medium horizon (2–7 years) — moderate volatility tolerance is fine.',
    long: 'Long horizon (7+ years) — short-term volatility is acceptable in pursuit of long-term growth.',
  };

  const growthTilt = preferences.incomeGrowthTilt >= 70
    ? 'Strongly favor growth over income — dividend yield is not a priority.'
    : preferences.incomeGrowthTilt <= 30
    ? 'Strongly favor income — prioritize dividend-paying, cash-generative positions over pure growth.'
    : 'Balance growth and income — neither should be ignored.';

  const diversificationLine = preferences.diversificationPreference >= 70
    ? 'Prefers diversified funds (ETFs/mutual funds) over individual stock picks when the two are comparable options.'
    : preferences.diversificationPreference <= 30
    ? 'Prefers individual stock selection over funds — comfortable with single-name concentration.'
    : 'No strong preference between individual stocks and funds — recommend whichever better fits the specific gap.';

  const cadenceLine = preferences.newMoneyCadence === 'dca'
    ? 'Prefers dollar-cost-averaging new money in over time rather than deploying it all at once.'
    : 'Comfortable deploying new money as a lump sum rather than staging it.';

  const exclusionLine = preferences.exclusions.length > 0
    ? `HARD EXCLUSION — do not recommend any company primarily in: ${preferences.exclusions.join(', ')}. Do not suggest workarounds or adjacent exposure to these themes.`
    : '';

  return `
INVESTOR PREFERENCES:
- Risk tolerance: ${riskLine[preferences.riskTolerance]}
- Time horizon: ${horizonLine[preferences.timeHorizon]}
- ${growthTilt}
- ${diversificationLine}
- Maximum single-position size: do not recommend any position exceeding ${preferences.maxPositionSizePct}% of the portfolio.
- ${cadenceLine}${exclusionLine ? `\n- ${exclusionLine}` : ''}
`;
}

// ─── Prompt builders ──────────────────────────────────────────────────────────

// ─── Cash grounding rule ────────────────────────────────────────────────────
// The app deliberately never sends the investor's actual total cash balance
// to Claude (privacy design — only cashWeightPct and pre-computed per-ticker
// share/leftover figures are sent). Without a real total to anchor to, Claude
// would sometimes fill the gap by illustrating with a made-up round number
// (e.g. "if you had $10,000..."), which reads as if it ignored the real
// amount even though the % math was correct. This line forbids that.
const CASH_GROUNDING_RULE = 'Only reference the exact percentages and share/leftover figures given below — never invent, estimate, or illustrate with a hypothetical total dollar amount (e.g. do not say things like "if you had $10,000..."). The actual total cash balance and share prices are intentionally not shared with you for privacy. Do NOT ask the user to provide their total portfolio value, cash dollar amount, or share prices — these are withheld by design, and a percentage-of-cash recommendation is a complete, sufficient answer on its own. Give a whole share count for a ticker ONLY if it appears in a "SHARE PURCHASE ESTIMATES" list in this prompt; for every other ticker you recommend, express the allocation purely as a percentage of the available cash.';

// ─── Freshness / date-grounding block ──────────────────────────────────────────
// Fixes a real staleness bug: with no live web access on these calls, Claude
// was filling gaps in macro/timing reasoning from training data and stating
// specifics (dates, "current" events) as if verified. Computed fresh inside
// the function (not a module-level constant) so it's correct per-request even
// on a warm serverless instance that outlives a single invocation.
// hasWebAccess: passed true ONLY for the two request types that now include the
// web_search tool (cash_deploy, macro_risk). Every other call still gets the
// no-live-access wording so it doesn't fabricate "as of" specifics.
function buildFreshnessBlock(hasWebAccess: boolean = false): string {
  const today = new Date().toISOString().slice(0, 10);
  if (hasWebAccess) {
    return `\nTODAY'S DATE: ${today}. You have live web search access for this request — use it to ground recommendations in actual current market conditions, sector sentiment, and recent developments rather than relying solely on training data. Search for a small number of specific, targeted queries (2-4) rather than broad ones — e.g. current outlook for a specific sub-theme or macro factor relevant to this portfolio's gaps, not generic "stock market news". Cite what you found briefly and naturally in your reasoning; do not pad the response with search-result summaries.\n`;
  }
  return `\nTODAY'S DATE: ${today}. Your training data has a fixed cutoff and this call has no live web or news access. Do not state or imply specific recent events, dates, or "as of" claims beyond what's provided in this prompt — reason about mechanisms, structure, and the portfolio data given rather than asserting current specifics you can't verify. If timing matters, anchor to the date given here, not an assumed one.\n`;
}

// ─── Thematic conviction block ─────────────────────────────────────────────────
// Mirrors buildPreferenceBlock/buildAccountBlock: a standing directional lean on
// each of the four macro themes, injected into the new-idea prompts only
// (cash_deploy, macro_risk). LEAN IN is a priority signal; AVOID is a HARD
// prohibition — same enforcement posture as CASH_GROUNDING_RULE and the
// account-type hard rules, not a soft nudge. Percentages + stance enums only;
// no dollar figures ever reach this block (Portfolio-tab privacy rule holds).

type ThemeStance = 'lean_in' | 'neutral' | 'avoid';

interface ThemePreferences {
  space_economy: ThemeStance;
  ai_infrastructure: ThemeStance;
  defense: ThemeStance;
  clean_energy_nuclear: ThemeStance;
}

const THEME_ORDER: (keyof ThemePreferences)[] = [
  'space_economy',
  'ai_infrastructure',
  'defense',
  'clean_energy_nuclear',
];

const STANCE_LABEL: Record<ThemeStance, string> = {
  lean_in: 'LEAN IN',
  neutral: 'NEUTRAL',
  avoid:   'AVOID',
};

function buildThemeBlock(themePreferences?: ThemePreferences, themeActuals?: Record<string, number>): string {
  if (!themePreferences) return '';

  const lines = THEME_ORDER.map(theme => {
    const actual = themeActuals?.[theme] ?? 0;
    return `  ${theme}: ${actual.toFixed(1)}% of portfolio | ${STANCE_LABEL[themePreferences[theme]]}`;
  }).join('\n');

  return `
THEMATIC CONVICTION:
${lines}

When recommending new positions, prioritize themes marked LEAN IN even if
they are not the most underweight by raw percentage — conviction stated by
the investor takes priority over pure gap-filling math. Do NOT recommend
new positions in a theme marked AVOID under any circumstances, even to
fill a sector gap. NEUTRAL themes are fine to include but should not be
the primary rationale for a pick.
`;
}

// ─── Sector ETF candidate pool ─────────────────────────────────────────────────
// Sector Explore and Cash Deploy were structurally stock-only: the stock/fund
// tilt preference was a soft instruction with no actual fund inventory behind
// it, so at high fund tilt Claude was told to prefer funds but only ever
// handed a candidate set of individual tickers, and fell back to those. This
// gives Claude a real, curated candidate pool of low-cost sector ETFs to
// choose from instead. 'diversified' and 'other' are intentionally excluded —
// there's no coherent single-sector fund to suggest as a gap-filler for
// either bucket.
const SECTOR_ETF_MAP: Record<string, { ticker: string; name: string }[]> = {
  information_technology: [
    { ticker: 'VGT', name: 'Vanguard Information Technology ETF' },
    { ticker: 'SMH', name: 'VanEck Semiconductor ETF' },
    { ticker: 'XLK', name: 'Technology Select Sector SPDR' },
  ],
  industrials: [
    { ticker: 'ITA', name: 'iShares U.S. Aerospace & Defense ETF' },
    { ticker: 'XAR', name: 'SPDR S&P Aerospace & Defense ETF' },
    { ticker: 'XLI', name: 'Industrial Select Sector SPDR' },
  ],
  energy: [
    { ticker: 'ICLN', name: 'iShares Global Clean Energy ETF' },
    { ticker: 'QCLN', name: 'First Trust NASDAQ Clean Edge Green Energy ETF' },
    { ticker: 'URA', name: 'Global X Uranium ETF' },
    { ticker: 'XLE', name: 'Energy Select Sector SPDR' },
  ],
  communication_services: [
    { ticker: 'XLC', name: 'Communication Services Select Sector SPDR' },
    { ticker: 'VOX', name: 'Vanguard Communication Services ETF' },
  ],
  financials: [
    { ticker: 'XLF', name: 'Financial Select Sector SPDR' },
    { ticker: 'VFH', name: 'Vanguard Financials ETF' },
  ],
  consumer_discretionary: [
    { ticker: 'XLY', name: 'Consumer Discretionary Select Sector SPDR' },
    { ticker: 'VCR', name: 'Vanguard Consumer Discretionary ETF' },
  ],
  consumer_staples: [
    { ticker: 'XLP', name: 'Consumer Staples Select Sector SPDR' },
    { ticker: 'VDC', name: 'Vanguard Consumer Staples ETF' },
  ],
  health_care: [
    { ticker: 'XLV', name: 'Health Care Select Sector SPDR' },
    { ticker: 'VHT', name: 'Vanguard Health Care ETF' },
  ],
  materials: [
    { ticker: 'XLB', name: 'Materials Select Sector SPDR' },
    { ticker: 'VAW', name: 'Vanguard Materials ETF' },
  ],
  real_estate: [
    { ticker: 'VNQ', name: 'Vanguard Real Estate ETF' },
    { ticker: 'XLRE', name: 'Real Estate Select Sector SPDR' },
  ],
  utilities: [
    { ticker: 'XLU', name: 'Utilities Select Sector SPDR' },
    { ticker: 'VPU', name: 'Vanguard Utilities ETF' },
  ],
};

function getFundCandidates(sector?: string): { ticker: string; name: string }[] {
  if (!sector) return [];
  return SECTOR_ETF_MAP[sector] ?? [];
}

// A threshold, not a suggestion: at this tilt, sector_explore and cash_deploy
// pull primarily from the ETF candidate pool instead of the stock universe —
// the same candidate-pool mechanism risk tolerance already uses to exclude
// speculative names, rather than a soft prompt instruction Claude can talk
// itself out of.
const FUND_TILT_THRESHOLD = 70;

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
    cashSection += `\n${CASH_GROUNDING_RULE}\n`;
  }

  const hasCash = cashContext && cashContext.cashWeightPct > 0;

  return `${buildAccountBlock(body.accountType, body.accountContext)}${buildPreferenceBlock(body.preferences)}${buildThemeBlock(body.themePreferences, body.themeActuals)}${buildFreshnessBlock(true)}
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

You are not restricted to this app's tracked 31-stock universe — if a name outside that list better fits an underweight, high-conviction theme given current conditions, recommend it. Clearly mark any such pick as "not currently tracked in this app" so the investor knows it would be added as an external/manual position rather than one with live pricing already wired up. Do not default to large, generically "safe" names (e.g. broad mega-cap tech or diversified conglomerates) unless a specific thematic or risk-reduction rationale — grounded in what you find via search — actually calls for that kind of name over a more targeted one.

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

  return `${buildAccountBlock(body.accountType, body.accountContext)}${buildPreferenceBlock(body.preferences)}${buildFreshnessBlock()}
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

    return `${buildAccountBlock(body.accountType, body.accountContext)}${buildPreferenceBlock(body.preferences)}${buildFreshnessBlock()}
You are a portfolio analyst. The investor has cash available and is considering deploying it into a new position. No existing position needs to be trimmed. Do not include a top-level heading.

CURRENT PORTFOLIO:
${posTable}
${targetSection}
CANDIDATE TO ADD WITH CASH: ${candidate?.ticker} | ${candidate?.sector}${candidate?.subSector ? ' / ' + candidate.subSector : ''} | target weight: ${candidate?.targetWeightPct}% of expanded portfolio${shareNote}
${CASH_GROUNDING_RULE}

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
    return `${buildAccountBlock(body.accountType, body.accountContext)}${buildPreferenceBlock(body.preferences)}${buildFreshnessBlock()}
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

  // Compute sector/sub-sector overlap with the candidate deterministically —
  // do not rely on Claude to infer redundancy from a flat position list.
  // This was the root cause of a bug where trim suggestions defaulted to the
  // three largest positions by weight regardless of thematic fit: with no
  // explicit overlap signal and an unranked list of acceptable rationales
  // ("overweight sector, high gain, thematic overlap, or target alignment"),
  // the model fell back to position size as the path of least resistance.
  const sameSector = candidate
    ? positions.filter(p => p.ticker !== candidate.ticker && p.sector === candidate.sector)
    : [];
  const sameSubSector = candidate?.subSector
    ? positions.filter(p => p.ticker !== candidate.ticker && p.subSector === candidate.subSector)
    : [];

  let overlapSection = '';
  if (sameSector.length > 0) {
    overlapSection = `\nPOSITIONS SHARING ${candidate?.ticker}'S SECTOR (${candidate?.sector}): ` +
      sameSector.map(p => `${p.ticker} (${p.weightPct}%, ${p.gainPct >= 0 ? '+' : ''}${p.gainPct}%)`).join(', ') +
      (sameSubSector.length > 0
        ? `\nOF THOSE, SHARING ITS EXACT SUB-SECTOR (${candidate?.subSector}): ${sameSubSector.map(p => p.ticker).join(', ')} — these are the strongest trim candidates on redundancy grounds alone.`
        : '') + '\n';
  }

  return `${buildAccountBlock(body.accountType, body.accountContext)}${buildPreferenceBlock(body.preferences)}${buildFreshnessBlock()}
You are a portfolio analyst helping rebalance toward a new position. Do not include a top-level heading — start directly with your recommendation.

CURRENT PORTFOLIO:
${posTable}
${targetSection}
CANDIDATE TO ADD: ${candidate?.ticker} | ${candidate?.sector}${candidate?.subSector ? ' / ' + candidate.subSector : ''} | target weight: ${candidate?.targetWeightPct}%
${overlapSection}
### Trim Plan to Fund ${candidate?.ticker} (${candidate?.targetWeightPct}%)
Rank trim candidates using this priority order — do NOT default to the largest positions by weight:
1. A position that shares ${candidate?.ticker}'s sector or, especially, its exact sub-sector. Funding a bet with a correlated/redundant holding is the strongest possible rationale and should be preferred over unrelated positions even if it is not the largest one.
2. A position in a sector that is OVERWEIGHT vs. its target.
3. A position with a large unrealized gain (locking in strength).
Position size alone is never a sufficient reason — only cite it in combination with one of the above.
If a same-sector or same-sub-sector position listed above exists and is a plausible trim size, you must explicitly address it (trim it, or state in one clause why you're choosing not to).

Suggest 1-3 specific positions to reduce, with exact share counts or dollar-equivalent percentages. For each trim, name which criterion above applies.

### Post-Rebalance Sector Weights
A compact table showing: Sector | Before | After for the sectors that change meaningfully.

Under 160 words total. Specific tickers and numbers only.`;
}

function buildSectorExplorePrompt(body: RequestBody): string {
  const { positions, exploreSector, sectorTargets, sectorActuals, preferences } = body;

  const heldTickers = positions.map(p => p.ticker).join(', ');
  const actual = sectorActuals?.[exploreSector!] ?? 0;
  const target = sectorTargets?.[exploreSector!] ?? null;
  const gap = target != null ? (target - actual).toFixed(1) : null;

  const fundTilt = preferences?.diversificationPreference ?? 50;
  const fundCandidates = getFundCandidates(exploreSector);
  const useFunds = fundTilt >= FUND_TILT_THRESHOLD && fundCandidates.length > 0;

  if (useFunds) {
    return `${buildAccountBlock(body.accountType, body.accountContext)}${buildPreferenceBlock(body.preferences)}${buildFreshnessBlock()}
You are a portfolio strategist helping an investor who prefers funds over individual stock-picking increase exposure to the "${exploreSector}" GICS sector.

CURRENT PORTFOLIO HOLDINGS: ${heldTickers || 'none yet'}
SECTOR EXPOSURE: ${actual.toFixed(1)}% actual${target != null ? ` | ${target}% target | ${gap}pp gap to close` : ''}

ELIGIBLE FUND CANDIDATES — choose only from this list. Do not suggest individual stocks or any fund not listed here:
${fundCandidates.map(f => `- ${f.ticker} — ${f.name}`).join('\n')}

Select 2-3 of the funds above that best fit closing this sector gap:
1. Do NOT duplicate a fund already held (check against CURRENT PORTFOLIO HOLDINGS)
2. Explain briefly why this fund fits the gap better than the other options listed

Respond ONLY with a valid JSON array, no markdown, no explanation outside the array:
[
  {
    "ticker": "TICKER",
    "rationale": "One concise sentence explaining why this fund fits the portfolio and sector gap.",
    "marketCapRange": "Fund — one short note, e.g. broad sector exposure, low expense ratio"
  }
]`;
  }

  return `${buildAccountBlock(body.accountType, body.accountContext)}${buildPreferenceBlock(body.preferences)}${buildFreshnessBlock()}
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
  const { positions, sectorTargets, sectorActuals, cashContext, preferences } = body;

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
      ).join('\n') + `\n${CASH_GROUNDING_RULE}\n`;
  }

  // Same candidate-pool mechanism as sector_explore: at high fund tilt, hand
  // Claude an actual list of eligible ETFs for each underweight sector rather
  // than a soft "prefers funds" instruction with nothing to point at.
  const fundTilt = preferences?.diversificationPreference ?? 50;
  const useFunds = fundTilt >= FUND_TILT_THRESHOLD;
  let fundPoolSection = '';
  if (useFunds && sectorTargets && sectorActuals) {
    const underweightSectors = Object.entries(sectorActuals)
      .filter(([sector, actual]) => {
        const target = sectorTargets[sector];
        return target != null && target - (actual ?? 0) >= 2;
      })
      .map(([sector]) => sector);

    const poolLines = underweightSectors
      .map(sector => {
        const funds = getFundCandidates(sector);
        return funds.length > 0 ? `  ${sector}: ${funds.map(f => `${f.ticker} (${f.name})`).join(', ')}` : null;
      })
      .filter((line): line is string => line != null)
      .join('\n');

    if (poolLines) {
      fundPoolSection = `\nFUND CANDIDATE POOL — this investor prefers funds. Prioritize picks from this list over individual stocks wherever the underweight sector has an eligible fund:\n${poolLines}\n`;
    }
  }

  return `${buildAccountBlock(body.accountType, body.accountContext)}${buildPreferenceBlock(body.preferences)}${buildThemeBlock(body.themePreferences, body.themeActuals)}${buildFreshnessBlock(true)}
You are a portfolio analyst. The investor has uninvested cash representing ${cashPct.toFixed(1)}% of their expanded portfolio and wants to know the best way to deploy it to improve their risk profile and sector balance.

CURRENT PORTFOLIO (excluding cash):
${posTable}
${targetSection}${shareSection}${fundPoolSection}
Do not include a top-level heading — start directly with the first section.

### Best Deployment Options
Recommend 2-3 specific ${useFunds ? 'funds where the FUND CANDIDATE POOL above has an eligible option for the gap, falling back to individual stocks only where no fund is listed for that sector' : 'stocks'} to buy with the available cash. For each pick:
- Ticker and sector
- Why it reduces portfolio risk or fills a meaningful gap
- Approximate portion of the cash to allocate (as % of available cash, must sum to ~100%)
- If account type requires whole shares AND this ticker appears in the SHARE PURCHASE ESTIMATES above, state the exact share count and any leftover cash. Otherwise state the allocation as a percentage of the cash only — never ask the user for a price or their total balance.
${useFunds ? '' : `
You are not restricted to this app's tracked 31-stock universe — if a name outside that list better fits an underweight, high-conviction theme given current conditions, recommend it. Clearly mark any such pick as "not currently tracked in this app" so the investor knows it would be added as an external/manual position rather than one with live pricing already wired up. An external ticker will not appear in SHARE PURCHASE ESTIMATES, so express its allocation as a percentage of the cash. Do not default to large, generically "safe" names (e.g. broad mega-cap tech or diversified conglomerates) unless a specific thematic or risk-reduction rationale — grounded in what you find via search — actually calls for that kind of name over a more targeted one.
`}
Prioritize: filling underweight sectors, reducing concentration, and adding defensive diversification where appropriate.

### Sector Impact
Which sector gaps this deployment would close. Be specific about before/after percentages.

### Timing Consideration
One sentence: deploy now vs. stage over time? Consider current macro conditions.

Under 250 words. Specific tickers and numbers only. No generic disclaimers.`;
}

// ─── Net worth analysis prompt ────────────────────────────────────────────────
// PRIVACY EXCEPTION — deliberate and scoped to this request type only.
// Unlike every other request type here (which sends percentages only, never
// dollars), networth_analysis receives real dollar balances, APRs, and income
// figures. The Net Worth tab is admin-only (gated behind NetWorthAuthGate) and
// the user explicitly approved sending real figures for this feature. Do NOT
// copy this pattern into any Portfolio-tab request type.

const NETWORTH_GROUNDING_RULE = `HARD RULES:
- Never invent, estimate, or illustrate with a balance, APR, income, or dollar figure that is not present in the data above.
- If a figure needed for a calculation is missing (e.g. a card's minimum payment), state the assumption you are using explicitly (e.g. "assuming a 2% minimum payment of $X/mo") instead of guessing silently. Do NOT ask the user to supply the missing figure — this is a one-shot analysis with no follow-up channel; make a stated assumption and proceed.
- Show the inputs plainly for any payoff or timeline math (balance, rate, payment used).`;

function buildNetWorthPrompt(body: RequestBody, hasProfile: boolean): string {
  const accounts = body.accounts ?? [];
  const fp = body.financialProfile;

  const fmt = (n: number) => `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

  const assets = accounts.filter(a => a.kind !== 'credit_card');
  const cards  = accounts.filter(a => a.kind === 'credit_card');
  const assetTotal = assets.reduce((s, a) => s + (a.balance ?? 0), 0);
  const debtTotal  = cards.reduce((s, a) => s + (a.balance ?? 0), 0);
  const cashTotal  = assets.filter(a => a.kind === 'cash').reduce((s, a) => s + (a.balance ?? 0), 0);
  const hasCardDebt = cards.some(a => (a.balance ?? 0) > 0);

  const kindLabel: Record<string, string> = {
    holdings_link: 'investment portfolio (stocks/funds)',
    cash:          'cash',
    balance:       'account balance (e.g. 401k)',
    crypto:        'crypto',
    credit_card:   'credit card',
  };

  const accountLines = accounts.map(a => {
    if (a.kind === 'credit_card') {
      const parts = [
        `${a.label} | credit card | ${fmt(a.balance ?? 0)} owed`,
        a.apr != null ? `APR ${a.apr}%` : 'APR not provided',
        a.minPayment != null ? `min payment ${fmt(a.minPayment)}/mo` : 'min payment not provided',
        a.dueDate ? `next due ${a.dueDate}` : null,
        a.statementBalance != null ? `statement balance ${fmt(a.statementBalance)}` : null,
      ].filter(Boolean);
      return '  ' + parts.join(' | ');
    }
    return `  ${a.label} | ${kindLabel[a.kind] ?? a.kind} | ${fmt(a.balance ?? 0)}`;
  }).join('\n');

  let sectorSection = '';
  const tops = body.portfolioContext?.topSectorWeights;
  if (tops && tops.length > 0) {
    sectorSection = '\nPORTFOLIO SECTOR CONCENTRATION (top sectors, % of the investment portfolio):\n' +
      tops.map(t => `  ${t.sector}: ${t.pct.toFixed(1)}%`).join('\n') + '\n';
  }

  let profileSection = '';
  if (hasProfile && fp) {
    profileSection = '\nFINANCIAL PROFILE:\n' + [
      fp.monthlyIncome != null        ? `  Monthly income: ${fmt(fp.monthlyIncome)}` : null,
      fp.monthlySavingsTarget != null ? `  Monthly savings target: ${fmt(fp.monthlySavingsTarget)}` : null,
      fp.goalLabel                    ? `  Goal: ${fp.goalLabel}` : null,
      fp.goalTargetDate               ? `  Goal target date: ${fp.goalTargetDate}` : null,
      fp.goalTargetAmount != null     ? `  Goal target amount: ${fmt(fp.goalTargetAmount)}` : null,
    ].filter(Boolean).join('\n') + '\n';
  }

  const tier2Sections = `
### Savings Rate
The monthly savings target as a % of monthly income. Whether that rate is healthy — frame rules of thumb as context, not prescriptive percentages presented as fact. Whether current debt minimum payments are eating into it.

### Debt Payoff Timeline
Using each card's APR + balance + minimum payment (state the assumption explicitly if the minimum payment is missing), give an actual month-count and total-interest estimate for paying off each card, and how redirecting part of the monthly savings target would change that.

### Runway & Trajectory
${fp?.goalTargetDate != null || fp?.goalTargetAmount != null
  ? 'A plain read on whether the current trajectory (net worth + monthly savings target) is roughly on pace for the stated goal — with explicit caveats that this ignores market returns, inflation, and income changes.'
  : 'How many months of expenses the liquid cash could plausibly cover (state the assumption used for monthly outflow), and where net worth is heading at the current savings rate.'}

End with a single brief line noting this is not professional financial advice.`;

  return `${buildFreshnessBlock()}
You are a personal balance-sheet analyst. Analyze the following net worth data and provide a structured assessment. Do not include a top-level heading — start directly with the first section.

ACCOUNTS:
${accountLines}

TOTALS (pre-computed): assets ${fmt(assetTotal)} | liabilities ${fmt(debtTotal)} | net worth ${fmt(assetTotal - debtTotal)} | liquid cash ${fmt(cashTotal)}
${sectorSection}${profileSection}
${NETWORTH_GROUNDING_RULE}

Format your response with these sections using ### headings:

### Balance Sheet Health
Overall read on the mix — how much is liquid (cash) vs illiquid (portfolio holdings, crypto) vs debt. Use the actual dollar figures.

### Debt Priority
${hasCardDebt
  ? `Rank the credit cards by APR (avalanche method) with the actual dollar payoff order — this is real math, get it right. State it plainly, e.g. "Pay off [Card X] first — its APR is Y points higher than [Card Z]."`
  : 'No credit card debt is carried — say so in one sentence and move on.'}

### Concentration & Liquidity
Flag if portfolio holdings or crypto dominate net worth with little cash cushion. ${tops && tops.length > 0 ? 'Use the sector concentration data above to note if the portfolio itself is concentrated.' : ''}

### Watch Items
2-3 bullets. Upcoming due dates are already visible in the UI — don't just repeat them; add judgment (e.g. whether minimum payments due soon exceed what's sitting in cash accounts).
${hasProfile ? tier2Sections : ''}
Keep total response under ${hasProfile ? '600' : '350'} words. Be specific about dollar amounts and percentages. No generic disclaimers${hasProfile ? ' beyond the single closing line requested above' : ''}.`;
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

    return `${buildAccountBlock(body.accountType, body.accountContext)}${buildPreferenceBlock(body.preferences)}${buildFreshnessBlock()}
You are a portfolio analyst writing a concise investment decision memo. The investor has cash available and is considering deploying ${shareNote} into ${candidate?.ticker}. Write a structured memo on whether this is a good use of that cash.

CURRENT PORTFOLIO:
${posTable}
${targetSection}${candidateMetrics}
CANDIDATE: ${candidate?.ticker} | ${candidate?.sector}${candidate?.subSector ? ' / ' + candidate.subSector : ''} | target weight: ${candidate?.targetWeightPct}% of expanded portfolio
${CASH_GROUNDING_RULE}

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
    return `${buildAccountBlock(body.accountType, body.accountContext)}${buildPreferenceBlock(body.preferences)}${buildFreshnessBlock()}
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

  return `${buildAccountBlock(body.accountType, body.accountContext)}${buildPreferenceBlock(body.preferences)}${buildFreshnessBlock()}
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

// networth_analysis only — real dollar figures by design (see privacy note
// above buildNetWorthPrompt). Never reuse these payloads for other types.
interface NetWorthAccountPayload {
  kind: 'holdings_link' | 'cash' | 'balance' | 'crypto' | 'credit_card';
  label: string;
  balance: number;
  apr?: number | null;
  dueDate?: string | null;
  minPayment?: number | null;
  statementBalance?: number | null;
}

interface NetWorthFinancialProfile {
  monthlyIncome: number | null;
  monthlySavingsTarget: number | null;
  goalLabel: string | null;
  goalTargetDate: string | null;
  goalTargetAmount: number | null;
}

interface RequestBody {
  type: 'macro_risk' | 'macro_scenario' | 'trim' | 'trim_memo' | 'sector_explore' | 'cash_deploy' | 'networth_analysis';
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
  preferences?: InvestorPreferences; // NEW: standing risk/style profile
  themePreferences?: ThemePreferences;      // NEW: directional macro-theme conviction (cash_deploy + macro_risk)
  themeActuals?: Record<string, number>;    // NEW: current theme weights (percentages only) — mirrors sectorActuals
  // networth_analysis only:
  accounts?: NetWorthAccountPayload[];
  portfolioContext?: { topSectorWeights?: { sector: string; pct: number }[] };
  financialProfile?: NetWorthFinancialProfile;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ?? 'unknown';
  if (!checkRateLimit(ip)) return res.status(429).json({ error: 'Rate limit exceeded. Try again later.' });

  const body = req.body as RequestBody;
  const { type } = body;

  if (!type || !['macro_risk', 'macro_scenario', 'trim', 'trim_memo', 'sector_explore', 'cash_deploy', 'networth_analysis'].includes(type)) {
    return res.status(400).json({ error: 'Invalid request type' });
  }

  if (type === 'sector_explore' && !body.exploreSector) {
    return res.status(400).json({ error: 'exploreSector is required for sector_explore' });
  }

  if (type === 'networth_analysis' && (!Array.isArray(body.accounts) || body.accounts.length === 0)) {
    return res.status(400).json({ error: 'accounts are required for networth_analysis' });
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
  } else if (type === 'networth_analysis') {
    // Tier selection is computed here from the actual profile contents —
    // never from a client-sent boolean flag.
    const fp = body.financialProfile;
    const hasProfile = !!fp && (fp.monthlyIncome != null || fp.monthlySavingsTarget != null);
    prompt = buildNetWorthPrompt(body, hasProfile);
    max_tokens = hasProfile ? 1400 : 900;
  } else {
    prompt = buildSectorExplorePrompt(body);
    max_tokens = 600;
  }

  // Web search grounding is scoped to the two new-idea request types only —
  // cash_deploy and macro_risk. Every other type stays tool-free (no added
  // latency, no multi-block response handling needed).
  const useWebSearch = type === 'cash_deploy' || type === 'macro_risk';

  try {
    const requestBody: Record<string, unknown> = {
      model: 'claude-sonnet-4-6',
      max_tokens,
      messages: [{ role: 'user', content: prompt }],
    };
    if (useWebSearch) {
      requestBody.tools = [{ type: 'web_search_20250305', name: 'web_search' }];
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY ?? '',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const err = await response.json();
      return res.status(500).json({ error: err.error?.message ?? 'Anthropic API error' });
    }

    const data = await response.json();
    // With the web_search tool enabled, data.content can interleave
    // server_tool_use / web_search_tool_result blocks with text blocks — so
    // filter for text and join. Tool-free types keep the original single-block
    // read (they never produce anything but one text block).
    const result = useWebSearch
      ? (data.content ?? [])
          .filter((block: any) => block.type === 'text')
          .map((block: any) => block.text)
          .join('\n')
      : data.content?.[0]?.text ?? '';

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