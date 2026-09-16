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

export function parseAdminEmails(raw: string | undefined): string[];
export function isOperatorEmail(
  email: string | undefined | null,
  adminEmailsRaw: string | undefined,
): boolean;
export function extractBearerToken(
  authorization: string | string[] | undefined,
): string | null;
export function consumeFixedWindowLimit(
  store: RateLimitStore,
  identity: string,
  limit: number,
  windowMs: number,
  bucket: string,
): Promise<{ allowed: boolean; count: number }>;
export function createMemoryRateLimitStore(): RateLimitStore;
export function createUpstashStore(): Promise<RateLimitStore | null>;
export function verifySupabaseJwt(token: string): Promise<GuardUser | null>;
export function productionGuardDeps(): Promise<ClaudeGuardDeps>;
export function gateClaudeRequest(
  req: GuardRequest,
  opts: {
    requireOperator: boolean;
    bucket: string;
    limit: number;
    windowMs?: number;
  },
  deps: ClaudeGuardDeps,
): Promise<GateResult>;
export function gateClaudeRoute(
  req: GuardRequest,
  opts: { requireOperator: boolean; bucket: string; limit: number },
): Promise<GateResult>;
