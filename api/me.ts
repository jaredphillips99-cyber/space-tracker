import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * GET /api/me
 * Returns operator status for the current session. Magic-link login alone
 * does NOT set isAdmin — only ADMIN_EMAILS does.
 *
 * Import surface is intentionally tiny: this file has NO static import of
 * lib/claudeGuard, @upstash/redis, or @supabase/supabase-js. Unauthenticated
 * GET must return 200 JSON even if those packages fail to load. JWT verify
 * is dynamically imported only after a Bearer token is present.
 */

function extractBearerToken(
  authorization: string | string[] | undefined,
): string | null {
  const header = Array.isArray(authorization) ? authorization[0] : authorization;
  if (!header || typeof header !== 'string') return null;
  const match = header.match(/^Bearer\s+(\S+)/i);
  return match ? match[1] : null;
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    if (req.method !== 'GET') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    const token = extractBearerToken(req.headers.authorization);
    if (!token) {
      res.status(200).json({ authenticated: false, isAdmin: false, email: null });
      return;
    }

    const { verifySupabaseJwt, isOperatorEmail } = await import('../lib/claudeGuard.js');
    const user = await verifySupabaseJwt(token);
    if (!user) {
      res.status(401).json({ error: 'Unauthorized — invalid or expired session' });
      return;
    }

    const isAdmin = isOperatorEmail(user.email, process.env.ADMIN_EMAILS);
    res.status(200).json({ authenticated: true, isAdmin, email: user.email });
  } catch (err) {
    console.error('[api/me]', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}
