import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { operatorAccessMessage } from './operatorAccess.ts';

describe('operatorAccessMessage', () => {
  it('names the signed-in email when not on the allowlist', () => {
    assert.equal(
      operatorAccessMessage({ email: 'reader@example.com' }),
      'Signed in as reader@example.com — not on operator allowlist',
    );
  });

  it('does not claim an allowlist miss when /api/me failed', () => {
    assert.equal(
      operatorAccessMessage({ email: 'jared@example.com', operatorCheckFailed: true }),
      'Signed in as jared@example.com — operator status unavailable',
    );
  });
});
