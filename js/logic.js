// Pure functions: no DOM, no storage. Everything here is covered by tests/logic.test.js.

export const HOUR = 3600000;
export const DAY = 24 * HOUR;

export const RANGES = {
  '1D': DAY,
  '1W': 7 * DAY,
  '1M': 30 * DAY,
  '3M': 90 * DAY,
  '1Y': 365 * DAY,
  ALL: Infinity,
};

export const RANGE_LABELS = {
  '1D': 'Today',
  '1W': 'Past week',
  '1M': 'Past month',
  '3M': 'Past 3 months',
  '1Y': 'Past year',
  ALL: 'All time',
};

export const TAGS = ['work', 'money', 'sleep', 'people', 'health', 'body', 'walk'];

export const OUTCOMES = {
  resolved: 'Resolved',
  faded: 'Faded on its own',
  'let-go': 'Let it go',
};

export function moodLabel(mood) {
  if (mood <= 2) return 'Rough';
  if (mood <= 4) return 'Low';
  if (mood <= 6) return 'Okay';
  if (mood <= 8) return 'Good';
  return 'Great';
}

export function sortByTs(list) {
  return [...list].sort((a, b) => a.ts - b.ts);
}

export function average(nums) {
  if (!nums.length) return null;
  return nums.reduce((s, n) => s + n, 0) / nums.length;
}

// The points inside a time range plus the "previous close": the last mood logged
// before the range started, which the chart draws as a dotted baseline.
export function rangeWindow(checkins, range, now) {
  const sorted = sortByTs(checkins).filter((c) => c.ts <= now);
  const span = RANGES[range];
  const start = span === Infinity ? -Infinity : now - span;
  const points = sorted.filter((c) => c.ts >= start);
  const before = sorted.filter((c) => c.ts < start);
  const baseline = before.length ? before[before.length - 1].mood : points.length ? points[0].mood : null;
  return {
    points,
    baseline,
    start: span === Infinity ? (points.length ? points[0].ts : now) : start,
    end: now,
  };
}

export function change(win) {
  if (!win.points.length || win.baseline == null) return null;
  const last = win.points[win.points.length - 1].mood;
  const delta = last - win.baseline;
  return { last, delta, pct: win.baseline ? (delta / win.baseline) * 100 : 0, up: delta >= 0 };
}

export function formatDelta(delta, pct) {
  const sign = delta > 0 ? '+' : delta < 0 ? '−' : '';
  const abs = Math.abs(delta);
  const d = Number.isInteger(abs) ? String(abs) : abs.toFixed(1);
  return `${sign}${d} (${sign}${Math.abs(pct).toFixed(0)}%)`;
}

// "Work deadline" -> "WORK". Adds a digit when the ticker is already taken.
export function suggestTicker(name, taken = []) {
  const words = String(name).toUpperCase().match(/[A-Z0-9]+/g) || [];
  const skip = new Set(['THE', 'A', 'AN', 'MY', 'TO', 'OF', 'AND', 'IN', 'ON', 'FOR']);
  const word = words.find((w) => !skip.has(w) && /[A-Z]/.test(w)) || words[0] || 'WORRY';
  const base = word.slice(0, 5);
  const used = new Set(taken.map((t) => t.toUpperCase()));
  if (!used.has(base)) return base;
  for (let i = 2; i < 100; i++) {
    const t = base.slice(0, 4) + i;
    if (!used.has(t)) return t;
  }
  return base;
}

export function cleanTicker(raw) {
  return String(raw).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
}

export function worryStats(worry, checkins, now) {
  const mine = sortByTs(checkins.filter((c) => c.worryId === worry.id));
  const end = worry.closedTs ?? now;
  return {
    mentions: mine.length,
    avgMood: average(mine.map((c) => c.mood)),
    lastTs: mine.length ? mine[mine.length - 1].ts : null,
    heldDays: Math.max(1, Math.round((end - worry.openedTs) / DAY)),
    points: mine,
  };
}

// Of the worries opened in the last `days`, how many are already closed, and how.
export function lookBack(worries, now, days = 30) {
  const since = now - days * DAY;
  const opened = worries.filter((w) => w.openedTs >= since && w.openedTs <= now);
  const closed = opened.filter((w) => w.closedTs != null);
  const by = (o) => closed.filter((w) => w.outcome === o).length;
  return {
    days,
    opened: opened.length,
    closed: closed.length,
    resolved: by('resolved'),
    faded: by('faded'),
    letGo: by('let-go'),
    stillOpen: opened.length - closed.length,
  };
}

// Average mood on check-ins with each tag, compared with the overall average.
export function tagInsights(checkins, minCount = 2) {
  const overall = average(checkins.map((c) => c.mood));
  if (overall == null) return [];
  const rows = [];
  for (const tag of TAGS) {
    const tagged = checkins.filter((c) => (c.tags || []).includes(tag));
    if (tagged.length < minCount) continue;
    const avg = average(tagged.map((c) => c.mood));
    rows.push({ tag, count: tagged.length, avg, diff: avg - overall });
  }
  return rows.sort((a, b) => b.diff - a.diff);
}

// Three rough check-ins in a row, all within the last week.
export function needsSupport(checkins, now) {
  const recent = sortByTs(checkins).filter((c) => c.ts <= now).slice(-3);
  return recent.length === 3 && recent.every((c) => c.mood <= 2 && now - c.ts <= 7 * DAY);
}

export function weeklyRecap(checkins, worries, now) {
  const week = checkins.filter((c) => c.ts > now - 7 * DAY && c.ts <= now);
  if (!week.length) return null;
  const best = week.reduce((b, c) => (c.mood > b.mood || (c.mood === b.mood && c.ts > b.ts) ? c : b));
  let heaviest = null;
  for (const w of worries) {
    const hits = week.filter((c) => c.worryId === w.id);
    if (!hits.length) continue;
    const avgMood = average(hits.map((c) => c.mood));
    // More mentions and a lower mood both make a worry heavier.
    const weight = hits.length * (11 - avgMood);
    if (!heaviest || weight > heaviest.weight) heaviest = { worry: w, mentions: hits.length, avgMood, weight };
  }
  const lettingGo = worries.filter((w) => w.closedTs != null && w.closedTs > now - 7 * DAY && w.closedTs <= now);
  return { count: week.length, avg: average(week.map((c) => c.mood)), best, heaviest, closed: lettingGo };
}

export function isValidData(data) {
  return Boolean(
    data &&
    typeof data === 'object' &&
    Array.isArray(data.checkins) &&
    Array.isArray(data.worries) &&
    data.checkins.every((c) => typeof c.ts === 'number' && typeof c.mood === 'number') &&
    data.worries.every((w) => typeof w.id === 'string' && typeof w.ticker === 'string')
  );
}
