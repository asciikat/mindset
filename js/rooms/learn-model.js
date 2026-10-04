// Learn room: the pure maths behind the diagrams. No DOM, no clock — every
// function takes the time it needs. These are illustrations, not measurements:
// the numbers show direction (narrower, wider, faster, slower), not real sizes.

// ---------- 1. window of tolerance simulation ----------
// Arousal runs from -1 (deep shutdown) to +1 (full fight/flight). The window is
// the band [-w, +w]. Each factor nudges the window width (dw), how big the swings
// are (amp) and which way the line leans (bias). A trauma reminder adds a spike
// that shoots up and then drops below (fight/flight, then shutdown).

export const BASE_WIDTH = 0.4;
export const BASE_AMP = 0.36;

export const NARROW = [
  { id: 'short-sleep', label: 'Short sleep', dw: -0.09, amp: 0.1, bias: -0.02, opp: 'slept' },
  { id: 'hungry', label: 'Hungry', dw: -0.05, amp: 0.05, bias: 0.02, opp: 'ate' },
  { id: 'conflict', label: 'Conflict or hard messages', dw: -0.07, amp: 0.08, bias: 0.08 },
  { id: 'reminder', label: 'A trauma reminder', dw: -0.08, amp: 0.06, spike: 0.62 },
  { id: 'decisions', label: 'Too many decisions', dw: -0.05, amp: 0.05, bias: -0.05 },
];

export const WIDEN = [
  { id: 'slept', label: 'Slept', dw: 0.06, amp: -0.04, opp: 'short-sleep' },
  { id: 'ate', label: 'Ate', dw: 0.04, amp: -0.03, opp: 'hungry' },
  { id: 'moved', label: 'Moved', dw: 0.04, amp: -0.04 },
  { id: 'exhale', label: 'Slow-exhale breathing', dw: 0.03, amp: -0.06 },
  { id: 'connection', label: 'Connection', dw: 0.05, amp: -0.04 },
  { id: 'outside', label: 'Time outside', dw: 0.03, amp: -0.03 },
  { id: 'plan', label: 'A plan made in advance', dw: 0.05, amp: -0.03 },
];

const FACTORS = new Map([...NARROW, ...WIDEN].map((f) => [f.id, f]));

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// Turn a factor on or off; switching one on turns its opposite off
// (you can't be both short of sleep and well slept). Returns a new array.
export function toggleFactor(on, id) {
  const set = new Set(on);
  if (set.has(id)) set.delete(id);
  else {
    set.add(id);
    const opp = FACTORS.get(id)?.opp;
    if (opp) set.delete(opp);
  }
  return [...set].filter((x) => FACTORS.has(x));
}

// { width, amp, bias, spike } for the factors that are on.
export function windowParams(on = []) {
  let width = BASE_WIDTH;
  let amp = BASE_AMP;
  let bias = 0;
  let spike = 0;
  for (const id of new Set(on)) {
    const f = FACTORS.get(id);
    if (!f) continue;
    width += f.dw;
    amp += f.amp;
    bias += f.bias || 0;
    spike += f.spike || 0;
  }
  return { width: clamp(width, 0.12, 0.66), amp: clamp(amp, 0.1, 0.8), bias: clamp(bias, -0.2, 0.2), spike };
}

// Word for the window size, for labels.
export function windowWord(width) {
  if (width < 0.24) return 'very narrow';
  if (width < 0.36) return 'narrower';
  if (width <= 0.46) return 'average';
  return 'wider';
}

// The arousal line: a smooth, repeatable wander (sum of slow waves).
const SPIKE_EVERY = 11;
export function wander(t) {
  return (Math.sin(0.83 * t) * 0.56 + Math.sin(2.11 * t + 1.3) * 0.3 + Math.sin(4.7 * t + 0.4) * 0.14);
}
function spikeAt(t) {
  const p = ((t % SPIKE_EVERY) + SPIKE_EVERY) % SPIKE_EVERY;
  const up = Math.exp(-((p - 5) ** 2) / (2 * 0.32 ** 2));
  const down = Math.exp(-((p - 6.4) ** 2) / (2 * 0.55 ** 2));
  return up - 0.62 * down;
}

export function arousal(t, p) {
  const y = p.bias + p.amp * wander(t) + (p.spike ? p.spike * spikeAt(t) : 0);
  return clamp(y, -0.97, 0.97);
}

// 'hyper' above the window, 'hypo' below, 'edge' just inside either edge, else 'ok'.
export function zoneOf(y, width) {
  if (y > width) return 'hyper';
  if (y < -width) return 'hypo';
  const edge = Math.min(0.08, width * 0.3);
  if (Math.abs(y) > width - edge) return 'edge';
  return 'ok';
}

export const ZONE_TEXT = {
  ok: 'In your window',
  edge: 'Near the edge',
  hyper: 'Above: fight or flight',
  hypo: 'Below: shutdown',
};

// How often the line leaves the window between t0 and t1.
// Returns { exits, outside (0–1 share of time), hyper, hypo (shares) }.
export function exitStats(p, t0, t1, samples = 400) {
  let exits = 0;
  let out = 0;
  let hi = 0;
  let lo = 0;
  let wasOut = Math.abs(arousal(t0, p)) > p.width;
  for (let i = 0; i <= samples; i += 1) {
    const y = arousal(t0 + ((t1 - t0) * i) / samples, p);
    const isOut = Math.abs(y) > p.width;
    if (isOut && !wasOut) exits += 1;
    if (isOut) out += 1;
    if (y > p.width) hi += 1;
    if (y < -p.width) lo += 1;
    wasOut = isOut;
  }
  const n = samples + 1;
  return { exits, outside: out / n, hyper: hi / n, hypo: lo / n };
}

// The visible stretch of the line is VIEW time units wide.
export const VIEW = 14;

// Average exits per visible stretch, over a long run (stable as the line moves).
export function typicalExits(p) {
  const runs = 6;
  const s = exitStats(p, 0, VIEW * runs, 2400);
  return { perStretch: Math.round(s.exits / runs), outside: s.outside, hyper: s.hyper, hypo: s.hypo };
}

// Today's sleep from a morning check-in (kind:'morning') logged since dayStart.
// Returns { hours, preset: 'short-sleep' | 'slept' | null } or null.
export function sleepHint(checkins, dayStart, sleepNeed = 8) {
  const list = Array.isArray(checkins) ? checkins : [];
  let best = null;
  for (const c of list) {
    if (!c || c.kind !== 'morning' || typeof c.ts !== 'number' || c.ts < dayStart) continue;
    const hrs = Number(c.sleepHours);
    if (c.sleepHours == null || !Number.isFinite(hrs) || hrs < 0 || hrs > 24) continue;
    if (!best || c.ts > best.ts) best = { ts: c.ts, hours: hrs };
  }
  if (!best) return null;
  const need = Number.isFinite(Number(sleepNeed)) && sleepNeed > 0 ? Number(sleepNeed) : 8;
  let preset = null;
  if (best.hours < need - 0.75) preset = 'short-sleep';
  else if (best.hours >= need - 0.25) preset = 'slept';
  return { hours: best.hours, preset };
}

// ---------- 3. same stressor, two nervous systems ----------
// A stressor arrives at t = 1. The response rises and falls (difference of two
// exponentials). The trauma-shaped system has a narrower window, a more
// sensitive alarm (gain), a faster rise, a slower return, and a raised baseline.
// Past a point it can tip from fight/flight into shutdown.

export const SYSTEMS = {
  typical: { label: 'Typical', width: 0.45, gain: 0.075, rise: 0.55, fall: 1.3, base: 0, collapseAt: Infinity },
  trauma: { label: 'After long-term trauma', width: 0.28, gain: 0.1, rise: 0.28, fall: 3.2, base: 0.06, collapseAt: 7.5 },
};
export const T_END = 12;
const T_STRESS = 1;

function pulse(t, rise, fall) {
  if (t <= 0) return 0;
  const raw = Math.exp(-t / fall) - Math.exp(-t / rise);
  const tPeak = (rise * fall * Math.log(fall / rise)) / (fall - rise);
  const peak = Math.exp(-tPeak / fall) - Math.exp(-tPeak / rise);
  return raw / peak;
}

export function response(t, stress, sys) {
  const s = clamp(Number(stress) || 0, 0, 10);
  const dt = t - T_STRESS;
  const collapse = s >= sys.collapseAt;
  // Past the collapse point the surge burns out fast and the system drops below.
  let y = sys.base + sys.gain * s * pulse(dt, sys.rise, collapse ? 0.8 : sys.fall);
  if (collapse) y -= (0.62 + (s - sys.collapseAt) * 0.06) * pulse(dt - 0.7, 0.6, 4);
  return clamp(y, -0.97, 0.97);
}

// Summary of one system's response: time outside (in illustration units),
// whether it went up, whether it dropped into shutdown, and when it was back.
export function responseStats(stress, sys, samples = 600) {
  let outside = 0;
  let wentUp = false;
  let wentDown = false;
  let firstOut = null;
  let lastOut = null;
  let peak = -1;
  const dt = T_END / samples;
  for (let i = 0; i <= samples; i += 1) {
    const t = i * dt;
    const y = response(t, stress, sys);
    peak = Math.max(peak, y);
    if (y > sys.width) wentUp = true;
    if (y < -sys.width) wentDown = true;
    if (Math.abs(y) > sys.width) {
      outside += dt;
      if (firstOut == null) firstOut = t;
      lastOut = t;
    }
  }
  return { outside, wentUp, wentDown, firstOut, back: lastOut, peak };
}

export function responseWords(st) {
  if (!st.wentUp && !st.wentDown) return 'Stays in the window.';
  if (st.wentUp && st.wentDown) return 'Flips into fight or flight, then drops into shutdown.';
  if (st.outside < 2) return 'Leaves the window briefly, then settles.';
  return 'Leaves the window and takes a while to come back.';
}

// ---------- 4. two windows on a hard morning ----------
// Capacity from 0 (nothing left) to 1 (a big day is fine), for you and your kid.
// The day you can share fits inside the smaller of the two.

export function kidMorning({ parentSlept = false, kidSlept = false, ate = false } = {}) {
  const parent = clamp(0.5 + (parentSlept ? 0.3 : 0) + (ate ? 0.1 : 0), 0, 1);
  const kid = clamp(0.4 + (kidSlept ? 0.35 : 0) + (ate ? 0.15 : 0), 0, 1);
  const shared = Math.min(parent, kid);
  const plan = shared >= 0.8 ? 'outing' : shared >= 0.5 ? 'low' : 'home';
  const limit = Math.abs(parent - kid) < 0.03 ? 'both' : parent < kid ? 'parent' : 'kid';
  return { parent, kid, shared, plan, limit, eatFirst: !ate };
}

// ---------- 5. breathing pacer ----------
export const PATTERNS = {
  sigh: {
    label: 'Cyclic sigh',
    phases: [
      { key: 'in', word: 'In', cue: 'Breathe in through your nose', secs: 2.5, scale: 0.86 },
      { key: 'top', word: 'In again', cue: 'A second short sip of air to fill right up', secs: 1, scale: 1 },
      { key: 'out', word: 'Out', cue: 'Long, slow breath out through your mouth', secs: 6, scale: 0.42 },
    ],
  },
  long: {
    label: 'Longer exhale',
    phases: [
      { key: 'in', word: 'In', cue: 'Breathe in gently for 4', secs: 4, scale: 1 },
      { key: 'out', word: 'Out', cue: 'Breathe out slowly for 6', secs: 6, scale: 0.42 },
    ],
  },
};

export function cycleSecs(pattern) {
  return pattern.phases.reduce((sum, p) => sum + p.secs, 0);
}

// Where you are in the pattern after elapsedMs. Returns
// { index, phase, left (seconds left in this phase), breaths (completed cycles) }.
export function pacerPhase(pattern, elapsedMs) {
  const cycle = cycleSecs(pattern);
  const secs = Math.max(0, elapsedMs) / 1000;
  const breaths = Math.floor(secs / cycle);
  let into = secs - breaths * cycle;
  for (let i = 0; i < pattern.phases.length; i += 1) {
    const ph = pattern.phases[i];
    if (into < ph.secs) return { index: i, phase: ph, left: ph.secs - into, breaths };
    into -= ph.secs;
  }
  const last = pattern.phases.length - 1;
  return { index: last, phase: pattern.phases[last], left: 0, breaths };
}

// ---------- 6. two-minute practice ----------
// Steps of equal length; returns { index, left (s in step), total left (s), done }.
export function practiceStep(stepCount, stepSecs, elapsedMs) {
  const secs = Math.max(0, elapsedMs) / 1000;
  const total = stepCount * stepSecs;
  if (secs >= total) return { index: stepCount - 1, left: 0, totalLeft: 0, done: true };
  const index = Math.floor(secs / stepSecs);
  return { index, left: stepSecs - (secs - index * stepSecs), totalLeft: total - secs, done: false };
}

// mm:ss for countdowns.
export function clock(secs) {
  const s = Math.max(0, Math.ceil(secs));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
