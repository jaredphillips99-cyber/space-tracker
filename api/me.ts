import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  extractBearerToken,
  isOperatorEmail,
  verifySupabaseJwt,
} from '@investai/claude-guard';

/**
 * GET /api/me
 * Returns operator status for the current session. Magic-link login alone
 * does NOT set isAdmin — only ADMIN_EMAILS does.
 *
 * No Anthropic call. Not a Claude spend path.
 */
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const token = extractBearerToken(req.headers.authorization);
  if (!token) {
    res.status(200).json({ authenticated: false, isAdmin: false, email: null });
    return;
  }

  const user = await verifySupabaseJwt(token);
  if (!user) {
    res.status(401).json({ error: 'Unauthorized — invalid or expired session' });
    return;
  }

  const isAdmin = isOperatorEmail(user.email, process.env.ADMIN_EMAILS);
  res.status(200).json({ authenticated: true, isAdmin, email: user.email });
}
