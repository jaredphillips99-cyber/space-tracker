import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  asDate,
  eventOverlapsRange,
  eventsFromYahooQuote,
  isIsoDate,
  nyDateISO,
  sessionFromTimestamp,
} from './earningsDate.ts';

describe('isIsoDate', () => {
  it('accepts real calendar days', () => {
    assert.equal(isIsoDate('2026-09-16'), true);
    assert.equal(isIsoDate('2026-02-28'), true);
  });
  it('rejects junk and impossible days', () => {
    assert.equal(isIsoDate('09/16/2026'), false);
    assert.equal(isIsoDate('2026-02-30'), false);
    assert.equal(isIsoDate('2026-13-01'), false);
  });
});

describe('sessionFromTimestamp / nyDateISO', () => {
  it('maps 20:00 UTC in August (EDT) to AMC on that NY date', () => {
    const d = new Date('2026-08-10T20:00:00.000Z');
    assert.equal(nyDateISO(d), '2026-08-10');
    assert.equal(sessionFromTimestamp(d), 'amc');
  });

  it('maps 20:00 UTC in November (EST) to AMC via the 15:00 ET rule', () => {
    const d = new Date('2026-11-17T20:00:00.000Z');
    assert.equal(nyDateISO(d), '2026-11-17');
    assert.equal(sessionFromTimestamp(d), 'amc');
  });

  it('maps 12:30 UTC in August to BMO', () => {
    const d = new Date('2026-08-06T12:30:00.000Z');
    assert.equal(nyDateISO(d), '2026-08-06');
    assert.equal(sessionFromTimestamp(d), 'bmo');
  });

  it('does not invent a chip at NY midnight', () => {
    // 04:00 UTC in winter is 23:00 previous evening… use a known midnight ET.
    const d = new Date('2026-11-03T05:00:00.000Z'); // 00:00 EST
    assert.equal(nyDateISO(d), '2026-11-03');
    assert.equal(sessionFromTimestamp(d), null);
  });

  it('does not label a 10:00 ET print as BMO or AMC', () => {
    const d = new Date('2026-11-04T15:00:00.000Z'); // 10:00 EST
    assert.equal(sessionFromTimestamp(d), null);
  });
});

describe('eventsFromYahooQuote', () => {
  it('returns nothing when Yahoo has no dates — do not invent', () => {
    assert.deepEqual(eventsFromYahooQuote('XXXX', {}), []);
  });

  it('emits a single next event when last and next share a NY day (NVDA-shaped)', () => {
    const ts = new Date('2026-11-17T20:00:00.000Z');
    const events = eventsFromYahooQuote('NVDA', {
      earningsTimestamp: ts,
      earningsTimestampStart: ts,
      earningsTimestampEnd: ts,
      isEarningsDateEstimate: false,
    });
    assert.equal(events.length, 1);
    assert.equal(events[0].ticker, 'NVDA');
    assert.equal(events[0].date, '2026-11-17');
    assert.equal(events[0].dateEnd, null);
    assert.equal(events[0].estimated, false);
    assert.equal(events[0].kind, 'next');
    assert.equal(events[0].session, 'amc');
  });

  it('emits last (confirmed) + next (estimated) when Yahoo gives both (CEG-shaped)', () => {
    const events = eventsFromYahooQuote('CEG', {
      earningsTimestamp: new Date('2026-08-06T12:30:00.000Z'),
      earningsTimestampStart: new Date('2026-11-09T12:30:00.000Z'),
      earningsTimestampEnd: new Date('2026-11-09T12:30:00.000Z'),
      isEarningsDateEstimate: true,
    });
    assert.equal(events.length, 2);
    const next = events.find((e) => e.kind === 'next');
    const last = events.find((e) => e.kind === 'last');
    assert.equal(next?.date, '2026-11-09');
    assert.equal(next?.estimated, true);
    assert.equal(next?.session, 'bmo');
    assert.equal(last?.date, '2026-08-06');
    assert.equal(last?.estimated, false);
    assert.equal(last?.session, 'bmo');
  });

  it('records a multi-day Yahoo window on date/dateEnd without filling in-between days', () => {
    const events = eventsFromYahooQuote('FAKE', {
      earningsTimestampStart: new Date('2026-10-20T12:00:00.000Z'),
      earningsTimestampEnd: new Date('2026-10-24T20:00:00.000Z'),
      isEarningsDateEstimate: true,
    });
    assert.equal(events.length, 1);
    assert.equal(events[0].date, '2026-10-20');
    assert.equal(events[0].dateEnd, '2026-10-24');
    assert.equal(events[0].estimated, true);
  });

  it('asDate unwraps Yahoo { raw } unix seconds-or-ms-like values', () => {
    const d = asDate({ raw: Date.parse('2026-11-17T20:00:00.000Z') });
    assert.ok(d);
    assert.equal(nyDateISO(d), '2026-11-17');
  });
});

describe('eventOverlapsRange', () => {
  const event = {
    ticker: 'NVDA',
    date: '2026-11-17',
    dateEnd: null,
    session: 'amc' as const,
    estimated: false,
    kind: 'next' as const,
  };
  it('includes the event only on its Yahoo date, not neighboring days', () => {
    assert.equal(eventOverlapsRange(event, '2026-11-01', '2026-11-30'), true);
    assert.equal(eventOverlapsRange(event, '2026-11-17', '2026-11-17'), true);
    assert.equal(eventOverlapsRange(event, '2026-11-18', '2026-11-30'), false);
  });
});
