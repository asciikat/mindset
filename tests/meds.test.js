import test from 'node:test';
import assert from 'node:assert/strict';
import {
  starterMeds, sampleMeds, doseToday, hoursSince, checksFor, schedule, nextDue, dayCurve, dayStats,
  caffeineFor, patterns, buildIcs, summaryText, cleanSettings, fmtClock, fmtHours, fmtAbout, fmtDay,
  bandAverages, curveSentence, doseLabel,
} from '../js/logic/meds.js';

const HOUR = 3600000;
const DAY = 24 * HOUR;
const MIN = 60000;
// Local times, so day boundaries match whatever time zone the tests run in.
const at = (d, hh, mm = 0) => new Date(2026, 9, d, hh, mm).getTime();
const NOW = at(4, 15, 20); // Sun 4 Oct 2026, 3:20pm
const SET = { name: 'Vyvanse', mg: null, everyMin: 60, hours: 12 };

const dose = (id, ts, extra = {}) => ({ id, ts, name: 'Vyvanse', mg: null, foodWhat: '', foodAmount: 'normal', protein: false, sleepHours: 7, note: '', ...extra });
const check = (doseId, ts, v = {}) => ({ id: `${doseId}-${ts}`, ts, doseId, focus: 3, mood: 3, anxiety: 2, appetite: 3, energy: 3, ate: false, note: '', ...v });

// ---------- starter & sample ----------

test('starterMeds has the default settings', () => {
  assert.deepEqual(starterMeds(), { settings: { name: 'Vyvanse', mg: null, everyMin: 60, hours: 12 } });
});

test('sampleMeds is deterministic, never in the future, and ids line up', () => {
  const a = sampleMeds(NOW);
  const b = sampleMeds(NOW);
  assert.deepEqual(a, b);
  const ids = new Set(a.doses.map((d) => d.id));
  assert.equal(ids.size, a.doses.length);
  for (const list of [a.doses, a.checks, a.caffeine]) {
    assert.ok(list.length > 0);
    for (const x of list) assert.ok(x.ts <= NOW, 'nothing in the future');
  }
  for (const c of a.checks) {
    assert.ok(ids.has(c.doseId), 'every check-in points at a dose');
    for (const k of ['focus', 'mood', 'anxiety', 'appetite', 'energy']) assert.ok(c[k] >= 1 && c[k] <= 5 && Number.isInteger(c[k]));
  }
  const checkIds = new Set(a.checks.map((c) => c.id));
  assert.equal(checkIds.size, a.checks.length);
});

test('sampleMeds doses are taken 7–9am across about six days, today only after 9am', () => {
  const after = sampleMeds(NOW);
  assert.ok(after.doses.length >= 6 && after.doses.length <= 7);
  for (const d of after.doses) {
    const hr = new Date(d.ts).getHours();
    assert.ok(hr >= 7 && hr < 9, `dose at ${fmtClock(d.ts)}`);
    assert.ok(['none', 'small', 'normal', 'big'].includes(d.foodAmount));
    assert.equal(typeof d.protein, 'boolean');
    assert.equal(typeof d.sleepHours, 'number');
  }
  assert.ok(doseToday(after.doses, NOW), 'today is included after 9am');
  assert.ok(after.doses.some((d) => d.foodAmount === 'none'), 'some days with nothing to eat');

  const early = sampleMeds(at(4, 8, 30));
  assert.equal(doseToday(early.doses, at(4, 8, 30)), null, 'no dose today before 9am');
  assert.ok(early.doses.length >= 5);
});

test('sampleMeds curves look like a stimulant day', () => {
  const { doses, checks, caffeine } = sampleMeds(NOW);
  const past = doses.filter((d) => d.ts < at(4, 0));
  const pts = past.flatMap((d) => dayCurve(d, checks));
  const avg = (xs) => xs.reduce((s, n) => s + n, 0) / xs.length;
  const early = pts.filter((p) => p.h < 1.5);
  const mid = pts.filter((p) => p.h >= 3 && p.h <= 8);
  const late = pts.filter((p) => p.h >= 11);
  assert.ok(avg(mid.map((p) => p.focus)) > avg(early.map((p) => p.focus)) + 0.7, 'focus rises after 1–2h');
  assert.ok(avg(mid.map((p) => p.focus)) > avg(late.map((p) => p.focus)) + 0.7, 'focus fades by 11h+');
  assert.ok(avg(mid.map((p) => p.appetite)) < avg(early.map((p) => p.appetite)) - 1, 'appetite low mid-day');
  const caf = patterns(doses, checks, caffeine).find((p) => p.key === 'caffeine');
  assert.ok(caf && caf.diff > 0, 'more caffeine, more anxiety');
  const food = patterns(doses, checks, caffeine).find((p) => p.key === 'food');
  assert.ok(food && food.diff > 0, 'eating goes with better focus in the example');
});

// ---------- formatting ----------

test('formatting helpers', () => {
  assert.equal(fmtClock(at(4, 7, 40)), '7:40am');
  assert.equal(fmtClock(at(4, 0, 5)), '12:05am');
  assert.equal(fmtClock(at(4, 12, 0)), '12:00pm');
  assert.equal(fmtClock(at(4, 21, 9)), '9:09pm');
  assert.equal(fmtHours(3 + 10 / 60), '3h 10m');
  assert.equal(fmtHours(0.5), '30m');
  assert.equal(fmtHours(2), '2h');
  assert.equal(fmtAbout(3.2), '3h');
  assert.equal(fmtAbout(3.3), '3h 30m');
  assert.equal(fmtDay(at(4, 9)), 'Sun 4 Oct');
  assert.equal(doseLabel({ name: 'Vyvanse', mg: 30 }), 'Vyvanse 30mg');
  assert.equal(doseLabel({ name: 'Vyvanse', mg: null }), 'Vyvanse');
});

test('cleanSettings fills gaps and keeps values in range', () => {
  assert.deepEqual(cleanSettings({}), SET);
  assert.deepEqual(cleanSettings({ name: '  Ritalin ', mg: 20, everyMin: 90, hours: 30 }), { name: 'Ritalin', mg: 20, everyMin: 90, hours: 14 });
  assert.deepEqual(cleanSettings({ name: '', mg: -1, everyMin: 45, hours: 'x' }), SET);
});

// ---------- today's dose ----------

test('doseToday picks the latest dose taken today, not yesterday or the future', () => {
  const doses = [dose('y', at(3, 7)), dose('a', at(4, 7, 40)), dose('b', at(4, 12)), dose('f', at(4, 18))];
  assert.equal(doseToday(doses, NOW).id, 'b');
  assert.equal(doseToday(doses, at(4, 9)).id, 'a');
  assert.equal(doseToday([dose('y', at(3, 7))], NOW), null);
  assert.equal(doseToday([], NOW), null);
});

test('hoursSince and checksFor', () => {
  const d = dose('d', at(4, 7, 40));
  assert.equal(hoursSince(d, at(4, 10, 50)), 3 + 10 / 60);
  const cs = [check('d', at(4, 10)), check('x', at(4, 9)), check('d', at(4, 8, 40))];
  assert.deepEqual(checksFor(d, cs).map((c) => c.ts), [at(4, 8, 40), at(4, 10)]);
  assert.deepEqual(checksFor(null, cs), []);
});

// ---------- schedule & nextDue ----------

test('nextDue: first check-in an interval after the dose', () => {
  const d = dose('d', at(4, 7, 40));
  assert.deepEqual(nextDue(d, [], at(4, 7, 50), SET), { dueTs: at(4, 8, 40), hour: 1, overdue: false, k: 1 });
  const due = nextDue(d, [], at(4, 8, 50), SET);
  assert.equal(due.dueTs, at(4, 8, 40));
  assert.equal(due.overdue, true);
});

test('nextDue: a check-in within half an interval fills the slot', () => {
  const d = dose('d', at(4, 7, 40));
  // Checked in 15 minutes early for the 1h slot.
  const cs = [check('d', at(4, 8, 25))];
  assert.deepEqual(nextDue(d, cs, at(4, 8, 45), SET), { dueTs: at(4, 9, 40), hour: 2, overdue: false, k: 2 });
});

test('nextDue: a missed slot is skipped once its window closes', () => {
  const d = dose('d', at(4, 7, 40));
  // No check-ins; at 10:15 the 2h slot (9:40) window closed at 10:10, so 3h (10:40) is next.
  const nd = nextDue(d, [], at(4, 10, 15), SET);
  assert.equal(nd.hour, 3);
  assert.equal(nd.overdue, false);
  const slots = schedule(d, [], at(4, 10, 15), SET);
  assert.deepEqual(slots.slice(0, 3).map((x) => x.status), ['missed', 'missed', 'upcoming']);
});

test('nextDue returns null after the tracking window', () => {
  const d = dose('d', at(4, 7, 40));
  assert.equal(nextDue(d, [], at(4, 20, 11), SET), null); // 12h slot window ends 8:10pm
  assert.ok(nextDue(d, [], at(4, 20, 5), SET).overdue);
  assert.equal(nextDue(d, [], at(4, 16, 15), { ...SET, hours: 8 }), null);
  assert.equal(nextDue(null, [], NOW, SET), null);
});

test('schedule honours the interval setting', () => {
  const d = dose('d', at(4, 7));
  assert.equal(schedule(d, [], NOW, { everyMin: 30, hours: 12 }).length, 24);
  assert.equal(schedule(d, [], NOW, { everyMin: 90, hours: 12 }).length, 8);
  const s90 = schedule(d, [], at(4, 8, 35), { everyMin: 90, hours: 12 });
  assert.equal(s90[0].status, 'due');
  assert.equal(s90[0].h, 1.5);
  const done = schedule(d, [check('d', at(4, 8, 20))], at(4, 8, 35), { everyMin: 90, hours: 12 });
  assert.equal(done[0].status, 'done');
  assert.equal(done[0].checkId, `d-${at(4, 8, 20)}`);
});

// ---------- curves & stats ----------

test('dayCurve gives hours since the dose and each score', () => {
  const d = dose('d', at(4, 7));
  const cs = [check('d', at(4, 10), { focus: 5, mood: 4, anxiety: 3, appetite: 1, energy: 4, note: 'flow' }), check('d', at(4, 8), { focus: 2, energy: null })];
  const pts = dayCurve(d, cs);
  assert.equal(pts.length, 2);
  assert.deepEqual(pts.map((p) => p.h), [1, 3]);
  assert.equal(pts[1].focus, 5);
  assert.equal(pts[1].appetite, 1);
  assert.equal(pts[0].energy, null);
  assert.equal(pts[1].note, 'flow');
  for (const k of ['h', 'focus', 'mood', 'anxiety', 'appetite', 'energy']) assert.ok(k in pts[0]);
});

test('dayStats finds the peak and the focus window', () => {
  const d = dose('d', at(4, 7));
  const cs = [1, 2, 3, 4, 5, 6].map((k, i) => check('d', at(4, 7 + k), { focus: [2, 4, 5, 4, 3, 2][i] }));
  const st = dayStats(d, cs);
  assert.equal(st.count, 6);
  assert.deepEqual(st.peakFocus, { value: 5, h: 3 });
  assert.deepEqual(st.focusWindow, { from: 2, to: 4 });
  assert.equal(st.avgFocus, 20 / 6);
  assert.ok(curveSentence(dayCurve(d, cs)).startsWith('6 check-ins. Focus peaked at 5 of 5 around 3h'));
  assert.equal(curveSentence([]), 'No check-ins yet.');
});

test('caffeineFor keeps the dose day only', () => {
  const d = dose('d', at(4, 7));
  const caf = [{ id: 'a', ts: at(4, 6, 30), what: 'coffee' }, { id: 'b', ts: at(3, 15), what: 'tea' }, { id: 'c', ts: at(4, 13), what: 'cola' }];
  assert.deepEqual(caffeineFor(d, caf).map((c) => c.id), ['a', 'c']);
});

test('bandAverages groups check-ins in 2-hour bands', () => {
  const d = dose('d', at(4, 7));
  const rows = bandAverages([d], [check('d', at(4, 8), { focus: 2 }), check('d', at(4, 9, 30), { focus: 4 }), check('d', at(4, 10), { focus: 5 })]);
  assert.equal(rows.length, 6);
  assert.equal(rows[0].focus, 2);
  assert.equal(rows[1].focus, 4.5);
  assert.equal(rows[1].n, 2);
  assert.equal(rows[5].n, 0);
  assert.equal(rows[5].focus, null);
});

// ---------- patterns ----------

// A day with check-ins at 3h and 6h, all at the given focus and anxiety.
function day(n, extra, focus, anxiety, cups = 0) {
  const ts = at(4, 7) - n * DAY;
  const d = dose(`p${n}`, ts, extra);
  const cs = [3, 6].map((k) => check(d.id, ts + k * HOUR, { focus, anxiety }));
  const caf = Array.from({ length: cups }, (_, i) => ({ id: `cf${n}-${i}`, ts: ts + i * HOUR, what: 'coffee' }));
  return { d, cs, caf };
}
const build = (days) => [days.map((x) => x.d), days.flatMap((x) => x.cs), days.flatMap((x) => x.caf)];

test('patterns compares food, protein, sleep and caffeine with sample sizes', () => {
  const days = [
    day(1, { foodAmount: 'none', protein: false, sleepHours: 5 }, 2, 4, 4),
    day(2, { foodAmount: 'none', protein: false, sleepHours: 5.5 }, 3, 3, 3),
    day(3, { foodAmount: 'normal', protein: true, sleepHours: 7 }, 4, 2, 1),
    day(4, { foodAmount: 'big', protein: true, sleepHours: 8 }, 5, 1, 0),
    day(5, { foodAmount: 'small', protein: false, sleepHours: 6.5 }, 4, 2, 2),
  ];
  const out = patterns(...build(days));
  const by = Object.fromEntries(out.map((p) => [p.key, p]));
  assert.deepEqual(Object.keys(by).sort(), ['caffeine', 'food', 'protein', 'sleep']);
  assert.equal(by.food.a.n, 3);
  assert.equal(by.food.b.n, 2);
  assert.equal(by.food.a.avg, 13 / 3);
  assert.equal(by.food.b.avg, 2.5);
  assert.equal(by.food.metric, 'focus');
  assert.equal(by.protein.a.n, 2);
  assert.equal(by.protein.b.n, 3);
  // 6.5h of sleep belongs to neither sleep group.
  assert.equal(by.sleep.a.n, 2);
  assert.equal(by.sleep.b.n, 2);
  assert.equal(by.sleep.diff, 4.5 - 2.5);
  assert.equal(by.caffeine.metric, 'anxiety');
  assert.equal(by.caffeine.a.n, 2);
  assert.equal(by.caffeine.a.avg, 3.5);
  assert.equal(by.caffeine.b.avg, 5 / 3);
  assert.equal(by.caffeine.days, 5);
});

test('patterns stays quiet until each group has two days', () => {
  const days = [
    day(1, { foodAmount: 'none', sleepHours: 5 }, 2, 4, 4),
    day(2, { foodAmount: 'normal', sleepHours: 7 }, 4, 2, 1),
    day(3, { foodAmount: 'normal', sleepHours: 8 }, 4, 2, 1),
  ];
  const keys = patterns(...build(days)).map((p) => p.key);
  assert.ok(!keys.includes('food'));
  assert.ok(!keys.includes('sleep'));
  assert.ok(!keys.includes('caffeine'));
  assert.deepEqual(patterns([], [], []), []);
});

test('patterns only counts focus 2–8h after the dose', () => {
  const ts0 = at(4, 7) - DAY;
  const mk = (n, amount, f) => {
    const ts = ts0 - n * DAY;
    const d = dose(`q${n}`, ts, { foodAmount: amount });
    // A 1h check-in (ignored for focus) and a 4h one (counted).
    return { d, cs: [check(d.id, ts + HOUR, { focus: 1 }), check(d.id, ts + 4 * HOUR, { focus: f })], caf: [] };
  };
  const out = patterns(...build([mk(0, 'none', 2), mk(1, 'none', 2), mk(2, 'big', 5), mk(3, 'big', 5)]));
  const food = out.find((p) => p.key === 'food');
  assert.equal(food.a.avg, 5);
  assert.equal(food.b.avg, 2);
});

// ---------- calendar ----------

test('buildIcs makes a valid calendar with one event and alarm per check-in', () => {
  const d = dose('dose-1', Date.UTC(2026, 9, 3, 21, 40)); // 7:40am in Sydney, as UTC
  const ics = buildIcs(d, SET);
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:'));
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
  assert.ok(!/[^\r]\n/.test(ics), 'every line ends in CRLF');
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 12);
  assert.equal((ics.match(/END:VEVENT/g) || []).length, 12);
  assert.equal((ics.match(/BEGIN:VALARM/g) || []).length, 12);
  assert.ok(ics.includes('DTSTART:20261003T224000Z'), 'first check-in 1h later, in UTC');
  assert.ok(ics.includes('DTEND:20261003T224500Z'));
  assert.ok(ics.includes('DTSTART:20261004T094000Z'), '12h check-in');
  assert.ok(ics.includes('UID:dose-1-1@mindset.local'));
  assert.ok(ics.includes('TRIGGER:PT0S'));
  for (const line of ics.split('\r\n')) assert.ok(Buffer.byteLength(line) <= 75, `line too long: ${line}`);
  const begins = ics.split('\r\n').filter((l) => l.startsWith('BEGIN:')).length;
  const ends = ics.split('\r\n').filter((l) => l.startsWith('END:')).length;
  assert.equal(begins, ends);
});

test('buildIcs keeps only check-ins after `from`, escapes text, and folds long lines', () => {
  const d = dose('d2', Date.UTC(2026, 9, 4, 0, 0), { name: 'Med; with, commas' });
  const ics = buildIcs(d, { everyMin: 90, hours: 12 }, { from: Date.UTC(2026, 9, 4, 6, 0) });
  // Slots at 1.5h steps: 1:30, 3:00, 4:30, 6:00, 7:30, 9:00, 10:30, 12:00 — keep the four after 6:00.
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 4);
  assert.ok(ics.includes('DTSTART:20261004T073000Z'));
  assert.ok(!ics.includes('DTSTART:20261004T060000Z'));
  assert.ok(ics.includes('Med\\; with\\, commas'));
  const unfolded = ics.replace(/\r\n /g, '');
  assert.ok(unfolded.includes('SUMMARY:Check-in: 7h 30m after Med\\; with\\, commas'));
  assert.ok(/\r\n /.test(ics), 'long description line is folded');
});

// ---------- summary ----------

test('summaryText lists the period, bands, days, notes and patterns', () => {
  const { doses, checks, caffeine } = sampleMeds(NOW);
  const txt = summaryText(doses, checks, caffeine, { ...SET, mg: 30 }, NOW);
  assert.ok(txt.startsWith('Medication log: Vyvanse 30mg'));
  assert.ok(txt.includes('Period: Mon 28 Sep to Sun 4 Oct (7 days with a dose logged)'));
  assert.ok(txt.includes('Average by hours after the dose'));
  assert.ok(txt.includes('Day by day'));
  assert.ok(txt.includes('Sun 4 Oct: 7:40am'));
  assert.ok(txt.includes('Crashed hard this afternoon.'));
  assert.ok(txt.includes('small sample, not conclusions'));
  assert.ok(txt.includes('not a clinical record'));
  assert.ok(!txt.includes('undefined') && !txt.includes('NaN'));
});

test('summaryText respects the day window and handles no data', () => {
  const old = dose('old', NOW - 30 * DAY);
  const txt = summaryText([old], [], [], SET, NOW, { days: 14 });
  assert.ok(txt.includes('No doses logged in the last 14 days.'));
  const one = summaryText([dose('d', at(4, 8))], [], [], SET, NOW);
  assert.ok(one.includes('1 day with a dose logged'));
  assert.ok(one.includes('no check-ins'));
  assert.ok(!one.includes('NaN'));
});

test('summaryText keeps user text as-is (it is plain text, not HTML)', () => {
  const d = dose('d', at(4, 8), { note: '<b>hi</b> & bye' });
  const txt = summaryText([d], [check('d', at(4, 9), { note: 'a "quote"' })], [], SET, NOW);
  assert.ok(txt.includes('Note at dose: <b>hi</b> & bye'));
  assert.ok(txt.includes('a "quote"'));
  assert.ok(txt.includes(`${fmtClock(at(4, 9))} (1h in)`));
  assert.equal(MIN, 60000);
});
