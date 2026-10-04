import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DAY, rangeWindow, change, formatDelta, suggestTicker, cleanTicker, worryStats,
  lookBack, tagInsights, needsSupport, weeklyRecap, isValidData, moodLabel,
} from '../js/logic.js';
import { sampleData } from '../js/sample.js';

const NOW = Date.UTC(2026, 9, 4, 12);
const c = (daysAgo, mood, extra = {}) => ({ id: `c${daysAgo}-${mood}`, ts: NOW - daysAgo * DAY, mood, tags: [], worryId: null, ...extra });

test('rangeWindow uses the last mood before the range as the baseline', () => {
  const checkins = [c(10, 3), c(5, 6), c(2, 7), c(1, 8)];
  const win = rangeWindow(checkins, '1W', NOW);
  assert.deepEqual(win.points.map((p) => p.mood), [6, 7, 8]);
  assert.equal(win.baseline, 3);
  assert.equal(win.start, NOW - 7 * DAY);
});

test('rangeWindow falls back to the first point when nothing came before', () => {
  const win = rangeWindow([c(2, 4), c(1, 6)], 'ALL', NOW);
  assert.equal(win.baseline, 4);
  assert.equal(win.start, NOW - 2 * DAY);
});

test('change reports direction and percent', () => {
  const ch = change(rangeWindow([c(10, 4), c(1, 6)], '1W', NOW));
  assert.equal(ch.delta, 2);
  assert.equal(ch.up, true);
  assert.equal(Math.round(ch.pct), 50);
  assert.equal(change(rangeWindow([], '1W', NOW)), null);
});

test('formatDelta signs both parts', () => {
  assert.equal(formatDelta(2, 50), '+2 (+50%)');
  assert.equal(formatDelta(-1.5, -20), '−1.5 (−20%)');
  assert.equal(formatDelta(0, 0), '0 (0%)');
});

test('suggestTicker skips filler words and avoids collisions', () => {
  assert.equal(suggestTicker('My project deadline'), 'PROJE');
  assert.equal(suggestTicker('rent going up'), 'RENT');
  assert.equal(suggestTicker('Rent again', ['RENT']), 'RENT2');
  assert.equal(suggestTicker('!!!'), 'WORRY');
  assert.equal(cleanTicker('$w-o rk!'), 'WORK');
});

test('worryStats counts mentions and held days', () => {
  const w = { id: 'w', openedTs: NOW - 10 * DAY, closedTs: NOW - 4 * DAY };
  const s = worryStats(w, [c(9, 3, { worryId: 'w' }), c(5, 5, { worryId: 'w' }), c(3, 9)], NOW);
  assert.equal(s.mentions, 2);
  assert.equal(s.avgMood, 4);
  assert.equal(s.heldDays, 6);
});

test('lookBack only counts worries opened in the window', () => {
  const worries = [
    { id: 'a', ticker: 'A', openedTs: NOW - 5 * DAY, closedTs: NOW - DAY, outcome: 'resolved' },
    { id: 'b', ticker: 'B', openedTs: NOW - 6 * DAY, closedTs: NOW - DAY, outcome: 'faded' },
    { id: 'c', ticker: 'C', openedTs: NOW - 2 * DAY, closedTs: null, outcome: null },
    { id: 'd', ticker: 'D', openedTs: NOW - 90 * DAY, closedTs: NOW - DAY, outcome: 'let-go' },
  ];
  assert.deepEqual(lookBack(worries, NOW, 30), { days: 30, opened: 3, closed: 2, resolved: 1, faded: 1, letGo: 0, stillOpen: 1 });
});

test('tagInsights compares tags with the overall average', () => {
  const rows = tagInsights([c(1, 8, { tags: ['walk'] }), c(2, 8, { tags: ['walk'] }), c(3, 2, { tags: ['sleep'] }), c(4, 2, { tags: ['sleep'] })]);
  assert.equal(rows[0].tag, 'walk');
  assert.equal(rows[0].diff, 3);
  assert.equal(rows[1].diff, -3);
});

test('needsSupport needs three recent rough check-ins in a row', () => {
  assert.equal(needsSupport([c(3, 2), c(2, 1), c(1, 2)], NOW), true);
  assert.equal(needsSupport([c(3, 2), c(2, 5), c(1, 2)], NOW), false);
  assert.equal(needsSupport([c(20, 2), c(19, 1), c(18, 2)], NOW), false);
  assert.equal(needsSupport([c(1, 1)], NOW), false);
});

test('weeklyRecap finds the best moment and heaviest worry', () => {
  const worries = [{ id: 'x', ticker: 'X', openedTs: NOW - 9 * DAY, closedTs: null }, { id: 'y', ticker: 'Y', openedTs: NOW - 9 * DAY, closedTs: NOW - DAY }];
  const r = weeklyRecap([c(1, 9), c(2, 3, { worryId: 'x' }), c(3, 2, { worryId: 'x' }), c(4, 6, { worryId: 'y' }), c(12, 10)], worries, NOW);
  assert.equal(r.count, 4);
  assert.equal(r.best.mood, 9);
  assert.equal(r.heaviest.worry.id, 'x');
  assert.equal(r.closed.length, 1);
  assert.equal(weeklyRecap([c(12, 5)], [], NOW), null);
});

test('moodLabel buckets', () => {
  assert.deepEqual([1, 3, 5, 7, 10].map(moodLabel), ['Rough', 'Low', 'Okay', 'Good', 'Great']);
});

test('sample data is valid, flagged as demo, and in range', () => {
  const data = sampleData(NOW);
  assert.equal(isValidData(data), true);
  assert.equal(data.demo, true);
  assert.ok(data.checkins.length > 40);
  assert.ok(data.checkins.every((x) => x.mood >= 1 && x.mood <= 10 && Number.isInteger(x.mood) && x.ts <= NOW));
  assert.ok(data.checkins.every((x) => x.worryId == null || data.worries.some((w) => w.id === x.worryId)));
});

test('isValidData rejects junk', () => {
  assert.equal(isValidData(null), false);
  assert.equal(isValidData({ checkins: [{ ts: 'x', mood: 1 }], worries: [] }), false);
  assert.equal(isValidData({ checkins: [], worries: [] }), true);
});
