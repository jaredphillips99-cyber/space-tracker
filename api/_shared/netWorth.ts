// Shared net-worth prompt helpers, reused by api/portfolio.ts's
// networth_analysis type and api/retirement.ts. Lives under api/_shared/ — the
// underscore-prefixed directory is excluded from Vercel's api/*.ts route glob,
// so it's a plain module, not a serverless function.
//
// PRIVACY EXCEPTION — deliberate and scoped. Unlike the Portfolio-tab request
// types (percentages only, never dollars), these helpers format real dollar
// balances, APRs, and income. Both consumers are admin-only, magic-link-gated
// tabs where the user explicitly approved sending real figures. Do NOT copy
// this pattern into any Portfolio-tab request type.

export interface NetWorthAccountPayload {
  kind: 'holdings_link' | 'cash' | 'balance' | 'crypto' | 'credit_card';
  label: string;
  balance: number;
  apr?: number | null;
  dueDate?: string | null;
  minPayment?: number | null;
  statementBalance?: number | null;
  // Live-priced crypto only — present when the holding has symbol + quantity set.
  cryptoSymbol?: string | null;
  cryptoQuantity?: number | null;
}

export const NETWORTH_GROUNDING_RULE = `HARD RULES:
- Never invent, estimate, or illustrate with a balance, APR, income, or dollar figure that is not present in the data above.
- If a figure needed for a calculation is missing (e.g. a card's minimum payment), state the assumption you are using explicitly (e.g. "assuming a 2% minimum payment of $X/mo") instead of guessing silently. Do NOT ask the user to supply the missing figure — this is a one-shot analysis with no follow-up channel; make a stated assumption and proceed.
- Show the inputs plainly for any payoff or timeline math (balance, rate, payment used).`;

export function fmtUsd(n: number): string {
  return `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

const KIND_LABEL: Record<string, string> = {
  holdings_link: 'investment portfolio (stocks/funds)',
  cash:          'cash',
  balance:       'account balance (e.g. 401k)',
  crypto:        'crypto',
  credit_card:   'credit card',
};

// One indented line per account. Credit cards carry APR / min payment / due date
// / statement balance; live-priced crypto names the holding (e.g. "0.5 BTC-USD").
// Kept identical to the original inline logic in buildNetWorthPrompt().
export function buildAccountLines(accounts: NetWorthAccountPayload[]): string {
  return accounts.map(a => {
    if (a.kind === 'credit_card') {
      const parts = [
        `${a.label} | credit card | ${fmtUsd(a.balance ?? 0)} owed`,
        a.apr != null ? `APR ${a.apr}%` : 'APR not provided',
        a.minPayment != null ? `min payment ${fmtUsd(a.minPayment)}/mo` : 'min payment not provided',
        a.dueDate ? `next due ${a.dueDate}` : null,
        a.statementBalance != null ? `statement balance ${fmtUsd(a.statementBalance)}` : null,
      ].filter(Boolean);
      return '  ' + parts.join(' | ');
    }
    if (a.kind === 'crypto' && a.cryptoSymbol && a.cryptoQuantity != null) {
      return `  ${a.label} | crypto (${a.cryptoQuantity} ${a.cryptoSymbol}) | ${fmtUsd(a.balance ?? 0)}`;
    }
    return `  ${a.label} | ${KIND_LABEL[a.kind] ?? a.kind} | ${fmtUsd(a.balance ?? 0)}`;
  }).join('\n');
}
