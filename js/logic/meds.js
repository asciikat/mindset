// Meds room logic: dose timing, the hourly check-in schedule, day curves,
// patterns across days, a calendar file and a plain-text summary for the prescriber.
//
// Pure functions: no DOM, no storage, no clock. Anything that needs the time
// takes `now`. Covered by tests/meds.test.js.
//
// Check-in slots are anchored to the dose: with a 60-minute interval the slots
// are 1h, 2h, 3h… after the dose, up to settings.hours. A check-in counts for a
// slot when it lands within half an interval either side of it, so checking in
// a little early or late still fills the slot.

import { HOUR, average, sortByTs } from '../logic.js';

const MIN = 60000;
export const CHART_HOURS = 14; // x axis of the day chart: 0–14h after the dose
export const SCALES = ['focus', 'mood', 'anxiety', 'appetite', 'energy'];
export const FOOD_AMOUNTS = ['none', 'small', 'normal', 'big'];
export const FOOD_LABELS = { none: 'None', small: 'Small', normal: 'Normal', big: 'Big' };
export const CAFFEINE_KINDS = ['coffee', 'tea', 'energy drink', 'cola'];
export const INTERVALS = [30, 60, 90];
export const TRACK_HOURS = [8, 10, 12, 14];

export function starterMeds() {
  return { settings: { name: 'Vyvanse', mg: null, everyMin: 60, hours: 12 } };
}

// ---------- small helpers ----------
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const round1 = (v) => Math.round(v * 10) / 10;

function localStart(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function localKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// 7:40am (local time). The same everywhere in the room, whatever the browser locale.
export function fmtClock(ts) {
  const d = new Date(ts);
  const h = d.getHours();
  return `${h % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')}${h < 12 ? 'am' : 'pm'}`;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// Sat 3 Oct
export function fmtDay(ts) {
  const d = new Date(ts);
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

// 3.25 -> "3h 15m", 0.5 -> "30m", 2 -> "2h"
export function fmtHours(hours) {
  const m = Math.max(0, Math.round(hours * 60));
  const hh = Math.floor(m / 60);
  const mm = m % 60;
  if (!hh) return `${mm}m`;
  return mm ? `${hh}h ${mm}m` : `${hh}h`;
}

// Rounded to the nearest half hour, for "around 3h" style summaries.
export function fmtAbout(hours) {
  return fmtHours(Math.round(hours * 2) / 2);
}

// Settings with every field present and in range.
export function cleanSettings(s = {}) {
  const base = starterMeds().settings;
  const name = typeof s?.name === 'string' && s.name.trim() ? s.name.trim().slice(0, 40) : base.name;
  const mg = num(s?.mg) != null && s.mg > 0 ? s.mg : null;
  const everyMin = INTERVALS.includes(s?.everyMin) ? s.everyMin : base.everyMin;
  const hours = num(s?.hours) != null ? clamp(Math.round(s.hours), 4, CHART_HOURS) : base.hours;
  return { name, mg, everyMin, hours };
}

export function doseLabel(dose) {
  const mg = num(dose?.mg);
  return `${dose?.name || 'Medication'}${mg ? ` ${mg}mg` : ''}`;
}

// ---------- today's dose & schedule ----------

// The most recent dose taken today (local day) and not in the future, or null.
export function doseToday(doses, now) {
  const start = localStart(now);
  let best = null;
  for (const d of doses || []) {
    if (!d || num(d.ts) == null || d.ts < start || d.ts > now) continue;
    if (!best || d.ts > best.ts) best = d;
  }
  return best;
}

export function hoursSince(dose, ts) {
  return (ts - dose.ts) / HOUR;
}

export function checksFor(dose, checks) {
  if (!dose) return [];
  return sortByTs((checks || []).filter((c) => c && c.doseId === dose.id && num(c.ts) != null));
}

// Every check-in slot for a dose with its status:
// 'done' (a check-in landed in its window), 'missed' (window passed),
// 'due' (its time has come, window still open) or 'upcoming'.
export function schedule(dose, checks, now, settings) {
  if (!dose) return [];
  const s = cleanSettings(settings);
  const step = s.everyMin * MIN;
  const n = Math.floor((s.hours * HOUR) / step + 1e-9);
  const mine = checksFor(dose, checks);
  const slots = [];
  for (let k = 1; k <= n; k++) {
    const ts = dose.ts + k * step;
    const lo = ts - step / 2;
    const hi = ts + step / 2;
    const check = mine.find((c) => c.ts >= lo && c.ts < hi) || null;
    let status = 'upcoming';
    if (check) status = 'done';
    else if (now >= hi) status = 'missed';
    else if (now >= ts) status = 'due';
    slots.push({ k, ts, h: (k * step) / HOUR, status, checkId: check ? check.id : null });
  }
  return slots;
}

// The next check-in to do: { dueTs, hour, overdue } (overdue = its time has passed),
// or null once the tracking window (settings.hours) is over.
export function nextDue(dose, checks, now, settings) {
  const slot = schedule(dose, checks, now, settings).find((x) => x.status === 'due' || x.status === 'upcoming');
  if (!slot) return null;
  return { dueTs: slot.ts, hour: slot.h, overdue: slot.status === 'due', k: slot.k };
}

// ---------- curves ----------

// One point per check-in: hours since the dose and each 1–5 score (null if skipped).
export function dayCurve(dose, checks) {
  return checksFor(dose, checks)
    .map((c) => ({
      id: c.id,
      ts: c.ts,
      h: hoursSince(dose, c.ts),
      focus: num(c.focus),
      mood: num(c.mood),
      anxiety: num(c.anxiety),
      appetite: num(c.appetite),
      energy: num(c.energy),
      ate: Boolean(c.ate),
      ateWhat: typeof c.ateWhat === 'string' ? c.ateWhat : '',
      note: typeof c.note === 'string' ? c.note : '',
    }))
    .filter((p) => p.h >= 0);
}

// Caffeine logged on the same calendar day as the dose.
export function caffeineFor(dose, caffeine) {
  if (!dose) return [];
  const key = localKey(dose.ts);
  return sortByTs((caffeine || []).filter((c) => c && num(c.ts) != null && localKey(c.ts) === key));
}

// Caffeine grouped for display: drinks of the same kind logged in the same
// minute become one entry with a count. [{ ts, what, n }] in time order.
export function caffeineGroups(items) {
  const out = [];
  for (const c of sortByTs((items || []).filter((x) => x && num(x.ts) != null))) {
    const what = c.what || 'caffeine';
    const prev = out[out.length - 1];
    if (prev && prev.what === what && Math.floor(prev.ts / MIN) === Math.floor(c.ts / MIN)) prev.n += 1;
    else out.push({ ts: c.ts, what, n: 1 });
  }
  return out;
}

// Caffeine and food marks for a chart or the timeline: one lane per kind, each
// mark at its real time. Marks that would overlap (closer than `gap`, in the
// units `pos` returns) merge into the first one with a count; a merged mark keeps
// a wider berth (`countGap`) so its count has room.
// events: [{ kind: 'cup'|'plate', h, label }] -> [{ kind, h, p, n, labels }]
export function groupEvents(events, pos = (x) => x, gap = 0, countGap = gap * 1.8) {
  const out = [];
  for (const kind of ['cup', 'plate']) {
    let g = null;
    const list = (events || []).filter((e) => e && e.kind === kind && num(e.h) != null).sort((a, b) => a.h - b.h);
    for (const ev of list) {
      const p = pos(ev.h);
      if (g && p - g.p < (g.n > 1 ? countGap : gap)) {
        g.n += 1;
        g.labels.push(ev.label);
      } else {
        g = { kind, h: ev.h, p, n: 1, labels: [ev.label] };
        out.push(g);
      }
    }
  }
  return out;
}

const vals = (pts, key) => pts.map((p) => p[key]).filter((v) => v != null);

function peakOf(pts, key) {
  let best = null;
  for (const p of pts) if (p[key] != null && (!best || p[key] > best[key])) best = p;
  return best ? { value: best[key], h: best.h } : null;
}

// Summary numbers for one day.
export function dayStats(dose, checks) {
  const pts = dayCurve(dose, checks);
  const core = pts.filter((p) => p.h >= 2 && p.h <= 8);
  const high = pts.filter((p) => p.focus != null && p.focus >= 4);
  return {
    count: pts.length,
    avgFocus: average(vals(pts, 'focus')),
    coreFocus: average(vals(core, 'focus')),
    avgMood: average(vals(pts, 'mood')),
    avgAnxiety: average(vals(pts, 'anxiety')),
    peakFocus: peakOf(pts, 'focus'),
    peakAnxiety: peakOf(pts, 'anxiety'),
    // First and last check-in where focus was 4 or 5.
    focusWindow: high.length ? { from: high[0].h, to: high[high.length - 1].h } : null,
    notes: pts.filter((p) => p.note).map((p) => ({ h: p.h, ts: p.ts, note: p.note })),
  };
}

// One plain sentence describing a day's curve (used as the chart's text alternative).
export function curveSentence(points) {
  if (!points.length) return 'No check-ins yet.';
  const parts = [];
  for (const [key, label] of [['focus', 'Focus'], ['mood', 'Mood'], ['anxiety', 'Anxiety']]) {
    const pk = peakOf(points, key);
    if (!pk) continue;
    const last = [...points].reverse().find((p) => p[key] != null);
    parts.push(`${label} peaked at ${pk.value} of 5 around ${fmtAbout(pk.h)}, latest ${last[key]}`);
  }
  return `${points.length} check-in${points.length === 1 ? '' : 's'}. ${parts.join('. ')}.`;
}

// Average of each score in 2-hour bands since the dose (last band is 10h+).
export const BANDS = [[0, 2], [2, 4], [4, 6], [6, 8], [8, 10], [10, Infinity]];
export function bandAverages(doses, checks) {
  const all = (doses || []).flatMap((d) => dayCurve(d, checks));
  return BANDS.map(([lo, hi]) => {
    const pts = all.filter((p) => p.h >= lo && p.h < hi);
    const row = { lo, hi, n: pts.length };
    for (const k of SCALES) row[k] = average(vals(pts, k));
    return row;
  });
}

// ---------- patterns ----------

// Compares days that differ in one way. Only reported when each group has at
// least `min` days, and always with the sample sizes.
export function patterns(doses, checks, caffeine, { min = 2 } = {}) {
  const days = (doses || []).filter((d) => d && num(d.ts) != null).map((d) => {
    const pts = dayCurve(d, checks);
    return {
      dose: d,
      focus: average(vals(pts.filter((p) => p.h >= 2 && p.h <= 8), 'focus')),
      anxiety: average(vals(pts, 'anxiety')),
      cups: caffeineFor(d, caffeine).length,
    };
  });

  const out = [];
  const TITLES = { food: 'Eating with your dose', protein: 'Protein with your dose', sleep: 'Sleep the night before', caffeine: 'Caffeine' };
  const compare = (key, metric, a, b) => {
    const ga = days.filter((x) => x[metric] != null && a.test(x));
    const gb = days.filter((x) => x[metric] != null && b.test(x));
    if (ga.length < min || gb.length < min) return;
    const avgA = average(ga.map((x) => x[metric]));
    const avgB = average(gb.map((x) => x[metric]));
    out.push({
      key,
      metric,
      title: TITLES[key],
      measure: metric === 'focus' ? 'Average focus, 2–8h after the dose' : 'Average anxiety or jitters, whole day',
      a: { label: a.label, n: ga.length, avg: avgA },
      b: { label: b.label, n: gb.length, avg: avgB },
      diff: avgA - avgB,
      days: ga.length + gb.length,
    });
  };

  const ate = (x) => FOOD_AMOUNTS.includes(x.dose.foodAmount) && x.dose.foodAmount !== 'none';
  compare('food', 'focus',
    { label: 'Ate with the dose', test: ate },
    { label: 'Nothing to eat', test: (x) => x.dose.foodAmount === 'none' });
  compare('protein', 'focus',
    { label: 'Had protein', test: (x) => x.dose.protein === true },
    { label: 'No protein', test: (x) => x.dose.protein !== true });
  compare('sleep', 'focus',
    { label: 'Slept 7h or more', test: (x) => num(x.dose.sleepHours) != null && x.dose.sleepHours >= 7 },
    { label: 'Slept under 6h', test: (x) => num(x.dose.sleepHours) != null && x.dose.sleepHours < 6 });
  compare('caffeine', 'anxiety',
    { label: '3 or more caffeine drinks', test: (x) => x.cups >= 3 },
    { label: 'Fewer than 3', test: (x) => x.cups < 3 });
  return out;
}

// ---------- calendar file ----------

function icsTime(ts) {
  return new Date(ts).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function icsText(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

// RFC 5545: lines longer than 75 octets are folded with CRLF + a space.
function fold(line) {
  const out = [];
  let cur = '';
  let bytes = 0;
  for (const ch of line) {
    const cp = ch.codePointAt(0);
    const b = cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
    if (bytes + b > (out.length ? 74 : 75)) {
      out.push(cur);
      cur = '';
      bytes = 0;
    }
    cur += ch;
    bytes += b;
  }
  out.push(cur);
  return out.join('\r\n ');
}

// An iCalendar file with one 5-minute event (and alarm) per check-in slot.
// `from` keeps only slots after that time; `stamp` is the DTSTAMP (defaults to the dose time).
export function buildIcs(dose, settings, { from = -Infinity, stamp = null } = {}) {
  const s = cleanSettings(settings);
  const step = s.everyMin * MIN;
  const n = Math.floor((s.hours * HOUR) / step + 1e-9);
  const name = dose.name || s.name;
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Mindset//Meds check-ins//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];
  for (let k = 1; k <= n; k++) {
    const ts = dose.ts + k * step;
    if (ts <= from) continue;
    const label = fmtHours((k * step) / HOUR);
    lines.push(
      'BEGIN:VEVENT',
      `UID:${icsText(`${dose.id}-${k}`)}@mindset.local`,
      `DTSTAMP:${icsTime(stamp ?? dose.ts)}`,
      `DTSTART:${icsTime(ts)}`,
      `DTEND:${icsTime(ts + 5 * MIN)}`,
      `SUMMARY:${icsText(`Check-in: ${label} after ${name}`)}`,
      `DESCRIPTION:${icsText(`Focus, mood, anxiety, appetite, energy. Anything eaten? Any caffeine? Log it in Mindset. (Taken at ${fmtClock(dose.ts)}.)`)}`,
      'TRANSP:TRANSPARENT',
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${icsText(`Mindset check-in (${label})`)}`,
      'TRIGGER:PT0S',
      'END:VALARM',
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return `${lines.map(fold).join('\r\n')}\r\n`;
}

// ---------- summary for the prescriber ----------

const f1 = (v) => (v == null ? '–' : round1(v).toFixed(1));
const pad = (s, n) => String(s).padEnd(n);

function foodLine(d) {
  const amount = FOOD_AMOUNTS.includes(d.foodAmount) ? d.foodAmount : 'none';
  if (amount === 'none') return d.foodWhat ? `${d.foodWhat} (nothing much)` : 'nothing';
  return `${d.foodWhat || 'something'} (${amount}${d.protein ? ', with protein' : ''})`;
}

// Plain text to paste into an email or show at an appointment.
export function summaryText(doses, checks, caffeine, settings, now, { days = 14 } = {}) {
  const s = cleanSettings(settings);
  const sinceDay = new Date(localStart(now));
  sinceDay.setDate(sinceDay.getDate() - (days - 1)); // calendar days, so a daylight-saving change doesn't shift the window
  const since = sinceDay.getTime();
  const list = sortByTs((doses || []).filter((d) => d && num(d.ts) != null && d.ts >= since && d.ts <= now));
  const out = [];
  out.push(`Medication log: ${s.name}${s.mg ? ` ${s.mg}mg` : ''}`);
  out.push('Self-tracked in Mindset. Scores are my own ratings from 1 (low) to 5 (high).');
  if (!list.length) {
    out.push('', `No doses logged in the last ${days} days.`);
    return out.join('\n');
  }
  out.push(`Period: ${fmtDay(list[0].ts)} to ${fmtDay(list[list.length - 1].ts)} (${list.length} day${list.length === 1 ? '' : 's'} with a dose logged)`);

  const minutes = list.map((d) => { const t = new Date(d.ts); return t.getHours() * 60 + t.getMinutes(); });
  const clock = (m) => fmtClock(new Date(2000, 0, 1, Math.floor(m / 60), m % 60).getTime());
  const mid = [...minutes].sort((a, b) => a - b)[Math.floor(minutes.length / 2)];
  out.push(`Dose time: usually around ${clock(mid)} (earliest ${clock(Math.min(...minutes))}, latest ${clock(Math.max(...minutes))}).`);
  const allChecks = list.flatMap((d) => checksFor(d, checks));
  out.push(`Check-ins: ${allChecks.length} in total, about ${Math.round(allChecks.length / list.length)} a day.`);

  if (allChecks.length) {
    out.push('', 'Average by hours after the dose', `${pad('Hours', 8)}${pad('Focus', 7)}${pad('Mood', 6)}${pad('Anxiety', 9)}${pad('Appetite', 10)}Energy`);
    for (const row of bandAverages(list, checks)) {
      if (!row.n) continue;
      const label = row.hi === Infinity ? `${row.lo}h+` : `${row.lo}-${row.hi}h`;
      out.push(`${pad(label, 8)}${pad(f1(row.focus), 7)}${pad(f1(row.mood), 6)}${pad(f1(row.anxiety), 9)}${pad(f1(row.appetite), 10)}${f1(row.energy)}`);
    }
    const windows = list.map((d) => dayStats(d, checks).focusWindow).filter(Boolean);
    if (windows.length >= 2) {
      const med = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
      out.push(`Focus at 4 or 5: typically from about ${fmtAbout(med(windows.map((w) => w.from)))} to ${fmtAbout(med(windows.map((w) => w.to)))} after the dose (${windows.length} days).`);
    }
  }

  out.push('', 'Day by day');
  for (const d of [...list].reverse()) {
    const st = dayStats(d, checks);
    const cups = caffeineFor(d, caffeine).length;
    const bits = [
      `${fmtDay(d.ts)}: ${fmtClock(d.ts)}${num(d.mg) ? ` ${d.mg}mg` : ''}`,
      `slept ${num(d.sleepHours) != null ? `${d.sleepHours}h` : '?'}`,
      `ate ${foodLine(d)}`,
      `caffeine ${cups}`,
    ];
    if (st.count) {
      bits.push(`focus avg ${f1(st.avgFocus)}${st.peakFocus ? ` (peak ${st.peakFocus.value} around ${fmtAbout(st.peakFocus.h)})` : ''}`);
      bits.push(`anxiety avg ${f1(st.avgAnxiety)}`);
    } else {
      bits.push('no check-ins');
    }
    out.push(`- ${bits.join(' · ')}`);
    if (d.note) out.push(`    Note at dose: ${d.note}`);
    for (const n of st.notes) out.push(`    ${fmtClock(n.ts)} (${fmtAbout(n.h)} in): ${n.note}`);
  }

  const pats = patterns(list, checks, caffeine);
  if (pats.length) {
    out.push('', 'Things I noticed (small sample, not conclusions)');
    for (const p of pats) {
      out.push(`- ${p.title}. ${p.measure}: ${f1(p.a.avg)} on "${p.a.label.toLowerCase()}" days (${p.a.n}) vs ${f1(p.b.avg)} on "${p.b.label.toLowerCase()}" days (${p.b.n}).`);
    }
  }
  out.push('', 'Questions I want to ask:', '- ', '', 'This is a personal log, not a clinical record.');
  return out.join('\n');
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

const sig = (x) => 1 / (1 + Math.exp(-x));

// Six past days of doses (taken 7–9am) plus today's once it's past 9am, each with
// hourly check-ins and caffeine. Sleep matches the example morning check-ins.
// The curves are invented but shaped like a long-acting stimulant day: focus rises
// 1–2h after the dose, plateaus, and fades 10–12h in; appetite dips mid-day;
// anxiety runs a bit higher on days with more caffeine or nothing to eat.
export function sampleMeds(now) {
  const rand = rng(53);
  const today = localStart(now);
  const pastNine = now >= new Date(today).setHours(9, 0, 0, 0);
  // [days ago, dose h, dose m, sleep, food, amount, protein, caffeine drinks, dose note, nudge]
  // nudge shifts a day's focus and anxiety a little so each example day has its own shape.
  const plan = [
    [6, 7, 50, 7, '', 'none', false, ['coffee', 'coffee', 'coffee'], ''],
    [5, 7, 25, 7.5, 'Eggs on toast', 'normal', true, ['coffee'], ''],
    [4, 8, 10, 8, 'Oats with yoghurt and peanut butter', 'big', true, ['coffee'], 'Slept well. Felt ready.'],
    [3, 7, 40, 7.5, 'Toast and jam', 'small', false, ['coffee', 'tea'], ''],
    [2, 8, 35, 7, 'Greek yoghurt and a banana', 'normal', true, ['coffee', 'tea'], ''],
    [1, 7, 5, 6.5, '', 'none', false, ['coffee', 'coffee', 'energy drink', 'cola'], 'Rushed out the door. Forgot breakfast.'],
    [0, 7, 40, 6, '', 'none', false, ['coffee', 'coffee'], 'Not hungry yet.', { focus: 0.75, anxiety: 0.45 }],
  ];
  const notes = {
    6: { 5: 'Third coffee. A bit buzzy.' },
    5: { 3: 'Cleared my inbox in one go.' },
    4: { 4: 'Calm and on it.', 11: 'Still okay. Gentle landing.' },
    3: { 10: 'Getting snappy. Wearing off?' },
    2: { 5: 'Barely ate lunch. Not hungry.' },
    1: { 5: 'Jittery after the energy drink.', 9: 'Crashed hard this afternoon.' },
    0: { 2: 'Slow to kick in today.' },
  };
  const meals = ['Half a sandwich', 'A few bites of leftover pasta', 'Muesli bar', 'Rice and chicken'];
  // Caffeine timing, hours after the dose: one before, then through the day.
  const cupAt = [-0.4, 2.4, 4.8, 6.3];

  const doses = [];
  const checks = [];
  const caffeine = [];
  for (const [daysAgo, hh, mm, sleep, food, amount, protein, cups, doseNote, nudge = {}] of plan) {
    if (daysAgo === 0 && !pastNine) continue;
    const day = new Date(today);
    day.setDate(day.getDate() - daysAgo);
    const ts = day.setHours(hh, mm, 0, 0);
    if (ts > now) continue;
    const id = `ex-dose${daysAgo}`;
    doses.push({ id, ts, name: 'Vyvanse', mg: null, foodWhat: food, foodAmount: amount, protein, sleepHours: sleep, note: doseNote });

    cups.forEach((what, i) => {
      const cts = ts + cupAt[i] * HOUR + Math.floor(rand() * 20) * MIN;
      if (cts <= now) caffeine.push({ id: `ex-cf${daysAgo}-${i}`, ts: cts, what });
    });

    const none = amount === 'none';
    const onset = 1.2 + (amount === 'big' ? 0.5 : amount === 'normal' ? 0.3 : 0) + rand() * 0.3;
    const fade = 10.2 + rand() * 1.4;
    const amp = 2.2 + (protein ? 0.35 : 0) + (sleep - 7) * 0.45 - (none ? 0.55 : 0) + (rand() - 0.5) * 0.3;
    const lunchK = Math.max(3, Math.round((13 * 60 - (hh * 60 + mm)) / 60));
    const dinnerK = Math.round((18.5 * 60 - (hh * 60 + mm)) / 60);

    for (let k = 1; k <= 12; k++) {
      if (daysAgo === 3 && k === 6) continue; // a missed one
      if (daysAgo === 5 && k > 10) continue; // stopped logging in the evening
      if (k > 3 && rand() < 0.05) continue;
      const cts = ts + k * HOUR + Math.floor(rand() * 18 - 5) * MIN;
      if (cts > now) break;
      const h = (cts - ts) / HOUR;
      const on = sig((h - onset) / 0.45) * (1 - sig((h - fade) / 0.9));
      const crash = sig((h - (fade - 1)) / 0.6) * sig((fade + 2.5 - h) / 0.6);
      const cupsBy = cups.filter((_, i) => cupAt[i] <= h).length;
      const jitter = (rand() - 0.5) * 0.7;
      const score = (v) => clamp(Math.round(v + jitter * 0.6 + (rand() - 0.5) * 0.5), 1, 5);
      const ate = k === lunchK || k === dinnerK;
      checks.push({
        id: `ex-chk${daysAgo}-${k}`,
        ts: cts,
        doseId: id,
        focus: score(1.9 + (amp + (nudge.focus || 0)) * on),
        mood: score(3 + 0.6 * on - 0.9 * crash + (sleep - 7) * 0.35 - (none ? 0.3 : 0)),
        anxiety: score(1.3 + (0.55 + (nudge.anxiety || 0)) * on + 0.35 * Math.max(0, cupsBy - 1) + (none ? 0.55 : 0) + (sleep < 6.6 ? 0.3 : 0)),
        appetite: score(3.4 - 2.3 * on + (h > fade ? 0.6 : 0)),
        energy: score(2.1 + 1.7 * on - 0.8 * crash + (sleep - 7) * 0.4),
        ate,
        ateWhat: ate ? (k === dinnerK ? 'Dinner' : meals[Math.floor(rand() * meals.length)]) : '',
        note: notes[daysAgo]?.[k] || '',
      });
    }
  }
  return { doses, checks, caffeine };
}
