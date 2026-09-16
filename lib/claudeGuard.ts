/**
 * Shared Claude-route guard: JWT auth, operator allowlist, durable rate limit.
 *
 * Lives at repo-root `lib/` on purpose — NOT under `api/_shared/`.
 * Vercel does not bundle underscore-prefixed paths under `api/` as importable
 * dependencies of serverless functions (see Aug 6 2026 hotfix). Root-level
 * `lib/` is traced and bundled as a normal import from `api/*.ts`.
 */

import { createClient } from '@supabase/supabase-js';
import { Redis } from '@upstash/redis';
import type { VercelRequest } from '@vercel/node';

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

const DEFAULT_WINDOW_MS = 60 * 60 * 1000;

export function parseAdminEmails(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
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

/**
 * Fixed-window counter. Atomic INCR + PEXPIRE-on-first-hit.
 * Two serverless instances sharing this store share the same count — that is
 * the cold-start / multi-instance property in-memory Maps do not have.
 */
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

export function createUpstashStore(): RateLimitStore | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const redis = new Redis({ url, token });
  return {
    incr: (key) => redis.incr(key),
    pexpire: (key, ms) => redis.pexpire(key, ms),
  };
}

export async function verifySupabaseJwt(token: string): Promise<GuardUser | null> {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) return null;

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;
  const email = data.user.email?.trim() ?? '';
  if (!email) return null;
  return { id: data.user.id, email };
}

export function productionGuardDeps(): ClaudeGuardDeps {
  return {
    verifyJwt: verifySupabaseJwt,
    rateLimitStore: createUpstashStore(),
    adminEmails: process.env.ADMIN_EMAILS ?? '',
  };
}

export async function gateClaudeRequest(
  req: Pick<VercelRequest, 'headers'>,
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

/** Convenience wrapper used by the Vercel handlers. */
export async function gateClaudeRoute(
  req: VercelRequest,
  opts: { requireOperator: boolean; bucket: string; limit: number },
): Promise<GateResult> {
  return gateClaudeRequest(req, opts, productionGuardDeps());
}
