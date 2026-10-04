import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BASE, capacity, dailyScores, warning, sleepDebt, sampleMorning, zoneOf, morningFor, todaysMorning,
  sleepNeed, fmtHours,
} from '../js/logic/capacity.js';

const HOUR = 3600000;
const DAY = 24 * HOUR;
// Local time, because days are local calendar days.
const at = (y, mo, d, hh = 0, mm = 0) => new Date(y, mo, d, hh, mm).getTime();
const NOW = at(2026, 9, 4, 12); // Sun 4 Oct 2026, noon
const daysAgo = (n, hh = 8) => { const d = new Date(NOW); d.setDate(d.getDate() - n); d.setHours(hh, 0, 0, 0); return d.getTime(); };

let n = 0;
const morning = (ts, extra = {}) => ({ id: `m${n++}`, ts, kind: 'morning', mood: 6, note: '', tags: [], worryId: null, sleepHours: 8, sleepQuality: 3, mind: null, tension: 2, ate: true, caffeine: 0, ...extra });
const data = (over = {}) => ({
  profile: { kidName: '', sleepNeed: 8, ...(over.profile || {}) },
  checkins: over.checkins || [],
  body: { states: over.states || [], rules: [] },
  kid: { nights: over.nights || [] },
  meds: { caffeine: over.caffeine || [] },
});
const factor = (cap, key) => cap.factors.find((f) => f.key === key);

// ---------- zones ----------
test('zoneOf boundaries', () => {
  assert.equal(zoneOf(100), 'ok');
  assert.equal(zoneOf(65), 'ok');
  assert.equal(zoneOf(64), 'edge');
  assert.equal(zoneOf(40), 'edge');
  assert.equal(zoneOf(39), 'over');
  assert.equal(zoneOf(0), 'over');
});

test('fmtHours keeps halves and drops .0', () => {
  assert.equal(fmtHours(5.5), '5.5h');
  assert.equal(fmtHours(8), '8h');
  assert.equal(fmtHours(3.04), '3h');
});

test('sleepNeed falls back to 8 for missing or silly values', () => {
  assert.equal(sleepNeed({ profile: { sleepNeed: 7.5 } }), 7.5);
  assert.equal(sleepNeed({ profile: { sleepNeed: 'abc' } }), 8);
  assert.equal(sleepNeed({ profile: { sleepNeed: 30 } }), 8);
  assert.equal(sleepNeed({}), 8);
  assert.equal(sleepNeed(undefined), 8);
});

// ---------- no data / bad data ----------
test('capacity with no data is a neutral estimate with no confidence', () => {
  for (const d of [undefined, null, {}, data()]) {
    const cap = capacity(d, NOW);
    assert.equal(cap.score, BASE);
    assert.equal(cap.zone, 'ok');
    assert.equal(cap.confidence, 'none');
    assert.deepEqual(cap.factors, []);
    assert.equal(cap.basis.source, 'none');
  }
});

test('capacity survives missing fields on a check-in', () => {
  const cap = capacity(data({ checkins: [{ id: 'x', ts: NOW - HOUR, kind: 'morning', mood: 6 }] }), NOW);
  assert.equal(cap.confidence, 'low'); // no sleep hours
  assert.equal(cap.score, BASE);
  assert.ok(Number.isInteger(cap.score));
});

test('capacity ignores junk entries and future entries', () => {
  const d = data({
    checkins: [null, { ts: 'nope', kind: 'morning' }, morning(NOW + HOUR, { sleepHours: 2 })],
    states: [null, { ts: NOW + HOUR, kind: 'overload' }],
    nights: [{ ts: NOW + HOUR, quality: 'bad' }],
  });
  const cap = capacity(d, NOW);
  assert.equal(cap.score, BASE);
  assert.equal(cap.confidence, 'none');
});

// ---------- the morning factors ----------
test('sleep: −9 per hour short, capped at −36; +3 for enough', () => {
  assert.equal(factor(capacity(data({ checkins: [morning(NOW - HOUR, { sleepHours: 6 })] }), NOW), 'sleep').delta, -18);
  assert.equal(factor(capacity(data({ checkins: [morning(NOW - HOUR, { sleepHours: 7.5 })] }), NOW), 'sleep').delta, -5);
  assert.equal(factor(capacity(data({ checkins: [morning(NOW - HOUR, { sleepHours: 1 })] }), NOW), 'sleep').delta, -36);
  assert.equal(factor(capacity(data({ checkins: [morning(NOW - HOUR, { sleepHours: 9 })] }), NOW), 'sleep').delta, 3);
  assert.equal(capacity(data({ checkins: [morning(NOW - HOUR, { sleepHours: 8 })] }), NOW).score, BASE + 3);
});

test('sleep uses the sleep need from the profile', () => {
  const cap = capacity(data({ profile: { sleepNeed: 7 }, checkins: [morning(NOW - HOUR, { sleepHours: 6 })] }), NOW);
  assert.equal(factor(cap, 'sleep').delta, -9);
  assert.match(factor(cap, 'sleep').label, /6h of the 7h/);
});

test('two-night sleep debt adds only what last night does not already count', () => {
  const checkins = [morning(daysAgo(1), { sleepHours: 5 }), morning(NOW - HOUR, { sleepHours: 6 })];
  const cap = capacity(data({ checkins }), NOW);
  assert.equal(factor(cap, 'sleep').delta, -18);
  assert.equal(cap.basis.debt, 5);
  assert.equal(factor(cap, 'debt').delta, -12); // 3h carried × 4
  // A long night before pays it back: no extra debt factor.
  const paid = capacity(data({ checkins: [morning(daysAgo(1), { sleepHours: 10 }), morning(NOW - HOUR, { sleepHours: 7 })] }), NOW);
  assert.equal(factor(paid, 'debt'), undefined);
  // Capped at −16.
  const deep = capacity(data({ checkins: [morning(daysAgo(1), { sleepHours: 1 }), morning(NOW - HOUR, { sleepHours: 7 })] }), NOW);
  assert.equal(factor(deep, 'debt').delta, -16);
});

test('quality, mind, tension and mood each move the score', () => {
  const one = (extra) => capacity(data({ checkins: [morning(NOW - HOUR, { sleepHours: 8, sleepQuality: 3, tension: 2, mood: 6, ...extra })] }), NOW);
  assert.equal(factor(one({ sleepQuality: 1 }), 'quality').delta, -8);
  assert.equal(factor(one({ sleepQuality: 5 }), 'quality').delta, 4);
  assert.equal(factor(one({ sleepQuality: 3 }), 'quality'), undefined); // zero deltas are hidden
  assert.equal(factor(one({ mind: 'positive' }), 'mind').delta, 5);
  assert.equal(factor(one({ mind: 'mixed' }), 'mind').delta, -3);
  assert.equal(factor(one({ mind: 'negative' }), 'mind').delta, -10);
  assert.equal(factor(one({ mind: 'weird' }), 'mind'), undefined);
  assert.equal(factor(one({ tension: 1 }), 'tension').delta, 2);
  assert.equal(factor(one({ tension: 4 }), 'tension').delta, -7);
  assert.equal(factor(one({ tension: 5 }), 'tension').delta, -12);
  assert.equal(factor(one({ mood: 1 }), 'mood').delta, -10);
  assert.equal(factor(one({ mood: 10 }), 'mood').delta, 6);
  assert.equal(one({ mood: 6 }).score, BASE + 3);
});

test('score is clamped to 0–100 and always an integer', () => {
  const worst = data({
    checkins: [morning(daysAgo(1), { sleepHours: 0 }), morning(NOW - HOUR, { sleepHours: 0, sleepQuality: 1, mind: 'negative', tension: 5, mood: 1, caffeine: 9 })],
    states: [{ id: 's', ts: NOW - HOUR, kind: 'overload' }],
    nights: [{ id: 'n', ts: NOW - 5 * HOUR, quality: 'bad' }],
  });
  const low = capacity(worst, NOW);
  assert.equal(low.score, 0);
  assert.equal(low.zone, 'over');
  const best = capacity(data({ checkins: [morning(NOW - HOUR, { sleepHours: 9, sleepQuality: 5, mind: 'positive', tension: 1, mood: 10 })], states: [{ ts: NOW - HOUR, kind: 'calm' }] }), NOW);
  assert.equal(best.score, 100);
  assert.ok(Number.isInteger(capacity(data({ checkins: [morning(NOW - HOUR, { sleepHours: 7.3 })] }), NOW).score));
});

// ---------- the rest of the app ----------
test('overload: −20 within 24h, −10 within 48h, nothing after', () => {
  const s = (h) => capacity(data({ states: [{ id: 'o', ts: NOW - h * HOUR, kind: 'overload' }] }), NOW);
  assert.equal(factor(s(3), 'overload').delta, -20);
  assert.equal(factor(s(24), 'overload').delta, -20);
  assert.equal(factor(s(30), 'overload').delta, -10);
  assert.equal(factor(s(50), 'overload'), undefined);
  // Only the most recent overload counts.
  const two = capacity(data({ states: [{ ts: NOW - 2 * HOUR, kind: 'overload' }, { ts: NOW - 30 * HOUR, kind: 'overload' }] }), NOW);
  assert.equal(two.factors.filter((f) => f.key === 'overload').length, 1);
});

test('for 12 hours after an overload the score is held at 50 at most', () => {
  const good = morning(NOW - 4 * HOUR, { sleepHours: 9, sleepQuality: 5, mind: 'positive', tension: 1, mood: 9 });
  const cap = capacity(data({ checkins: [good], states: [{ ts: NOW - 2 * HOUR, kind: 'overload' }] }), NOW);
  assert.equal(cap.score, 50);
  assert.equal(cap.zone, 'edge');
  // The why-list still adds up to the score.
  assert.equal(BASE + cap.factors.reduce((s, f) => s + f.delta, 0), 50);
  assert.ok(factor(cap, 'recovery').delta < 0);
  // Already under 50: nothing extra.
  const low = capacity(data({ checkins: [morning(NOW - 4 * HOUR, { sleepHours: 5 })], states: [{ ts: NOW - 2 * HOUR, kind: 'overload' }] }), NOW);
  assert.equal(factor(low, 'recovery'), undefined);
  // After 12 hours the cap lifts.
  const later = capacity(data({ checkins: [good], states: [{ ts: NOW - 13 * HOUR, kind: 'overload' }] }), NOW);
  assert.equal(factor(later, 'recovery'), undefined);
  assert.ok(later.score > 50);
});

test('a calm moment after an overload helps a little; before it, it does not', () => {
  const after = capacity(data({ states: [{ ts: NOW - 5 * HOUR, kind: 'overload' }, { ts: NOW - 2 * HOUR, kind: 'calm' }] }), NOW);
  assert.equal(factor(after, 'calm').delta, 3);
  const before = capacity(data({ states: [{ ts: NOW - 5 * HOUR, kind: 'calm' }, { ts: NOW - 2 * HOUR, kind: 'overload' }] }), NOW);
  assert.equal(factor(before, 'calm'), undefined);
  const old = capacity(data({ states: [{ ts: NOW - 13 * HOUR, kind: 'calm' }] }), NOW);
  assert.equal(factor(old, 'calm'), undefined);
});

test('a rough night with the kid counts for 24h and uses the kid’s name', () => {
  const bad = capacity(data({ profile: { kidName: 'Robin' }, nights: [{ ts: NOW - 6 * HOUR, quality: 'bad' }] }), NOW);
  assert.equal(factor(bad, 'kidNight').delta, -6);
  assert.equal(factor(bad, 'kidNight').label, 'Rough night with Robin');
  assert.equal(factor(capacity(data({ nights: [{ ts: NOW - 6 * HOUR, quality: 'bad' }] }), NOW), 'kidNight').label, 'Rough night with your kid');
  assert.equal(factor(capacity(data({ nights: [{ ts: NOW - 6 * HOUR, quality: 'ok' }] }), NOW), 'kidNight'), undefined);
  assert.equal(factor(capacity(data({ nights: [{ ts: NOW - 30 * HOUR, quality: 'bad' }] }), NOW), 'kidNight'), undefined);
  // The latest night wins: a good night after a bad one means no penalty.
  const later = capacity(data({ nights: [{ ts: NOW - 20 * HOUR, quality: 'bad' }, { ts: NOW - 4 * HOUR, quality: 'good' }] }), NOW);
  assert.equal(factor(later, 'kidNight'), undefined);
});

test('caffeine: 4 or more today, from the check-in or the Meds log', () => {
  assert.equal(factor(capacity(data({ checkins: [morning(NOW - HOUR, { caffeine: 4 })] }), NOW), 'caffeine').delta, -4);
  assert.equal(factor(capacity(data({ checkins: [morning(NOW - HOUR, { caffeine: 3 })] }), NOW), 'caffeine'), undefined);
  const log = [1, 2, 3, 4].map((i) => ({ id: `k${i}`, ts: NOW - i * HOUR, what: 'coffee' }));
  assert.equal(factor(capacity(data({ caffeine: log }), NOW), 'caffeine').delta, -4);
  // Last night's check-in (still used just after midnight) doesn't carry its coffee into the new day.
  const lateNight = at(2026, 9, 4, 1);
  assert.equal(factor(capacity(data({ checkins: [morning(at(2026, 9, 3, 8), { caffeine: 5 })] }), lateNight), 'caffeine'), undefined);
  // Yesterday's coffee doesn't count today.
  const old = [1, 2, 3, 4].map((i) => ({ ts: daysAgo(1, 9 + i), what: 'coffee' }));
  assert.equal(factor(capacity(data({ caffeine: old }), NOW), 'caffeine'), undefined);
});

// ---------- which check-in counts ----------
test('today’s check-in gives ok confidence', () => {
  const cap = capacity(data({ checkins: [morning(NOW - 4 * HOUR, { sleepHours: 7 })] }), NOW);
  assert.equal(cap.confidence, 'ok');
  assert.equal(cap.basis.source, 'checkin');
});

test('just after midnight, yesterday’s check-in still counts (within 18h), with low confidence', () => {
  const lateNight = at(2026, 9, 4, 1);
  const yesterday8am = at(2026, 9, 3, 8);
  const d = data({ checkins: [morning(yesterday8am, { sleepHours: 6 })] });
  assert.equal(morningFor(d.checkins, lateNight)?.ts, yesterday8am);
  assert.equal(todaysMorning(d.checkins, lateNight), null);
  const cap = capacity(d, lateNight);
  assert.equal(cap.confidence, 'low');
  assert.equal(factor(cap, 'sleep').delta, -18);
});

test('no check-in today: estimate from the last 3 days, confidence none', () => {
  const checkins = [morning(daysAgo(1), { sleepHours: 6 }), morning(daysAgo(2), { sleepHours: 8 }), morning(daysAgo(6), { sleepHours: 2 })];
  const cap = capacity(data({ checkins }), NOW);
  assert.equal(cap.confidence, 'none');
  assert.equal(cap.basis.source, 'recent');
  assert.equal(cap.basis.recentDays, 2); // the 6-day-old one is too old
  const d1 = capacity(data({ checkins: checkins.slice(0, 2) }), daysAgo(1, 23)).score;
  const d2 = capacity(data({ checkins: [checkins[1]] }), daysAgo(2, 23)).score;
  assert.equal(cap.score, Math.round((d1 + d2) / 2));
  assert.equal(factor(cap, 'recent').delta, cap.score - BASE);
  // Events still apply on top of the estimate.
  const withOverload = capacity(data({ checkins, states: [{ ts: NOW - 20 * HOUR, kind: 'overload' }] }), NOW);
  assert.equal(withOverload.score, cap.score - 20);
});

// ---------- sleep debt ----------
test('sleepDebt: none without data', () => {
  assert.equal(sleepDebt([], 8, NOW), 0);
  assert.equal(sleepDebt(undefined, 8, NOW), 0);
});

test('sleepDebt sums the last two nights, ending today or yesterday', () => {
  const c = [morning(daysAgo(2), { sleepHours: 4 }), morning(daysAgo(1), { sleepHours: 6 }), morning(NOW - HOUR, { sleepHours: 7 })];
  assert.equal(sleepDebt(c, 8, NOW), 3); // today 1 + yesterday 2
  assert.equal(sleepDebt(c.slice(0, 2), 8, NOW), 6); // no check-in today: yesterday 2 + day before 4
  assert.equal(sleepDebt(c, 8, NOW, 3), 7);
  assert.equal(sleepDebt(c, 8, NOW, 1), 1);
});

test('sleepDebt skips missing nights, ignores old ones, and never goes negative', () => {
  assert.equal(sleepDebt([morning(daysAgo(5), { sleepHours: 2 })], 8, NOW), 0);
  assert.equal(sleepDebt([morning(daysAgo(1), { sleepHours: 10 }), morning(NOW - HOUR, { sleepHours: 9 })], 8, NOW), 0);
  assert.equal(sleepDebt([morning(daysAgo(1), { sleepHours: 10 }), morning(NOW - HOUR, { sleepHours: 5 })], 8, NOW), 1);
  assert.equal(sleepDebt([morning(NOW - HOUR, { sleepHours: null })], 8, NOW), 0);
  // Only the latest check-in per day counts.
  assert.equal(sleepDebt([morning(NOW - 3 * HOUR, { sleepHours: 2 }), morning(NOW - HOUR, { sleepHours: 7 })], 8, NOW), 1);
});

// ---------- daily scores ----------
test('dailyScores returns one entry per day, oldest first, null without a check-in', () => {
  const checkins = [morning(daysAgo(5), { sleepHours: 8 }), morning(daysAgo(1), { sleepHours: 5 })];
  const days = dailyScores(data({ checkins }), NOW, 7);
  assert.equal(days.length, 7);
  assert.equal(days[6].date, '2026-10-04');
  assert.equal(days[0].date, '2026-09-28');
  assert.deepEqual(days.map((d) => d.score === null), [true, false, true, true, true, false, true]);
  assert.equal(days[1].score, BASE + 3);
  assert.equal(days[1].zone, 'ok');
  assert.equal(days[6].zone, null);
});

test('dailyScores reads past days at the end of the day (a later overload counts)', () => {
  const checkins = [morning(daysAgo(1), { sleepHours: 8, mood: 3 })];
  const morningOverload = [{ ts: daysAgo(1, 9), kind: 'overload' }];
  assert.equal(dailyScores(data({ checkins, states: morningOverload }), NOW, 2)[0].score, BASE + 3 - 6 - 20);
  // An evening one is still inside its 12-hour recovery window at midnight.
  const eveningOverload = [{ ts: daysAgo(1, 19), kind: 'overload' }];
  assert.equal(dailyScores(data({ checkins, states: eveningOverload }), NOW, 2)[0].score, 50);
});

// ---------- warnings ----------
// Find a check-in that scores exactly `score` on its own. Earlier days keep a full
// night's sleep so they add no sleep debt to the days after them.
function dayWith(score, ts, allowShort) {
  const sleeps = allowShort ? [8, 7.5, 7, 6.5, 6, 5.5, 5, 4.5, 4, 3.5, 3, 2.5, 2, 1.5, 1, 0.5, 0] : [8];
  for (const sleepHours of sleeps) {
    for (const mind of [null, 'positive', 'mixed', 'negative']) {
      for (const tension of [2, 1, 3, 4, 5]) {
        for (let mood = 1; mood <= 10; mood++) {
          const c = morning(ts, { sleepHours, mind, tension, mood });
          if (capacity(data({ checkins: [c] }), ts + HOUR).score === score) return c;
        }
      }
    }
  }
  throw new Error(`no check-in scores ${score}`);
}
// Daily check-ins scoring `scores` (oldest first), the last one `endAgo` days ago (0 = today).
const slide = (scores, endAgo = 0) => scores.map((sc, i) => {
  const ago = endAgo + scores.length - 1 - i;
  return dayWith(sc, ago === 0 ? NOW - HOUR : daysAgo(ago), i === scores.length - 1);
});

test('the slide helper produces the scores it was asked for', () => {
  const days = dailyScores(data({ checkins: slide([84, 70, 54]) }), NOW, 3);
  assert.deepEqual(days.map((d) => d.score), [84, 70, 54]);
});

test('warning: none when things look steady', () => {
  const w = warning(data({ checkins: slide([88, 88, 88]) }), NOW);
  assert.equal(w.level, 'none');
  assert.deepEqual(w.reasons, []);
  assert.deepEqual(w.actions, []);
  assert.equal(warning(data(), NOW).level, 'none');
  assert.equal(warning(undefined, NOW).level, 'none');
});

test('warning: two days sliding under 55', () => {
  const w = warning(data({ checkins: slide([84, 70, 54]) }), NOW);
  assert.equal(w.level, 'warning');
  assert.match(w.title, /heading toward overload/);
  assert.ok(w.reasons.some((r) => r.includes('84 → 70 → 54')));
  assert.ok(w.actions.some((a) => a.key === 'projects' && /building apps/.test(a.text)));
  assert.ok(w.actions.every((a) => typeof a.key === 'string' && typeof a.text === 'string'));
});

test('warning: no slide when today is 55 or more, or when a day held level', () => {
  assert.equal(warning(data({ checkins: slide([84, 70, 56]) }), NOW).level, 'none');
  assert.equal(warning(data({ checkins: slide([70, 70, 54]) }), NOW).level, 'none');
  assert.equal(warning(data({ checkins: slide([60, 70, 54]) }), NOW).level, 'none');
  // A missing day breaks the run.
  const gap = slide([84, 70, 54]);
  gap.splice(1, 1);
  assert.equal(warning(data({ checkins: gap }), NOW).level, 'none');
});

test('warning: a very narrow day (under 40) on its own', () => {
  const w = warning(data({ checkins: slide([60, 70, 38]) }), NOW);
  assert.equal(w.level, 'warning');
  assert.match(w.title, /very narrow/);
  const edge = warning(data({ checkins: slide([40]) }), NOW);
  assert.equal(edge.level, 'none');
});

test('warning: recovery takes precedence for 12 hours after an overload', () => {
  const states = [{ ts: NOW - 3 * HOUR, kind: 'overload' }];
  const w = warning(data({ checkins: slide([84, 70, 54]), states }), NOW);
  assert.equal(w.level, 'recovery');
  assert.match(w.title, /coming down/i);
  assert.ok(w.reasons.length >= 2); // the slide is still listed
  assert.equal(w.actions[0].key, 'expect');
  // After 12h it drops to watch.
  const later = warning(data({ states: [{ ts: NOW - 20 * HOUR, kind: 'overload' }] }), NOW);
  assert.equal(later.level, 'watch');
  assert.equal(warning(data({ states: [{ ts: NOW - 40 * HOUR, kind: 'overload' }] }), NOW).level, 'none');
});

test('warning: 3h of two-night sleep debt is at least watch', () => {
  const checkins = [morning(daysAgo(1), { sleepHours: 6.5, mood: 9 }), morning(NOW - HOUR, { sleepHours: 6.5, mood: 9 })];
  const w = warning(data({ checkins }), NOW);
  assert.equal(w.level, 'watch');
  assert.match(w.reasons.join(' '), /3h short on sleep/);
  assert.equal(w.actions[0].key, 'sleep');
  const under = [morning(daysAgo(1), { sleepHours: 7, mood: 9 }), morning(NOW - HOUR, { sleepHours: 6.5, mood: 9 })];
  assert.equal(warning(data({ checkins: under }), NOW).level, 'none');
});

test('warning: before today’s check-in, a slide over the last days is a watch', () => {
  const w = warning(data({ checkins: slide([84, 70, 54], 1) }), NOW);
  assert.equal(w.level, 'watch');
  assert.ok(w.reasons.some((r) => r.includes('84 → 70 → 54')));
});

test('warning: the most important rule names the card', () => {
  // A slide before today's check-in outranks "still settling" from an overload yesterday.
  const states = [{ ts: daysAgo(1, 20), kind: 'overload' }];
  const w = warning(data({ checkins: slide([84, 70, 54], 1), states }), NOW);
  assert.equal(w.level, 'watch');
  assert.match(w.title, /sliding/);
  assert.ok(w.reasons.some((r) => r === 'You were overloaded yesterday. It can take a day or two to settle.'), w.reasons.join(' | '));
  assert.ok(w.reasons[0].startsWith('The last two days slid'));
});

test('warning: the sleep action uses the kid’s name', () => {
  const w = warning(data({ profile: { kidName: 'Robin' }, states: [{ ts: NOW - HOUR, kind: 'overload' }] }), NOW);
  assert.ok(w.actions.find((a) => a.key === 'sleep').text.includes('Robin'));
});

// ---------- example data ----------
test('sampleMorning: about 10 days, all fields, nothing in the future', () => {
  const s = sampleMorning(NOW);
  assert.ok(s.length >= 9 && s.length <= 11);
  for (const c of s) {
    assert.equal(c.kind, 'morning');
    assert.ok(c.ts <= NOW);
    for (const k of ['id', 'ts', 'mood', 'note', 'tags', 'worryId', 'sleepHours', 'sleepQuality', 'mind', 'tension', 'ate', 'caffeine']) assert.ok(k in c, k);
    assert.ok(['positive', 'mixed', 'negative'].includes(c.mind));
    assert.ok(c.mood >= 1 && c.mood <= 10);
  }
  assert.equal(new Set(s.map((c) => c.id)).size, s.length);
  assert.deepEqual(sampleMorning(NOW), s); // deterministic
});

test('sampleMorning: today’s check-in appears only after 7am', () => {
  const early = at(2026, 9, 4, 6, 30);
  assert.equal(todaysMorning(sampleMorning(early), early), null);
  assert.ok(sampleMorning(early).every((c) => c.ts <= early));
  const justAfter = at(2026, 9, 4, 7, 5);
  const t = todaysMorning(sampleMorning(justAfter), justAfter);
  assert.ok(t && t.ts <= justAfter);
});

test('sampleMorning: the example slides into a warning', () => {
  const d = data({ checkins: sampleMorning(NOW) });
  const w = warning(d, NOW);
  assert.equal(w.level, 'warning');
  const days = dailyScores(d, NOW, 7);
  assert.ok(days.every((x) => x.score != null));
  assert.ok(days[6].score < days[5].score && days[5].score < days[4].score);
  assert.equal(capacity(d, NOW).zone, 'edge');
  // Before today's check-in exists, the slide shows as a watch.
  const early = at(2026, 9, 4, 6, 30);
  assert.equal(warning(data({ checkins: sampleMorning(early) }), early).level, 'watch');
});
