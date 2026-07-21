import type { AccountKind } from '../../hooks/useNetWorthSync';

// Colors reuse the existing sector palette (SECTOR_COLORS / SECTOR_DISPLAY)
// so the stacked bar reads as part of the same design language.
export const KIND_DISPLAY: Record<AccountKind, { label: string; color: string }> = {
  holdings_link:       { label: 'PORTFOLIO', color: '#00c8ff' },  // cyan — space / comm services
  portfolio_cash_link: { label: 'PF CASH',   color: '#06b6d4' },  // teal — synthetic cash mirror
  cash:          { label: 'CASH',      color: '#00e676' },  // green — clean energy
  balance:       { label: 'BALANCE',   color: '#a259ff' },  // violet — AI infra / info tech
  crypto:        { label: 'CRYPTO',    color: '#fbbf24' },  // amber — financials / lng reserve
  credit_card:   { label: 'CREDIT CARD', color: '#ff4b6e' }, // red — liability, matches loss color
};