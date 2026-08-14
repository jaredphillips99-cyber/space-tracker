// ─── Analysis freshness ─────────────────────────────────────────────────────
// Single source of truth for "has this stock's analysis fallen behind its
// earnings?" — shared by the Needs Attention sidebar and the Dashboard's
// ANALYSIS-column STALE badge, so the two never drift out of sync again.
//
// The core rule: elapsed time alone NEVER makes an analysis stale. An analysis
// is only "reportDue" when a newer earnings report has actually been released.
//
// PRIMARY signal = lastReportedQuarterEnd (Yahoo's mostRecentQuarter — the
// fiscal period-end Yahoo has ACTUAL reported data for). This is ground truth:
// when it is newer than the filing we last analyzed (analysis.lastEarningsDate),
// a re-run is due — regardless of nextEarningsDate. nextEarningsDate is a
// FORWARD-LOOKING estimate that Yahoo can roll to the next quarter before/right
// after a release, so relying on it alone silently missed just-released reports.
// It is now used only for the upcoming/soon ("earningsToday"/"earningsSoon")
// messaging and the "overdue since" display.
//
// Date note: lastEarningsDate is a FILING date, lastReportedQuarterEnd is a
// PERIOD-END date. A filing always postdates its own quarter-end, so
// filingDate >= quarterEnd means "already covers that quarter"; a quarterEnd
// LATER than the quarter our analysis covers means a newer quarter has been
// reported. When lastEarningsDate is missing (older records saved before it
// was recorded, or a filing date that didn't persist) we fall back to the
// analysis's analyzedAt timestamp as its "current as of" date, so a current
// analysis is never falsely flagged reportDue just for lacking a filing date.
//
// The flat 30-day isAnalysisStale() rule survives ONLY as a fallback for
// tickers Yahoo has no upcoming earnings date for at all.

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
  lastReportedQuarterEnd: string | null | undefined,
): FreshnessResult {
  const earnings = parseDate(nextEarningsDate);
  const daysUntilEarnings = earnings ? daysUntil(earnings) : null;
  const reportedQuarter = parseDate(lastReportedQuarterEnd);

  // No analysis yet → awaiting. Still surface daysUntilEarnings so callers can
  // show an upcoming-earnings hint even pre-analysis.
  if (!analysis) {
    return { status: 'awaiting', daysUntilEarnings };
  }

  // The date our stored analysis is "current as of". Prefer the filing date we
  // actually analyzed (lastEarningsDate); fall back to when the analysis ran
  // (analyzedAt) for older records saved before lastEarningsDate was recorded
  // (pre-Aug-6), or any record whose filing date didn't persist. Without this
  // fallback the primary check below would treat a missing filing date as
  // "never analyzed" and flag a perfectly current analysis as reportDue forever.
  // An analysis run after a quarter closed almost certainly covers that quarter.
  const lastAnalyzed = parseDate(analysis.lastEarningsDate);
  const coverageDate = lastAnalyzed ?? new Date(analysis.analyzedAt);

  // ── PRIMARY ground-truth check (evaluated before everything below) ──────────
  // If Yahoo's most-recently-reported quarter-end is newer than the quarter our
  // analysis already covers, a new report has actually been released — flag it
  // as reportDue regardless of what nextEarningsDate says. This is the case
  // where Yahoo already rolled the forward estimate to the next quarter before
  // the app caught up, which daysUntilEarnings>7 used to mask.
  if (reportedQuarter && reportedQuarter.getTime() > coverageDate.getTime()) {
    return { status: 'reportDue', daysUntilEarnings };
  }

  // Yahoo has no upcoming earnings date for this ticker at all → fall back to
  // the flat 30-day elapsed-time rule (the only place it still applies).
  if (!earnings || daysUntilEarnings == null) {
    return {
      status: isAnalysisStale(analysis) ? 'staleFallback' : 'analyzed',
      daysUntilEarnings: null,
    };
  }

  // Next report is more than a week out — never flag as stale from elapsed time
  // alone when we know the next report isn't due yet (the primary check above
  // has already handled any report Yahoo has actually recorded as released).
  if (daysUntilEarnings > 7) {
    return { status: 'analyzed', daysUntilEarnings };
  }

  // Earnings today — ambiguous (may or may not have been released yet). But if
  // we've already analyzed a filing that covers/postdates the most recently
  // reported quarter, don't keep flagging it just because nextEarningsDate still
  // says "today" or hasn't rolled forward yet (clears a same-day re-run).
  if (daysUntilEarnings === 0) {
    if (reportedQuarter && coverageDate.getTime() >= reportedQuarter.getTime()) {
      return { status: 'analyzed', daysUntilEarnings };
    }
    return { status: 'earningsToday', daysUntilEarnings };
  }

  // Earnings 1–7 days out.
  if (daysUntilEarnings > 0) {
    return { status: 'earningsSoon', daysUntilEarnings };
  }

  // Earnings is in the past. Driven by the same ground-truth comparison as the
  // primary check: if our analysis already covers/postdates the last reported
  // quarter, we're current; otherwise (or if Yahoo has no quarter-end at all)
  // fall back to comparing against nextEarningsDate.
  if (reportedQuarter && coverageDate.getTime() >= reportedQuarter.getTime()) {
    return { status: 'analyzed', daysUntilEarnings };
  }
  if (earnings.getTime() > coverageDate.getTime()) {
    return { status: 'reportDue', daysUntilEarnings };
  }

  // The analysis already covers this earnings event, regardless of elapsed time.
  return { status: 'analyzed', daysUntilEarnings };
}
