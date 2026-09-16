/**
 * Shared Claude-route guard: JWT auth, operator allowlist, durable rate limit.
 *
 * Shipped as a `file:` workspace package (imported via node_modules as
 * `@investai/claude-guard`) on purpose. Relative imports from `api/*.ts` into
 * repo-root `lib/*.ts` (and `api/_shared/`) 500 at Vercel init with
 * FUNCTION_INVOCATION_FAILED — confirmed on production 2026-09-16 for every
 * handler that imported `../lib/claudeGuard`. NFT follows package imports
 * through node_modules; it does not reliably bundle cross-tree TS helpers.
 *
 * Redis and Supabase are loaded lazily so a GET with no auth (or a 405)
 * never evaluates those packages.
 */

const DEFAULT_WINDOW_MS = 60 * 60 * 1000;

function stripWrappingQuotes(s) {
  return s.replace(/^['"]+/, '').replace(/['"]+$/, '');
}

export function parseAdminEmails(raw) {
  return (raw ?? '')
    .split(',')
    .map((s) => stripWrappingQuotes(s.trim()).trim().toLowerCase())
    .filter(Boolean);
}

export function isOperatorEmail(email, adminEmailsRaw) {
  if (!email) return false;
  const list = parseAdminEmails(adminEmailsRaw);
  if (list.length === 0) return false;
  return list.includes(email.trim().toLowerCase());
}

export function extractBearerToken(authorization) {
  const header = Array.isArray(authorization) ? authorization[0] : authorization;
  if (!header || typeof header !== 'string') return null;
  const match = header.match(/^Bearer\s+(\S+)/i);
  return match ? match[1] : null;
}

export async function consumeFixedWindowLimit(store, identity, limit, windowMs, bucket) {
  const key = `rl:${bucket}:${identity}`;
  const count = await store.incr(key);
  if (count === 1) {
    await store.pexpire(key, windowMs);
  }
  return { allowed: count <= limit, count };
}

export function createMemoryRateLimitStore() {
  const map = new Map();
  return {
    async incr(key) {
      const now = Date.now();
      const entry = map.get(key);
      if (!entry || now > entry.resetAt) {
        map.set(key, { count: 1, resetAt: now + DEFAULT_WINDOW_MS });
        return 1;
      }
      entry.count += 1;
      return entry.count;
    },
    async pexpire(key, ms) {
      const entry = map.get(key);
      if (entry) entry.resetAt = Date.now() + ms;
    },
  };
}

export async function createUpstashStore() {
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
    console.error('[claudeGuard] Upstash Redis init failed', err);
    return null;
  }
}

export async function verifySupabaseJwt(token) {
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

export async function productionGuardDeps() {
  return {
    verifyJwt: verifySupabaseJwt,
    rateLimitStore: await createUpstashStore(),
    adminEmails: process.env.ADMIN_EMAILS ?? '',
  };
}

export async function gateClaudeRequest(req, opts, deps) {
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

  if (!deps.rateLimitStore) {
    return {
      ok: false,
      status: 503,
      error: 'Rate limiter not configured (set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN)',
    };
  }

  const { allowed } = await consumeFixedWindowLimit(
    deps.rateLimitStore,
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

export async function gateClaudeRoute(req, opts) {
  return gateClaudeRequest(req, opts, await productionGuardDeps());
}
