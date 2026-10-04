// Body room logic: the vocabulary for body-map logs, starter "notes from calm me",
// example logs, and the maths that compares your overload and calm signatures.
// Pure functions only: no DOM, no storage, no Date.now(). Tested in tests/body.test.js.
//
// A body state (data.body.states[]) looks like:
//   { id, ts, kind: 'overload'|'calm', regions: [regionId], sensations: [string],
//     emotions: [string], breathing: breathingId|null, thoughts: 'one thought per line',
//     triggers: [triggerId], intensity: 1-10|null }
// Thought chips and free text are stored together in `thoughts`, one per line,
// so the field stays a plain string that any room can read.

const HOUR = 3600000;
const DAY = 24 * HOUR;

// Front-view body regions, top to bottom.
export const REGIONS = [
  { id: 'head', label: 'Head' },
  { id: 'eyes', label: 'Face, eyes' },
  { id: 'jaw', label: 'Jaw' },
  { id: 'throat', label: 'Throat' },
  { id: 'shoulders', label: 'Shoulders' },
  { id: 'chest', label: 'Chest' },
  { id: 'heart', label: 'Heart' },
  { id: 'stomach', label: 'Stomach' },
  { id: 'gut', label: 'Lower belly' },
  { id: 'arms', label: 'Arms' },
  { id: 'hands', label: 'Hands' },
  { id: 'hips', label: 'Hips' },
  { id: 'legs', label: 'Legs' },
  { id: 'feet', label: 'Feet' },
];

export const SENSATIONS_HARD = ['tight', 'hot', 'racing heart', 'shaky', 'heavy', 'buzzing', 'sick', 'aching', 'restless', 'numb', 'cold'];
export const SENSATIONS_CALM = ['warm', 'loose', 'open', 'light', 'steady', 'grounded', 'soft', 'tingly'];
export const SENSATIONS = [...SENSATIONS_HARD, ...SENSATIONS_CALM];

export const EMOTIONS_HARD = ['angry', 'overwhelmed', 'anxious', 'frustrated', 'ashamed', 'guilty', 'sad', 'trapped', 'panicky', 'numb', 'lonely'];
export const EMOTIONS_CALM = ['calm', 'connected', 'playful', 'content', 'safe', 'curious', 'grateful', 'hopeful', 'proud', 'tender'];

// `phrase` reads naturally inside a sentence ("…heading toward overload: fast, shallow breathing").
export const BREATHING = [
  { id: 'fast', label: 'Fast and shallow', phrase: 'fast, shallow breathing' },
  { id: 'holding', label: 'Holding my breath', phrase: 'holding your breath' },
  { id: 'tight', label: 'Can’t get a full breath', phrase: 'can’t get a full breath' },
  { id: 'normal', label: 'Normal', phrase: 'ordinary breathing' },
  { id: 'slow', label: 'Slow and deep', phrase: 'slow, deep breathing' },
];

export const THOUGHT_CHIPS_HARD = [
  'I can’t do this',
  'I can’t think',
  'Everyone needs something from me',
  'I just need it to stop',
  'I’m messing this up',
  'It’s always like this',
];
export const THOUGHT_CHIPS_CALM = [
  'We’re okay',
  'I can handle this',
  'There’s time',
  'I like being with my kid',
  'This is enough',
  'It will pass',
];

// What came before an overload. `{kid}` is replaced with the kid's name for display.
export const TRIGGERS = [
  { id: 'sleep', label: 'Not enough sleep' },
  { id: 'kid-food', label: '{kid} not eating' },
  { id: 'kid-screens', label: '{kid} only wants screens' },
  { id: 'kid-out', label: '{kid} won’t go out' },
  { id: 'message', label: 'A draining message' },
  { id: 'call', label: 'A phone call' },
  { id: 'noise', label: 'Noise and mess' },
  { id: 'late', label: 'Running late' },
  { id: 'hungry', label: 'I hadn’t eaten' },
  { id: 'too-much', label: 'Too much at once' },
  { id: 'pain', label: 'Pain or feeling sick' },
  { id: 'memory', label: 'An old memory' },
];

export function regionLabel(id) {
  return REGIONS.find((r) => r.id === id)?.label || id;
}
export function breathingLabel(id) {
  return BREATHING.find((b) => b.id === id)?.label || id;
}
export function triggerLabel(id, kid = 'my kid') {
  const t = TRIGGERS.find((x) => x.id === id);
  if (!t) return id;
  return t.label.replace('{kid}', kid).replace(/^./, (c) => c.toUpperCase());
}

// ---------- starter library ----------
export function starterBody() {
  const rules = [
    ['r-replies', 'When I’m overloaded I don’t reply to messages. They can wait until I’ve slept.'],
    ['r-sleep', 'Sleep when my kid sleeps. Everything else can wait.'],
    ['r-hardtime', 'My kid isn’t giving me a hard time. My kid is having a hard time.'],
    ['r-projects', 'No new projects after 9pm. That includes building apps.'],
    ['r-food', 'Food and sleep first. Feelings make more sense after.'],
    ['r-repair', 'I can repair anything I say in a bad moment.'],
  ];
  return { rules: rules.map(([id, text]) => ({ id, text, ts: 0 })) };
}

// ---------- example logs ----------
function rng(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// About three weeks of logs: six overloads and six calm moments, each with its own
// realistic signature. Every entry is at least a day old, so none is in the future.
export function sampleBody(now) {
  const rand = rng(21);
  const day = new Date(now);
  day.setHours(0, 0, 0, 0);
  const today = day.getTime();
  const at = (daysAgo, hour) => today - daysAgo * DAY + hour * HOUR + Math.floor(rand() * 20) * 60000;

  // [daysAgo, hour, kind, regions, sensations, emotions, breathing, thoughts, triggers, intensity]
  const rows = [
    [20, 10.5, 'calm', ['chest', 'shoulders', 'hands'], ['warm', 'loose', 'open'], ['calm', 'connected'], 'slow', ['We’re okay'], [], null],
    [19, 18.5, 'overload', ['jaw', 'shoulders', 'chest'], ['tight', 'hot'], ['angry', 'overwhelmed'], 'fast', ['I can’t do this', 'Everyone needs something from me'], ['sleep', 'kid-food'], 8],
    [17, 16, 'calm', ['chest', 'legs', 'feet'], ['light', 'warm'], ['playful', 'connected'], 'normal', ['I like being with my kid', 'Scooters by the river. Went straight out after pickup.'], [], null],
    [16, 7.75, 'overload', ['head', 'jaw', 'stomach'], ['tight', 'sick'], ['overwhelmed', 'anxious'], 'holding', ['I can’t think'], ['sleep', 'late'], 6],
    [14, 20.5, 'calm', ['shoulders', 'chest', 'stomach'], ['grounded', 'warm', 'loose'], ['calm', 'content'], 'slow', ['There’s time'], [], null],
    [12, 17.5, 'overload', ['jaw', 'chest', 'heart', 'shoulders'], ['racing heart', 'hot', 'shaky'], ['angry', 'frustrated', 'ashamed'], 'fast', ['I can’t do this', 'I’m messing this up'], ['kid-screens', 'message'], 9],
    [10, 9.25, 'calm', ['chest', 'shoulders'], ['open', 'light'], ['calm', 'hopeful'], 'slow', ['I can handle this'], [], null],
    [9, 21.25, 'overload', ['head', 'shoulders', 'chest', 'stomach'], ['tight', 'buzzing', 'restless'], ['overwhelmed', 'anxious'], 'tight', ['Everyone needs something from me', 'Too many ideas at once. Couldn’t switch off.'], ['too-much', 'sleep'], 7],
    [6, 15.5, 'calm', ['chest', 'heart', 'hands'], ['warm', 'open'], ['connected', 'playful', 'grateful'], 'normal', ['We’re okay', 'I like being with my kid'], [], null],
    [5, 12.25, 'overload', ['jaw', 'stomach', 'hands'], ['tight', 'hot', 'shaky'], ['angry', 'guilty'], 'fast', ['I can’t do this'], ['kid-food', 'hungry'], 8],
    [2, 18, 'overload', ['jaw', 'shoulders', 'chest', 'heart'], ['racing heart', 'tight', 'hot'], ['overwhelmed', 'angry', 'ashamed'], 'fast', ['I can’t do this', 'I’m messing this up'], ['message', 'kid-out'], 8],
    [1, 11, 'calm', ['shoulders', 'chest', 'legs'], ['loose', 'grounded'], ['calm', 'safe'], 'slow', ['There’s time'], [], null],
  ];

  const states = rows.map(([daysAgo, hour, kind, regions, sensations, emotions, breathing, thoughts, triggers, intensity], i) => ({
    id: `ex-b${i + 1}`,
    ts: at(daysAgo, hour),
    kind,
    regions,
    sensations,
    emotions,
    breathing,
    thoughts: thoughts.join('\n'),
    triggers,
    intensity,
  }));
  return { states: states.filter((s) => s.ts <= now) };
}

// ---------- building a log entry ----------
// draft: { regions, sensations, emotions, thoughtChips, triggers: Set|Array, breathing, text, intensity }
// Lists come out in vocabulary order so logs read the same way every time.
export function buildState(draft, kind, ts, id) {
  const ordered = (values, vocab) => {
    const set = new Set(values || []);
    const known = vocab.filter((v) => set.has(v));
    return [...known, ...[...set].filter((v) => !vocab.includes(v))];
  };
  const lines = [...(draft.thoughtChips || []), ...String(draft.text || '').split('\n')]
    .map((l) => l.trim())
    .filter(Boolean);
  const intensity = Number(draft.intensity);
  return {
    id,
    ts,
    kind: kind === 'calm' ? 'calm' : 'overload',
    regions: ordered(draft.regions, REGIONS.map((r) => r.id)),
    sensations: ordered(draft.sensations, SENSATIONS),
    emotions: ordered(draft.emotions, [...EMOTIONS_HARD, ...EMOTIONS_CALM]),
    breathing: draft.breathing || null,
    thoughts: [...new Set(lines)].join('\n'),
    triggers: ordered(draft.triggers, TRIGGERS.map((t) => t.id)),
    intensity: draft.intensity != null && Number.isInteger(intensity) && intensity >= 1 && intensity <= 10 ? intensity : null,
  };
}

// Split a stored thoughts string into lines.
export function thoughtLines(thoughts) {
  return String(thoughts || '').split('\n').map((l) => l.trim()).filter(Boolean);
}

// Same thought, different punctuation or apostrophes -> same key.
export function thoughtKey(line) {
  return String(line).toLowerCase().replace(/[’‘`]/g, '\'').replace(/[.!?…\s]+$/u, '').replace(/\s+/g, ' ').trim();
}

// ---------- signatures ----------
// How often each item shows up in logs of one kind, as a share of those logs (0..1).
// { kind, count, regions:{id:share}, sensations, emotions, breathing, triggers,
//   thoughts:[{ key, text, count, share }] (top 5), intensity: average|null }
export function signature(states, kind) {
  const logs = (states || []).filter((s) => s && s.kind === kind);
  const n = logs.length;
  const shares = (get) => {
    const counts = {};
    for (const s of logs) {
      for (const v of new Set([].concat(get(s) ?? []).filter((x) => x != null && x !== ''))) counts[v] = (counts[v] || 0) + 1;
    }
    const out = {};
    for (const [k, c] of Object.entries(counts)) out[k] = c / n;
    return out;
  };

  const thoughtCounts = new Map();
  for (const s of logs) {
    const seen = new Set();
    for (const line of thoughtLines(s.thoughts)) {
      const key = thoughtKey(line);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const cur = thoughtCounts.get(key) || { text: line, count: 0 };
      cur.count += 1;
      thoughtCounts.set(key, cur);
    }
  }
  const thoughts = [...thoughtCounts.entries()]
    .map(([key, t]) => ({ key, text: t.text, count: t.count, share: t.count / n }))
    .sort((a, b) => b.count - a.count || a.text.localeCompare(b.text))
    .slice(0, 5);

  const levels = logs.map((s) => s.intensity).filter((v) => typeof v === 'number');
  return {
    kind,
    count: n,
    regions: shares((s) => s.regions),
    sensations: shares((s) => s.sensations),
    emotions: shares((s) => s.emotions),
    breathing: shares((s) => s.breathing),
    triggers: shares((s) => s.triggers),
    thoughts,
    intensity: levels.length ? levels.reduce((a, b) => a + b, 0) / levels.length : null,
  };
}

// A share map as [[id, share], …], biggest first (ties alphabetical), at most n.
export function ranked(map, n = Infinity) {
  return Object.entries(map || {})
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, n);
}

// ---------- early signs ----------
// Things that show up much more in overload logs than in calm ones. Noticing these
// early is the point: they're the signal to slow down before the window closes.
// An item counts when it's in at least `minCount` overload logs, its overload share is
// at least `minGap` higher than its calm share, and at least double it.
// Returns [{ type, id, label, phrase, overload, calm, count }], strongest first.
export function earlySigns(states, { minCount = 2, minGap = 0.3 } = {}) {
  const over = signature(states, 'overload');
  const calm = signature(states, 'calm');
  if (over.count < 2) return [];

  const cap = (w) => w.replace(/^./, (c) => c.toUpperCase());
  const words = {
    regions: (id) => ({ label: regionLabel(id), phrase: regionLabel(id).toLowerCase() }),
    sensations: (id) => ({ label: cap(id), phrase: id }),
    emotions: (id) => ({ label: cap(id), phrase: `feeling ${id}` }),
    breathing: (id) => {
      const b = BREATHING.find((x) => x.id === id);
      return { label: b ? b.label : id, phrase: b ? b.phrase : id };
    },
  };

  const out = [];
  const consider = (type, id, o, c, count, label, phrase) => {
    if (count < minCount) return;
    if (o - c < minGap) return;
    if (c > 0 && o < c * 2) return;
    out.push({ type, id, label, phrase, overload: o, calm: c, count });
  };

  for (const type of ['regions', 'sensations', 'emotions', 'breathing']) {
    for (const [id, o] of Object.entries(over[type])) {
      const c = calm[type][id] || 0;
      const { label, phrase } = words[type](id);
      consider(type, id, o, c, Math.round(o * over.count), label, phrase);
    }
  }
  const calmThoughts = new Map();
  for (const s of (states || []).filter((x) => x && x.kind === 'calm')) {
    for (const k of new Set(thoughtLines(s.thoughts).map(thoughtKey))) calmThoughts.set(k, (calmThoughts.get(k) || 0) + 1);
  }
  for (const t of over.thoughts) {
    const c = calm.count ? (calmThoughts.get(t.key) || 0) / calm.count : 0;
    consider('thoughts', t.key, t.share, c, t.count, `“${t.text}”`, `“${t.text}”`);
  }

  const order = ['regions', 'sensations', 'breathing', 'emotions', 'thoughts'];
  return out.sort((a, b) => (b.overload - b.calm) - (a.overload - a.calm)
    || b.count - a.count
    || order.indexOf(a.type) - order.indexOf(b.type)
    || a.label.localeCompare(b.label));
}

// How many overload and calm logs in the last `days` days (for Today's early warning).
export function recentCounts(states, now, days = 7) {
  const since = now - days * DAY;
  const recent = (states || []).filter((s) => s && s.ts > since && s.ts <= now);
  const overloads = recent.filter((s) => s.kind === 'overload');
  return {
    days,
    overload: overloads.length,
    calm: recent.filter((s) => s.kind === 'calm').length,
    lastOverloadTs: overloads.length ? Math.max(...overloads.map((s) => s.ts)) : null,
  };
}
