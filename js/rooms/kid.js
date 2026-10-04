// The Kid room: the kid's window today (from how they slept), sleep sync
// ("sleep when they sleep"), the next meal not had yet with foods they like,
// pre-made ideas ranked by what has worked, and the visit plan. All the ideas
// are made ahead, on a calm day, for the moment nobody can think of one.

import {
  MEALS, SLOTS, SLOT_LABELS, SLOT_FALLBACK, RATING_FACES, faceFor, COST_LABELS, HEALTHY_LABELS,
  ENERGY, ENERGY_LABELS, WHERE_LABELS, ACTIVITY_COST_LABELS, WORKED, WORKED_LABELS, WHEN_LABELS, QUALITY_LABELS,
  nightToday, kidWindow, togetherToday, dayFor, markHad, nextMeal, foodSuggestions, foodHistory, wakeGap, activeSleep,
  timeAfter, timeBefore, sleepWords, activityStats, pickupInsight, rankActivities, moveById, planProgress,
} from '../logic/kid.js';
import {
  state, h, s, now, uid, startOfDay, dayKey, fmtTime, fmtWhen, fmtDur, commit, toast, go, render, setAccent,
  openSheet, closeSheet, registerView, backButton, demoBanner, sectionHead, chipGroup,
  kidName, KidName, afterRender,
} from '../core.js';

const MIN = 60000;
const kid = () => state.data.kid;
const foodById = (id) => kid().foods.find((f) => f.id === id);
const activityById = (id) => kid().activities.find((a) => a.id === id);
const hasName = () => Boolean(state.data.profile.kidName?.trim());
const possessive = (name) => (name === 'Your kid' || name === 'your kid' ? `${name}’s` : /s$/i.test(name) ? `${name}’` : `${name}’s`);

let sleepTimer = null;
function stopSleepTimer() {
  if (sleepTimer) clearInterval(sleepTimer);
  sleepTimer = null;
}

// Save a log entry and say so. While examples are showing, the first real entry
// clears them, so the message says that too (one toast, not two).
function logCommit(mutate, msg) {
  const wasDemo = state.data.demo;
  commit(mutate, { quiet: true });
  if (msg || wasDemo) toast(wasDemo ? `${msg ? `${msg} ` : ''}Examples cleared, this is your own data now.` : msg);
}

// Move focus to something after the next render (render() rebuilds the page).
function focusAfterRender(selector) {
  state.ui.kidFocus = selector;
}
function applyPendingFocus() {
  const sel = state.ui.kidFocus;
  if (!sel) return;
  state.ui.kidFocus = null;
  afterRender(() => document.querySelector(sel)?.focus());
}

// ---------- small pieces ----------
// A face for a 1–5 rating. Always shown next to its label, never alone.
function face(score, size = 28) {
  const m = RATING_FACES[score]?.mouth ?? 0;
  const y = 15.6 - m * 0.6;
  const c = 15.6 + m * 4.6;
  return s('svg', { viewBox: '0 0 24 24', width: String(size), height: String(size), class: `kid-face kid-face-${score || 0}`, 'aria-hidden': 'true', focusable: 'false' },
    s('circle', { cx: '12', cy: '12', r: '10.4', class: 'kid-face-ring' }),
    s('circle', { cx: '8.6', cy: '9.6', r: '1.35', class: 'kid-face-eye' }),
    s('circle', { cx: '15.4', cy: '9.6', r: '1.35', class: 'kid-face-eye' }),
    s('path', { d: `M 7.6 ${y.toFixed(2)} Q 12 ${c.toFixed(2)} 16.4 ${y.toFixed(2)}`, class: 'kid-face-mouth' }));
}

function costTag(cost, labels = COST_LABELS, glyph = '$') {
  const c = Math.min(3, Math.max(1, Number(cost) || 1));
  if (labels === ACTIVITY_COST_LABELS) return h('span', { class: 'kid-cost words', text: labels[c] });
  return h('span', { class: 'kid-cost', title: labels[c] },
    h('span', { 'aria-hidden': 'true' }, glyph.repeat(c), h('span', { class: 'kid-cost-off', text: glyph.repeat(3 - c) })),
    h('span', { class: 'visually-hidden', text: labels[c] }));
}

function healthyTag(n) {
  const v = Math.min(3, Math.max(1, Number(n) || 1));
  return h('span', { class: 'kid-dots', title: HEALTHY_LABELS[v] },
    h('span', { 'aria-hidden': 'true', class: 'kid-dots-row' }, [1, 2, 3].map((i) => h('i', { class: i <= v ? 'on' : '' }))),
    h('span', { class: 'visually-hidden', text: HEALTHY_LABELS[v] }));
}

function ratingTag(f) {
  if (!f.count) return h('span', { class: 'kid-rate none', text: 'Not rated yet' });
  const sc = faceFor(f.avg);
  return h('span', { class: 'kid-rate' }, face(sc, 20), h('span', { text: RATING_FACES[sc].label }), h('span', { class: 'kid-rate-n', text: `· ${f.count}` }));
}

function foodMeta(f) {
  return h('span', { class: 'kid-meta' }, costTag(f.cost), healthyTag(f.healthy), ratingTag(f));
}

function activityMeta(a) {
  return h('span', { class: 'kid-meta' },
    h('span', { class: `kid-energy e-${a.energy}`, text: ENERGY_LABELS[a.energy] || 'Any energy' }),
    h('span', { text: WHERE_LABELS[a.where] || '' }),
    costTag(a.cost, ACTIVITY_COST_LABELS));
}

// Single-select row of buttons (radio semantics). Returns { node, get }.
function pickRow(name, options, value, { cols = options.length, onChange = null } = {}) {
  let current = value;
  const row = h('div', { class: `kid-pick cols-${cols}`, role: 'radiogroup', 'aria-labelledby': `${name}-l` });
  const draw = () => row.replaceChildren(...options.map(([v, label, sub]) => h('button', {
    class: 'choice', type: 'button', role: 'radio', 'aria-checked': String(current === v),
    onclick: () => { current = v; draw(); row.querySelector('[aria-checked="true"]')?.focus(); onChange?.(v); },
  }, label, sub ? h('span', { text: sub }) : null)));
  draw();
  // Arrow keys move the choice, like native radio buttons.
  row.addEventListener('keydown', (e) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    const i = options.findIndex(([v]) => v === current);
    const next = options[(Math.max(0, i) + step + options.length) % options.length][0];
    current = next;
    draw();
    row.querySelector('[aria-checked="true"]')?.focus();
    onChange?.(next);
  });
  return { node: row, get: () => current };
}

function field(id, label, control, hint = null) {
  return h('div', { class: 'field' }, h('span', { class: 'lbl', id: `${id}-l`, text: label }), control, hint ? h('span', { class: 'fine', text: hint }) : null);
}

// ---------- window today ----------
const GUIDE = {
  bad: {
    title: 'Narrow window today.',
    lead: (n) => `${possessive(n)} brain is running on less sleep, so big feelings come faster.`,
    tips: ['Lower the demands', 'Food first', 'Offer two choices', 'Stay close to home', 'Screens are okay'],
    close: 'It’s not defiance, it’s capacity.',
  },
  ok: {
    title: 'Ordinary window.',
    lead: () => 'Plan as usual. Keep meals on time and one quiet option ready for when energy drops.',
    tips: ['Outing early', 'Meals on time', 'A quiet option ready'],
    close: null,
  },
  good: {
    title: 'Good window. Do the big outing early.',
    lead: (n) => `${n} has a full tank today. Spend it outside first, straight after pickup, while energy is high.`,
    tips: ['Big outing first', 'Snack in the bag', 'Quiet time after'],
    close: null,
  },
};

function windowCard(night, win) {
  const name = KidName();
  const editing = !night || state.ui.kidNightEdit;
  const head = h('span', { class: 'eyebrow', id: 'kid-win-h', text: `${possessive(name)} window today` });

  if (!editing) {
    const g = GUIDE[night.quality] || GUIDE.ok;
    return h('section', { class: `card kid-window kid-z-${win.zone}`, 'aria-labelledby': 'kid-win-h' },
      head,
      h('p', { class: 'kid-zone' }, h('span', { class: 'kid-zone-dot', 'aria-hidden': 'true' }), win.label,
        h('span', { class: 'kid-zone-sub', text: `· ${QUALITY_LABELS[night.quality] || 'OK'} night${night.hours ? `, ${night.hours}h` : ''}` })),
      h('h2', { class: 'kid-window-title', text: g.title }),
      h('p', { class: 'kid-window-lead', text: g.lead(name) }),
      h('ul', { class: 'kid-tips', 'aria-label': 'For today' }, g.tips.map((tip) => h('li', { text: tip }))),
      g.close ? h('p', { class: 'kid-window-close', text: g.close }) : null,
      night.quality === 'bad' ? h('button', { class: 'btn ghost', type: 'button', onclick: () => go('kid-plan') }, 'Open Plan B') : null,
      h('p', { class: 'fine kid-logged' }, `Logged ${fmtTime(night.ts)}. `,
        h('button', { class: 'text-btn', type: 'button', 'data-kid-night-change': '', onclick: () => {
          state.ui.kidNightEdit = true;
          state.ui.kidNightDraft = { quality: night.quality, hours: night.hours ?? '' };
          focusAfterRender('#kid-night-q [aria-checked="true"]');
          render();
        } }, 'Change')));
  }

  const draft = state.ui.kidNightDraft || (state.ui.kidNightDraft = { quality: null, hours: '' });
  const save = h('button', { class: 'btn block', type: 'button', disabled: !draft.quality }, 'Save');
  const pick = pickRow('kid-night-q', [['good', 'Good', 'Slept well'], ['ok', 'OK', 'A few wake-ups'], ['bad', 'Rough', 'Little sleep']], draft.quality, {
    onChange: (v) => { draft.quality = v; save.disabled = false; },
  });
  pick.node.id = 'kid-night-q';
  const hours = h('input', { type: 'number', id: 'kid-night-hours', min: '1', max: '16', step: '0.5', inputmode: 'decimal', placeholder: 'e.g. 9.5', value: draft.hours === '' ? '' : String(draft.hours) });
  hours.addEventListener('input', () => { draft.hours = hours.value; });
  save.addEventListener('click', () => {
    if (!draft.quality) return;
    const hv = Number(hours.value);
    const quality = draft.quality;
    state.ui.kidNightEdit = false;
    state.ui.kidNightDraft = null;
    focusAfterRender('[data-kid-night-change]');
    commit((d) => {
      const t = now();
      const start = startOfDay(t);
      d.kid.nights = d.kid.nights.filter((n) => !(n.ts >= start && n.ts <= t));
      const n = { id: uid(), ts: t, quality };
      if (hours.value !== '' && Number.isFinite(hv) && hv > 0 && hv <= 16) n.hours = Math.round(hv * 2) / 2;
      d.kid.nights.push(n);
    });
  });

  return h('section', { class: 'card kid-window kid-ask', 'aria-labelledby': 'kid-win-h' },
    head,
    h('h2', { class: 'prompt-q', id: 'kid-night-q-l', text: `How did ${kidName()} sleep last night?` }),
    pick.node,
    h('label', { class: 'field', for: 'kid-night-hours' }, h('span', { class: 'lbl' }, 'Hours', h('span', { class: 'kid-opt', text: ' (optional)' })), hours),
    save,
    night ? h('button', { class: 'text-btn', type: 'button', onclick: () => { state.ui.kidNightEdit = false; state.ui.kidNightDraft = null; render(); } }, 'Cancel') : null);
}

// ---------- sleep sync ----------
function moon() {
  return s('svg', { viewBox: '0 0 32 32', width: '30', height: '30', class: 'kid-moon', 'aria-hidden': 'true', focusable: 'false' },
    s('path', { d: 'M21.5 4.5a11.5 11.5 0 1 0 6 20.6A12.5 12.5 0 0 1 21.5 4.5Z' }),
    s('circle', { cx: '25', cy: '8', r: '1.1', class: 'kid-star' }),
    s('circle', { cx: '29', cy: '14', r: '0.8', class: 'kid-star' }));
}

function nudgeText(remaining) {
  if (remaining <= 0) return `Past the usual wake time. If ${kidName()} is still asleep, lie down now. Any sleep you get counts.`;
  const w = sleepWords(remaining);
  return `Go to sleep now. Lights out for you too. ${w ? `Even ${w} now beats waiting up.` : 'Even a short rest now beats waiting up.'}`;
}

function gapLine(gap) {
  return gap.isDefault
    ? `Starting from what you noticed: about ${fmtDur(gap.median * MIN)}. It learns from each night you log.`
    : `Learned from ${gap.count} ${gap.count === 1 ? 'night' : 'nights'}.`;
}

function sleepCard(sleep) {
  const name = KidName();
  const gap = wakeGap(kid().sleeps);
  const gapText = fmtDur(Math.round(gap.median / 5) * 5 * MIN);

  if (!sleep) {
    return h('section', { class: 'kid-night', 'aria-labelledby': 'kid-sleep-h' },
      h('div', { class: 'kid-night-head' }, moon(), h('span', { class: 'kid-night-eyebrow', text: 'Sleep sync' })),
      h('h2', { class: 'kid-night-title', id: 'kid-sleep-h', text: `Sleep when ${kidName()} sleeps` }),
      h('p', { class: 'kid-night-p', text: `${name} usually wakes after about ${gapText}. Tap the moment ${kidName()} falls asleep, then go to sleep too and get those hours.` }),
      h('button', { class: 'kid-asleep-btn', type: 'button', 'data-kid-asleep': '', onclick: () => {
        focusAfterRender('[data-kid-woke]');
        logCommit((d) => { d.kid.sleeps.push({ id: uid(), asleepTs: now(), wokeTs: null }); }, 'Sleep sync on. Lights out for you too.');
      } }, `${name} is asleep`),
      h('p', { class: 'kid-night-fine', text: gapLine(gap) }));
  }

  const expected = sleep.asleepTs + gap.median * MIN;
  const countdown = h('span', { class: 'kid-countdown' });
  const nudge = h('p', { class: 'kid-nudge' });
  const update = () => {
    const rem = expected - now();
    const c = rem > 0 ? `in ${fmtDur(rem)}` : `${fmtDur(-rem)} past the usual time`;
    if (countdown.textContent !== c) countdown.textContent = c;
    const text = nudgeText(rem);
    if (nudge.textContent !== text) nudge.textContent = text;
  };
  update();
  afterRender(() => {
    stopSleepTimer();
    sleepTimer = setInterval(() => {
      if (!countdown.isConnected) { stopSleepTimer(); return; }
      update();
    }, 30000);
  });

  const confirming = state.ui.kidSleepCancel === sleep.id;
  const asleepIn = h('input', { type: 'time', id: 'kid-asleep-at', value: hhmm(sleep.asleepTs) });
  const wokeIn = h('input', { type: 'time', id: 'kid-woke-at', value: hhmm(Math.min(expected, now())) });
  const fixTimes = () => {
    const t = now();
    const a = timeBefore(t, asleepIn.value);
    if (a == null || t - a > 14 * 60 * MIN) { toast('Pick a fall-asleep time from the last 14 hours.'); asleepIn.focus(); return; }
    let w = null;
    if (wokeIn.value && wokeIn.dataset.touched) {
      w = timeAfter(a, wokeIn.value, t);
      if (w == null) { toast('That wake time hasn’t happened yet.'); wokeIn.focus(); return; }
    }
    focusAfterRender(w ? '[data-kid-asleep]' : '[data-kid-woke]');
    commit((d) => { const x = d.kid.sleeps.find((y) => y.id === sleep.id); if (x) { x.asleepTs = a; if (w) x.wokeTs = w; } });
    toast(w ? `Saved. ${fmtDur(w - a)} from asleep to awake.` : 'Time fixed');
  };
  wokeIn.addEventListener('input', () => { wokeIn.dataset.touched = '1'; });

  return h('section', { class: 'kid-night on', 'aria-labelledby': 'kid-sleep-h' },
    h('div', { class: 'kid-night-head' }, moon(), h('span', { class: 'kid-night-eyebrow', text: 'Sleep sync · on' })),
    h('h2', { class: 'kid-night-title', id: 'kid-sleep-h', text: `${name} asleep since ${fmtTime(sleep.asleepTs)}` }),
    h('div', { class: 'kid-wake' },
      h('span', { class: 'kid-night-fine', text: `Usually wakes after about ${gapText}` }),
      h('span', { class: 'kid-wake-time', text: fmtTime(expected) }),
      h('span', { class: 'kid-wake-sub', role: 'status', 'aria-live': 'polite' }, 'Likely first wake, ', countdown)),
    nudge,
    h('button', { class: 'kid-asleep-btn', type: 'button', 'data-kid-woke': '', onclick: () => {
      const t = now();
      focusAfterRender('[data-kid-asleep]');
      logCommit((d) => { const x = d.kid.sleeps.find((y) => y.id === sleep.id); if (x) x.wokeTs = t; }, `Logged. ${fmtDur(t - sleep.asleepTs)} from asleep to awake.`);
    } }, `${name} woke up`),
    h('details', { class: 'kid-fix' },
      h('summary', {}, 'Times not right?'),
      h('div', { class: 'kid-fix-body' },
        h('label', { class: 'field', for: 'kid-asleep-at' }, h('span', { class: 'lbl', text: 'Fell asleep at' }), asleepIn),
        h('label', { class: 'field', for: 'kid-woke-at' }, h('span', { class: 'lbl', text: 'Woke at' }), wokeIn, h('span', { class: 'kid-night-fine', text: 'Only saved if you change it.' })),
        h('button', { class: 'btn ghost', type: 'button', onclick: fixTimes }, 'Save times'))),
    confirming
      ? h('div', { class: 'kid-night-confirm', role: 'group', 'aria-label': 'Confirm remove' },
        h('span', { text: 'Remove this sleep? Use this if it was a false start.' }),
        h('div', { class: 'btn-row' },
          h('button', { class: 'btn danger', type: 'button', 'data-kid-sleep-confirm': '', onclick: () => {
            state.ui.kidSleepCancel = null;
            focusAfterRender('[data-kid-asleep]');
            commit((d) => { d.kid.sleeps = d.kid.sleeps.filter((x) => x.id !== sleep.id); }, { keepDemo: true });
            toast('Removed');
          } }, 'Remove'),
          h('button', { class: 'btn ghost', type: 'button', onclick: () => { state.ui.kidSleepCancel = null; focusAfterRender('[data-kid-sleep-cancel]'); render(); } }, 'Keep it')))
      : h('button', { class: 'text-btn kid-night-link', type: 'button', 'data-kid-sleep-cancel': '', onclick: () => { state.ui.kidSleepCancel = sleep.id; focusAfterRender('[data-kid-sleep-confirm]'); render(); } }, 'Not asleep after all'),
    h('p', { class: 'kid-night-fine', text: gapLine(gap) }));
}

function hhmm(ts) {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// ---------- meals ----------
function setHad(slot, on, msg = null) {
  const date = dayKey(now());
  logCommit((d) => { d.kid.day = markHad(d.kid.day, date, slot, on); }, msg);
}

function suggestionRow(f, slot) {
  return h('li', { class: 'kid-food' },
    h('span', { class: 'kid-food-main' },
      h('span', { class: 'kid-food-name', text: f.name }),
      foodMeta(f)),
    h('button', { class: 'kid-serve', type: 'button', 'aria-label': `Serve ${f.name}`, onclick: () => openServe(f.id, slot) }, 'Serve'));
}

function mealsCard() {
  const t = now();
  const date = dayKey(t);
  const day = dayFor(kid().day, date);
  const next = nextMeal(kid().day, date);
  const slot = next || 'snack';
  const all = foodSuggestions(kid().foods, kid().ratings, slot);
  const top = all.slice(0, 4);
  const anyRated = top.some((f) => f.count);

  const track = h('div', { class: 'kid-track', role: 'group', 'aria-label': 'Meals today. Tap to tick or untick.' },
    MEALS.map((m) => h('button', {
      class: `kid-track-btn${m === next ? ' is-next' : ''}`, type: 'button', 'aria-pressed': String(day.had[m]), 'data-kid-had': m,
      onclick: () => { focusAfterRender(`[data-kid-had="${m}"]`); setHad(m, !day.had[m]); },
    }, h('span', { class: 'kid-track-tick', 'aria-hidden': 'true', text: day.had[m] ? '✓' : '' }), SLOT_LABELS[m])));

  return h('section', { class: 'card kid-meals', 'aria-labelledby': 'kid-meal-h' },
    h('span', { class: 'eyebrow', text: 'Meals today' }),
    next
      ? h('h2', { class: 'kid-next', id: 'kid-meal-h', tabindex: '-1' }, h('span', { class: 'kid-next-k', text: 'Next meal' }), h('span', { class: 'kid-next-v', text: SLOT_LABELS[next] }))
      : h('h2', { class: 'kid-next', id: 'kid-meal-h', tabindex: '-1' }, h('span', { class: 'kid-next-k', text: 'All three meals done' }), h('span', { class: 'kid-next-v', text: 'Snacks' })),
    next
      ? h('p', { class: 'kid-rule', text: `${SLOT_LABELS[next]} is ${next} — even at ${next === 'breakfast' ? 'lunchtime' : next === 'lunch' ? 'dinnertime' : 'bedtime'} if it hasn’t happened yet.` })
      : h('p', { class: 'kid-rule', text: `Snack ideas, if ${kidName()} is hungry.` }),
    track,
    top.length
      ? [
        h('p', { class: 'kid-sub', text: anyRated ? `Best bets for ${slot}` : `Cheap, healthy ${slot} ideas. Ratings will sort them.` }),
        h('ul', { class: 'list kid-foods' }, top.map((f) => suggestionRow(f, slot))),
      ]
      : h('p', { class: 'kid-fallback' }, `No ${slot} foods in the list yet. ${SLOT_FALLBACK[slot]} `,
        h('button', { class: 'text-btn', type: 'button', onclick: () => openFoodForm(null, slot) }, `Add a ${slot} food`)),
    h('div', { class: 'kid-meal-actions' },
      next ? h('button', { class: 'btn ghost', type: 'button', onclick: () => { focusAfterRender('#kid-meal-h'); setHad(next, true, `${SLOT_LABELS[next]} done.`); } }, `Mark ${next} done`) : null,
      all.length > top.length ? h('button', { class: 'text-btn', type: 'button', onclick: () => go('kid-foods') }, `All ${all.length} ${slot} foods`) : null));
}

// The rating sheet: "How much did {Name} like it?" Tapping a face saves.
function openServe(foodId, slot) {
  const f = foodById(foodId);
  if (!f) return;
  const date = dayKey(now());
  const slots = SLOTS.filter((x) => (f.slots || []).includes(x) || x === slot);
  let current = slot;
  const slotRow = pickRow('kid-serve-slot', slots.map((x) => [x, SLOT_LABELS[x]]), current, { cols: Math.min(4, slots.length), onChange: (v) => { current = v; } });
  const save = (score) => {
    const chosen = current;
    closeSheet();
    focusAfterRender('#kid-meal-h');
    logCommit((d) => {
      d.kid.ratings.push({ id: uid(), ts: now(), foodId, slot: chosen, score });
      if (MEALS.includes(chosen)) d.kid.day = markHad(d.kid.day, date, chosen, true);
    }, MEALS.includes(chosen) ? `${RATING_FACES[score].label}. ${SLOT_LABELS[chosen]} done.` : `${RATING_FACES[score].label}. Saved.`);
  };
  const faces = h('div', { class: 'kid-faces', role: 'group', 'aria-label': `How much did ${kidName()} like it?` },
    [1, 2, 3, 4, 5].map((sc) => h('button', { class: 'kid-face-btn', type: 'button', onclick: () => save(sc) },
      face(sc, 40), h('span', { text: RATING_FACES[sc].label }))));
  openSheet(`How much did ${kidName()} like it?`, h('div', { class: 'kid-sheet' },
    h('p', { class: 'kid-sheet-food', text: f.name }),
    slots.length > 1 ? field('kid-serve-slot', 'Counts as', slotRow.node) : null,
    faces,
    h('p', { class: 'fine', text: 'Tap a face to save. It ticks off the meal and helps sort the list next time.' }),
    h('button', { class: 'btn ghost block', type: 'button', onclick: () => {
      const chosen = current;
      closeSheet();
      focusAfterRender('#kid-meal-h');
      if (MEALS.includes(chosen)) setHad(chosen, true, `${SLOT_LABELS[chosen]} done. No rating.`);
    } }, MEALS.includes(slot) ? `Skip rating, just mark ${slot} done` : 'Skip rating')));
}

// ---------- ideas ----------
function insightCard(ins) {
  if (!ins) return null;
  const bar = (label, part) => h('div', { class: 'kid-bar-row' },
    h('span', { class: 'kid-bar-k', text: label }),
    h('span', { class: 'kid-bar', 'aria-hidden': 'true' }, h('span', { style: `width:${part.n ? Math.round((part.yes / part.n) * 100) : 0}%` })),
    h('span', { class: 'kid-bar-v', text: part.n ? `${part.yes} of ${part.n}` : '–' }));
  const verdict = {
    pickup: 'Going straight out after pickup is working. Keep it first in the plan.',
    later: 'Later outings are going better so far. Worth a look at what is different.',
    same: 'About the same either way so far.',
  }[ins.verdict];
  return h('div', { class: 'kid-insight' },
    h('p', { class: 'kid-insight-text', text: ins.text }),
    h('div', { class: 'kid-bars', role: 'img', 'aria-label': `Worked: straight after pickup ${ins.pickup.yes} of ${ins.pickup.n}, later ${ins.later.yes} of ${ins.later.n}` },
      bar('After pickup', ins.pickup), bar('Later', ins.later)),
    verdict ? h('p', { class: 'fine', text: verdict }) : null);
}

// "Worked 2 of 3" when it has worked, otherwise "Tried once: so-so".
const LAST_WORDS = { yes: 'worked', meh: 'so-so', no: 'didn’t work' };
function triedText(st) {
  if (!st?.n) return null;
  if (st.yes) return `Worked ${st.yes} of ${st.n}`;
  return `${st.n === 1 ? 'Tried once' : `Tried ${st.n} times`}: ${LAST_WORDS[st.last] || 'logged'}`;
}

function ideaRow(a, stat) {
  const badge = stat && stat.pickup.yes ? `Worked ${stat.pickup.yes} of ${stat.pickup.n} straight after pickup` : triedText(stat);
  return h('li', { class: 'kid-idea' },
    h('div', { class: 'kid-idea-main' },
      h('span', { class: 'kid-idea-name', text: a.name }),
      activityMeta(a),
      a.notes ? h('span', { class: 'kid-idea-note', text: a.notes }) : null,
      badge ? h('span', { class: `kid-badge${stat.yes ? '' : ' flat'}`, text: badge }) : null),
    h('button', { class: 'kid-did', type: 'button', 'aria-label': `We did this: ${a.name}`, onclick: () => openTry(a.id) }, 'We did this'));
}

function ideasSection(night) {
  const q = night?.quality || null;
  const ranked = rankActivities(kid().activities, kid().tries, { quality: q }).slice(0, 4);
  const stats = activityStats(kid().tries, kid().activities);
  const byId = new Map(stats.byActivity.map((x) => [x.id, x]));
  const aside = q === 'bad' ? 'Low energy first' : q === 'good' ? 'Big outing first' : 'What’s worked first';
  return h('section', { class: 'section', 'aria-labelledby': 'kid-ideas-h' },
    sectionHead('Ideas for today', aside, 'kid-ideas-h'),
    insightCard(pickupInsight(stats)),
    ranked.length
      ? h('ul', { class: 'list kid-ideas' }, ranked.map((a) => ideaRow(a, byId.get(a.id))))
      : h('p', { class: 'empty', text: 'No ideas in the list yet. Add a few on a calm day.' }),
    h('button', { class: 'text-btn kid-more', type: 'button', onclick: () => go('kid-activities') }, `All ${kid().activities.length} activities`));
}

// "We did this": did it work, and when?
function openTry(activityId) {
  const a = activityById(activityId);
  if (!a) return;
  const save = h('button', { class: 'btn block', type: 'button', disabled: true }, 'Save');
  let worked = null;
  let when = null;
  const ready = () => { save.disabled = !(worked && when); };
  const workedRow = pickRow('kid-try-worked', WORKED.map((w) => [w, WORKED_LABELS[w]]), null, { onChange: (v) => { worked = v; ready(); } });
  const whenRow = pickRow('kid-try-when', [['pickup', WHEN_LABELS.pickup], ['later', 'Later in the day']], null, { onChange: (v) => { when = v; ready(); } });
  save.addEventListener('click', () => {
    if (!(worked && when)) return;
    closeSheet();
    focusAfterRender('#kid-ideas-h');
    logCommit((d) => { d.kid.tries.push({ id: uid(), ts: now(), activityId, worked, when }); }, worked === 'yes' ? 'Logged. That one goes up the list.' : 'Logged. Good to know.');
  });
  openSheet('How did it go?', h('div', { class: 'kid-sheet' },
    h('p', { class: 'kid-sheet-food', text: a.name }),
    field('kid-try-worked', 'Did it work?', workedRow.node),
    field('kid-try-when', 'When?', whenRow.node),
    save));
}

// ---------- screens ----------
function youtubeCard() {
  const n = kidName();
  const tips = [
    ['First, then.', `“One more video, then scooters.” Say it before the video starts, not when it ends.`],
    ['A timer you can both see.', 'The timer ends it, not you.'],
    ['Watch one together.', 'Ask about it. What was the best bit? What would you change?'],
    ['Act it out outside.', `Be the characters, build the thing, or film your own with ${n}.`],
  ];
  return h('section', { class: 'card kid-yt', 'aria-labelledby': 'kid-yt-h' },
    h('h2', { class: 'eyebrow', id: 'kid-yt-h', text: 'When it’s only YouTube' }),
    h('ol', { class: 'kid-yt-list' }, tips.map(([b, rest]) => h('li', {}, h('strong', { text: b }), ' ', rest))),
    h('p', { class: 'kid-yt-close', text: 'On a low-sleep day, screens are rest, not failure.' }));
}

// ---------- links ----------
function linksSection() {
  const prog = planProgress(kid().plan.main);
  const rated = new Set(kid().ratings.map((r) => r.foodId)).size;
  const tile = (route, title, sub) => h('button', { class: 'kid-tile', type: 'button', onclick: () => go(route) }, h('strong', { text: title }), h('span', { text: sub }));
  return h('nav', { class: 'kid-tiles', 'aria-label': 'Plan and libraries' },
    tile('kid-plan', 'Visit plan', prog.total ? (prog.next ? `${prog.done} of ${prog.total} ticked. Next: ${prog.next.text}` : 'All ticked. Nice work.') : 'Make a plan on a calm day'),
    tile('kid-foods', 'Foods', `${kid().foods.length} foods, ${rated} rated`),
    tile('kid-activities', 'Activities', `${kid().activities.length} ideas, ${kid().tries.length} logged`));
}

// ---------- the Kid screen ----------
function nameHint() {
  if (hasName()) return null;
  return h('div', { class: 'banner' },
    h('span', { text: 'Add their name in Settings and this page will use it.' }),
    h('button', { class: 'text-btn', type: 'button', onclick: () => go('settings') }, 'Settings'));
}

function kidView() {
  stopSleepTimer();
  applyPendingFocus();
  const t = now();
  const night = nightToday(kid().nights, t);
  const win = kidWindow(night?.quality);
  setAccent(win.zone);
  const sleep = activeSleep(kid().sleeps, t);
  const hr = new Date(t).getHours();
  const evening = hr >= 17 || hr < 5;

  return [
    h('header', { class: 'topbar' },
      h('span', { class: 'eyebrow', text: 'Time together' }),
      h('button', { class: 'text-btn kid-top-link', type: 'button', onclick: () => go('kid-plan') }, 'Visit plan')),
    h('h1', { class: 'page-title', text: KidName() }),
    nameHint(),
    demoBanner(),
    sleep ? sleepCard(sleep) : null,
    windowCard(night, win),
    !sleep && evening ? sleepCard(null) : null,
    mealsCard(),
    ideasSection(night),
    !sleep && !evening ? sleepCard(null) : null,
    youtubeCard(),
    linksSection(),
  ];
}

// ---------- Today card ----------
export function kidCard() {
  const t = now();
  const night = nightToday(kid().nights, t);
  const win = kidWindow(night?.quality);
  const sleep = activeSleep(kid().sleeps, t);
  const head = h('span', { class: 'kid-card-head' },
    h('span', { class: 'eyebrow', text: `${KidName()} · today` }),
    h('span', { class: 'kid-card-go', 'aria-hidden': 'true', text: 'Open ›' }));

  // On days apart, a quiet card: no meals, no questions.
  if (!togetherToday(kid(), t)) {
    const prog = planProgress(kid().plan.main);
    return h('button', { class: 'card kid-card kid-card-quiet', type: 'button', onclick: () => go('kid') }, head,
      h('span', { class: 'kid-card-meal', text: `Together today? Log how ${kidName()} slept to see today’s window.` }),
      prog.total ? h('span', { class: 'fine', text: `Visit plan ready: ${prog.total} steps, made on a calm day.` }) : null);
  }

  const next = nextMeal(kid().day, dayKey(t));
  const topFood = foodSuggestions(kid().foods, kid().ratings, next || 'snack')[0];
  const gap = wakeGap(kid().sleeps);
  return h('button', { class: `card kid-card kid-z-${win.zone}`, type: 'button', onclick: () => go('kid') },
    head,
    sleep
      ? h('span', { class: 'kid-card-sleep' },
        h('strong', { text: `Asleep since ${fmtTime(sleep.asleepTs)}.` }),
        ` Likely first wake about ${fmtTime(sleep.asleepTs + gap.median * MIN)}. Sleep now too.`)
      : null,
    h('span', { class: 'kid-card-zone' },
      h('span', { class: 'kid-zone-dot', 'aria-hidden': 'true' }),
      night ? h('span', {}, h('strong', { text: win.label }), ` · ${QUALITY_LABELS[night.quality] || 'OK'} night`) : h('span', { text: `How did ${kidName()} sleep? Tap to log.` })),
    h('span', { class: 'kid-card-meal' },
      h('strong', { text: next ? `Next meal: ${SLOT_LABELS[next]}` : 'All meals done' }),
      topFood ? `. ${next ? 'Top pick' : 'Snack idea'}: ${topFood.name}` : '.'));
}

// ---------- visit plan ----------
const LIST_LABELS = { main: 'The plan', planB: 'Plan B' };

function stepRef(st) {
  if (!st.refId) return null;
  const a = activityById(st.refId);
  if (a) return h('span', { class: 'kid-step-ref', text: `Idea · ${ENERGY_LABELS[a.energy] || ''} · ${WHERE_LABELS[a.where] || ''}` });
  const f = foodById(st.refId);
  if (f) return h('span', { class: 'kid-step-ref', text: `Food · ${(f.slots || []).map((x) => SLOT_LABELS[x]).join(', ')}` });
  return null;
}

function stepItem(st, i, list, listKey) {
  const editing = state.ui.kidStepEdit === st.id;
  const confirming = state.ui.kidStepDel === st.id;
  const total = list.length;

  if (editing) {
    const id = `kid-step-edit-${st.id}`;
    const input = h('input', { type: 'text', id, maxlength: '140', value: st.text, 'data-kid-edit': st.id });
    const save = () => {
      const v = input.value.trim();
      if (!v) { toast('Write something, or delete the step instead.'); input.focus(); return; }
      state.ui.kidStepEdit = null;
      focusAfterRender(`[data-kid-step-edit="${st.id}"]`);
      commit((d) => { const x = d.kid.plan[listKey].find((y) => y.id === st.id); if (x) x.text = v; }, { keepDemo: true });
      toast('Step saved');
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } });
    return h('li', { class: 'kid-step editing' },
      h('label', { class: 'visually-hidden', for: id }, 'Edit step'),
      input,
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn', type: 'button', onclick: save }, 'Save'),
        h('button', { class: 'btn ghost', type: 'button', onclick: () => { state.ui.kidStepEdit = null; focusAfterRender(`[data-kid-step-edit="${st.id}"]`); render(); } }, 'Cancel')));
  }

  const checkId = `kid-check-${st.id}`;
  return h('li', { class: `kid-step${st.done ? ' done' : ''}` },
    h('label', { class: 'kid-check', for: checkId },
      h('input', { type: 'checkbox', id: checkId, checked: st.done, 'data-kid-check': st.id, onchange: () => {
        focusAfterRender(`[data-kid-check="${st.id}"]`);
        commit((d) => { const x = d.kid.plan[listKey].find((y) => y.id === st.id); if (x) x.done = !x.done; }, { keepDemo: true });
      } }),
      h('span', { class: 'kid-step-num', 'aria-hidden': 'true', text: String(i + 1) }),
      h('span', { class: 'kid-step-text' }, h('span', { text: st.text }), stepRef(st))),
    !state.ui.kidPlanEdit ? null : confirming
      ? h('div', { class: 'banner kid-confirm', role: 'group', 'aria-label': 'Confirm delete' },
        h('span', { text: 'Delete this step?' }),
        h('div', { class: 'btn-row' },
          h('button', { class: 'btn danger', type: 'button', 'data-kid-step-confirm': st.id, onclick: () => {
            state.ui.kidStepDel = null;
            focusAfterRender('#kid-add-text');
            commit((d) => { d.kid.plan[listKey] = d.kid.plan[listKey].filter((x) => x.id !== st.id); }, { keepDemo: true });
            toast('Step deleted');
          } }, 'Delete'),
          h('button', { class: 'btn ghost', type: 'button', onclick: () => { state.ui.kidStepDel = null; focusAfterRender(`[data-kid-step-del="${st.id}"]`); render(); } }, 'Cancel')))
      : h('div', { class: 'kid-tools' },
        h('button', { class: 'kid-tool', type: 'button', 'aria-label': `Move up: ${st.text}`, disabled: i === 0, 'data-kid-up': st.id,
          onclick: () => { focusAfterRender(i - 1 === 0 ? `[data-kid-down="${st.id}"]` : `[data-kid-up="${st.id}"]`); commit((d) => { d.kid.plan[listKey] = moveById(d.kid.plan[listKey], st.id, -1); }, { keepDemo: true }); } }, '↑'),
        h('button', { class: 'kid-tool', type: 'button', 'aria-label': `Move down: ${st.text}`, disabled: i === total - 1, 'data-kid-down': st.id,
          onclick: () => { focusAfterRender(i + 1 === total - 1 ? `[data-kid-up="${st.id}"]` : `[data-kid-down="${st.id}"]`); commit((d) => { d.kid.plan[listKey] = moveById(d.kid.plan[listKey], st.id, 1); }, { keepDemo: true }); } }, '↓'),
        h('span', { class: 'kid-tool-gap' }),
        h('button', { class: 'kid-tool text', type: 'button', 'data-kid-step-edit': st.id, 'aria-label': `Edit: ${st.text}`,
          onclick: () => { state.ui.kidStepEdit = st.id; state.ui.kidStepDel = null; focusAfterRender(`[data-kid-edit="${st.id}"]`); render(); } }, 'Edit'),
        h('button', { class: 'kid-tool text danger', type: 'button', 'data-kid-step-del': st.id, 'aria-label': `Delete: ${st.text}`,
          onclick: () => { state.ui.kidStepDel = st.id; state.ui.kidStepEdit = null; focusAfterRender(`[data-kid-step-confirm="${st.id}"]`); render(); } }, 'Delete')));
}

function addStepCard() {
  const draft = state.ui.kidAdd || (state.ui.kidAdd = { text: '', refId: null, list: 'main' });
  const input = h('input', { type: 'text', id: 'kid-add-text', maxlength: '140', placeholder: 'e.g. Library on the way home', value: draft.text });
  input.addEventListener('input', () => { draft.text = input.value; });
  const select = h('select', { id: 'kid-add-pick' },
    h('option', { value: '' }, 'Choose one…'),
    h('optgroup', { label: 'Activities' }, kid().activities.map((a) => h('option', { value: a.id, selected: draft.refId === a.id }, a.name))),
    h('optgroup', { label: 'Foods' }, kid().foods.map((f) => h('option', { value: f.id, selected: draft.refId === f.id }, f.name))));
  select.addEventListener('change', () => {
    const ref = activityById(select.value) || foodById(select.value);
    draft.refId = ref ? ref.id : null;
    if (ref) { input.value = ref.name; draft.text = ref.name; }
  });
  const listRow = pickRow('kid-add-list', [['main', 'The plan'], ['planB', 'Plan B']], draft.list, { onChange: (v) => { draft.list = v; } });
  const add = () => {
    const v = input.value.trim();
    if (!v) { toast('Write a step, or pick one from your ideas.'); input.focus(); return; }
    const ref = draft.refId && (activityById(draft.refId) || foodById(draft.refId)) ? draft.refId : null;
    const listKey = draft.list === 'planB' ? 'planB' : 'main';
    state.ui.kidAdd = { text: '', refId: null, list: listKey };
    focusAfterRender('#kid-add-text');
    commit((d) => {
      const st = { id: `p-${uid()}`, text: v, done: false };
      if (ref) st.refId = ref;
      d.kid.plan[listKey].push(st);
    }, { keepDemo: true });
    toast(`Added to ${LIST_LABELS[listKey]}`);
  };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
  return h('section', { class: 'card', 'aria-labelledby': 'kid-add-h' },
    h('h2', { class: 'eyebrow', id: 'kid-add-h', text: 'Add a step' }),
    h('label', { class: 'field', for: 'kid-add-text' }, h('span', { class: 'lbl', text: 'Step' }), input),
    h('label', { class: 'field', for: 'kid-add-pick' }, h('span', { class: 'lbl', text: 'Or pick from your ideas' }), select),
    field('kid-add-list', 'Add to', listRow.node),
    h('button', { class: 'btn', type: 'button', onclick: add }, 'Add step'));
}

function planView() {
  stopSleepTimer();
  applyPendingFocus();
  const night = nightToday(kid().nights, now());
  const rough = night?.quality === 'bad';
  setAccent(rough ? 'edge' : 'calm');
  const plan = kid().plan;
  const editing = Boolean(state.ui.kidPlanEdit);
  const prog = planProgress(plan.main);
  const anyDone = [...plan.main, ...plan.planB].some((x) => x.done);
  const toggleEdit = () => {
    state.ui.kidPlanEdit = !editing;
    state.ui.kidStepEdit = null;
    state.ui.kidStepDel = null;
    focusAfterRender('[data-kid-plan-mode]');
    render();
  };
  const listNode = (key) => (plan[key].length
    ? h('ol', { class: `kid-steps${editing ? ' is-editing' : ''}`, 'aria-label': LIST_LABELS[key] }, plan[key].map((st, i) => stepItem(st, i, plan[key], key)))
    : h('p', { class: 'empty', text: editing ? 'No steps yet. Add one below.' : 'No steps yet. Tap Edit steps to add some.' }));
  const planB = h('section', { class: `section kid-planb${rough ? ' is-today' : ''}`, 'aria-labelledby': 'kid-planb-h' },
    sectionHead('Plan B', 'For a rough-sleep day', 'kid-planb-h'),
    rough ? h('p', { class: 'kid-planb-note', text: `${KidName()} had a rough night. This is today’s plan.` }) : h('p', { class: 'fine', text: 'Lower demands. Food first. Stay close to home.' }),
    listNode('planB'));
  return [
    h('header', { class: 'topbar' },
      backButton(KidName()),
      h('button', { class: 'text-btn kid-top-link', type: 'button', 'data-kid-plan-mode': '', onclick: toggleEdit }, editing ? 'Done editing' : 'Edit steps')),
    h('div', { class: 'kid-head' },
      h('h1', { class: 'page-title', text: 'Visit plan' }),
      h('p', { class: 'page-sub', text: editing ? 'Reorder, rename, delete or add. Changes are kept for every visit.' : 'Made on a calm day, for the moments you can’t think. Tick as you go.' })),
    rough ? planB : null,
    h('section', { class: 'section', 'aria-labelledby': 'kid-main-h' },
      sectionHead('The plan', prog.total ? `${prog.done} of ${prog.total} done` : null, 'kid-main-h'),
      listNode('main')),
    rough ? null : planB,
    editing
      ? addStepCard()
      : h('div', { class: 'btn-row' },
        h('button', { class: 'btn ghost', type: 'button', disabled: !anyDone, 'data-kid-reset': '', onclick: () => {
          focusAfterRender('[data-kid-plan-mode]');
          commit((d) => { for (const k of ['main', 'planB']) for (const x of d.kid.plan[k]) x.done = false; }, { keepDemo: true });
          toast('Ready for next visit');
        } }, 'Reset for next visit'),
        h('button', { class: 'btn ghost', type: 'button', onclick: toggleEdit }, 'Edit or add steps')),
  ];
}

// ---------- foods ----------
function foodsView() {
  stopSleepTimer();
  applyPendingFocus();
  setAccent('calm');
  const foods = kid().foods;
  return [
    h('header', { class: 'topbar' }, backButton(KidName())),
    h('div', { class: 'kid-head' },
      h('h1', { class: 'page-title', text: 'Foods' }),
      h('p', { class: 'page-sub', text: `Cheap, healthy, and what ${kidName()} actually eats. The faces come from ratings at meals, best first.` })),
    h('button', { class: 'btn', type: 'button', 'data-kid-add-food': '', onclick: () => openFoodForm(null) }, 'Add a food'),
    h('nav', { class: 'chips kid-jump', 'aria-label': 'Jump to a meal' }, SLOTS.map((slot) => h('button', { class: 'chip', type: 'button', onclick: () => jumpTo(`kid-fs-${slot}`) }, SLOT_LABELS[slot]))),
    SLOTS.map((slot) => {
      const list = foodSuggestions(foods, kid().ratings, slot);
      return h('section', { class: 'section', 'aria-labelledby': `kid-fs-${slot}` },
        sectionHead(SLOT_LABELS[slot], `${list.length}`, `kid-fs-${slot}`),
        list.length
          ? h('ul', { class: 'list' }, list.map((f) => h('li', {},
            h('button', { class: 'kid-row', type: 'button', 'data-kid-food': f.id, onclick: () => openFoodSheet(f.id) },
              h('span', { class: 'kid-row-main' }, h('span', { class: 'kid-food-name', text: f.name }), foodMeta(f)),
              h('span', { class: 'kid-row-go', 'aria-hidden': 'true', text: '›' })))))
          : h('p', { class: 'empty', text: SLOT_FALLBACK[slot] }));
    }),
  ];
}

function jumpTo(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.setAttribute('tabindex', '-1');
  el.scrollIntoView({ block: 'start' });
  el.focus({ preventScroll: true });
}

function historyList(items) {
  return h('ul', { class: 'list kid-history' }, items.map((x) => h('li', {}, x)));
}

function openFoodSheet(foodId, confirmDelete = false) {
  const f = foodSuggestions(kid().foods, kid().ratings, null).find((x) => x.id === foodId);
  if (!f) return;
  const hist = foodHistory(kid().ratings, foodId).slice(0, 8);
  const sc = faceFor(f.avg);
  const body = h('div', { class: 'kid-sheet' },
    f.notes ? h('p', { class: 'kid-sheet-note', text: f.notes }) : null,
    h('p', { class: 'kid-meta big' }, costTag(f.cost), h('span', { text: COST_LABELS[f.cost] || '' }), healthyTag(f.healthy), h('span', { text: HEALTHY_LABELS[f.healthy] || '' })),
    h('p', { class: 'fine', text: `Good for: ${(f.slots || []).map((x) => SLOT_LABELS[x]).join(', ') || 'any time'}` }),
    f.count
      ? h('div', { class: 'kid-avg' }, face(sc, 44), h('span', {}, h('strong', { text: RATING_FACES[sc].label }), h('span', { class: 'fine', text: ` on average · ${f.count} ${f.count === 1 ? 'rating' : 'ratings'}` })))
      : h('p', { class: 'fine', text: `Not rated yet. Serve it and tap a face to see how ${kidName()} likes it.` }),
    hist.length ? historyList(hist.map((r) => h('span', { class: 'kid-hist' }, face(r.score, 22), h('span', { text: RATING_FACES[r.score]?.label || '' }), h('span', { class: 'fine', text: `${SLOT_LABELS[r.slot] || ''} · ${fmtWhen(r.ts)}` })))) : null,
    h('div', { class: 'btn-row' },
      h('button', { class: 'btn', type: 'button', onclick: () => openServe(f.id, servingSlot(f)) }, 'Serve now'),
      h('button', { class: 'btn ghost', type: 'button', onclick: () => openFoodForm(f.id) }, 'Edit')),
    confirmDelete
      ? h('div', { class: 'banner kid-confirm', role: 'group', 'aria-label': 'Confirm delete' },
        h('span', { text: `Delete ${f.name}? Past ratings stay in your history.` }),
        h('div', { class: 'btn-row' },
          h('button', { class: 'btn danger', type: 'button', 'data-autofocus': '', onclick: () => {
            closeSheet();
            focusAfterRender('[data-kid-add-food]');
            commit((d) => { d.kid.foods = d.kid.foods.filter((x) => x.id !== foodId); }, { keepDemo: true });
            toast('Food deleted');
          } }, 'Delete'),
          h('button', { class: 'btn ghost', type: 'button', onclick: () => openFoodSheet(foodId) }, 'Cancel')))
      : h('button', { class: 'text-btn danger-text', type: 'button', onclick: () => openFoodSheet(foodId, true) }, 'Delete this food'));
  openSheet(f.name, body);
}

// The meal to log a food against: the next meal if it fits, else its first slot.
function servingSlot(f) {
  const next = nextMeal(kid().day, dayKey(now())) || 'snack';
  return (f.slots || []).includes(next) ? next : (f.slots || [])[0] || next;
}

function openFoodForm(foodId, presetSlot = null) {
  const f = foodId ? foodById(foodId) : null;
  const slots = new Set(f ? f.slots : presetSlot ? [presetSlot] : []);
  const name = h('input', { type: 'text', id: 'kid-food-name', maxlength: '80', value: f?.name || '', placeholder: 'e.g. Cheese on toast', 'data-autofocus': '' });
  const cost = pickRow('kid-food-cost', [[1, '$', 'Cheap'], [2, '$$', 'Mid'], [3, '$$$', 'Pricier']], f?.cost ?? 1);
  const healthy = pickRow('kid-food-healthy', [[1, 'A treat'], [2, 'Pretty good'], [3, 'Very healthy']], f?.healthy ?? 2);
  const notes = h('textarea', { id: 'kid-food-notes', maxlength: '200', rows: '2', placeholder: 'A tip for future you: how to make it, what helps' });
  notes.value = f?.notes || '';
  const chips = chipGroup(SLOTS, (x) => slots.has(x), (x) => { slots.has(x) ? slots.delete(x) : slots.add(x); }, { label: 'Which meals', labels: SLOT_LABELS });
  chips.setAttribute('aria-labelledby', 'kid-food-slots-l');
  const save = () => {
    const v = name.value.trim();
    if (!v) { toast('Give it a name.'); name.focus(); return; }
    if (!slots.size) { toast('Pick at least one meal it’s good for.'); return; }
    const rec = { name: v, slots: SLOTS.filter((x) => slots.has(x)), cost: cost.get() || 1, healthy: healthy.get() || 2, notes: notes.value.trim() };
    closeSheet();
    commit((d) => {
      const x = foodId && d.kid.foods.find((y) => y.id === foodId);
      if (x) Object.assign(x, rec);
      else d.kid.foods.push({ id: `f-${uid()}`, ...rec });
    }, { keepDemo: true });
    toast(foodId ? 'Food saved' : `Added ${v}`);
  };
  openSheet(f ? 'Edit food' : 'Add a food', h('form', { class: 'kid-sheet', onsubmit: (e) => { e.preventDefault(); save(); } },
    h('label', { class: 'field', for: 'kid-food-name' }, h('span', { class: 'lbl', text: 'Name' }), name),
    field('kid-food-slots', 'Good for', chips),
    field('kid-food-cost', 'Cost', cost.node),
    field('kid-food-healthy', 'How healthy', healthy.node),
    h('label', { class: 'field', for: 'kid-food-notes' }, h('span', { class: 'lbl' }, 'Note', h('span', { class: 'kid-opt', text: ' (optional)' })), notes),
    h('button', { class: 'btn block', type: 'submit' }, f ? 'Save' : 'Add food')));
}

// ---------- activities ----------
function activitiesView() {
  stopSleepTimer();
  applyPendingFocus();
  setAccent('calm');
  const acts = kid().activities;
  const stats = activityStats(kid().tries, acts);
  const byId = new Map(stats.byActivity.map((x) => [x.id, x]));
  const ranked = rankActivities(acts, kid().tries);
  return [
    h('header', { class: 'topbar' }, backButton(KidName())),
    h('div', { class: 'kid-head' },
      h('h1', { class: 'page-title', text: 'Activities' }),
      h('p', { class: 'page-sub', text: 'Ideas made ahead, for when your head is too full to think of one. What works rises to the top.' })),
    insightCard(pickupInsight(stats)) || h('p', { class: 'fine', text: 'Tap “We did this” after an outing. After a few, you’ll see whether going straight out after pickup works best.' }),
    h('button', { class: 'btn', type: 'button', 'data-kid-add-act': '', onclick: () => openActivityForm(null) }, 'Add an activity'),
    ENERGY.map((en) => {
      const list = ranked.filter((a) => a.energy === en);
      if (!list.length) return null;
      return h('section', { class: 'section', 'aria-labelledby': `kid-as-${en}` },
        sectionHead(ENERGY_LABELS[en], `${list.length}`, `kid-as-${en}`),
        h('ul', { class: 'list' }, list.map((a) => {
          const st = byId.get(a.id);
          return h('li', {},
            h('button', { class: 'kid-row', type: 'button', 'data-kid-act': a.id, onclick: () => openActivitySheet(a.id) },
              h('span', { class: 'kid-row-main' },
                h('span', { class: 'kid-food-name', text: a.name }),
                h('span', { class: 'kid-meta' },
                  h('span', { text: WHERE_LABELS[a.where] || '' }), costTag(a.cost, ACTIVITY_COST_LABELS),
                  h('span', { class: 'kid-row-stat', text: st?.n ? `${triedText(st)}${st.yes && st.pickup.n ? `, ${st.pickup.yes} of ${st.pickup.n} at pickup` : ''}` : 'Not tried yet' }))),
              h('span', { class: 'kid-row-go', 'aria-hidden': 'true', text: '›' })));
        })));
    }),
    acts.some((a) => !ENERGY.includes(a.energy))
      ? h('ul', { class: 'list' }, acts.filter((a) => !ENERGY.includes(a.energy)).map((a) => h('li', {}, h('button', { class: 'kid-row', type: 'button', onclick: () => openActivitySheet(a.id) }, h('span', { class: 'kid-food-name', text: a.name })))))
      : null,
  ];
}

function openActivitySheet(activityId, confirmDelete = false) {
  const a = activityById(activityId);
  if (!a) return;
  const st = activityStats(kid().tries, [a]).byActivity[0];
  const hist = kid().tries.filter((t) => t.activityId === activityId).sort((x, y) => y.ts - x.ts).slice(0, 8);
  const body = h('div', { class: 'kid-sheet' },
    a.notes ? h('p', { class: 'kid-sheet-note', text: a.notes }) : null,
    h('p', { class: 'kid-meta big' }, h('span', { class: `kid-energy e-${a.energy}`, text: ENERGY_LABELS[a.energy] || '' }), h('span', { text: WHERE_LABELS[a.where] || '' }), costTag(a.cost, ACTIVITY_COST_LABELS)),
    st.n
      ? h('div', { class: 'stats' },
        h('div', { class: 'stat' }, h('span', { class: 'v', text: `${st.yes}/${st.n}` }), h('span', { class: 'k', text: 'worked' })),
        h('div', { class: 'stat' }, h('span', { class: 'v', text: st.pickup.n ? `${st.pickup.yes}/${st.pickup.n}` : '–' }), h('span', { class: 'k', text: 'after pickup' })),
        h('div', { class: 'stat' }, h('span', { class: 'v', text: st.later.n ? `${st.later.yes}/${st.later.n}` : '–' }), h('span', { class: 'k', text: 'later' })))
      : h('p', { class: 'fine', text: 'Not tried yet.' }),
    hist.length ? historyList(hist.map((t) => h('span', { class: 'kid-hist' }, h('span', { class: `kid-worked w-${t.worked}`, text: WORKED_LABELS[t.worked] || '' }), h('span', { class: 'fine', text: `${t.when === 'pickup' ? 'After pickup' : 'Later'} · ${fmtWhen(t.ts)}` })))) : null,
    h('div', { class: 'btn-row' },
      h('button', { class: 'btn', type: 'button', onclick: () => openTry(a.id) }, 'We did this'),
      h('button', { class: 'btn ghost', type: 'button', onclick: () => openActivityForm(a.id) }, 'Edit')),
    confirmDelete
      ? h('div', { class: 'banner kid-confirm', role: 'group', 'aria-label': 'Confirm delete' },
        h('span', { text: `Delete ${a.name}? Past outings still count in the pickup comparison.` }),
        h('div', { class: 'btn-row' },
          h('button', { class: 'btn danger', type: 'button', 'data-autofocus': '', onclick: () => {
            closeSheet();
            focusAfterRender('[data-kid-add-act]');
            commit((d) => { d.kid.activities = d.kid.activities.filter((x) => x.id !== activityId); }, { keepDemo: true });
            toast('Activity deleted');
          } }, 'Delete'),
          h('button', { class: 'btn ghost', type: 'button', onclick: () => openActivitySheet(activityId) }, 'Cancel')))
      : h('button', { class: 'text-btn danger-text', type: 'button', onclick: () => openActivitySheet(activityId, true) }, 'Delete this activity'));
  openSheet(a.name, body);
}

function openActivityForm(activityId) {
  const a = activityId ? activityById(activityId) : null;
  const name = h('input', { type: 'text', id: 'kid-act-name', maxlength: '80', value: a?.name || '', placeholder: 'e.g. Feed the ducks', 'data-autofocus': '' });
  const energy = pickRow('kid-act-energy', [['high', 'High'], ['med', 'Some'], ['low', 'Low']], a?.energy ?? 'med');
  const where = pickRow('kid-act-where', [['out', 'Out'], ['in', 'At home']], a?.where ?? 'out');
  const cost = pickRow('kid-act-cost', [[1, 'Free'], [2, 'Small cost'], [3, 'Costs more']], a?.cost ?? 1);
  const notes = h('textarea', { id: 'kid-act-notes', maxlength: '200', rows: '2', placeholder: 'What to bring, where to go, what makes it work' });
  notes.value = a?.notes || '';
  const save = () => {
    const v = name.value.trim();
    if (!v) { toast('Give it a name.'); name.focus(); return; }
    const rec = { name: v, energy: energy.get() || 'med', where: where.get() || 'out', cost: cost.get() || 1, notes: notes.value.trim() };
    closeSheet();
    commit((d) => {
      const x = activityId && d.kid.activities.find((y) => y.id === activityId);
      if (x) Object.assign(x, rec);
      else d.kid.activities.push({ id: `a-${uid()}`, ...rec });
    }, { keepDemo: true });
    toast(activityId ? 'Activity saved' : `Added ${v}`);
  };
  openSheet(a ? 'Edit activity' : 'Add an activity', h('form', { class: 'kid-sheet', onsubmit: (e) => { e.preventDefault(); save(); } },
    h('label', { class: 'field', for: 'kid-act-name' }, h('span', { class: 'lbl', text: 'Name' }), name),
    field('kid-act-energy', 'Energy it needs', energy.node),
    field('kid-act-where', 'Where', where.node),
    field('kid-act-cost', 'Cost', cost.node),
    h('label', { class: 'field', for: 'kid-act-notes' }, h('span', { class: 'lbl' }, 'Note', h('span', { class: 'kid-opt', text: ' (optional)' })), notes),
    h('button', { class: 'btn block', type: 'submit' }, a ? 'Save' : 'Add activity')));
}

registerView('kid', { tab: 'kid', render: () => kidView() });
registerView('kid-plan', { tab: 'kid', render: () => planView() });
registerView('kid-foods', { tab: 'kid', render: () => foodsView() });
registerView('kid-activities', { tab: 'kid', render: () => activitiesView() });
