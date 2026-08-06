import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  NETWORTH_GROUNDING_RULE,
  buildAccountLines,
  fmtUsd,
  type NetWorthAccountPayload,
} from './_shared/netWorth';

// ─── Rate limiting (15 calls / IP / hour) ────────────────────────────────────
// Own bucket — deliberately NOT shared with analyze.ts (10/hr) or
// portfolio.ts (20/hr). Same pattern as api/analyze.ts, fresh Map.

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 15;
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

// ─── Request body ─────────────────────────────────────────────────────────────
// PRIVACY EXCEPTION — same class as networth_analysis. Real salary/balances by
// design; this tab is magic-link-gated (RetirementAuthGate). Do NOT copy into
// any Portfolio-tab request type.

interface RetirementProfilePayload {
  employmentType: string | null;
  state: string | null;
  annualSalary: number | null;
  primaryPlanType: string | null;
  primaryContributionPct: number | null;
  employerMatchPct: number | null;
  employerMatchUpToPct: number | null;
  hasPension: boolean | null;
  birthYear: number | null;
  otherRetirementAccounts: Array<{ label: string; kind: string; balance: number | null; monthlyContribution: number | null }>;
  otherInvestmentGoals: Array<{ label: string; monthlyAmount: number | null; accountType: string }>;
}

interface RetirementRequestBody {
  retirementProfile: RetirementProfilePayload;
  netWorthAccounts?: NetWorthAccountPayload[];
  financialProfile?: {
    monthlyIncome: number | null;
    monthlySavingsTarget: number | null;
  };
}

// ─── Prompt builder ────────────────────────────────────────────────────────────

const EMPLOYMENT_LABEL: Record<string, string> = {
  private:              'private sector',
  state_government:     'state government',
  municipal_government: 'municipal government',
  federal_government:   'federal government',
  self_employed:        'self-employed',
  other:                'other',
};

const PLAN_LABEL: Record<string, string> = {
  '401k':             '401(k)',
  '403b':             '403(b)',
  '457b':             '457(b)',
  pension_plus_457b:  'pension + 457(b)',
  none:               'no employer plan',
};

function buildRetirementPrompt(body: RetirementRequestBody): string {
  const rp = body.retirementProfile;
  const accounts = body.netWorthAccounts ?? [];
  const fp = body.financialProfile;

  const salary = rp.annualSalary!; // validated non-null upstream
  const contribPct = rp.primaryContributionPct!;
  const isPublicSector =
    rp.hasPension === true ||
    rp.employmentType === 'state_government' ||
    rp.employmentType === 'municipal_government' ||
    rp.employmentType === 'federal_government';

  const hasNetWorth = accounts.length > 0;
  const cards = accounts.filter(a => a.kind === 'credit_card' && (a.balance ?? 0) > 0);
  const hasCardDebt = cards.length > 0;

  // ── Retirement profile block ──────────────────────────────────────────────
  const profileLines = [
    `  Annual salary: ${fmtUsd(salary)}`,
    `  Employment: ${rp.employmentType ? (EMPLOYMENT_LABEL[rp.employmentType] ?? rp.employmentType) : 'not provided'}`,
    rp.state ? `  State: ${rp.state}` : `  State: not provided`,
    `  Primary plan: ${rp.primaryPlanType ? (PLAN_LABEL[rp.primaryPlanType] ?? rp.primaryPlanType) : 'not provided'}`,
    `  Current contribution: ${contribPct}% of salary (${fmtUsd(salary * contribPct / 100)}/yr)`,
    rp.employerMatchPct != null && rp.employerMatchUpToPct != null
      ? `  Employer match: matches ${rp.employerMatchPct}% of contributions up to ${rp.employerMatchUpToPct}% of salary`
      : `  Employer match: not provided`,
    rp.hasPension != null ? `  Has pension: ${rp.hasPension ? 'yes' : 'no'}` : null,
    rp.birthYear != null ? `  Birth year: ${rp.birthYear}` : null,
  ].filter(Boolean).join('\n');

  // Employer-match gap — pre-computed so the model states an exact figure.
  let matchBlock = '';
  if (rp.employerMatchPct != null && rp.employerMatchUpToPct != null) {
    if (contribPct < rp.employerMatchUpToPct) {
      const unclaimedPct = (rp.employerMatchUpToPct - contribPct) * (rp.employerMatchPct / 100);
      const unclaimedDollars = salary * unclaimedPct / 100;
      matchBlock = `\nEMPLOYER MATCH GAP (pre-computed): contributing ${contribPct}% but the match tops out at ${rp.employerMatchUpToPct}% of salary. Raising to ${rp.employerMatchUpToPct}% would capture roughly ${fmtUsd(unclaimedDollars)}/yr in employer money currently left unclaimed.\n`;
    } else {
      matchBlock = `\nEMPLOYER MATCH GAP (pre-computed): current ${contribPct}% already meets or exceeds the ${rp.employerMatchUpToPct}% match threshold — the full employer match is being captured. Say so and move on to the next step.\n`;
    }
  }

  // ── Net Worth block (debt / cash) ─────────────────────────────────────────
  let netWorthBlock = '';
  if (hasNetWorth) {
    netWorthBlock = `\nNET WORTH ACCOUNTS (from the user's Net Worth tab):\n${buildAccountLines(accounts)}\n`;
  } else {
    netWorthBlock = `\nNET WORTH ACCOUNTS: none connected — no debt or cash data available for this run.\n`;
  }

  let financialProfileBlock = '';
  if (fp && (fp.monthlyIncome != null || fp.monthlySavingsTarget != null)) {
    financialProfileBlock = '\nFINANCIAL PROFILE:\n' + [
      fp.monthlyIncome != null        ? `  Monthly income: ${fmtUsd(fp.monthlyIncome)}` : null,
      fp.monthlySavingsTarget != null ? `  Monthly savings target: ${fmtUsd(fp.monthlySavingsTarget)}` : null,
    ].filter(Boolean).join('\n') + '\n';
  }

  // ── Other accounts / goals ────────────────────────────────────────────────
  let otherAccountsBlock = '';
  if (rp.otherRetirementAccounts.length > 0) {
    otherAccountsBlock = '\nOTHER RETIREMENT ACCOUNTS:\n' + rp.otherRetirementAccounts.map(a => {
      const parts = [`  ${a.label} | ${a.kind}`];
      if (a.balance != null) parts.push(`${fmtUsd(a.balance)} balance`);
      if (a.monthlyContribution != null) parts.push(`${fmtUsd(a.monthlyContribution)}/mo`);
      return parts.join(' | ');
    }).join('\n') + '\n';
  }

  let goalsBlock = '';
  if (rp.otherInvestmentGoals.length > 0) {
    goalsBlock = '\nOTHER INVESTMENT GOALS:\n' + rp.otherInvestmentGoals.map(g => {
      const parts = [`  ${g.label} | ${g.accountType}`];
      if (g.monthlyAmount != null) parts.push(`${fmtUsd(g.monthlyAmount)}/mo`);
      return parts.join(' | ');
    }).join('\n') + '\n';
  }

  // ── 457(b) contextual note ─────────────────────────────────────────────────
  const plan457Note =
    (rp.primaryPlanType === '457b' || rp.primaryPlanType === 'pension_plus_457b') && isPublicSector
      ? 'This is a governmental 457(b): note the distinctive feature that there is NO 10% early-withdrawal penalty on distributions taken after separation from service, even before age 59½ — a genuine flexibility advantage worth weighing.'
      : '';

  // ── Step 2 (debt) instruction — degrades gracefully with no Net Worth data ──
  const step2 = hasCardDebt
    ? `High-APR debt — for any credit card with an APR above ~7-8%, note that paying it down is a predictable, guaranteed return that beats expected market returns. Name the specific card(s) by their label and use the real APR/balance figures shown above.`
    : hasNetWorth
      ? `High-APR debt — no credit card balances are carried in the connected Net Worth data, so there is no high-APR debt to prioritize ahead of contributions. Say so in one line and move to step 3.`
      : `High-APR debt — no Net Worth data is connected for this run, so debt cannot be assessed. Note that connecting the Net Worth tab (credit card APRs/balances) would let this step sequence debt payoff against contributions.`;

  return `You are a retirement-contribution advisor. Analyze the inputs below and produce a structured, opinionated recommendation. Do not include a top-level heading — start directly with the first section. This is educational information, not personalized financial or tax advice.

RETIREMENT PROFILE:
${profileLines}
${matchBlock}${netWorthBlock}${financialProfileBlock}${otherAccountsBlock}${goalsBlock}
${NETWORTH_GROUNDING_RULE}

Format your response with these sections using ### headings:

### Contribution Priority Waterfall
Numbered, concrete, in this FIXED order — do not reorder based on preference, this sequence is the point:
  1. Employer match capture — ${matchBlock ? 'use the pre-computed EMPLOYER MATCH GAP figure above; if money is being left unclaimed, state the exact annual dollar amount plainly. This step is never skipped or softened.' : 'employer match details were not provided — note that capturing any available employer match is always the first priority, and that entering the match terms would let this step quantify it.'}
  2. ${step2}
  3. Additional tax-advantaged contribution room — informed by the primary plan type${plan457Note ? ` (${plan457Note})` : ''} and any other retirement accounts listed. Weigh remaining room realistically against the debt step above.
  4. Other investment goals — weigh each listed goal explicitly against remaining tax-advantaged room. Do NOT present them as a parallel, unrelated bucket; they compete for the same dollars.

### Roth vs. Traditional
Frame using the stated salary${rp.state ? ` and state (${rp.state})` : ''} as context for the likely tax bracket. Explicit caveat that this is not tax advice.${rp.state ? ' If the state has no income tax or does not tax retirement income, note that as relevant context.' : ''}

### Where the "Other Goals" Money Fits
${rp.otherInvestmentGoals.length > 0
  ? 'One short paragraph per listed goal, each referencing step 4 of the waterfall — where it sits relative to remaining tax-advantaged room.'
  : 'No separate investment goals were listed — say so in one line.'}

### Watch Items
2-3 bullets. Add judgment, do not just restate the inputs.${!hasNetWorth ? ' Include a note that connecting Net Worth data (credit card APRs/balances, cash) would sharpen the debt-priority step.' : ''}

End with exactly this line: "This is educational information, not personalized financial or tax advice — consult a financial planner or CPA for your specific situation."

Keep the total response under 700 words. Be specific about dollar amounts and percentages using only the figures provided.`;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ?? 'unknown';
  if (!checkRateLimit(ip)) return res.status(429).json({ error: 'Rate limit exceeded. Try again later.' });

  const body = req.body as RetirementRequestBody;
  const rp = body?.retirementProfile;

  if (!rp || rp.annualSalary == null || rp.primaryContributionPct == null) {
    return res.status(400).json({ error: 'annualSalary and primaryContributionPct are required' });
  }
  // Normalize array fields so the builder never dereferences undefined.
  rp.otherRetirementAccounts = Array.isArray(rp.otherRetirementAccounts) ? rp.otherRetirementAccounts : [];
  rp.otherInvestmentGoals    = Array.isArray(rp.otherInvestmentGoals) ? rp.otherInvestmentGoals : [];

  const prompt = buildRetirementPrompt(body);

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
        max_tokens: 1400,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.json();
      return res.status(500).json({ error: err.error?.message ?? 'Anthropic API error' });
    }

    const data = await response.json();
    const result = data.content?.[0]?.text ?? '';
    return res.status(200).json({ result });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return res.status(500).json({ error: msg });
  }
}
