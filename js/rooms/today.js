// The Today room, the home screen. In a few seconds: how wide your window is
// today, whether you're sliding toward overload over the last few days, and
// what to do about it. Also the morning check-in, and doors to every other room.

import {
  capacity, dailyScores, warning, todaysMorning, sleepNeed, fmtHours, zoneOf, ZONE_LABELS, MIND_LABELS, ZONE_OK, BASE,
} from '../logic/capacity.js';
import { moodLabel } from '../logic.js';
import {
  state, h, s, now, uid, startOfDay, dayKey, commit, toast, go, setAccent, openSheet, closeSheet,
  demoBanner, sectionHead, scalePicker, registerView, registerAction, runAction,
} from '../core.js';
import { kidCard } from './kid.js';
import { medsCard } from './meds.js';
import { mindCard, supportBanner } from './mind.js';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const ZONE_LINES = {
  ok: 'Room to handle what comes.',
  edge: 'Less room than usual. Go a bit easier.',
  over: 'Protect yourself today.',
};
const LEVEL_TAGS = { watch: 'Heads up', warning: 'Early warning', recovery: 'Recovery' };

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const signed = (d) => (d > 0 ? `+${d}` : d < 0 ? `−${Math.abs(d)}` : '0');
const longDate = (ts) => { const d = new Date(ts); return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`; };
const weekday = (key) => { const [y, m, d] = key.split('-').map(Number); return WEEKDAYS[new Date(y, m - 1, d).getDay()]; };

// Another room's card should never take the whole home screen down with it.
function safe(fn) {
  try {
    return fn() || null;
  } catch (err) {
    console.error(err);
    return null;
  }
}

function gearIcon() {
  const pts = [];
  const teeth = 8;
  const w = Math.PI / teeth;
  for (let i = 0; i < teeth; i++) {
    const a = i * 2 * w;
    for (const [r, da] of [[7.4, -0.78 * w], [10, -0.42 * w], [10, 0.42 * w], [7.4, 0.78 * w]]) {
      pts.push(`${(12 + r * Math.cos(a + da)).toFixed(2)},${(12 + r * Math.sin(a + da)).toFixed(2)}`);
    }
  }
  return s('svg', { viewBox: '0 0 24 24', width: '22', height: '22', 'aria-hidden': 'true', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.7', 'stroke-linejoin': 'round' },
    s('path', { d: `M${pts.join('L')}Z` }),
    s('circle', { cx: '12', cy: '12', r: '3' }));
}

// ---------- check-in prompt / summary ----------
function promptCard(t) {
  const hr = new Date(t).getHours();
  const [title, sub, btn] = hr < 4
    ? ['It’s late.', 'If you can, sleep now. Check in when you wake.', 'Check in anyway']
    : hr < 11
      ? ['Good morning.', 'How did you sleep?', 'Morning check-in']
      : ['Quick check-in', 'How did you sleep, and where’s your mind today?', 'Check in'];
  return h('section', { class: 'today-prompt', 'aria-labelledby': 'tp-h' },
    h('h2', { id: 'tp-h', class: 'today-prompt-title' }, h('span', { class: 'today-prompt-big', text: title }), h('span', { text: sub })),
    hr < 4 ? null : h('p', { class: 'today-prompt-note', text: 'About a minute. It turns today’s estimate into a real reading.' }),
    h('button', { class: 'btn today-prompt-btn', type: 'button', onclick: () => openMorning() }, btn));
}

function summaryLine(m) {
  const parts = [];
  if (num(m.sleepHours) != null) parts.push(`Slept ${fmtHours(m.sleepHours)}`);
  if (MIND_LABELS[m.mind]) parts.push(`mind ${MIND_LABELS[m.mind].toLowerCase()}`);
  if (num(m.tension) != null) parts.push(`tension ${m.tension}`);
  return h('div', { class: 'today-summary' },
    h('span', { text: parts.join(' · ') || 'Checked in this morning' }),
    h('button', { class: 'text-btn today-link', type: 'button', 'aria-label': 'Edit this morning’s check-in', onclick: () => openMorning() }, 'Edit'));
}

// ---------- the window ----------
// A window-of-tolerance diagram: fight/flight above, shutdown below, your window
// in the middle. The band's height is today's score. The wave is the ordinary
// rise and fall of a day, the same size every day: when the window is wide it
// fits inside; when the window narrows, the same ups and downs spill over.
let diagramSeq = 0;
const W = 340;
const H = 160;
const PAD = 24; // each outer zone keeps at least this much room for its label
const WAVE = 120; // wavelength in SVG units; css/today.css drifts by exactly this much
const bandFor = (score) => 10 + (H - 2 * PAD - 10) * (score / 100);
// The wave just fits a window at the "wide" threshold (65).
const AMP = bandFor(ZONE_OK) / 2 - 1;

function windowDiagram(cap) {
  const id = `tw${++diagramSeq}`;
  const band = bandFor(cap.score);
  const top = (H - band) / 2;
  const bottom = top + band;
  const mid = H / 2;

  // An odd function, so it rises and falls by the same amount (no built-in lean
  // toward fight/flight or shutdown); the second harmonic just makes it organic.
  const f = (x) => Math.sin((2 * Math.PI * x) / WAVE) + 0.22 * Math.sin((4 * Math.PI * x) / WAVE);
  let peak = 0;
  for (let x = 0; x < WAVE; x += 1) peak = Math.max(peak, Math.abs(f(x)));
  const pts = [];
  for (let x = -WAVE; x <= W + WAVE; x += 3) pts.push(`${x},${(mid - (AMP * f(x)) / peak).toFixed(1)}`);
  const d = `M${pts.join('L')}`;
  const wave = (cls) => s('g', { class: 'today-drift' }, s('path', { d, class: `today-wave ${cls}`, 'vector-effect': 'non-scaling-stroke' }));
  const fits = band / 2 >= AMP;

  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none', 'aria-hidden': 'true', focusable: 'false' },
    s('defs', {},
      s('clipPath', { id: `${id}-hi` }, s('rect', { x: '0', y: '0', width: W, height: top })),
      s('clipPath', { id: `${id}-in` }, s('rect', { x: '0', y: top, width: W, height: band })),
      s('clipPath', { id: `${id}-lo` }, s('rect', { x: '0', y: bottom, width: W, height: H - bottom }))),
    s('rect', { class: 'today-zone-hi', x: '0', y: '0', width: W, height: top }),
    s('rect', { class: 'today-zone-lo', x: '0', y: bottom, width: W, height: H - bottom }),
    s('rect', { class: 'today-band', x: '0', y: top, width: W, height: band }),
    s('g', { 'clip-path': `url(#${id}-hi)` }, wave('hi')),
    s('g', { 'clip-path': `url(#${id}-lo)` }, wave('lo')),
    s('g', { 'clip-path': `url(#${id}-in)` }, wave('in')),
    s('line', { class: 'today-edge', x1: '0', x2: W, y1: top, y2: top, 'vector-effect': 'non-scaling-stroke' }),
    s('line', { class: 'today-edge', x1: '0', x2: W, y1: bottom, y2: bottom, 'vector-effect': 'non-scaling-stroke' }));

  const label = `Window of tolerance diagram. Your window today is ${cap.score} out of 100: ${ZONE_LABELS[cap.zone].toLowerCase()}. `
    + (fits
      ? 'The ordinary ups and downs of a day fit inside it.'
      : 'The ordinary ups and downs of a day can spill over it, up into fight or flight, or down into shutdown.');
  return h('div', { class: 'today-window', role: 'img', 'aria-label': label },
    svg,
    h('span', { class: 'today-wl today-wl-hi', 'aria-hidden': 'true', text: 'Fight / flight ↑' }),
    h('span', { class: 'today-wl today-wl-band', 'aria-hidden': 'true', text: 'Your window' }),
    h('span', { class: 'today-wl today-wl-lo', 'aria-hidden': 'true', text: 'Shutdown ↓' }));
}

function whyBlock(cap) {
  const clamped = BASE + cap.factors.reduce((sum, f) => sum + f.delta, 0) !== cap.score;
  const det = h('details', { class: 'today-why' },
    h('summary', {}, h('span', { text: `Why ${cap.score}?` })),
    h('ul', { class: 'today-factors' },
      h('li', {}, h('span', { text: 'Starting point' }), h('span', { class: 'today-delta', text: String(BASE) })),
      cap.factors.map((f) => h('li', {},
        h('span', { text: f.label }),
        h('span', { class: `today-delta ${f.delta < 0 ? 'neg' : f.delta > 0 ? 'pos' : ''}`, text: signed(f.delta) }))),
      h('li', { class: 'total' }, h('span', { text: 'Today' }), h('span', { class: 'today-delta', text: `${cap.score}${clamped ? ' (kept within 0–100)' : ''}` }))),
    h('p', { class: 'fine', text: cap.basis.source === 'none' && !cap.factors.length
      ? 'Nothing logged yet, so this starts from an ordinary day. A morning check-in makes it yours.'
      : cap.basis.source === 'none'
      ? 'No check-in yet today, so this starts from an ordinary day plus what else you’ve logged.'
      : cap.confidence === 'none'
      ? 'No check-in yet today, so this leans on recent days and anything else you’ve logged.'
      : cap.confidence === 'low'
        ? (cap.basis.checkinTs < startOfDay(now())
          ? 'Based on your most recent check-in, from yesterday.'
          : 'This morning’s check-in has no sleep hours, so this is rougher than usual.')
        : 'Sleep, mind and body come from this morning’s check-in. Overload, calm moments, nights with your kid and caffeine come from the rest of the app.' }));
  det.open = Boolean(state.ui.todayWhy);
  det.addEventListener('toggle', () => { state.ui.todayWhy = det.open; });
  return det;
}

function hero(cap, mine) {
  const est = cap.confidence === 'none';
  return h('section', { class: 'today-hero', 'aria-labelledby': 'win-h' },
    h('div', { class: 'today-hero-head' },
      h('h2', { class: 'eyebrow', id: 'win-h', text: 'Your window today' }),
      est ? h('span', { class: 'today-tag', text: 'Estimate' }) : null),
    h('div', { class: 'hero-row' },
      h('span', { class: `hero-num${est ? ' today-est' : ''}` }, String(cap.score), h('small', { text: '/100' })),
      h('span', { class: 'hero-word today-zone' }, h('span', { class: 'today-zone-dot', 'aria-hidden': 'true' }), ZONE_LABELS[cap.zone])),
    h('p', { class: 'today-zone-line', text: cap.basis.source === 'none' && !cap.factors.length ? 'A starting guess until you check in.' : ZONE_LINES[cap.zone] }),
    windowDiagram(cap),
    mine ? summaryLine(mine) : null,
    whyBlock(cap),
    h('p', { class: 'fine today-fine' }, 'An estimate from what you’ve logged, not a diagnosis. ',
      h('button', { class: 'text-btn', type: 'button', onclick: () => go('learn/window') }, 'What is the window?')));
}

// ---------- early warning ----------
function doneKeys(t) {
  const k = dayKey(t);
  if (state.ui.todayDone?.date !== k) state.ui.todayDone = { date: k, keys: [] };
  return state.ui.todayDone.keys;
}

function warningCard(w, t) {
  if (w.level === 'none') return null;
  const done = doneKeys(t);
  const count = h('span', { class: 'today-count', 'aria-live': 'polite' });
  const syncCount = () => {
    const n = w.actions.filter((a) => done.includes(a.key)).length;
    count.textContent = n ? `${n} of ${w.actions.length} done` : '';
  };
  syncCount();
  const actions = w.actions.map((a) => {
    const box = h('input', { type: 'checkbox', id: `act-${a.key}` });
    box.checked = done.includes(a.key);
    box.addEventListener('change', () => {
      const i = done.indexOf(a.key);
      if (box.checked && i < 0) done.push(a.key);
      if (!box.checked && i >= 0) done.splice(i, 1);
      syncCount();
    });
    return h('li', {}, h('label', { class: 'today-act', for: `act-${a.key}` }, box, h('span', { text: a.text })));
  });

  const rules = (state.data.body?.rules || []).filter((r) => r && r.text).slice(0, 3);
  const notes = h('div', { class: 'today-notes' },
    h('div', { class: 'today-subhead' }, h('h3', { class: 'today-sub', text: 'Notes from calm me' }),
      h('button', { class: 'text-btn today-link', type: 'button', onclick: () => go('rules') }, rules.length ? 'All notes' : 'Write one')),
    rules.length
      ? h('ul', { class: 'today-note-list' }, rules.map((r) => h('li', { class: 'today-note' }, h('q', { text: r.text }))))
      : h('p', { class: 'fine', text: 'When you feel steady, write yourself a few lines for days like this.' }));

  return h('section', { class: `today-warn lvl-${w.level}`, 'aria-labelledby': 'warn-h' },
    h('span', { class: 'today-warn-tag', text: LEVEL_TAGS[w.level] }),
    h('h2', { id: 'warn-h', class: 'today-warn-title', text: w.title }),
    h('p', { class: 'today-warn-lead', text: w.lead }),
    h('ul', { class: 'today-reasons' }, w.reasons.map((r) => h('li', { text: r }))),
    h('div', { class: 'today-subhead' }, h('h3', { class: 'today-sub', text: 'For today' }), count),
    h('ul', { class: 'today-acts' }, actions),
    notes,
    h('button', { class: 'btn block today-over-btn', type: 'button', onclick: () => runAction('overload') }, 'I’m overloaded now'));
}

// ---------- last 7 days ----------
// Each day is a small window: the taller the bar, the wider the window. The
// dashed lines mark 65, where a window counts as wide.
function weekStrip(days, cap) {
  const items = days.map((d, i) => {
    const isToday = i === days.length - 1;
    const est = isToday && d.score == null;
    const score = est ? cap.score : d.score;
    const day = weekday(d.date);
    return { ...d, score, est, isToday, zone: score == null ? null : zoneOf(score), name: isToday ? 'Today' : day.slice(0, 3), spokenName: isToday ? 'Today' : day };
  });
  const spoken = items.map((x) => `${x.spokenName} ${x.score == null ? 'no check-in' : `${x.score}, ${ZONE_LABELS[x.zone].toLowerCase()}${x.est ? ', estimate' : ''}`}`).join('; ');
  const logged = items.filter((x) => x.score != null && !x.est).length;
  return h('section', { class: 'section', 'aria-labelledby': 'wk-h' },
    sectionHead('Last 7 days', 'Taller is wider', 'wk-h'),
    h('div', { class: 'today-week', role: 'img', 'aria-label': `Window by day. ${spoken}.` },
      h('div', { class: 'today-week-row', 'aria-hidden': 'true' }, items.map((x) => h('span', { class: `today-week-num${x.est ? ' est' : ''}`, text: x.score == null ? '–' : String(x.score) }))),
      h('div', { class: 'today-week-plot', 'aria-hidden': 'true' }, items.map((x) => h('span', { class: 'today-week-col' },
        x.score == null
          ? h('span', { class: 'today-week-gap' })
          : h('span', { class: `today-week-bar z-${x.zone}${x.est ? ' est' : ''}`, style: `height:${Math.max(6, x.score)}%` })))),
      h('div', { class: 'today-week-row names', 'aria-hidden': 'true' }, items.map((x) => h('span', { class: x.isToday ? 'is-today' : '', text: x.name })))),
    h('div', { class: 'legend', 'aria-hidden': 'true' },
      h('span', {}, h('i', { class: 'today-key z-ok' }), 'Wide 65+'),
      h('span', {}, h('i', { class: 'today-key z-edge' }), 'Narrowing 40–64'),
      h('span', {}, h('i', { class: 'today-key z-over' }), 'Very narrow')),
    logged < 2 ? h('p', { class: 'fine', text: 'Check in each morning and your days line up here, so a slide shows before it tips.' }) : null);
}

// ---------- quick actions ----------
function quickActions() {
  const qa = (label, sub, fn) => h('button', { class: 'today-qa', type: 'button', onclick: fn }, label, h('span', { text: sub }));
  return h('section', { class: 'section', 'aria-labelledby': 'qa-h' },
    h('h2', { class: 'eyebrow', id: 'qa-h', text: 'Quick' }),
    h('div', { class: 'today-quick' },
      qa('Mood check-in', 'How you feel right now', () => runAction('checkin')),
      qa('Log a calm moment', 'Teach your body what safe feels like', () => runAction('logCalm')),
      qa('My two signatures', 'Overload and calm, side by side', () => go('body')),
      qa('Notes from calm me', 'For the hard days', () => go('rules'))));
}

// ---------- morning check-in sheet ----------
export function openMorning() {
  const t = now();
  const data = state.data;
  const existing = todaysMorning(data.checkins, t);
  const last = data.checkins.filter((c) => c && c.kind === 'morning' && num(c.sleepHours) != null && c.ts <= t).sort((a, b) => b.ts - a.ts)[0];
  const need = sleepNeed(data);
  const coffeeToday = (data.meds?.caffeine || []).filter((x) => x && x.ts >= startOfDay(t) && x.ts <= t).length;
  const form = {
    sleep: num(existing?.sleepHours) ?? num(last?.sleepHours) ?? Math.max(0, need - 1),
    mind: existing?.mind ?? null,
    mood: num(existing?.mood) ?? 5,
    ate: typeof existing?.ate === 'boolean' ? existing.ate : null,
    caffeine: num(existing?.caffeine) ?? coffeeToday,
  };

  // Sleep: − / number / +
  const sleepIn = h('input', { type: 'number', id: 'mc-sleep', min: '0', max: '16', step: '0.5', inputmode: 'decimal', value: String(form.sleep), 'aria-describedby': 'mc-sleep-hint' });
  const sleepHint = h('p', { class: 'today-hint', id: 'mc-sleep-hint', 'aria-live': 'polite' });
  const syncHint = () => {
    const short = need - form.sleep;
    sleepHint.textContent = short > 0 ? `${fmtHours(short)} short of the ${fmtHours(need)} you need.` : `That’s your ${fmtHours(need)}. Good.`;
  };
  const setSleep = (v) => {
    form.sleep = clamp(Math.round(v * 2) / 2, 0, 16);
    sleepIn.value = String(form.sleep);
    syncHint();
  };
  sleepIn.addEventListener('input', () => {
    const v = Number(sleepIn.value);
    if (sleepIn.value !== '' && Number.isFinite(v)) { form.sleep = clamp(v, 0, 16); syncHint(); }
  });
  sleepIn.addEventListener('change', () => setSleep(form.sleep));
  syncHint();
  const stepBtn = (sign, label) => h('button', { class: 'today-step-btn', type: 'button', 'aria-label': label, onclick: () => setSleep(form.sleep + sign * 0.5) }, sign < 0 ? '−' : '+');

  const quality = scalePicker('mc-quality', { min: 1, max: 5, value: num(existing?.sleepQuality), low: '1 · restless', high: '5 · deep', label: 'Sleep quality, from 1 restless to 5 deep' });
  const tension = scalePicker('mc-tension', { min: 1, max: 5, value: num(existing?.tension), low: '1 · loose', high: '5 · tight', label: 'Body tension, from 1 loose to 5 tight' });

  // Single-choice buttons that update in place (keeps keyboard focus).
  const choiceGroup = (options, get, set, labelId, cls) => {
    const btns = options.map(([value, label, sub]) => {
      const b = h('button', { class: 'choice', type: 'button', 'aria-pressed': String(get() === value) }, label, sub ? h('span', { text: sub }) : null);
      b.addEventListener('click', () => {
        set(get() === value ? null : value);
        btns.forEach((x, i) => x.setAttribute('aria-pressed', String(get() === options[i][0])));
      });
      return b;
    });
    return h('div', { class: cls, role: 'group', 'aria-labelledby': labelId }, btns);
  };
  const mindGroup = choiceGroup(
    [['positive', 'Positive', 'Good things'], ['mixed', 'Mixed', 'A bit of both'], ['negative', 'Negative', 'Hard things']],
    () => form.mind, (v) => { form.mind = v; }, 'mc-mind-l', 'today-choices three');
  const ateGroup = choiceGroup(
    [[true, 'Yes'], [false, 'Not yet']],
    () => form.ate, (v) => { form.ate = v; }, 'mc-ate-l', 'today-choices');

  const note = h('textarea', { id: 'mc-note', maxlength: '500', placeholder: 'Optional. A line is enough. Only you can see this.' });
  note.value = existing?.note || '';

  const moodN = h('span', { class: 'n' });
  const moodW = h('span', { class: 'w' });
  const syncMood = () => { moodN.textContent = form.mood; moodW.textContent = moodLabel(form.mood); };
  const slider = h('input', { type: 'range', id: 'mc-mood', min: '1', max: '10', step: '1', value: String(form.mood), 'aria-label': 'Mood from 1 to 10' });
  slider.addEventListener('input', () => { form.mood = Number(slider.value); syncMood(); });
  syncMood();

  const cupsOut = h('output', { class: 'today-step-count', id: 'mc-caf', 'aria-live': 'polite' });
  const setCups = (v) => { form.caffeine = clamp(v, 0, 20); cupsOut.textContent = String(form.caffeine); };
  setCups(form.caffeine);

  const field = (labelId, label, sub, ...body) => h('div', { class: 'field' },
    h('span', { class: 'lbl', id: labelId }, label, sub ? h('span', { class: 'today-lbl-sub', text: ` ${sub}` }) : null), ...body);

  const editingExample = Boolean(existing && data.demo);
  const save = () => {
    setSleep(form.sleep);
    const entry = {
      kind: 'morning',
      mood: form.mood,
      note: note.value.trim(),
      sleepHours: form.sleep,
      sleepQuality: quality.get(),
      mind: form.mind,
      tension: tension.get(),
      ate: form.ate,
      caffeine: form.caffeine,
    };
    const editId = existing?.id ?? null;
    const clearing = data.demo && !editingExample;
    closeSheet();
    commit((d) => {
      const i = editId == null ? -1 : d.checkins.findIndex((c) => c.id === editId);
      if (i >= 0) d.checkins[i] = { ...d.checkins[i], ...entry };
      else d.checkins.push({ id: uid(), ts: now(), tags: [], worryId: null, ...entry });
    }, { keepDemo: editingExample, quiet: true });
    const cap = capacity(state.data, now());
    toast(`${clearing ? 'Examples cleared. ' : ''}${editId && !clearing ? 'Updated' : 'Checked in'}. Your window: ${cap.score}, ${ZONE_LABELS[cap.zone].toLowerCase()}.`);
  };

  const hr = new Date(t).getHours();
  const title = existing ? 'Edit this morning' : hr >= 4 && hr < 11 ? 'Morning check-in' : 'Check-in';
  openSheet(title, h('form', { class: 'today-form', novalidate: true, onsubmit: (e) => { e.preventDefault(); save(); } },
    h('div', { class: 'field' },
      h('label', { class: 'lbl', for: 'mc-sleep', text: 'How long did you sleep?' }),
      h('div', { class: 'today-stepper' }, stepBtn(-1, 'Half an hour less'), sleepIn, h('span', { class: 'today-step-unit', text: 'hours' }), stepBtn(1, 'Half an hour more')),
      sleepHint),
    field('mc-quality-l', 'How well?', null, quality.node),
    field('mc-mind-l', 'Where’s your mind?', null, mindGroup),
    h('label', { class: 'field', for: 'mc-note' }, h('span', { class: 'lbl' }, 'What’s on your mind?', h('span', { class: 'today-lbl-sub', text: ' Optional' })), note),
    field('mc-tension-l', 'Body tension', null, tension.node),
    h('div', { class: 'mood-pick' },
      h('label', { class: 'lbl', for: 'mc-mood', style: 'font-weight:600', text: 'Mood right now' }),
      h('div', { class: 'mood-read', 'aria-hidden': 'true' }, moodN, moodW),
      slider,
      h('div', { class: 'scale', 'aria-hidden': 'true' }, h('span', { text: '1 · rough' }), h('span', { text: '10 · great' }))),
    field('mc-ate-l', 'Eaten yet?', null, ateGroup),
    h('div', { class: 'field' },
      h('span', { class: 'lbl', id: 'mc-caf-l' }, 'Caffeine so far', h('span', { class: 'today-lbl-sub', text: ' cups or cans' })),
      h('div', { class: 'today-stepper', role: 'group', 'aria-labelledby': 'mc-caf-l' },
        h('button', { class: 'today-step-btn', type: 'button', 'aria-label': 'One less', onclick: () => setCups(form.caffeine - 1) }, '−'),
        cupsOut,
        h('button', { class: 'today-step-btn', type: 'button', 'aria-label': 'One more', onclick: () => setCups(form.caffeine + 1) }, '+'))),
    data.demo && !editingExample ? h('p', { class: 'fine', text: 'Saving clears the example data and starts your own history.' }) : null,
    h('button', { class: 'btn block today-save', type: 'submit' }, existing ? 'Save changes' : 'Save check-in')));
}

// ---------- the screen ----------
function todayView() {
  const t = now();
  const data = state.data;
  const cap = capacity(data, t);
  const w = warning(data, t);
  const days = dailyScores(data, t, 7);
  const mine = todaysMorning(data.checkins, t);
  setAccent(cap.zone);

  return [
    h('header', { class: 'topbar today-top' },
      h('div', { class: 'today-when' },
        h('span', { class: 'eyebrow', text: 'Today' }),
        h('h1', { class: 'today-date', text: longDate(t) })),
      h('button', { class: 'icon-btn today-gear', type: 'button', 'aria-label': 'Settings', onclick: () => go('settings') }, gearIcon())),
    demoBanner(),
    safe(supportBanner),
    mine ? null : promptCard(t),
    hero(cap, mine),
    warningCard(w, t),
    weekStrip(days, cap),
    safe(kidCard),
    safe(medsCard),
    safe(mindCard),
    quickActions(),
  ];
}

registerView('today', { tab: 'today', render: () => todayView() });
registerAction('morning', () => openMorning());
