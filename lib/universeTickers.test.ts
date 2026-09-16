import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ALL_TICKERS } from '../src/config/tickers.ts';
import { UNIVERSE_TICKERS } from './universeTickers.ts';

describe('earnings-calendar universe sync', () => {
  it('matches src/config/tickers.ts ALL_TICKERS (hand-synced copy)', () => {
    assert.deepEqual([...UNIVERSE_TICKERS].sort(), [...ALL_TICKERS].sort());
  });
});
