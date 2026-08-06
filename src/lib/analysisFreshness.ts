// ─── Analysis freshness ─────────────────────────────────────────────────────
// Single source of truth for "has this stock's analysis fallen behind its
// earnings?" — shared by the Needs Attention sidebar and the Dashboard's
// ANALYSIS-column STALE badge, so the two never drift out of sync again.
//
// The core rule: elapsed time alone NEVER makes an analysis stale. An analysis
// is only "reportDue" when a newer earnings report has actually been released
// (Yahoo's nextEarningsDate is now in the past AND is newer than the filing we
// last analyzed, tracked via analysis.lastEarningsDate). The flat 30-day
// isAnalysisStale() rule survives ONLY as a fallback for tickers Yahoo has no
// earnings date for at all.

import { isAnalysisStale, type StockAnalysis } from '../types';

export type FreshnessStatus =
  | 'awaiting'       // no analysis exists yet
  | 'reportDue'      // a newer earnings report exists than what was analyzed
  | 'earningsToday'  // Yahoo's nextEarningsDate is today — ambiguous, don't assume it's out yet
  | 'earningsSoon'   // upcoming earnings within 7 days
  | 'staleFallback'  // Yahoo has no earnings date at all; fall back to the flat 30-day rule
  | 'analyzed';      // current — do not flag

export interface FreshnessResult {
  status: FreshnessStatus;
  daysUntilEarnings: number | null; // null when Yahoo has no earnings date
}

// Parse a date-only ISO string as UTC midnight — consistent with the existing
// parseDate() pattern used in SidePanel. Returns null on unparseable input.
function parseDate(iso?: string | null): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

function daysUntil(d: Date): number {
  return Math.ceil((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

export function getAnalysisFreshness(
  analysis: StockAnalysis | undefined,
  nextEarningsDate: string | null | undefined,
): FreshnessResult {
  const earnings = parseDate(nextEarningsDate);
  const daysUntilEarnings = earnings ? daysUntil(earnings) : null;

  // No analysis yet → awaiting. Still surface daysUntilEarnings so callers can
  // show an upcoming-earnings hint even pre-analysis.
  if (!analysis) {
    return { status: 'awaiting', daysUntilEarnings };
  }

  // Yahoo has no earnings data for this ticker at all → fall back to the flat
  // 30-day elapsed-time rule (the only place it still applies).
  if (!earnings || daysUntilEarnings == null) {
    return {
      status: isAnalysisStale(analysis) ? 'staleFallback' : 'analyzed',
      daysUntilEarnings: null,
    };
  }

  // Next report is more than a week out — never flag as stale from elapsed
  // time alone when we know the next report isn't due yet (the core fix).
  if (daysUntilEarnings > 7) {
    return { status: 'analyzed', daysUntilEarnings };
  }

  // Earnings today — ambiguous (may or may not have been released yet).
  if (daysUntilEarnings === 0) {
    return { status: 'earningsToday', daysUntilEarnings };
  }

  // Earnings 1–7 days out.
  if (daysUntilEarnings > 0) {
    return { status: 'earningsSoon', daysUntilEarnings };
  }

  // Earnings is in the past — a new report has come out. Compare against the
  // filing we actually analyzed: if we have no record of it, or the released
  // report is newer than what we analyzed, a re-run is due.
  const lastAnalyzed = parseDate(analysis.lastEarningsDate);
  if (!lastAnalyzed || earnings.getTime() > lastAnalyzed.getTime()) {
    return { status: 'reportDue', daysUntilEarnings };
  }

  // The analysis already covers this earnings event, regardless of elapsed time.
  return { status: 'analyzed', daysUntilEarnings };
}
