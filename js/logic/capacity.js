// Today's capacity: a rough, transparent estimate of how wide your window of
// tolerance is today (0–100), plus a multi-day early warning.
//
// Pure functions: no DOM, no storage, no clock. Every function takes `now`.
// Covered by tests/capacity.test.js.
//
// HOW THE SCORE WORKS (a heuristic, not a measurement)
// Start at BASE (85): an ordinary day with nothing known to be pulling on you.
// Then add or subtract for each thing you logged:
//
//   From the morning check-in (today's, or the most recent one within 18 hours,
//   so a check-in still counts just after midnight):
//     sleep        −9 per hour short of your sleep need, at most −36; +3 if you got enough
//     sleep debt   the 2-night shortfall beyond last night's: −4 per hour, at most −16
//                  (a long night pays some of it back; see sleepDebt)
//     quality      1 restless −8 · 2 −4 · 3 0 · 4 +2 · 5 deep +4
//     mind         positive +5 · mixed −3 · negative −10
//     tension      1 +2 · 2 0 · 3 −3 · 4 −7 · 5 −12
//     mood         (mood − 6) × 2, between −10 and +6
//   From the rest of the app:
//     overload     logged in the last 24h −20, in the last 24–48h −10 (most recent only)
//     recovery     for 12h after an overload the score is held at 50 at most: you were
//                  outside your window only hours ago, so it can't honestly read as wide
//     calm moment  logged in the last 12h, after any overload +3
//     kid's night  the most recent one in the last 24h was 'bad' −6
//     caffeine     4 or more so far today −4 (check-in count or Meds log, whichever is higher)
//
// The total is clamped to 0–100 and rounded. Zones:
//   ok   65–100  wide window
//   edge 40–64   narrowing
//   over  0–39   very narrow
//
// No check-in yet: the morning part is replaced by the average morning score of
// up to 3 previous days (or BASE if there are none), the rest still applies, and
// confidence is 'none'.

import { DAY, HOUR } from '../logic.js';

export const BASE = 85;
export const ZONE_OK = 65;
export const ZONE_EDGE = 40;
export const RECOVERY_CAP = 50;

export const ZONE_LABELS = { ok: 'Wide window', edge: 'Narrowing', over: 'Very narrow' };
export const MIND_LABELS = { positive: 'Positive', mixed: 'Mixed', negative: 'Negative' };

const QUALITY_DELTA = { 1: -8, 2: -4, 3: 0, 4: 2, 5: 4 };
const QUALITY_LABEL = { 1: 'Restless sleep', 2: 'Light, broken sleep', 3: 'So-so sleep', 4: 'Good sleep', 5: 'Deep sleep' };
const MIND_DELTA = { positive: 5, mixed: -3, negative: -10 };
const MIND_FACTOR = { positive: 'Mind on good things', mixed: 'Mind mixed', negative: 'Mind on hard things' };
const TENSION_DELTA = { 1: 2, 2: 0, 3: -3, 4: -7, 5: -12 };

// ---------- small helpers (local calendar time) ----------
function startOfDay(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
// Shift by whole calendar days (safe across daylight-saving changes).
function addDays(ts, n) {
  const d = new Date(ts);
  d.setDate(d.getDate() + n);
  return d.getTime();
}
// A wall-clock time on the same local day (right on daylight-saving days too).
function clock(dayTs, hours, minutes) {
  const d = new Date(dayTs);
  d.setHours(hours, minutes, 0, 0);
  return d.getTime();
}
function dayKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const list = (v) => (Array.isArray(v) ? v : []);

// "5.5h", "8h"
export function fmtHours(hours) {
  const r = Math.round(hours * 10) / 10;
  return `${Number.isInteger(r) ? r : r.toFixed(1)}h`;
}

// Calendar-day words for things more than a few hours back.
function dayWord(ts, now) {
  const diff = Math.round((startOfDay(now) - startOfDay(ts)) / DAY);
  return diff <= 0 ? 'earlier today' : diff === 1 ? 'yesterday' : diff === 2 ? 'two days ago' : `${diff} days ago`;
}

function ago(ms) {
  const hrs = Math.floor(ms / HOUR);
  if (hrs < 1) return 'less than an hour ago';
  return `${hrs} ${hrs === 1 ? 'hour' : 'hours'} ago`;
}

export function zoneOf(score) {
  if (score >= ZONE_OK) return 'ok';
  if (score >= ZONE_EDGE) return 'edge';
  return 'over';
}

export function sleepNeed(data) {
  const n = num(Number(data?.profile?.sleepNeed));
  return n != null && n >= 4 && n <= 12 ? n : 8;
}

const isMorning = (c) => Boolean(c) && c.kind === 'morning' && num(c.ts) != null;

function latest(items, pred = () => true) {
  let best = null;
  for (const it of items) if (it && num(it.ts) != null && pred(it) && (!best || it.ts > best.ts)) best = it;
  return best;
}

// The morning check-in that counts at `now`: the latest one today, or failing
// that the most recent one within 18 hours. Null if there isn't one.
export function morningFor(checkins, now) {
  const m = latest(list(checkins), (c) => isMorning(c) && c.ts <= now);
  if (!m) return null;
  return m.ts >= startOfDay(now) || now - m.ts <= 18 * HOUR ? m : null;
}

// Today's morning check-in only (what the Today screen edits).
export function todaysMorning(checkins, now) {
  return latest(list(checkins), (c) => isMorning(c) && c.ts <= now && c.ts >= startOfDay(now));
}

// Net hours short over the last `nights` nights, from morning check-ins
// (each one records the night before). The window ends today if you've checked
// in today, otherwise yesterday. Nights with no check-in are skipped. A long
// night pays some debt back, but the total never goes below 0.
export function sleepDebt(checkins, need, now, nights = 2) {
  const byDay = new Map();
  for (const c of list(checkins)) {
    if (!isMorning(c) || c.ts > now || num(c.sleepHours) == null) continue;
    const k = dayKey(c.ts);
    if (!byDay.has(k) || byDay.get(k).ts < c.ts) byDay.set(k, c);
  }
  const today = startOfDay(now);
  const end = byDay.has(dayKey(today)) ? today : addDays(today, -1);
  let sum = 0;
  for (let i = 0; i < nights; i++) {
    const c = byDay.get(dayKey(addDays(end, -i)));
    if (c) sum += need - c.sleepHours;
  }
  return Math.max(0, Math.round(sum * 10) / 10);
}

// The factors that come from one morning check-in. `at` is the moment the
// check-in is read (so sleep debt is counted up to that morning).
function morningFactors(c, checkins, need, at) {
  const out = [];
  const sh = num(c.sleepHours);
  if (sh != null) {
    const short = need - sh;
    if (short > 0) out.push({ key: 'sleep', label: `Slept ${fmtHours(sh)} of the ${fmtHours(need)} you need`, delta: -Math.min(36, Math.round(9 * short)) });
    else out.push({ key: 'sleep', label: `Slept ${fmtHours(sh)}, enough`, delta: 3 });
    const debt = sleepDebt(checkins, need, at, 2);
    const carry = debt - Math.max(0, short);
    if (carry > 0) out.push({ key: 'debt', label: `Sleep debt over two nights: ${fmtHours(debt)}`, delta: -Math.min(16, Math.round(4 * carry)) });
  }
  const q = num(c.sleepQuality);
  if (q != null && QUALITY_DELTA[q] != null) out.push({ key: 'quality', label: QUALITY_LABEL[q], delta: QUALITY_DELTA[q] });
  if (MIND_DELTA[c.mind] != null) out.push({ key: 'mind', label: MIND_FACTOR[c.mind], delta: MIND_DELTA[c.mind] });
  const t = num(c.tension);
  if (t != null && TENSION_DELTA[t] != null) out.push({ key: 'tension', label: `Body tension ${t} of 5`, delta: TENSION_DELTA[t] });
  const m = num(c.mood);
  if (m != null) out.push({ key: 'mood', label: `Mood ${m}/10`, delta: clamp(Math.round((m - 6) * 2), -10, 6) });
  return out;
}

const sumDeltas = (factors) => factors.reduce((s, f) => s + f.delta, 0);

// capacity(data, now) -> { score, zone, factors, confidence, basis }
export function capacity(data, now) {
  const checkins = list(data?.checkins);
  const states = list(data?.body?.states).filter((s) => num(s?.ts) != null && s.ts <= now);
  const nights = list(data?.kid?.nights).filter((n) => num(n?.ts) != null && n.ts <= now);
  const coffees = list(data?.meds?.caffeine).filter((x) => num(x?.ts) != null && x.ts <= now && x.ts >= startOfDay(now));
  const need = sleepNeed(data);
  const kid = String(data?.profile?.kidName || '').trim() || 'your kid';

  const factors = [];
  const basis = { need, source: 'none', checkinId: null, checkinTs: null, sleepHours: null, debt: sleepDebt(checkins, need, now, 2), recentDays: 0, overloadTs: null, calmTs: null, kidNight: null, caffeine: 0 };
  let confidence = 'none';

  const morning = morningFor(checkins, now);
  if (morning) {
    factors.push(...morningFactors(morning, checkins, need, now));
    basis.source = 'checkin';
    basis.checkinId = morning.id ?? null;
    basis.checkinTs = morning.ts;
    basis.sleepHours = num(morning.sleepHours);
    confidence = morning.ts >= startOfDay(now) && basis.sleepHours != null ? 'ok' : 'low';
  } else {
    // No check-in: average the morning part of up to 3 previous days.
    const since = addDays(startOfDay(now), -3);
    const perDay = new Map();
    for (const c of checkins) {
      if (!isMorning(c) || c.ts < since || c.ts > now) continue;
      const k = dayKey(c.ts);
      if (!perDay.has(k) || perDay.get(k).ts < c.ts) perDay.set(k, c);
    }
    const parts = [...perDay.values()].map((c) => clamp(BASE + sumDeltas(morningFactors(c, checkins, need, c.ts)), 0, 100));
    if (parts.length) {
      const avg = Math.round(parts.reduce((s, p) => s + p, 0) / parts.length);
      basis.source = 'recent';
      basis.recentDays = parts.length;
      factors.push({ key: 'recent', label: parts.length === 1 ? `No check-in yet. Your last morning scored ${avg}` : `No check-in yet. Your last ${parts.length} mornings averaged ${avg}`, delta: avg - BASE });
    }
  }

  // Overload: the most recent one counts.
  const over = latest(states, (s) => s.kind === 'overload');
  if (over) {
    const age = now - over.ts;
    if (age <= DAY) { factors.push({ key: 'overload', label: `Overload ${ago(age)}`, delta: -20 }); basis.overloadTs = over.ts; }
    else if (age <= 2 * DAY) { factors.push({ key: 'overload', label: 'Overload in the last two days', delta: -10 }); basis.overloadTs = over.ts; }
  }
  const calm = latest(states, (s) => s.kind === 'calm');
  if (calm && now - calm.ts <= 12 * HOUR && (!over || calm.ts > over.ts)) {
    factors.push({ key: 'calm', label: 'Logged a calm moment', delta: 3 });
    basis.calmTs = calm.ts;
  }

  const night = latest(nights);
  if (night && now - night.ts <= DAY) {
    basis.kidNight = night.quality ?? null;
    if (night.quality === 'bad') factors.push({ key: 'kidNight', label: `Rough night with ${kid}`, delta: -6 });
  }

  // A check-in from yesterday (the 18-hour case) says nothing about today's coffee.
  const fromCheckin = morning && morning.ts >= startOfDay(now) ? num(morning.caffeine) ?? 0 : 0;
  const cups = Math.max(fromCheckin, coffees.length);
  basis.caffeine = cups;
  if (cups >= 4) factors.push({ key: 'caffeine', label: `Caffeine: ${cups} so far today`, delta: -4 });

  // Recovery cap, shown as its own factor so the "why" list still adds up.
  const pre = BASE + sumDeltas(factors);
  if (over && now - over.ts <= 12 * HOUR && pre > RECOVERY_CAP) {
    factors.push({ key: 'recovery', label: `Still coming down: held at ${RECOVERY_CAP} for 12 hours`, delta: RECOVERY_CAP - pre });
  }

  const shown = factors.filter((f) => f.delta !== 0 || f.key === 'recent');
  const score = Math.round(clamp(BASE + sumDeltas(factors), 0, 100));
  return { score, zone: zoneOf(score), factors: shown, confidence, basis };
}

// One score per calendar day, oldest first. A day without a morning check-in
// is null. Past days are read at the end of the day; today is read at `now`.
export function dailyScores(data, now, days = 7) {
  const checkins = list(data?.checkins);
  const today = startOfDay(now);
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const start = addDays(today, -i);
    const at = i === 0 ? now : addDays(start, 1) - 1;
    const has = checkins.some((c) => isMorning(c) && c.ts >= start && c.ts <= at);
    const score = has ? capacity(data, at).score : null;
    out.push({ date: dayKey(start), score, zone: score == null ? null : zoneOf(score) });
  }
  return out;
}

const RANK = { none: 0, watch: 1, warning: 2, recovery: 3 };
// Which rule names the card when several match (reasons are listed in this order too).
const PRIORITY = ['overload', 'sliding', 'narrow', 'slidingBefore', 'debt', 'afterOverload'];

const TITLES = {
  overload: ['Coming down from an overload', 'Go gently. Your body is still settling.'],
  sliding: ['You’re heading toward overload', 'Two days sliding. Ease off now, before it tips.'],
  narrow: ['Your window is very narrow today', 'Protect yourself today. Small and gentle is the plan.'],
  slidingBefore: ['The last two days were sliding', 'Check in to see where today is.'],
  debt: ['Running low on sleep', 'Short sleep tends to narrow the window. Tonight matters.'],
  afterOverload: ['Still settling after an overload', 'Bodies can take a day or two to come back.'],
};

const ACTION_ORDER = {
  recovery: ['expect', 'messages', 'protein', 'sleep', 'notes', 'projects'],
  warning: ['projects', 'sleep', 'messages', 'protein', 'expect', 'notes'],
  watch: ['sleep', 'projects', 'protein', 'notes'],
  none: [],
};

function actionText(key, kid) {
  return {
    sleep: `Protect sleep tonight. Lights out early, or when ${kid} goes down.`,
    projects: 'Pause big projects today, including building apps. They’ll keep.',
    messages: 'Hard messages can wait. You don’t have to answer today.',
    protein: 'Eat something with protein, even something small.',
    expect: 'Lower the bar. Today only needs the basics.',
    notes: 'Read your notes from calm me.',
  }[key];
}

// warning(data, now) -> { level, title, lead, reasons, actions:[{ key, text }] }
// Rules (the highest level wins; every matching reason is listed):
//   recovery  an overload logged in the last 12 hours
//   warning   two days sliding: today < 55, and today < yesterday < the day before
//   warning   today's score is under 40
//   watch     no check-in today, and the two days before were sliding the same way
//   watch     2-night sleep debt of 3 hours or more
//   watch     an overload 12–36 hours ago
export function warning(data, now) {
  const cap = capacity(data, now);
  const [d3, d2, d1, d0] = dailyScores(data, now, 4).map((d) => d.score);
  const states = list(data?.body?.states).filter((s) => num(s?.ts) != null && s.ts <= now);
  const kid = String(data?.profile?.kidName || '').trim() || 'your kid';
  const hits = [];

  const over = latest(states, (s) => s.kind === 'overload');
  if (over) {
    const age = now - over.ts;
    if (age <= 12 * HOUR) hits.push({ level: 'recovery', key: 'overload', reason: `You logged an overload ${ago(age)}.` });
    else if (age <= 36 * HOUR) hits.push({ level: 'watch', key: 'afterOverload', reason: `You were overloaded ${dayWord(over.ts, now)}. It can take a day or two to settle.` });
  }
  if (d0 != null && d1 != null && d2 != null && d0 < 55 && d0 < d1 && d1 < d2) {
    hits.push({ level: 'warning', key: 'sliding', reason: `Two days sliding: ${d2} → ${d1} → ${d0}.` });
  } else if (d0 == null && d1 != null && d2 != null && d3 != null && d1 < 55 && d1 < d2 && d2 < d3) {
    hits.push({ level: 'watch', key: 'slidingBefore', reason: `The last two days slid: ${d3} → ${d2} → ${d1}.` });
  }
  if (cap.score < ZONE_EDGE) {
    hits.push({ level: 'warning', key: 'narrow', reason: cap.confidence === 'none' ? `Today’s estimate is ${cap.score} out of 100.` : `Today’s window is ${cap.score} out of 100.` });
  }
  const debt = sleepDebt(data?.checkins, sleepNeed(data), now, 2);
  if (debt >= 3) hits.push({ level: 'watch', key: 'debt', reason: `About ${fmtHours(debt)} short on sleep over the last two nights.` });

  if (!hits.length) return { level: 'none', title: '', lead: '', reasons: [], actions: [] };
  hits.sort((a, b) => PRIORITY.indexOf(a.key) - PRIORITY.indexOf(b.key));
  const level = hits.reduce((lv, x) => (RANK[x.level] > RANK[lv] ? x.level : lv), 'none');
  const top = hits.find((x) => x.level === level);
  const [title, lead] = TITLES[top.key];
  return {
    level,
    title,
    lead,
    reasons: hits.map((x) => x.reason),
    actions: ACTION_ORDER[level].map((key) => ({ key, text: actionText(key, kid) })),
  };
}

// ---------- example data ----------
function rng(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// About 10 days of morning check-ins. The first week is steady; the last three
// days slide (less sleep, a heavier mind) so the example shows an early warning.
// Today's is included only once it's past 7am. Nothing is in the future.
export function sampleMorning(now) {
  const rand = rng(31);
  const today = startOfDay(now);
  // [days ago, sleep h, quality, mind, tension, mood, ate, caffeine, note]
  const plan = [
    [9, 7.5, 4, 'positive', 2, 7, true, 1, 'Slept right through. Felt like myself.'],
    [8, 7, 3, 'mixed', 2, 6, true, 2, ''],
    [7, 8, 4, 'positive', 2, 7, true, 1, 'Easy morning.'],
    [6, 7, 3, 'mixed', 3, 6, false, 2, 'Lots of small things to sort out.'],
    [5, 7.5, 4, 'positive', 2, 8, true, 1, 'Good day yesterday. Still riding it.'],
    [4, 8, 3, 'positive', 2, 7, true, 1, ''],
    [3, 7.5, 3, 'mixed', 2, 7, true, 2, ''],
    [2, 7, 3, 'mixed', 2, 6, true, 2, 'Stayed up too late again.'],
    [1, 6.5, 2, 'mixed', 2, 3, false, 3, 'Woke at 2am and lay there thinking.'],
    [0, 6, 3, 'negative', 4, 5, false, 2, 'Keep replaying a message from yesterday.'],
  ];
  const out = [];
  for (const [daysAgo, sleepHours, sleepQuality, mind, tension, mood, ate, caffeine, note] of plan) {
    const day = addDays(today, -daysAgo);
    let ts = clock(day, 6, 40 + Math.floor(rand() * 100)); // 6:40–8:20am
    if (daysAgo === 0) {
      if (now < clock(day, 7, 0)) continue;
      ts = Math.min(ts, now - 10 * 60000);
    }
    if (ts > now) continue;
    out.push({ id: `ex-m${daysAgo}`, ts, kind: 'morning', mood, note, tags: [], worryId: null, sleepHours, sleepQuality, mind, tension, ate, caffeine });
  }
  return out;
}
