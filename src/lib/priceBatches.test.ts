import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  PRICE_BATCH_SIZE,
  chunkTickers,
  mergePriceResults,
  priceErrorStub,
} from './priceBatches.ts';

describe('chunkTickers', () => {
  it('splits a 65-ticker book into parallel batches of ≤40', () => {
    const tickers = Array.from({ length: 65 }, (_, i) => `T${i}`);
    const chunks = chunkTickers(tickers);
    assert.equal(chunks.length, 2);
    assert.equal(chunks[0].length, PRICE_BATCH_SIZE);
    assert.equal(chunks[1].length, 25);
    assert.deepEqual(chunks.flat(), tickers);
  });

  it('keeps a small list as a single batch', () => {
    assert.deepEqual(chunkTickers(['NVDA', 'CRWD']), [['NVDA', 'CRWD']]);
  });
});

describe('mergePriceResults', () => {
  it('fills omitted tickers with fetchError instead of dropping them', () => {
    const fetchedAt = 1;
    const merged = mergePriceResults(
      ['NVDA', 'CRWD', 'FTNT'],
      [{ ticker: 'NVDA', price: 100, change: 1, changePercent: 1, fetchedAt, fetchError: false }],
      fetchedAt,
    );
    assert.equal(merged.length, 3);
    assert.equal(merged[0].price, 100);
    assert.equal(merged[1].fetchError, true);
    assert.equal(merged[2].ticker, 'FTNT');
    assert.equal(merged[2].price, 0);
  });

  it('priceErrorStub never looks like a real quote', () => {
    const stub = priceErrorStub('ARM', 9);
    assert.equal(stub.fetchError, true);
    assert.equal(stub.price, 0);
    assert.equal(stub.change, 0);
  });
});
