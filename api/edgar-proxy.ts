import type { VercelRequest, VercelResponse } from '@vercel/node';

const EDGAR_UA = 'SpaceTracker Jared Phillips jaredphillips99@gmail.com';

// Allowlist — only SEC domains can be proxied
const ALLOWED_HOSTS = ['www.sec.gov', 'data.sec.gov'];

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { url } = req.query;
  if (!url || typeof url !== 'string') {
    res.status(400).json({ error: 'url query param required' });
    return;
  }

  // Security: only allow SEC domains
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    res.status(400).json({ error: 'Invalid URL' });
    return;
  }

  if (!ALLOWED_HOSTS.includes(parsed.hostname)) {
    res.status(403).json({ error: `Host not allowed: ${parsed.hostname}` });
    return;
  }

  try {
    const secRes = await fetch(url, {
      headers: { 'User-Agent': EDGAR_UA },
    });

    if (!secRes.ok) {
      res.status(secRes.status).json({ error: `SEC returned ${secRes.status}` });
      return;
    }

    const text = await secRes.text();
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 's-maxage=3600'); // cache 1hr at edge
    res.status(200).send(text);
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
  }
}
