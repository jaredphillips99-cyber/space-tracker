import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  addDaysIso,
  addMonthsIso,
  buildMonthGrid,
  buildWeekDays,
  monthEndIso,
  monthStartIso,
  nyWeekday,
  weekStartSunday,
} from './earningsCalendar.ts';

describe('civil-date arithmetic', () => {
  it('adds days across month boundaries via UTC date math', () => {
    assert.equal(addDaysIso('2026-09-30', 1), '2026-10-01');
    assert.equal(addDaysIso('2026-10-01', -1), '2026-09-30');
  });

  it('month start/end and addMonths', () => {
    assert.equal(monthStartIso('2026-09-16'), '2026-09-01');
    assert.equal(monthEndIso('2026-09-16'), '2026-09-30');
    assert.equal(addMonthsIso('2026-09-16', 1), '2026-10-01');
    assert.equal(addMonthsIso('2026-01-15', -1), '2025-12-01');
  });
});

describe('September 2026 grid (Tue Sep 1; today Wed Sep 16)', () => {
  it('pads from Sunday Aug 30 and marks today', () => {
    // Sep 1 2026 is a Tuesday → weekday 2, so grid opens on Sun Aug 30.
    assert.equal(nyWeekday('2026-09-01'), 2);
    const grid = buildMonthGrid('2026-09-01', '2026-09-16');
    assert.equal(grid.length, 42);
    assert.equal(grid[0].iso, '2026-08-30');
    assert.equal(grid[0].inMonth, false);
    assert.equal(grid[2].iso, '2026-09-01');
    assert.equal(grid[2].inMonth, true);
    const today = grid.find((d) => d.iso === '2026-09-16');
    assert.equal(today?.isToday, true);
    assert.equal(today?.weekday, 3);
  });

  it('week view is Sunday–Saturday around the anchor', () => {
    assert.equal(weekStartSunday('2026-09-16'), '2026-09-13');
    const week = buildWeekDays('2026-09-16', '2026-09-16');
    assert.equal(week.length, 7);
    assert.equal(week[0].iso, '2026-09-13');
    assert.equal(week[6].iso, '2026-09-19');
    assert.equal(week[3].isToday, true);
  });
});
