import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MEALS, SLOTS, RATING_FACES, faceFor, starterKid, sampleKid, nextMeal, dayFor, markHad, freshDay,
  foodSuggestions, foodHistory, wakeGap, activeSleep, timeAfter, timeBefore, sleepWords, activityStats,
  pickupInsight, rankActivities, moveById, planProgress, nightToday, kidWindow, togetherToday, localDayKey, DEFAULT_GAP_MIN,
} from '../js/logic/kid.js';

const MIN = 60000;
const HOUR = 60 * MIN;
// Local time, because days are local calendar days.
const at = (y, mo, d, hh = 0, mm = 0) => new Date(y, mo, d, hh, mm).getTime();
const NOW = at(2026, 9, 4, 12); // Sun 4 Oct 2026, noon
const TODAY = '2026-10-04';

// ---------- starter libraries ----------
test('starterKid has a full, valid library with unique stable ids', () => {
  const a = starterKid();
  const b = starterKid();
  assert.deepEqual(a, b, 'same every time');
  assert.ok(a.foods.length >= 24 && a.foods.length <= 32, `foods: ${a.foods.length}`);
  assert.ok(a.activities.length >= 14, `activities: ${a.activities.length}`);
  const ids = [...a.foods, ...a.activities, ...a.plan.main, ...a.plan.planB].map((x) => x.id);
  assert.equal(new Set(ids).size, ids.length, 'ids are unique');
  for (const f of a.foods) {
    assert.ok(f.id.startsWith('f-') && f.name && f.notes, f.id);
    assert.ok(f.slots.length && f.slots.every((s) => SLOTS.includes(s)), `${f.id} slots`);
    assert.ok([1, 2, 3].includes(f.cost) && [1, 2, 3].includes(f.healthy), `${f.id} cost/healthy`);
  }
  for (const s of SLOTS) assert.ok(a.foods.filter((f) => f.slots.includes(s)).length >= 5, `enough ${s} foods`);
  for (const x of a.activities) {
    assert.ok(x.id.startsWith('a-') && x.name && x.notes, x.id);
    assert.ok(['low', 'med', 'high'].includes(x.energy) && ['in', 'out'].includes(x.where) && [1, 2, 3].includes(x.cost), x.id);
  }
  assert.ok(a.plan.main.length >= 5 && a.plan.planB.length >= 4);
  for (const p of [...a.plan.main, ...a.plan.planB]) {
    assert.equal(p.done, false);
    assert.ok(p.text);
    if (p.refId) assert.ok(a.activities.some((x) => x.id === p.refId) || a.foods.some((f) => f.id === p.refId));
  }
  assert.ok(a.foods.some((f) => f.id === 'f-weetbix' && f.slots.includes('breakfast')));
});

test('starter text never names a real kid', () => {
  const text = JSON.stringify(starterKid());
  assert.ok(!/\b(she|her|he|him|his)\b/i.test(text), 'no gendered pronouns in starter text');
});

// ---------- sample ----------
test('sampleKid is deterministic, realistic and never in the future', () => {
  const a = sampleKid(NOW);
  assert.deepEqual(a, sampleKid(NOW));
  const lib = starterKid();
  assert.equal(a.day, null);
  assert.ok(a.nights.length >= 7 && a.nights.length <= 9, `nights ${a.nights.length}`);
  assert.deepEqual(new Set(a.nights.map((n) => n.quality)), new Set(['good', 'ok', 'bad']));
  assert.ok(a.sleeps.length >= 7);
  for (const s of a.sleeps) {
    assert.ok(s.wokeTs != null && s.wokeTs <= NOW && s.asleepTs < s.wokeTs);
    const gap = (s.wokeTs - s.asleepTs) / MIN;
    assert.ok(gap >= 150 && gap <= 210, `gap ${gap}`);
  }
  assert.ok(a.ratings.length >= 18);
  for (const r of a.ratings) {
    assert.ok(lib.foods.some((f) => f.id === r.foodId && f.slots.includes(r.slot)), r.foodId);
    assert.ok(r.score >= 1 && r.score <= 5 && r.ts <= NOW);
  }
  assert.ok(a.tries.length >= 10);
  for (const t of a.tries) assert.ok(lib.activities.some((x) => x.id === t.activityId) && t.ts <= NOW);
  const st = activityStats(a.tries, lib.activities);
  assert.ok(st.pickup.rate > st.later.rate, 'pickup mostly worked');
  const all = [...a.nights, ...a.ratings, ...a.tries].map((x) => x.id);
  assert.equal(new Set(all).size, all.length);
});

test('sampleKid early in the morning drops tonight-ish entries that have not happened', () => {
  const early = at(2026, 9, 4, 5, 0);
  const a = sampleKid(early);
  for (const x of [...a.nights, ...a.ratings, ...a.tries]) assert.ok(x.ts <= early);
  for (const s of a.sleeps) assert.ok(s.wokeTs <= early);
});

// ---------- meals ----------
test('nextMeal: breakfast is breakfast, even at noon', () => {
  // The function never looks at the clock: nothing eaten yet means breakfast.
  assert.equal(nextMeal(null, TODAY), 'breakfast');
  assert.equal(nextMeal(freshDay(TODAY), TODAY), 'breakfast');
  let d = markHad(null, TODAY, 'breakfast');
  assert.equal(nextMeal(d, TODAY), 'lunch');
  d = markHad(d, TODAY, 'lunch');
  assert.equal(nextMeal(d, TODAY), 'dinner');
  d = markHad(d, TODAY, 'dinner');
  assert.equal(nextMeal(d, TODAY), null, 'all three done: snacks only');
});

test('nextMeal goes back to the first gap and resets on a new date', () => {
  const lunchOnly = markHad(null, TODAY, 'lunch');
  assert.equal(nextMeal(lunchOnly, TODAY), 'breakfast');
  const allYesterday = { date: '2026-10-03', had: { breakfast: true, lunch: true, dinner: true } };
  assert.equal(nextMeal(allYesterday, TODAY), 'breakfast');
  assert.deepEqual(dayFor(allYesterday, TODAY), freshDay(TODAY));
  const marked = markHad(allYesterday, TODAY, 'breakfast');
  assert.deepEqual(marked.had, { breakfast: true, lunch: false, dinner: false });
  assert.equal(marked.date, TODAY);
  assert.deepEqual(markHad(marked, TODAY, 'breakfast', false).had, { breakfast: false, lunch: false, dinner: false });
  assert.deepEqual(markHad(null, TODAY, 'snack').had, freshDay(TODAY).had, 'snacks do not tick a meal');
  assert.deepEqual(dayFor({ date: TODAY, had: null }, TODAY), freshDay(TODAY), 'tolerates a broken record');
});

test('localDayKey is the local calendar date', () => {
  assert.equal(localDayKey(NOW), TODAY);
  assert.equal(localDayKey(at(2026, 0, 5, 23, 59)), '2026-01-05');
});

const F = (id, slots, cost, healthy) => ({ id, name: id, slots, cost, healthy, notes: '' });
const R = (foodId, score, ts = NOW) => ({ id: `${foodId}-${score}-${ts}`, ts, foodId, slot: 'dinner', score });

test('foodSuggestions: liked first, unrated in the middle, disliked last', () => {
  const foods = [F('hated', ['dinner'], 1, 3), F('plain', ['dinner'], 1, 1), F('loved', ['dinner'], 3, 1), F('fresh', ['dinner'], 2, 3), F('brekky', ['breakfast'], 1, 3)];
  const ratings = [R('hated', 1), R('hated', 2), R('loved', 5), R('loved', 4, NOW + 1)];
  const out = foodSuggestions(foods, ratings, 'dinner');
  assert.deepEqual(out.map((f) => f.id), ['loved', 'fresh', 'plain', 'hated']);
  const loved = out[0];
  assert.equal(loved.avg, 4.5);
  assert.equal(loved.count, 2);
  assert.equal(loved.lastTs, NOW + 1);
  assert.equal(loved.last, 4);
  assert.equal(out[1].avg, null);
  assert.equal(out[1].count, 0);
  assert.equal(out[1].lastTs, null);
  assert.ok(!('order' in loved));
});

test('foodSuggestions breaks ties by healthy, then cheaper, then list order', () => {
  const foods = [F('a', ['lunch'], 2, 2), F('b', ['lunch'], 1, 2), F('c', ['lunch'], 3, 3), F('d', ['lunch'], 1, 2)];
  assert.deepEqual(foodSuggestions(foods, [], 'lunch').map((f) => f.id), ['c', 'b', 'd', 'a']);
  assert.deepEqual(foodSuggestions(foods, [], 'snack'), []);
  assert.equal(foodSuggestions(null, null, 'lunch').length, 0);
  assert.equal(foodSuggestions(foods, [], null).length, 4, 'no slot means every food');
});

test('foodSuggestions counts ratings from any slot and ignores unknown foods', () => {
  const foods = [F('eggs', ['breakfast', 'lunch'], 1, 3), F('toast', ['breakfast'], 1, 3)];
  const ratings = [{ id: 'x', ts: NOW, foodId: 'eggs', slot: 'lunch', score: 5 }, { id: 'y', ts: NOW, foodId: 'gone', slot: 'breakfast', score: 5 }];
  const out = foodSuggestions(foods, ratings, 'breakfast');
  assert.equal(out[0].id, 'eggs');
  assert.equal(out[0].avg, 5);
  assert.deepEqual(foodHistory([...ratings, { id: 'z', ts: NOW + 5, foodId: 'eggs', score: 2 }], 'eggs').map((r) => r.id), ['z', 'x']);
});

test('rating faces cover 1–5 and faceFor rounds an average', () => {
  assert.deepEqual(Object.keys(RATING_FACES).map(Number), [1, 2, 3, 4, 5]);
  assert.deepEqual(Object.values(RATING_FACES).map((f) => f.label), ['Refused', 'A bite', 'Some', 'Most of it', 'Loved it']);
  assert.equal(faceFor(null), null);
  assert.equal(faceFor(4.5), 5);
  assert.equal(faceFor(4.4), 4);
  assert.equal(faceFor(0.2), 1);
  assert.equal(MEALS.length, 3);
});

// ---------- sleep ----------
const S = (asleepTs, gapMin) => ({ id: `s${asleepTs}`, asleepTs, wokeTs: gapMin == null ? null : asleepTs + gapMin * MIN });

test('wakeGap defaults to 3 hours under two nights', () => {
  assert.deepEqual(wakeGap([]), { median: DEFAULT_GAP_MIN, count: 0, isDefault: true });
  assert.deepEqual(wakeGap(undefined), { median: 180, count: 0, isDefault: true });
  assert.deepEqual(wakeGap([S(NOW - 30 * HOUR, 150)]), { median: 180, count: 1, isDefault: true });
});

test('wakeGap is the median of complete, sensible nights', () => {
  const base = NOW - 10 * 24 * HOUR;
  const sleeps = [S(base, 160), S(base + 24 * HOUR, 175), S(base + 48 * HOUR, 200), S(base + 72 * HOUR, null), S(base + 96 * HOUR, 5), S(base + 120 * HOUR, 900)];
  assert.deepEqual(wakeGap(sleeps), { median: 175, count: 3, isDefault: false });
  assert.deepEqual(wakeGap(sleeps.slice(0, 2)), { median: 168, count: 2, isDefault: false }, 'even count averages the middle two (167.5 rounds)');
});

test('wakeGap only uses the last 14 nights', () => {
  const sleeps = [];
  for (let i = 0; i < 20; i++) sleeps.push(S(NOW - (40 - i) * 24 * HOUR, i < 6 ? 400 : 170));
  assert.equal(wakeGap(sleeps).median, 170);
  assert.equal(wakeGap(sleeps).count, 14);
});

test('activeSleep finds an open sleep from the last 14 hours', () => {
  const open = S(NOW - 2 * HOUR, null);
  assert.equal(activeSleep([S(NOW - 26 * HOUR, 170), open], NOW), open);
  assert.equal(activeSleep([S(NOW - 15 * HOUR, null)], NOW), null, 'stale');
  assert.equal(activeSleep([S(NOW + HOUR, null)], NOW), null, 'future');
  assert.equal(activeSleep([S(NOW - HOUR, 30)], NOW), null, 'already woke');
  assert.equal(activeSleep(null, NOW), null);
});

test('timeAfter finds the next matching clock time, never in the future', () => {
  const asleep = at(2026, 9, 3, 20, 0);
  const late = at(2026, 9, 4, 7, 0);
  assert.equal(timeAfter(asleep, '22:50', late), at(2026, 9, 3, 22, 50));
  assert.equal(timeAfter(asleep, '1:15', late), at(2026, 9, 4, 1, 15), 'after midnight');
  assert.equal(timeAfter(asleep, '08:30', late), null, 'not yet');
  assert.equal(timeAfter(asleep, '20:00', late), null, 'same minute rolls to tomorrow, which is in the future');
  assert.equal(timeAfter(asleep, 'nope', late), null);
  assert.equal(timeAfter(asleep, '25:00', late), null);
});

test('timeBefore finds the latest matching clock time at or before now', () => {
  const night = at(2026, 9, 4, 1, 30);
  assert.equal(timeBefore(night, '20:10'), at(2026, 9, 3, 20, 10), 'last night');
  assert.equal(timeBefore(night, '01:30'), night, 'this very minute');
  assert.equal(timeBefore(night, '0:45'), at(2026, 9, 4, 0, 45));
  assert.equal(timeBefore(night, 'x'), null);
  assert.equal(timeBefore(night, '12:60'), null);
});

test('sleepWords rounds down to the half hour', () => {
  assert.equal(sleepWords(20 * MIN), null);
  assert.equal(sleepWords(-5 * MIN), null);
  assert.equal(sleepWords(35 * MIN), 'half an hour');
  assert.equal(sleepWords(60 * MIN), 'an hour');
  assert.equal(sleepWords(100 * MIN), 'an hour and a half');
  assert.equal(sleepWords(150 * MIN), 'two and a half hours');
  assert.equal(sleepWords(179 * MIN), 'two and a half hours');
  assert.equal(sleepWords(180 * MIN), 'three hours');
});

test('nightToday is today’s latest night; kidWindow maps quality to a zone', () => {
  const nights = [{ id: 'a', ts: at(2026, 9, 3, 7), quality: 'good' }, { id: 'b', ts: at(2026, 9, 4, 7), quality: 'bad' }, { id: 'c', ts: at(2026, 9, 4, 8), quality: 'ok' }, { id: 'd', ts: NOW + HOUR, quality: 'good' }];
  assert.equal(nightToday(nights, NOW).id, 'c');
  assert.equal(nightToday(nights.slice(0, 1), NOW), null);
  assert.equal(nightToday(undefined, NOW), null);
  assert.equal(kidWindow('bad').zone, 'edge');
  assert.equal(kidWindow('good').zone, 'ok');
  assert.equal(kidWindow('ok').zone, 'calm');
  assert.equal(kidWindow(null).label, 'Not logged yet');
});

// ---------- activities ----------
const A = (id, energy = 'high', where = 'out', cost = 1) => ({ id, name: id, energy, where, cost, notes: '' });
const T = (activityId, worked, when, ts = NOW) => ({ id: `${activityId}${worked}${when}${ts}`, ts, activityId, worked, when });

test('activityStats splits pickup vs later and per activity', () => {
  const acts = [A('scoot'), A('lego', 'low', 'in')];
  const tries = [T('scoot', 'yes', 'pickup'), T('scoot', 'yes', 'pickup', NOW + 1), T('scoot', 'no', 'later'), T('lego', 'meh', 'later'), T('gone', 'yes', 'later'), T('scoot', 'bad-value', 'later')];
  const st = activityStats(tries, acts);
  assert.deepEqual(st.pickup, { n: 2, yes: 2, rate: 1 });
  assert.deepEqual(st.later, { n: 3, yes: 1, rate: 1 / 3 });
  const scoot = st.byActivity.find((x) => x.id === 'scoot');
  assert.equal(scoot.n, 3);
  assert.equal(scoot.yes, 2);
  assert.equal(scoot.no, 1);
  assert.deepEqual(scoot.pickup, { n: 2, yes: 2 });
  assert.equal(scoot.lastTs, NOW + 1);
  assert.equal(scoot.last, 'yes');
  const lego = st.byActivity.find((x) => x.id === 'lego');
  assert.equal(lego.meh, 1);
  assert.equal(lego.rate, 0);
  const empty = activityStats([], acts);
  assert.equal(empty.pickup.rate, null);
  assert.equal(empty.byActivity[0].rate, null);
});

test('pickupInsight words the comparison and only judges with enough data', () => {
  assert.equal(pickupInsight(activityStats([], [])), null);
  const four = [T('a', 'yes', 'pickup'), T('a', 'yes', 'pickup'), T('a', 'yes', 'pickup'), T('a', 'yes', 'pickup'), T('a', 'no', 'pickup'), T('a', 'yes', 'later'), T('a', 'no', 'later'), T('a', 'no', 'later'), T('a', 'meh', 'later')];
  const ins = pickupInsight(activityStats(four, []));
  assert.equal(ins.text, 'Straight after pickup: 4 of 5 worked. Later: 1 of 4.');
  assert.equal(ins.verdict, 'pickup');
  const onlyPickup = pickupInsight(activityStats([T('a', 'yes', 'pickup')], []));
  assert.equal(onlyPickup.text, 'Straight after pickup: 1 of 1 worked. Nothing logged later in the day yet.');
  assert.equal(onlyPickup.verdict, null);
  const same = pickupInsight(activityStats([T('a', 'yes', 'pickup'), T('a', 'no', 'pickup'), T('a', 'yes', 'later'), T('a', 'no', 'later')], []));
  assert.equal(same.verdict, 'same');
  const later = pickupInsight(activityStats([T('a', 'no', 'pickup'), T('a', 'no', 'pickup'), T('a', 'yes', 'later'), T('a', 'yes', 'later')], []));
  assert.equal(later.verdict, 'later');
});

test('rankActivities prefers what worked, especially at pickup', () => {
  const acts = [A('one'), A('two'), A('three')];
  const ranked = rankActivities(acts, [T('two', 'yes', 'later'), T('three', 'yes', 'pickup'), T('one', 'no', 'later')]);
  assert.deepEqual(ranked.map((a) => a.id), ['three', 'two', 'one']);
  assert.ok(typeof ranked[0].score === 'number');
  assert.deepEqual(rankActivities(acts, []).map((a) => a.id), ['one', 'two', 'three'], 'stable with no data');
});

test('rankActivities tilts to low energy after a rough night and high after a good one', () => {
  const acts = [A('scoot', 'high', 'out'), A('walk', 'med', 'out'), A('lego', 'low', 'in')];
  assert.equal(rankActivities(acts, [], { quality: 'bad' })[0].id, 'lego');
  assert.equal(rankActivities(acts, [], { quality: 'bad' }).at(-1).id, 'scoot');
  assert.equal(rankActivities(acts, [], { quality: 'good' })[0].id, 'scoot');
  const pricey = [A('pool', 'high', 'out', 3), A('park', 'high', 'out', 1)];
  assert.equal(rankActivities(pricey, [])[0].id, 'park', 'cheaper wins a tie');
});

// ---------- lists ----------
test('moveById swaps neighbours and ignores moves off the ends', () => {
  const list = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  assert.deepEqual(moveById(list, 'b', -1).map((x) => x.id), ['b', 'a', 'c']);
  assert.deepEqual(moveById(list, 'b', 1).map((x) => x.id), ['a', 'c', 'b']);
  assert.deepEqual(moveById(list, 'a', -1).map((x) => x.id), ['a', 'b', 'c']);
  assert.deepEqual(moveById(list, 'c', 1).map((x) => x.id), ['a', 'b', 'c']);
  assert.deepEqual(moveById(list, 'zzz', 1).map((x) => x.id), ['a', 'b', 'c']);
  assert.deepEqual(list.map((x) => x.id), ['a', 'b', 'c'], 'input untouched');
});

test('planProgress counts done steps and finds the next one', () => {
  const steps = [{ id: '1', text: 'a', done: true }, { id: '2', text: 'b', done: false }, { id: '3', text: 'c', done: false }];
  assert.deepEqual(planProgress(steps), { done: 1, total: 3, next: steps[1] });
  assert.deepEqual(planProgress([]), { done: 0, total: 0, next: null });
});

test('togetherToday reads signs of a day together', () => {
  assert.equal(togetherToday({}, NOW), false);
  assert.equal(togetherToday(undefined, NOW), false);
  assert.equal(togetherToday({ nights: [{ id: 'n', ts: at(2026, 9, 4, 7), quality: 'ok' }] }, NOW), true);
  assert.equal(togetherToday({ nights: [{ id: 'n', ts: at(2026, 9, 3, 7), quality: 'ok' }] }, NOW), false, 'yesterday’s night only');
  assert.equal(togetherToday({ sleeps: [S(NOW - 13 * HOUR, 170)] }, NOW), true, 'slept here last night');
  assert.equal(togetherToday({ sleeps: [S(NOW - 30 * HOUR, 170)] }, NOW), false);
  assert.equal(togetherToday({ day: markHad(null, TODAY, 'breakfast') }, NOW), true);
  assert.equal(togetherToday({ day: freshDay(TODAY) }, NOW), false, 'nothing ticked');
  assert.equal(togetherToday({ day: { date: '2026-10-03', had: { breakfast: true } } }, NOW), false);
  assert.equal(togetherToday({ tries: [T('a', 'yes', 'pickup', at(2026, 9, 4, 9))] }, NOW), true);
  assert.equal(togetherToday({ ratings: [R('x', 3, at(2026, 9, 3, 18))] }, NOW), false);
});

test('sampleKid keeps local clock times on a daylight-saving change day', () => {
  // 4 Oct 2026 is the spring-forward day in Sydney; run with TZ=Australia/Sydney to exercise it.
  const a = sampleKid(at(2026, 9, 4, 20, 0));
  for (const n of a.nights) assert.equal(new Date(n.ts).getHours(), 7, new Date(n.ts).toString());
});
