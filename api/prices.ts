import type { VercelRequest, VercelResponse } from '@vercel/node';
import yahooFinance from 'yahoo-finance2';

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
      const quote = await yahooFinance.quote(ticker, {
        fields: [
          'regularMarketPrice',
          'regularMarketChange',
          'regularMarketChangePercent',
          'regularMarketOpen',
          'marketCap',
          'regularMarketVolume',
          'fiftyTwoWeekHigh',
          'fiftyTwoWeekLow',
        ],
      });

      // Compute 1-week change via spark data
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
        price: quote.regularMarketPrice ?? 0,
        change: quote.regularMarketChange ?? 0,
        changePercent: quote.regularMarketChangePercent ?? 0,
        weekChangePercent,
        marketCap: quote.marketCap,
        volume: quote.regularMarketVolume,
        regularMarketOpen: quote.regularMarketOpen,
        fiftyTwoWeekHigh: quote.fiftyTwoWeekHigh,
        fiftyTwoWeekLow: quote.fiftyTwoWeekLow,
        fetchError: false,
        fetchedAt,
      };
    }),
  );

  const prices = results.map((result, i) => {
    if (result.status === 'fulfilled') return result.value;
    return {
      ticker: tickers[i],
      price: 0,
      change: 0,
      changePercent: 0,
      fetchError: true,
      fetchedAt,
    };
  });

  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60');
  return res.status(200).json(prices);
}
