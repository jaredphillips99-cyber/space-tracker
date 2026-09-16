/**
 * Shared Claude-route guard: JWT auth, operator allowlist, optional rate limit.
 *
 * Lives at repo-root `lib/claudeGuard.ts` so Vercel NFT can trace it from
 * `api/*.ts` (vercel.json also includeFiles this folder).
 *
 * CRITICAL: do NOT statically import `@upstash/redis` or `@supabase/supabase-js`
 * here. A top-level Redis/Supabase import crashed every Claude-route AND
 * `/api/me` at module load (FUNCTION_INVOCATION_FAILED) even when the request
 * had no Authorization header. Load those packages only inside the helpers
 * that need them.
 */

export interface GuardUser {
  id: string;
  email: string;
}

export type GateFailure = { ok: false; status: number; error: string };
export type GateSuccess = { ok: true; user: GuardUser; isAdmin: boolean };
export type GateResult = GateSuccess | GateFailure;

export interface RateLimitStore {
  incr: (key: string) => Promise<number>;
  pexpire: (key: string, ms: number) => Promise<unknown>;
}

export interface ClaudeGuardDeps {
  verifyJwt: (token: string) => Promise<GuardUser | null>;
  rateLimitStore: RateLimitStore | null;
  adminEmails: string;
}

export interface GuardRequest {
  headers: {
    authorization?: string | string[];
  };
}

const DEFAULT_WINDOW_MS = 60 * 60 * 1000;

function stripWrappingQuotes(s: string): string {
  return s.replace(/^['"]+/, '').replace(/['"]+$/, '');
}

export function parseAdminEmails(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((s) => stripWrappingQuotes(s.trim()).trim().toLowerCase())
    .filter(Boolean);
}

export function isOperatorEmail(
  email: string | undefined | null,
  adminEmailsRaw: string | undefined,
): boolean {
  if (!email) return false;
  const list = parseAdminEmails(adminEmailsRaw);
  if (list.length === 0) return false;
  return list.includes(email.trim().toLowerCase());
}

export function extractBearerToken(
  authorization: string | string[] | undefined,
): string | null {
  const header = Array.isArray(authorization) ? authorization[0] : authorization;
  if (!header || typeof header !== 'string') return null;
  const match = header.match(/^Bearer\s+(\S+)/i);
  return match ? match[1] : null;
}

export async function consumeFixedWindowLimit(
  store: RateLimitStore,
  identity: string,
  limit: number,
  windowMs: number,
  bucket: string,
): Promise<{ allowed: boolean; count: number }> {
  const key = `rl:${bucket}:${identity}`;
  const count = await store.incr(key);
  if (count === 1) {
    await store.pexpire(key, windowMs);
  }
  return { allowed: count <= limit, count };
}

export function createMemoryRateLimitStore(): RateLimitStore {
  const map = new Map<string, { count: number; resetAt: number }>();
  return {
    async incr(key: string) {
      const now = Date.now();
      const entry = map.get(key);
      if (!entry || now > entry.resetAt) {
        map.set(key, { count: 1, resetAt: now + DEFAULT_WINDOW_MS });
        return 1;
      }
      entry.count += 1;
      return entry.count;
    },
    async pexpire(key: string, ms: number) {
      const entry = map.get(key);
      if (entry) entry.resetAt = Date.now() + ms;
    },
  };
}

/** Lazy-load Upstash. Returns null when env is missing or Redis fails to init. */
export async function createUpstashStore(): Promise<RateLimitStore | null> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  try {
    const { Redis } = await import('@upstash/redis');
    const redis = new Redis({ url, token });
    return {
      incr: (key) => redis.incr(key),
      pexpire: (key, ms) => redis.pexpire(key, ms),
    };
  } catch (err) {
    console.error('[claudeGuard] Upstash Redis init failed — using in-memory fallback', err);
    return null;
  }
}

export async function verifySupabaseJwt(token: string): Promise<GuardUser | null> {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) return null;

  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) return null;
    const email = data.user.email?.trim() ?? '';
    if (!email) return null;
    return { id: data.user.id, email };
  } catch (err) {
    console.error('[claudeGuard] JWT verify failed', err);
    return null;
  }
}

export async function productionGuardDeps(): Promise<ClaudeGuardDeps> {
  const upstash = await createUpstashStore();
  if (!upstash) {
    console.warn(
      '[claudeGuard] Upstash not configured — in-memory rate limit (per-instance). Fine for personal use; add UPSTASH_REDIS_* for durable multi-instance limits.',
    );
  }
  return {
    verifyJwt: verifySupabaseJwt,
    rateLimitStore: upstash ?? createMemoryRateLimitStore(),
    adminEmails: process.env.ADMIN_EMAILS ?? '',
  };
}

export async function gateClaudeRequest(
  req: GuardRequest,
  opts: {
    requireOperator: boolean;
    bucket: string;
    limit: number;
    windowMs?: number;
  },
  deps: ClaudeGuardDeps,
): Promise<GateResult> {
  const token = extractBearerToken(req.headers.authorization);
  if (!token) {
    return { ok: false, status: 401, error: 'Unauthorized — sign in required' };
  }

  const user = await deps.verifyJwt(token);
  if (!user) {
    return { ok: false, status: 401, error: 'Unauthorized — invalid or expired session' };
  }

  const isAdmin = isOperatorEmail(user.email, deps.adminEmails);
  if (opts.requireOperator && !isAdmin) {
    return {
      ok: false,
      status: 403,
      error: 'Forbidden — operator allowlist required for this action',
    };
  }

  // Upstash is optional. A missing store must not 503 Claude routes.
  const store = deps.rateLimitStore ?? createMemoryRateLimitStore();
  const { allowed } = await consumeFixedWindowLimit(
    store,
    user.id,
    opts.limit,
    opts.windowMs ?? DEFAULT_WINDOW_MS,
    opts.bucket,
  );

  if (!allowed) {
    return {
      ok: false,
      status: 429,
      error: `Rate limit exceeded — ${opts.limit} requests per hour.`,
    };
  }

  return { ok: true, user, isAdmin };
}

export async function gateClaudeRoute(
  req: GuardRequest,
  opts: { requireOperator: boolean; bucket: string; limit: number },
): Promise<GateResult> {
  return gateClaudeRequest(req, opts, await productionGuardDeps());
}

export function jsonHandlerError(res: { headersSent?: boolean; status: (n: number) => { json: (b: unknown) => unknown } }, err: unknown, label: string): void {
  console.error(label, err);
  if (!res.headersSent) {
    res.status(500).json({ error: 'Internal server error' });
  }
}
