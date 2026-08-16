import type { VercelRequest, VercelResponse } from '@vercel/node';

const EDGAR_UA = 'SpaceTracker Jared Phillips jaredphillips99@gmail.com';

// Allowlist — only SEC domains can be proxied
const ALLOWED_HOSTS = ['www.sec.gov', 'data.sec.gov'];

// Path allowlist. /Archives/ serves filing indexes and exhibit documents;
// /submissions/ serves the per-CIK filing history JSON, which the browser now
// routes through here too so every SEC request carries the declared User-Agent.
const ALLOWED_PATH_PREFIXES = ['/Archives/', '/submissions/'];

// Filing history changes when a new form is filed, so it gets a shorter edge
// cache than immutable archived documents — a re-run right after an earnings
// release should not be served an hour-old submission index.
const SUBMISSIONS_MAX_AGE = 300;
const ARCHIVES_MAX_AGE    = 3600;

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

  const isSubmissions = parsed.pathname.startsWith('/submissions/');
  if (!ALLOWED_PATH_PREFIXES.some(p => parsed.pathname.startsWith(p))) {
    res.status(403).json({ error: `Path not allowed: ${parsed.pathname}` });
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
    res.setHeader(
      'Cache-Control',
      `s-maxage=${isSubmissions ? SUBMISSIONS_MAX_AGE : ARCHIVES_MAX_AGE}`,
    );
    res.status(200).send(text);
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
  }
}
