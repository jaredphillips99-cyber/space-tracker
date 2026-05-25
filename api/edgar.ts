import { VercelRequest, VercelResponse } from '@vercel/node';

// CIK map for all tickers (31 stocks per original spec)
const CIK_MAP: Record<string, string> = {
  RKLB: '0001819994',
  PL: '0001836833',
  RDW: '0001819810',
  LUNR: '0001844452',
  ASTS: '0001780312',
  KTOS: '0001069258',
  BKSY: '0001753539',
  FLY: '0001860160',
  SATS: '0001415404',
  NVDA: '0001045810',
  PLTR: '0001321655',
  CRWV: '0001769628',
  IREN: '0001878848',
  NBIS: '0001513845',
  CIFR: '0001819989',
  RIOT: '0001167419',
  VRT: '0001674101',
  MOD: '0000067347',
  CEG: '0001868275',
  VST: '0001692819',
  BWXT: '0001486957',
  GEV: '0001996810',
  BE: '0001664703',
  CCJ: '0001009001',
  LEU: '0001065059',
  NXE: '0001698535',
  OKLO: '0001849056',
  NNE: '0001923891',
  LHX: '0000202058',
  AVAV: '0001368622',
};

interface EdgarSubmission {
  cik_str: number;
  filings: {
    recent: {
      accessionNumber: string[];
      filingDate: string[];
      reportDate: string[];
      items: string[];
      form: string[];
    };
  };
}

interface EdgarResponse {
  ticker: string;
  cik: string;
  filingDate: string;
  accessionNumber: string;
  period: string;
  items: string;
  documentUrl: string;
  documentText: string;
  wordCount: number;
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  res.setHeader('Cache-Control', 's-maxage=3600');

  const { ticker } = req.query;

  if (!ticker || typeof ticker !== 'string') {
    res.status(400).json({ error: 'ticker query param required' });
    return;
  }

  const cik = CIK_MAP[ticker.toUpperCase()];
  if (!cik) {
    res.status(404).json({ error: `Unknown ticker: ${ticker}` });
    return;
  }

  try {
    // Fetch submission index
    const submissionUrl = `https://data.sec.gov/submissions/CIK${cik}.json`;
    const submissionRes = await fetch(submissionUrl, {
      headers: {
        'User-Agent': 'SpaceTracker space-tracker@users.noreply.github.com',
      },
    });

    if (!submissionRes.ok) {
      res.status(502).json({
        error: 'Failed to fetch SEC submission data',
        ticker,
        detail: `HTTP ${submissionRes.status}`,
      });
      return;
    }

    const submission = (await submissionRes.json()) as EdgarSubmission;
    const recent = submission.filings.recent;

    // Find most recent 8-K with items including "2.02"
    let filing8kIdx = -1;
    for (let i = 0; i < recent.form.length; i++) {
      if (
        recent.form[i] === '8-K' &&
        recent.items[i] &&
        recent.items[i].includes('2.02')
      ) {
        filing8kIdx = i;
        break;
      }
    }

    if (filing8kIdx === -1) {
      res.status(502).json({
        error: 'No recent 8-K with earnings release (item 2.02) found',
        ticker,
      });
      return;
    }

    const filingDate = recent.filingDate[filing8kIdx];
    const accessionNumber = recent.accessionNumber[filing8kIdx];
    const reportDate = recent.reportDate[filing8kIdx];
    const items = recent.items[filing8kIdx];

    // Fetch filing index
    const numericCik = submission.cik_str;
    const accNoNoDashes = accessionNumber.replace(/-/g, '');
    const indexUrl = `https://www.sec.gov/Archives/edgar/data/${numericCik}/${accNoNoDashes}/`;

    const indexRes = await fetch(indexUrl, {
      headers: {
        'User-Agent': 'SpaceTracker space-tracker@users.noreply.github.com',
      },
    });

    if (!indexRes.ok) {
      res.status(502).json({
        error: 'Failed to fetch filing index',
        ticker,
        detail: `HTTP ${indexRes.status}`,
      });
      return;
    }

    const indexHtml = await indexRes.text();

    // Find EX-99.1 link
    const ex99Pattern = /(ex-?99\.?\d?|exhibit\s*99)[^\s>]*/gi;
    const matches = Array.from(indexHtml.matchAll(ex99Pattern));

    let documentUrl = '';
    let shortestMatch = '';

    for (const match of matches) {
      const href = match[0];
      // Look for .htm files, prefer shortest match
      if (
        (href.endsWith('.htm') || href.endsWith('.html')) &&
        (!shortestMatch || href.length < shortestMatch.length)
      ) {
        shortestMatch = href;
      }
    }

    if (!shortestMatch) {
      res.status(502).json({
        error: 'Could not find EX-99.1 document link',
        ticker,
      });
      return;
    }

    documentUrl = `${indexUrl}${shortestMatch}`;

    // Fetch EX-99.1 document
    const docRes = await fetch(documentUrl, {
      headers: {
        'User-Agent': 'SpaceTracker space-tracker@users.noreply.github.com',
      },
    });

    if (!docRes.ok) {
      res.status(502).json({
        error: 'Failed to fetch document',
        ticker,
        detail: `HTTP ${docRes.status}`,
      });
      return;
    }

    let docText = await docRes.text();

    // Strip HTML tags, scripts, styles
    docText = docText.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
    docText = docText.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
    docText = docText.replace(/<[^>]+>/g, ' ');

    // Decode HTML entities
    docText = docText
      .replace(/&nbsp;/g, ' ')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");

    // Collapse whitespace
    docText = docText.replace(/\s+/g, ' ').trim();

    // Truncate to 80000 chars
    if (docText.length > 80000) {
      docText = docText.substring(0, 80000);
    }

    const wordCount = docText.split(/\s+/).length;

    const response: EdgarResponse = {
      ticker: ticker.toUpperCase(),
      cik,
      filingDate,
      accessionNumber,
      period: reportDate,
      items,
      documentUrl,
      documentText: docText,
      wordCount,
    };

    res.status(200).json(response);
  } catch (error) {
    res.status(502).json({
      error: 'Internal server error',
      ticker,
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}
