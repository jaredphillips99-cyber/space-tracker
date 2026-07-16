import type { VercelRequest, VercelResponse } from '@vercel/node';
import YahooFinance from 'yahoo-finance2';

// yahoo-finance2 v3 requires instantiation (breaking change from v2)
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const tickersParam = req.query.tickers;
  if (!tickersParam || typeof tickersParam !== 'string') {
    return res.status(400).json({ error: 'Missing tickers query param' });
  }

  const tickers = tickersParam
    .split(',')
    .map((t) => t.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, 50); // hard cap

  const fetchedAt = Date.now();

  const results = await Promise.allSettled(
    tickers.map(async (ticker) => {
      // Primary quote for price/market data
      const quote = await yahooFinance.quote(ticker);

      // quoteType tells us whether this is a stock, ETF, or mutual fund —
      // stocks-only modules (financialData/assetProfile) return empty for
      // funds, so we branch to fundProfile instead.
      const isFund = quote.quoteType === 'ETF' || quote.quoteType === 'MUTUALFUND';

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

      try {
        if (isFund) {
          // fundProfile works for both ETFs and mutual funds — confirmed
          // against ICLN, ITA, VFIAX, VTSAX, FXAIX. categoryName is a
          // Morningstar-style label (e.g. "Large Blend", "Industrials"),
          // not a GICS sector — mapped downstream in PortfolioTab.tsx.
          const summary = await yahooFinance.quoteSummary(ticker, {
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
          const summary = await yahooFinance.quoteSummary(ticker, {
            modules: ['financialData', 'assetProfile', 'calendarEvents'],
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
        }
      } catch {
        // Analyst/fund/earnings data is optional — fall back to whatever quote() has
        analystTargetPrice = (quote as any).targetMeanPrice ?? undefined;
        recommendationMean = (quote as any).recommendationMean ?? undefined;
      }

      // Compute 1-week change via chart data
      let weekChangePercent: number | undefined;
      try {
        const spark = await yahooFinance.chart(ticker, {
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
      fetchError: true,
      fetchedAt,
    };
  });

  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60');
  return res.status(200).json(prices);
}