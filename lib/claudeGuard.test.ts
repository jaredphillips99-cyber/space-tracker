import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import {
  consumeFixedWindowLimit,
  createMemoryRateLimitStore,
  extractBearerToken,
  gateClaudeRequest,
  isOperatorEmail,
  parseAdminEmails,
  type ClaudeGuardDeps,
  type GuardUser,
} from './claudeGuard.ts';

const operator: GuardUser = { id: 'user-op', email: 'jared@example.com' };
const reader: GuardUser = { id: 'user-reader', email: 'reader@example.com' };

function deps(overrides: Partial<ClaudeGuardDeps> = {}): ClaudeGuardDeps {
  const store = createMemoryRateLimitStore();
  return {
    verifyJwt: async (token) => {
      if (token === 'op-token') return operator;
      if (token === 'reader-token') return reader;
      if (token === 'bad-token') return null;
      return null;
    },
    rateLimitStore: store,
    adminEmails: 'jared@example.com, other@example.com',
    ...overrides,
  };
}

function req(authorization?: string) {
  return {
    headers: authorization ? { authorization } : {},
  };
}

describe('parseAdminEmails / isOperatorEmail', () => {
  it('parses comma-separated emails, trims, lowercases', () => {
    assert.deepEqual(
      parseAdminEmails(' Jared@Example.com , other@example.com '),
      ['jared@example.com', 'other@example.com'],
    );
  });

  it('empty / unset allowlist grants nobody (fail closed)', () => {
    assert.equal(isOperatorEmail('jared@example.com', ''), false);
    assert.equal(isOperatorEmail('jared@example.com', undefined), false);
    assert.equal(isOperatorEmail('jared@example.com', '   '), false);
  });

  it('allowlist match is case-insensitive', () => {
    assert.equal(isOperatorEmail('JARED@example.com', 'jared@example.com'), true);
    assert.equal(isOperatorEmail('reader@example.com', 'jared@example.com'), false);
  });
});

describe('extractBearerToken', () => {
  it('reads a Bearer token', () => {
    assert.equal(extractBearerToken('Bearer abc.def'), 'abc.def');
  });
  it('rejects missing / non-bearer', () => {
    assert.equal(extractBearerToken(undefined), null);
    assert.equal(extractBearerToken('Basic abc'), null);
    assert.equal(extractBearerToken(''), null);
  });
});

describe('gateClaudeRequest — auth', () => {
  it('unauthenticated POST → 401 (not 400)', async () => {
    const result = await gateClaudeRequest(
      req(),
      { requireOperator: true, bucket: 'analyze', limit: 10 },
      deps(),
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 401);
      assert.match(result.error, /Unauthorized/i);
    }
  });

  it('invalid JWT → 401', async () => {
    const result = await gateClaudeRequest(
      req('Bearer bad-token'),
      { requireOperator: true, bucket: 'analyze', limit: 10 },
      deps(),
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.status, 401);
  });

  it('authenticated non-allowlisted user cannot run operator analysis (403)', async () => {
    const result = await gateClaudeRequest(
      req('Bearer reader-token'),
      { requireOperator: true, bucket: 'analyze', limit: 10 },
      deps(),
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 403);
      assert.match(result.error, /allowlist/i);
    }
  });

  it('allowlisted operator passes analyze gate', async () => {
    const result = await gateClaudeRequest(
      req('Bearer op-token'),
      { requireOperator: true, bucket: 'analyze', limit: 10 },
      deps(),
    );
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.isAdmin, true);
      assert.equal(result.user.email, 'jared@example.com');
    }
  });

  it('authenticated non-operator MAY call non-operator Claude routes (portfolio/retirement)', async () => {
    const result = await gateClaudeRequest(
      req('Bearer reader-token'),
      { requireOperator: false, bucket: 'portfolio', limit: 20 },
      deps(),
    );
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.isAdmin, false);
  });
});

describe('durable rate limit (shared store ≈ Redis across instances)', () => {
  it('two "instances" sharing one store share the same count', async () => {
    const shared = createMemoryRateLimitStore();
    const instanceA = deps({ rateLimitStore: shared });
    const instanceB = deps({ rateLimitStore: shared });

    const limit = 3;
    const opts = { requireOperator: false, bucket: 'portfolio', limit };

    const r1 = await gateClaudeRequest(req('Bearer reader-token'), opts, instanceA);
    const r2 = await gateClaudeRequest(req('Bearer reader-token'), opts, instanceB);
    const r3 = await gateClaudeRequest(req('Bearer reader-token'), opts, instanceA);
    const r4 = await gateClaudeRequest(req('Bearer reader-token'), opts, instanceB);

    assert.equal(r1.ok, true);
    assert.equal(r2.ok, true);
    assert.equal(r3.ok, true);
    assert.equal(r4.ok, false);
    if (!r4.ok) assert.equal(r4.status, 429);
  });

  it('separate users get separate buckets', async () => {
    const shared = createMemoryRateLimitStore();
    const d = deps({ rateLimitStore: shared });
    const opts = { requireOperator: false, bucket: 'portfolio', limit: 1 };

    const a = await gateClaudeRequest(req('Bearer reader-token'), opts, d);
    const b = await gateClaudeRequest(req('Bearer op-token'), opts, d);
    const a2 = await gateClaudeRequest(req('Bearer reader-token'), opts, d);

    assert.equal(a.ok, true);
    assert.equal(b.ok, true);
    assert.equal(a2.ok, false);
    if (!a2.ok) assert.equal(a2.status, 429);
  });

  it('missing store fail-closes with 503 (no in-memory production fallback)', async () => {
    const result = await gateClaudeRequest(
      req('Bearer op-token'),
      { requireOperator: true, bucket: 'analyze', limit: 10 },
      deps({ rateLimitStore: null }),
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.status, 503);
  });

  it('consumeFixedWindowLimit itself is store-backed, not process-local', async () => {
    const store = createMemoryRateLimitStore();
    const a = await consumeFixedWindowLimit(store, 'u1', 2, 60_000, 't');
    const b = await consumeFixedWindowLimit(store, 'u1', 2, 60_000, 't');
    const c = await consumeFixedWindowLimit(store, 'u1', 2, 60_000, 't');
    assert.equal(a.allowed, true);
    assert.equal(b.allowed, true);
    assert.equal(c.allowed, false);
    assert.equal(c.count, 3);
  });
});

describe('handler wiring', () => {
  it('Claude routes import gateClaudeRequest and no longer use in-memory rateLimitMap', () => {
    for (const file of ['api/analyze.ts', 'api/portfolio.ts', 'api/retirement.ts']) {
      const src = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
      assert.match(src, /gateClaudeRoute/);
      assert.doesNotMatch(src, /rateLimitMap/);
    }
  });

  it('dead api/edgar.ts is not present', () => {
    assert.equal(existsSync(new URL('../api/edgar.ts', import.meta.url)), false);
  });
});
