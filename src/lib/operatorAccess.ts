export function operatorAccessMessage(opts: {
  email: string | null;
  operatorCheckFailed?: boolean;
}): string {
  const who = opts.email?.trim() || 'this account';
  if (opts.operatorCheckFailed) {
    return `Signed in as ${who} — operator status unavailable`;
  }
  return `Signed in as ${who} — not on operator allowlist`;
}
