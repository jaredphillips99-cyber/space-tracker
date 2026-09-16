import { getSession } from './supabase';

/** Attach the current Supabase access token to Claude (and /api/me) fetches. */
export async function authHeaders(
  extra: Record<string, string> = {},
): Promise<Record<string, string>> {
  const session = await getSession();
  const headers: Record<string, string> = { ...extra };
  if (session?.access_token) {
    headers.Authorization = `Bearer ${session.access_token}`;
  }
  return headers;
}

export async function jsonAuthHeaders(): Promise<Record<string, string>> {
  return authHeaders({ 'Content-Type': 'application/json' });
}
