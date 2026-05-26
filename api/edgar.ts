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

const SPECULATIVE_TICKERS = new Set(['OKLO', 'NNE', 'NXE']);
const SEDAR_ONLY_TICKERS = new Set(['NXE']);

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

interface FilingInfo {
  filingDate: string;
  accessionNumber: string;
  period: string;
  items: string;
}

interface EdgarResponse {
  ticker: string;
  cik: string;
  filingDate: string | null;
  accessionNumber: string | null;
  period: string | null;
  items: string | null;
  documentUrl: string;
  documentText: string;
  wordCount: number;
  isSpeculative?: boolean;
  isSedarOnly?: boolean;
  tenQUrl?: string;
  sources?: {
    hasEightK: boolean;
    hasTenQ: boolean;
  };
  note?: string;
}

function stripHtml(html: string): string {
  let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  text = text.replace(/<[^>]+>/g, ' ');
  text = text
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  text = text.replace(/\s+/g, ' ').trim();
  return text;
}

function findLatestEarnings8K(
  submission: EdgarSubmission
): FilingInfo | null {
  const recent = submission.filings.recent;
  for (let i = 0; i < recent.form.length; i++) {
    if (
      recent.form[i] === '8-K' &&
      recent.items[i] &&
      recent.items[i].includes('2.02')
    ) {
      return {
        filingDate: recent.filingDate[i],
        accessionNumber: recent.accessionNumber[i],
        period: recent.reportDate[i],
        items: recent.items[i],
      };
    }
  }
  return null;
}

function findLatest8K(submission: EdgarSubmission): FilingInfo | null {
  const recent = submission.filings.recent;
  for (let i = 0; i < recent.form.length; i++) {
    if (recent.form[i] === '8-K') {
      return {
        filingDate: recent.filingDate[i],
        accessionNumber: recent.accessionNumber[i],
        period: recent.reportDate[i],
        items: recent.items[i] || '',
      };
    }
  }
  return null;
}

function findLatest10Q(submission: EdgarSubmission): FilingInfo | null {
  const recent = submission.filings.recent;
  for (let i = 0; i < recent.form.length; i++) {
    if (recent.form[i] === '10-Q') {
      return {
        filingDate: recent.filingDate[i],
        accessionNumber: recent.accessionNumber[i],
        period: recent.reportDate[i],
        items: '',
      };
    }
  }
  return null;
}

function extractMDA(fullText: string): string {
  const mdaStartPatterns = [
    /management'?s?\s+discussion\s+and\s+analysis/i,
    /management\s+discussion/i,
    /item\s+2\.?\s*$/m,
  ];

  const mdaEndPatterns = [
    /item\s+3[^a-z0-9]/i,
    /quantitative\s+and\s+qualitative/i,
    /controls\s+and\s+procedures/i,
    /legal\s+proceedings/i,
  ];

  let startIdx = -1;
  for (const pattern of mdaStartPatterns) {
    const match = fullText.match(pattern);
    if (match) {
      startIdx = match.index ?? 0;
      break;
    }
  }

  if (startIdx === -1) {
    return fullText.substring(0, 15000);
  }

  let endIdx = fullText.length;
  const remaining = fullText.substring(startIdx);
  for (const pattern of mdaEndPatterns) {
    const match = remaining.match(pattern);
    if (match) {
      endIdx = startIdx + (match.index ?? remaining.length) + 1000;
      break;
    }
  }

  endIdx = Math.min(endIdx, startIdx + 15000);
  let mdaText = fullText.substring(startIdx, endIdx);

  if (mdaText.length > 20000) {
    mdaText = mdaText.substring(0, 20000);
  }

  return mdaText;
}

async function findEx991Url(indexHtml: string): Promise<string | null> {
  const ex99Pattern = /(ex-?99\.?\d?|exhibit\s*99)[^\s>]*/gi;
  const matches = Array.from(indexHtml.matchAll(ex99Pattern));

  let shortestMatch = '';
  for (const match of matches) {
    const href = match[0];
    if (
      (href.endsWith('.htm') || href.endsWith('.html')) &&
      (!shortestMatch || href.length < shortestMatch.length)
    ) {
      shortestMatch = href;
    }
  }

  return shortestMatch || null;
}

async function findPrimaryDocumentUrl(
  indexHtml: string,
  accessionNumber: string
): Promise<string | null> {
  const accNoBase = accessionNumber.replace(/-/g, '');

  // Look for 10-Q form
  const tenQPattern = /-10q\.htm/i;
  const matches = Array.from(
    indexHtml.matchAll(/href\s*=\s*["']([^"']+\.htm[l]?)["']/gi)
  );

  let candidateUrl = '';
  for (const match of matches) {
    const href = match[1];
    if (tenQPattern.test(href) && !href.toLowerCase().includes('ex')) {
      return href;
    }
    if (
      href.includes(accNoBase) &&
      !href.toLowerCase().includes('ex') &&
      (href.endsWith('.htm') || href.endsWith('.html'))
    ) {
      if (!candidateUrl || href.length < candidateUrl.length) {
        candidateUrl = href;
      }
    }
  }

  return candidateUrl || null;
}

async function fetchDocumentText(
  url: string
): Promise<{ text: string; documentUrl: string } | null> {
  try {
    const docRes = await fetch(url, {
      headers: {
        'User-Agent': 'SpaceTracker space-tracker@users.noreply.github.com',
      },
    });

    if (!docRes.ok) {
      return null;
    }

    let docText = await docRes.text();
    docText = stripHtml(docText);

    if (docText.length > 80000) {
      docText = docText.substring(0, 80000);
    }

    return { text: docText, documentUrl: url };
  } catch {
    return null;
  }
}

async function fetchLatest10QText(
  cik: string,
  submission: EdgarSubmission
): Promise<{
  text: string;
  filingDate: string;
  period: string;
  documentUrl: string;
} | null> {
  const tenQFiling = findLatest10Q(submission);
  if (!tenQFiling) {
    return null;
  }

  const numericCik = submission.cik_str;
  const accNoNoDashes = tenQFiling.accessionNumber.replace(/-/g, '');
  const indexUrl = `https://www.sec.gov/Archives/edgar/data/${numericCik}/${accNoNoDashes}/`;

  const indexRes = await fetch(indexUrl, {
    headers: {
      'User-Agent': 'SpaceTracker space-tracker@users.noreply.github.com',
    },
  });

  if (!indexRes.ok) {
    return null;
  }

  const indexHtml = await indexRes.text();

  // Try EX-99.1 first
  let docUrl = await findEx991Url(indexHtml);
  if (!docUrl) {
    // Fall back to primary document
    docUrl = await findPrimaryDocumentUrl(
      indexHtml,
      tenQFiling.accessionNumber
    );
  }

  if (!docUrl) {
    return null;
  }

  const fullUrl = `${indexUrl}${docUrl}`;
  const docResult = await fetchDocumentText(fullUrl);

  if (!docResult) {
    return null;
  }

  const mdaText = extractMDA(docResult.text);

  return {
    text: mdaText,
    filingDate: tenQFiling.filingDate,
    period: tenQFiling.period,
    documentUrl: fullUrl,
  };
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

  const upperTicker = ticker.toUpperCase();
  const cik = CIK_MAP[upperTicker];
  if (!cik) {
    res.status(404).json({ error: `Unknown ticker: ${ticker}` });
    return;
  }

  // Handle SEDAR-only tickers
  if (SEDAR_ONLY_TICKERS.has(upperTicker)) {
    const response: EdgarResponse = {
      ticker: upperTicker,
      cik,
      isSedarOnly: true,
      documentText: '',
      documentUrl: 'https://www.sedar.com',
      filingDate: null,
      accessionNumber: null,
      period: null,
      items: null,
      wordCount: 0,
      note: 'NXE (NexGen Energy) files on SEDAR (Canadian), not SEC EDGAR. Automated filing fetch is not supported. Analysis will be based on Claude training knowledge only.',
    };
    res.status(200).json(response);
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
    const numericCik = submission.cik_str;

    // Handle speculative tickers (dual filing)
    if (SPECULATIVE_TICKERS.has(upperTicker)) {
      const [eightKResult, tenQResult] = await Promise.allSettled([
        (async () => {
          const eightKFiling = findLatest8K(submission);
          if (!eightKFiling) return null;

          const accNoNoDashes = eightKFiling.accessionNumber.replace(/-/g, '');
          const indexUrl = `https://www.sec.gov/Archives/edgar/data/${numericCik}/${accNoNoDashes}/`;

          const indexRes = await fetch(indexUrl, {
            headers: {
              'User-Agent':
                'SpaceTracker space-tracker@users.noreply.github.com',
            },
          });

          if (!indexRes.ok) return null;

          const indexHtml = await indexRes.text();
          let docUrl = await findEx991Url(indexHtml);

          if (!docUrl) {
            docUrl = await findPrimaryDocumentUrl(
              indexHtml,
              eightKFiling.accessionNumber
            );
          }

          if (!docUrl) return null;

          const fullUrl = `${indexUrl}${docUrl}`;
          const docResult = await fetchDocumentText(fullUrl);

          if (!docResult) return null;

          return {
            ...eightKFiling,
            text: docResult.text,
            documentUrl: fullUrl,
          };
        })(),
        fetchLatest10QText(cik, submission),
      ]);

      const eightKData =
        eightKResult.status === 'fulfilled' ? eightKResult.value : null;
      const tenQData =
        tenQResult.status === 'fulfilled' ? tenQResult.value : null;

      if (!eightKData && !tenQData) {
        res.status(502).json({
          error: `No EDGAR filings found for ${ticker}`,
          ticker,
        });
        return;
      }

      let combinedText = '';
      if (eightKData) {
        combinedText += `=== MOST RECENT 8-K: Current Events & Announcements ===\n`;
        combinedText += `Filed: ${eightKData.filingDate} | Items: ${eightKData.items}\n\n`;
        combinedText += eightKData.text;
      }
      if (tenQData) {
        if (combinedText) combinedText += '\n\n';
        combinedText += `=== MOST RECENT 10-Q: Financial Position & MD&A ===\n`;
        combinedText += `Filed: ${tenQData.filingDate} | Period: ${tenQData.period}\n\n`;
        combinedText += tenQData.text;
      }

      const response: EdgarResponse = {
        ticker: upperTicker,
        cik,
        isSpeculative: true,
        filingDate: eightKData?.filingDate ?? tenQData?.filingDate ?? null,
        accessionNumber: eightKData?.accessionNumber ?? null,
        period: tenQData?.period ?? eightKData?.period ?? null,
        items: eightKData?.items ?? null,
        documentUrl: eightKData?.documentUrl ?? tenQData?.documentUrl ?? '',
        tenQUrl: tenQData?.documentUrl,
        documentText: combinedText,
        wordCount: combinedText.split(/\s+/).length,
        sources: {
          hasEightK: !!eightKData,
          hasTenQ: !!tenQData,
        },
      };

      res.status(200).json(response);
      return;
    }

    // Normal revenue-generating ticker (existing logic)
    const recent = submission.filings.recent;

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

    const ex99Url = await findEx991Url(indexHtml);
    if (!ex99Url) {
      res.status(502).json({
        error: 'Could not find EX-99.1 document link',
        ticker,
      });
      return;
    }

    const documentUrl = `${indexUrl}${ex99Url}`;

    // Fetch EX-99.1 document
    const docRes = await fetchDocumentText(documentUrl);

    if (!docRes) {
      res.status(502).json({
        error: 'Failed to fetch document',
        ticker,
        detail: 'HTTP error or no response body',
      });
      return;
    }

    const wordCount = docRes.text.split(/\s+/).length;

    const response: EdgarResponse = {
      ticker: upperTicker,
      cik,
      filingDate,
      accessionNumber,
      period: reportDate,
      items,
      documentUrl,
      documentText: docRes.text,
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
