import type { VercelRequest, VercelResponse } from '@vercel/node';
import YahooFinance from 'yahoo-finance2';

// yahoo-finance2 v3 requires instantiation (breaking change from v2)
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

// Pin Yahoo's listing ONLY when it differs from the book ticker
// (e.g. BRK.B → BRK-B). None of the current tracked universe needs a remap —
// add a row here only when quote() for the book ticker resolves to the wrong
// listing, and document why.
const SYMBOL_OVERRIDES: Record<string, string> = {};

function resolveSymbol(ticker: string): string {
  return SYMBOL_OVERRIDES[ticker] ?? ticker;
}

// Hard cap is a safety rail, not the book size. The tracked universe is ~65
// and growing; the previous 50-ticker cap silently dropped ARM+ and the entire
// cyber sleeve. Client loaders chunk to PRICE_BATCH_SIZE (40). Keep this
// well above any single batch AND above the full book.
const MAX_PRICE_TICKERS = 120;

function parseTickersParam(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(',')) {
    const ticker = part.trim().toUpperCase();
    if (!ticker || seen.has(ticker)) continue;
    seen.add(ticker);
    out.push(ticker);
  }
  return out;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const tickersParam = req.query.tickers;
  if (!tickersParam || typeof tickersParam !== 'string') {
    return res.status(400).json({ error: 'Missing tickers query param' });
  }

  const requested = parseTickersParam(tickersParam);
  if (requested.length === 0) {
    return res.status(400).json({ error: 'No tickers provided' });
  }

  const tickers = requested.slice(0, MAX_PRICE_TICKERS);
  const overflow = requested.slice(MAX_PRICE_TICKERS);
  if (overflow.length > 0) {
    console.warn(
      `[prices] capping ${requested.length} tickers to ${MAX_PRICE_TICKERS}; ` +
        `${overflow.length} returned as fetchError`,
    );
  }

  const fetchedAt = Date.now();

  const results = await Promise.allSettled(
    tickers.map(async (ticker) => {
      // Resolve any ambiguous symbol to its canonical Yahoo listing before any
      // fetch. The returned `ticker` field stays the original input — the rest
      // of the app keys off that string.
      const symbol = resolveSymbol(ticker);

      // Primary quote for price/market data
      const quote = await yahooFinance.quote(symbol);

      // Do not invent a $0 last price when Yahoo omitted regularMarketPrice.
      if (quote.regularMarketPrice == null) {
        return {
          ticker,
          price: 0,
          change: 0,
          changePercent: 0,
          nextEarningsDate: null,
          lastReportedQuarterEnd: null,
          fetchError: true,
          fetchedAt,
        };
      }

      // quoteType tells us whether this is a stock, ETF, or mutual fund —
      // stocks-only modules (financialData/assetProfile) return empty for
      // funds, so we branch to fundProfile instead.
      const isFund = quote.quoteType === 'ETF' || quote.quoteType === 'MUTUALFUND';
      // Crypto has none of the stock-only fields below (analyst targets, sector,
      // earnings) and the fund modules don't apply either — skip the extra
      // quoteSummary round-trip entirely and let those fields stay undefined.
      const isCrypto = quote.quoteType === 'CRYPTOCURRENCY';

      // ── Analyst consensus data (stocks) / fund classification (funds) ────
      let analystTargetPrice: number | undefined;
      let recommendationMean: number | undefined;
      let yahooSector: string | undefined;
      let yahooIndustry: string | undefined;
      let fundCategory: string | undefined;
      let expenseRatio: number | undefined;
      // Earliest upcoming earnings date, sourced from calendarEvents (stocks only).
      // Null (not undefined) when Yahoo has no earnings data for this ticker —
      // callers should treat null/undefined the same, but null is the explicit signal.
      let nextEarningsDate: string | null = null;
      // Ground-truth fiscal period-end that Yahoo has ACTUAL reported data for,
      // from defaultKeyStatistics.mostRecentQuarter — independent of the
      // forward-looking nextEarningsDate estimate (which can roll to the next
      // quarter before/right after a release). Null when unavailable.
      let lastReportedQuarterEnd: string | null = null;

      try {
        if (isCrypto) {
          // No stock/fund metadata to fetch — all the fields above stay undefined.
        } else if (isFund) {
          // fundProfile works for both ETFs and mutual funds — confirmed
          // against ICLN, ITA, VFIAX, VTSAX, FXAIX. categoryName is a
          // Morningstar-style label (e.g. "Large Blend", "Industrials"),
          // not a GICS sector — mapped downstream in PortfolioTab.tsx.
          const summary = await yahooFinance.quoteSummary(symbol, {
            modules: ['fundProfile'],
          });
          const fp = summary?.fundProfile;
          if (fp) {
            fundCategory = (fp as any).categoryName ?? undefined;
            expenseRatio = (fp as any).feesExpensesInvestment?.netExpRatio ?? undefined;
          }
        } else {
          // quote() does not reliably return targetMeanPrice / recommendationMean
          // in all environments. quoteSummary with the 'financialData' module is
          // the authoritative source — it always includes both fields when available.
          // calendarEvents is bundled into the same request — Yahoo returns all
          // requested modules in one HTTP call, so this adds no extra round-trip.
          const summary = await yahooFinance.quoteSummary(symbol, {
            modules: ['financialData', 'assetProfile', 'calendarEvents', 'defaultKeyStatistics'],
          });
          const fd = summary?.financialData;
          if (fd) {
            analystTargetPrice = (fd as any).targetMeanPrice?.raw
              ?? (fd as any).targetMeanPrice
              ?? undefined;
            recommendationMean = (fd as any).recommendationMean?.raw
              ?? (fd as any).recommendationMean
              ?? undefined;
          }
          const ap = summary?.assetProfile;
          if (ap) {
            yahooSector = (ap as any).sector ?? undefined;
            yahooIndustry = (ap as any).industry ?? undefined;
          }
          const earningsDates = summary?.calendarEvents?.earnings?.earningsDate;
          if (earningsDates && earningsDates.length > 0) {
            const earliest = earningsDates
              .map((d) => new Date(d))
              .filter((d) => !isNaN(d.getTime()))
              .sort((a, b) => a.getTime() - b.getTime())[0];
            if (earliest) nextEarningsDate = earliest.toISOString().split('T')[0];
          }
          const mrq = (summary?.defaultKeyStatistics as any)?.mostRecentQuarter;
          if (mrq) {
            const mrqDate = new Date(mrq);
            if (!isNaN(mrqDate.getTime())) {
              lastReportedQuarterEnd = mrqDate.toISOString().split('T')[0];
            }
          }
        }
      } catch {
        // Analyst/fund/earnings data is optional — fall back to whatever quote() has
        analystTargetPrice = (quote as any).targetMeanPrice ?? undefined;
        recommendationMean = (quote as any).recommendationMean ?? undefined;
      }

      // Compute 1-week change via chart data
      let weekChangePercent: number | undefined;
      try {
        const spark = await yahooFinance.chart(symbol, {
          period1: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          period2: new Date(),
          interval: '1d',
        });
        const closes = spark.quotes
          ?.map((q: { close: number | null }) => q.close)
          .filter((v): v is number => v != null);
        if (closes && closes.length >= 2) {
          const open = closes[0];
          const last = closes[closes.length - 1];
          weekChangePercent = ((last - open) / open) * 100;
        }
      } catch {
        // Week change is optional — skip on failure
      }

      return {
        ticker,
        quoteType: quote.quoteType, // NEW — 'EQUITY' | 'ETF' | 'MUTUALFUND' etc.
        price: quote.regularMarketPrice ?? 0,
        change: quote.regularMarketChange ?? 0,
        changePercent: quote.regularMarketChangePercent ?? 0,
        weekChangePercent,
        marketCap: quote.marketCap,
        volume: quote.regularMarketVolume,
        regularMarketOpen: quote.regularMarketOpen,
        fiftyTwoWeekHigh: quote.fiftyTwoWeekHigh,
        fiftyTwoWeekLow: quote.fiftyTwoWeekLow,
        // Analyst consensus — sourced from quoteSummary.financialData (stocks only)
        analystTargetPrice,
        recommendationMean,
        // Sector/industry — sourced from quoteSummary.assetProfile (stocks only)
        yahooSector,
        yahooIndustry,
        // Fund classification — sourced from quoteSummary.fundProfile (ETFs + mutual funds)
        fundCategory,
        expenseRatio,
        // Earliest upcoming earnings date — sourced from quoteSummary.calendarEvents (stocks only)
        nextEarningsDate,
        // Fiscal period-end Yahoo has actual reported data for — sourced from
        // quoteSummary.defaultKeyStatistics.mostRecentQuarter (stocks only).
        // Ground-truth "last actually reported quarter", independent of the
        // forward-looking nextEarningsDate estimate.
        lastReportedQuarterEnd,
        fetchError: false,
        fetchedAt,
      };
    }),
  );

  const prices = results.map((result, i) => {
    if (result.status === 'fulfilled') return result.value;
    console.error(`Price fetch failed for ${tickers[i]}:`, result.reason?.message);
    return {
      ticker: tickers[i],
      price: 0,
      change: 0,
      changePercent: 0,
      nextEarningsDate: null,
      lastReportedQuarterEnd: null,
      fetchError: true,
      fetchedAt,
    };
  });

  for (const ticker of overflow) {
    prices.push({
      ticker,
      price: 0,
      change: 0,
      changePercent: 0,
      nextEarningsDate: null,
      lastReportedQuarterEnd: null,
      fetchError: true,
      fetchedAt,
    });
  }

  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60');
  return res.status(200).json(prices);
}