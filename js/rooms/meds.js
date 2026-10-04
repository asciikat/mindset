// The Meds room: log the dose (with food, sleep and caffeine), answer a short
// check-in every hour, and see the day as a curve. Patterns across days and a
// plain summary for the prescriber come out of the same log.
//
// Nothing here gives dose advice. Copy points to the prescriber for decisions.

import {
  CHART_HOURS, FOOD_AMOUNTS, FOOD_LABELS, CAFFEINE_KINDS, INTERVALS, TRACK_HOURS,
  cleanSettings, doseLabel, doseToday, checksFor, schedule, nextDue, dayCurve, dayStats, caffeineFor,
  patterns, buildIcs, summaryText, curveSentence, fmtClock, fmtDay, fmtHours, fmtAbout, hoursSince,
} from '../logic/meds.js';
import {
  medChart, medTable, chartLegend, doseTrack, trackLegend, focusSpark, cupIcon, plateIcon, caffeineLabel,
} from './medchart.js';
import {
  state, h, now, uid, fmt1, fmtDur, startOfDay, dayKey, commit, toast, go, back, render, setAccent,
  openSheet, closeSheet, demoBanner, stat, backButton, scalePicker, registerView, registerAction,
} from '../core.js';

const MIN = 60000;
const HOUR = 3600000;

const meds = () => state.data.meds;
const settings = () => cleanSettings(meds().settings);
const doseById = (id) => meds().doses.find((d) => d.id === id);
const pastDoses = (t) => [...meds().doses].filter((d) => d.ts <= t).sort((a, b) => b.ts - a.ts);

const SAFETY = 'This is a log, not medical advice. Don’t change your dose without talking to your prescriber. Caffeine on top of a stimulant can make some people jittery or anxious — worth noting in your log.';
const ONSET_NOTE = 'Everyone’s different. Many people notice Vyvanse starting within about 1–2 hours, and it can last up to around 13–14 hours (prescribing information). Your log shows what it’s like for you.';

// Caffeine and food markers for one dose, as hours since the dose.
function dayEvents(dose) {
  const ev = caffeineFor(dose, meds().caffeine).map((c) => ({ kind: 'cup', h: hoursSince(dose, c.ts), label: caffeineLabel(c.what) }));
  if (FOOD_AMOUNTS.includes(dose.foodAmount) && dose.foodAmount !== 'none') ev.push({ kind: 'plate', h: 0, label: dose.foodWhat || 'Food' });
  for (const c of checksFor(dose, meds().checks)) if (c.ate) ev.push({ kind: 'plate', h: hoursSince(dose, c.ts), label: c.ateWhat || 'Food' });
  return ev;
}

function foodText(d) {
  if (!FOOD_AMOUNTS.includes(d.foodAmount) || d.foodAmount === 'none') return d.foodWhat ? `${d.foodWhat} (not much)` : 'Nothing to eat';
  return `${d.foodWhat || 'Food'} (${FOOD_LABELS[d.foodAmount].toLowerCase()}${d.protein ? ', protein' : ''})`;
}

function todaysMorning(t) {
  const start = startOfDay(t);
  return state.data.checkins
    .filter((c) => c && c.kind === 'morning' && c.ts >= start && c.ts <= t)
    .sort((a, b) => b.ts - a.ts)[0] || null;
}

const hhmm = (ts) => { const d = new Date(ts); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const reduced = () => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };
const sheetOpen = () => Boolean(document.querySelector('#layer .scrim'));

// ---------- copying & downloading (both may be blocked in a preview) ----------
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch { /* fall through */ }
  try {
    const ta = h('textarea', { readonly: true, 'aria-hidden': 'true', style: 'position:fixed;top:0;left:0;opacity:0;pointer-events:none' });
    ta.value = text;
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

function selectText(node) {
  try {
    const r = document.createRange();
    r.selectNodeContents(node);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
  } catch { /* nothing to do */ }
}

function downloadFile(name, text, type) {
  try {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = h('a', { href: url, download: name, style: 'display:none' });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return true;
  } catch {
    return false;
  }
}

// ---------- reminders while the app is open ----------
let remindTimer = null;

async function notify(title, body) {
  try {
    if ('Notification' in window && Notification.permission === 'granted') {
      const reg = await navigator.serviceWorker?.getRegistration?.();
      if (reg && reg.showNotification) await reg.showNotification(title, { body, tag: 'mindset-med', icon: 'icon.svg' });
      else new Notification(title, { body, tag: 'mindset-med', icon: 'icon.svg' });
    }
  } catch { /* blocked here: the in-app toast and banner still show */ }
  toast(`${title}. ${body}`);
}

function scheduleReminder() {
  clearTimeout(remindTimer);
  remindTimer = null;
  const r = state.ui.medRemind;
  if (!r || !r.on) return;
  const t = now();
  const dose = doseToday(meds().doses, t);
  if (!dose || dose.id !== r.doseId) { state.ui.medRemind = null; return; }
  const next = schedule(dose, meds().checks, t, settings()).find((sl) => sl.status === 'upcoming' && sl.ts > t);
  if (!next) { state.ui.medRemind = null; return; }
  remindTimer = setTimeout(() => {
    notify('Mindset check-in', `${fmtHours(next.h)} since your ${dose.name || 'dose'}. How are focus, mood and appetite?`);
    if (!sheetOpen() && ['meds', 'today'].includes(state.view)) render();
    scheduleReminder();
  }, Math.max(1000, next.ts - t));
}

async function enableReminders(dose) {
  let perm = 'unsupported';
  try {
    if ('Notification' in window) {
      perm = Notification.permission;
      if (perm === 'default') {
        const asked = Notification.requestPermission();
        perm = asked && typeof asked.then === 'function'
          ? await Promise.race([asked, new Promise((res) => setTimeout(() => res('default'), 8000))])
          : Notification.permission;
      }
    }
  } catch {
    perm = 'blocked';
  }
  state.ui.medRemind = { on: true, perm, doseId: dose.id };
  scheduleReminder();
  render();
  toast(perm === 'granted' ? 'Reminders on while Mindset is open' : 'Reminders on. Notifications are blocked here, so they’ll show inside the app.');
}

function disableReminders() {
  clearTimeout(remindTimer);
  remindTimer = null;
  state.ui.medRemind = null;
  render();
  toast('Reminders off');
}

// ---------- keep "3h 10m ago" and the due banner fresh ----------
let ticker = null;
let lastSig = '';
function statusSig(t) {
  const dose = doseToday(meds().doses, t);
  if (!dose) return 'none';
  const due = nextDue(dose, meds().checks, t, settings());
  return `${dose.id}:${due ? `${due.k}:${due.overdue}` : 'done'}`;
}
function startTicker() {
  lastSig = statusSig(now());
  if (ticker) return;
  ticker = setInterval(() => {
    const t = now();
    for (const el of document.querySelectorAll('[data-med-since]')) el.textContent = `${fmtDur(t - Number(el.dataset.medSince))} ago`;
    const sig = statusSig(t);
    if (sig !== lastSig && !sheetOpen() && ['meds', 'today'].includes(state.view.split('/')[0])) render();
  }, 30000);
}

// ---------- sheets ----------
function choiceChips(options, labels, get, set, label) {
  const row = h('div', { class: 'chips', role: 'group', 'aria-label': label });
  const draw = () => row.replaceChildren(...options.map((o) => h('button', {
    class: 'chip med-chip', type: 'button', 'aria-pressed': String(get() === o),
    onclick: () => { set(get() === o ? null : o); draw(); },
  }, labels[o] ?? String(o))));
  draw();
  return row;
}

function toggleSwitch(id, text, initial) {
  let on = initial;
  const btn = h('button', { class: 'med-switch', type: 'button', role: 'switch', id, 'aria-checked': String(on) },
    h('span', { class: 'med-switch-track', 'aria-hidden': 'true' }, h('span', { class: 'med-switch-thumb' })),
    h('span', { text }));
  btn.addEventListener('click', () => { on = !on; btn.setAttribute('aria-checked', String(on)); });
  return { node: btn, get: () => on };
}

function openDoseSheet(existing = null) {
  const t = now();
  const st = settings();
  const morning = existing ? null : todaysMorning(t);
  let amount = existing ? existing.foodAmount : null;
  let cups = 0;
  const alreadyCups = existing ? 0 : meds().caffeine.filter((c) => c.ts >= startOfDay(t) && c.ts <= t).length;

  const name = h('input', { type: 'text', id: 'med-name', maxlength: '40', value: existing?.name || st.name, autocomplete: 'off' });
  const mg = h('input', { type: 'number', id: 'med-mg', min: '0', max: '2000', step: 'any', inputmode: 'decimal', value: existing ? existing.mg ?? '' : st.mg ?? '', placeholder: 'Optional' });
  const time = h('input', { type: 'time', id: 'med-time', value: hhmm(existing ? existing.ts : t), 'data-autofocus': '' });
  const food = h('input', { type: 'text', id: 'med-food', maxlength: '80', value: existing?.foodWhat || '', placeholder: 'e.g. Eggs on toast' });
  const protein = toggleSwitch('med-protein', 'Had protein', existing ? Boolean(existing.protein) : false);
  const sleepPrefill = existing ? existing.sleepHours : morning?.sleepHours;
  const sleep = h('input', { type: 'number', id: 'med-sleep', min: '0', max: '16', step: '0.5', inputmode: 'decimal', value: sleepPrefill ?? '', placeholder: 'Hours' });
  const note = h('textarea', { id: 'med-dose-note', maxlength: '300', placeholder: 'Anything worth remembering about this morning?' });
  note.value = existing?.note || '';

  const cupsOut = h('output', { class: 'med-step-n', id: 'med-cups', 'aria-live': 'polite' }, '0');
  const step = (dv) => { cups = Math.max(0, Math.min(9, cups + dv)); cupsOut.textContent = String(cups); };

  const save = () => {
    const [hh, mm] = (time.value || hhmm(t)).split(':').map(Number);
    const day = new Date(existing ? existing.ts : t);
    day.setHours(hh || 0, mm || 0, 0, 0);
    const ts = day.getTime();
    if (ts > t + MIN) { toast('That time hasn’t happened yet. Pick the time you took it.'); time.focus(); return; }
    const mgN = Number(mg.value);
    const sleepN = sleep.value === '' ? null : Number(sleep.value);
    const rec = {
      ts,
      name: name.value.trim() || st.name,
      mg: mg.value !== '' && Number.isFinite(mgN) && mgN > 0 ? mgN : null,
      foodWhat: food.value.trim(),
      foodAmount: amount || (food.value.trim() ? 'normal' : 'none'),
      protein: protein.get(),
      sleepHours: sleepN != null && Number.isFinite(sleepN) && sleepN >= 0 && sleepN <= 16 ? sleepN : null,
      note: note.value.trim(),
    };
    const wasDemo = state.data.demo;
    closeSheet();
    commit((d) => {
      if (existing) {
        const x = d.meds.doses.find((y) => y.id === existing.id);
        if (x) Object.assign(x, rec);
      } else {
        d.meds.doses.push({ id: uid(), ...rec });
        for (let i = 0; i < cups; i++) d.meds.caffeine.push({ id: uid(), ts: Math.min(ts, t), what: 'caffeine' });
      }
      d.meds.settings = { ...cleanSettings(d.meds.settings), name: rec.name, mg: rec.mg };
    }, { keepDemo: Boolean(existing), quiet: true });
    if (existing) { toast('Dose updated'); return; }
    const first = nextDue({ id: 'x', ts }, [], t, settings());
    const next = !first ? '' : first.overdue ? 'A check-in is due now.' : `First check-in around ${fmtClock(first.dueTs)}.`;
    toast(`${wasDemo ? 'Logged. Examples cleared. ' : 'Logged. '}${next}`);
  };

  const del = existing ? (() => {
    const confirmRow = h('div', { class: 'banner', hidden: true },
      h('span', { text: 'Delete this dose and its check-ins?' }),
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn danger', type: 'button', onclick: () => {
          closeSheet();
          commit((d) => {
            d.meds.doses = d.meds.doses.filter((x) => x.id !== existing.id);
            d.meds.checks = d.meds.checks.filter((x) => x.doseId !== existing.id);
          }, { keepDemo: true });
          toast('Dose deleted');
          if (state.view.startsWith('meds-day')) go('meds', { replace: true });
        } }, 'Delete'),
        h('button', { class: 'btn ghost', type: 'button', onclick: () => { confirmRow.hidden = true; } }, 'Keep')));
    return [h('button', { class: 'text-btn danger-text', type: 'button', onclick: () => { confirmRow.hidden = false; } }, 'Delete this dose'), confirmRow];
  })() : null;

  openSheet(existing ? 'Edit dose' : 'I took my meds', h('form', { class: 'med-form', onsubmit: (e) => { e.preventDefault(); save(); } },
    h('div', { class: 'med-form-row' },
      h('label', { class: 'field', for: 'med-name' }, h('span', { class: 'lbl', text: 'Medication' }), name),
      h('label', { class: 'field med-mg-field', for: 'med-mg' }, h('span', { class: 'lbl', text: 'mg' }), mg)),
    h('label', { class: 'field', for: 'med-time' }, h('span', { class: 'lbl', text: 'Time taken' }), time),
    h('div', { class: 'field' },
      h('label', { class: 'lbl', for: 'med-food', text: 'What did you eat?' }), food,
      h('span', { class: 'fine', id: 'med-amount-l', text: 'How much?' }),
      choiceChips(FOOD_AMOUNTS, FOOD_LABELS, () => amount, (v) => { amount = v; }, 'How much did you eat?'),
      protein.node),
    h('label', { class: 'field', for: 'med-sleep' }, h('span', { class: 'lbl', text: 'Sleep last night' }), sleep,
      morning?.sleepHours != null ? h('span', { class: 'fine', text: 'From your morning check-in.' }) : null),
    existing ? null : h('div', { class: 'field' },
      h('span', { class: 'lbl', id: 'med-cups-l', text: 'Caffeine so far today' }),
      h('div', { class: 'med-stepper', role: 'group', 'aria-labelledby': 'med-cups-l' },
        h('button', { class: 'icon-btn med-step-btn', type: 'button', 'aria-label': 'One less', onclick: () => step(-1) }, '−'),
        cupsOut,
        h('button', { class: 'icon-btn med-step-btn', type: 'button', 'aria-label': 'One more', onclick: () => step(1) }, '+')),
      h('span', { class: 'fine', text: alreadyCups ? `Coffee, tea, energy drinks, cola. You’ve already logged ${alreadyCups} today; count only new ones.` : 'Coffee, tea, energy drinks, cola. Each one goes in today’s caffeine log.' })),
    h('label', { class: 'field', for: 'med-dose-note' }, h('span', { class: 'lbl', text: 'Note (optional)' }), note),
    !existing && state.data.demo ? h('p', { class: 'fine', text: 'Saving clears the example data and starts your own log.' }) : null,
    h('button', { class: 'btn block', type: 'submit' }, existing ? 'Save changes' : 'Log dose'),
    del));
}

function openDemoNotice() {
  openSheet('These are examples', h('div', { class: 'med-form' },
    h('p', { text: 'The check-ins here are example data. To start your own, log today’s dose. That clears the examples and keeps your settings.' }),
    h('div', { class: 'btn-row' },
      h('button', { class: 'btn', type: 'button', 'data-autofocus': '', onclick: () => { closeSheet(); openDoseSheet(); } }, 'Log my dose'),
      h('button', { class: 'btn ghost', type: 'button', onclick: () => closeSheet() }, 'Not now'))));
}

const SCALE_COPY = [
  ['focus', 'Focus', 'Scattered', 'Locked in'],
  ['mood', 'Mood', 'Low', 'Good'],
  ['anxiety', 'Anxious or jittery', 'Calm', 'Very'],
  ['appetite', 'Appetite', 'None', 'Hungry'],
  ['energy', 'Energy', 'Drained', 'Lots'],
];

function openCheckSheet() {
  const t = now();
  const dose = doseToday(meds().doses, t);
  if (!dose) { openDoseSheet(); return; }
  if (state.data.demo) { openDemoNotice(); return; }
  const pickers = Object.fromEntries(SCALE_COPY.map(([key, label, low, high]) => [key, scalePicker(`med-${key}`, { label, low: `1 · ${low}`, high: `${high} · 5` })]));
  let ate = null;
  const kinds = new Set();
  const ateWhat = h('input', { type: 'text', id: 'med-ate-what', maxlength: '80', placeholder: 'What, roughly?' });
  const ateField = h('label', { class: 'field', for: 'med-ate-what', hidden: true }, h('span', { class: 'visually-hidden', text: 'What did you eat?' }), ateWhat);
  const note = h('textarea', { id: 'med-check-note', maxlength: '300', placeholder: 'Anything you notice: headache, crash, flow, snappy…' });

  const save = () => {
    const missing = ['focus', 'mood', 'anxiety'].filter((k) => pickers[k].get() == null);
    if (missing.length) {
      toast('Pick focus, mood and anxiety. The rest is optional.');
      pickers[missing[0]].row.querySelector('button')?.focus();
      return;
    }
    const rec = { id: uid(), ts: now(), doseId: dose.id, ate: ate === true, ateWhat: ate === true ? ateWhat.value.trim() : '', note: note.value.trim() };
    for (const [key] of SCALE_COPY) rec[key] = pickers[key].get();
    closeSheet();
    commit((d) => {
      d.meds.checks.push(rec);
      for (const what of kinds) d.meds.caffeine.push({ id: uid(), ts: rec.ts, what });
    }, { quiet: true });
    const nd = nextDue(dose, meds().checks, now(), settings());
    toast(nd ? `Logged. Next one around ${fmtClock(nd.dueTs)}.` : 'Logged. That’s the last one for today.');
    scheduleReminder();
  };

  openSheet(`Check-in · ${fmtHours(hoursSince(dose, t))} in`, h('form', { class: 'med-form', onsubmit: (e) => { e.preventDefault(); save(); } },
    SCALE_COPY.map(([key, label]) => h('div', { class: 'field' },
      h('span', { class: 'lbl', id: `med-${key}-l`, text: label }),
      pickers[key].node)),
    h('div', { class: 'field' },
      h('span', { class: 'lbl', text: 'Eaten since last check-in?' }),
      h('div', { class: 'chips', role: 'group', 'aria-label': 'Eaten since last check-in?' },
        ...[['yes', true], ['no', false]].map(([txt, v]) => {
          const b = h('button', { class: 'chip med-chip', type: 'button', 'aria-pressed': 'false', 'data-ate': txt }, txt === 'yes' ? 'Yes' : 'No');
          b.addEventListener('click', () => {
            ate = ate === v ? null : v;
            for (const x of b.parentNode.children) x.setAttribute('aria-pressed', String((x.dataset.ate === 'yes') === ate && ate !== null));
            ateField.hidden = ate !== true;
            if (ate === true) ateWhat.focus();
          });
          return b;
        })),
      ateField),
    h('div', { class: 'field' },
      h('span', { class: 'lbl', text: 'Caffeine since?' }),
      h('div', { class: 'chips', role: 'group', 'aria-label': 'Caffeine since last check-in' },
        CAFFEINE_KINDS.map((k) => {
          const b = h('button', { class: 'chip med-chip', type: 'button', 'aria-pressed': 'false' }, caffeineLabel(k));
          b.addEventListener('click', () => { kinds.has(k) ? kinds.delete(k) : kinds.add(k); b.setAttribute('aria-pressed', String(kinds.has(k))); });
          return b;
        }))),
    h('label', { class: 'field', for: 'med-check-note' }, h('span', { class: 'lbl', text: 'Note (optional)' }), note),
    h('button', { class: 'btn block', type: 'submit' }, 'Save check-in')));
}

function openCaffeineSheet() {
  const t = now();
  const today = meds().caffeine.filter((c) => c.ts >= startOfDay(t) && c.ts <= t).length;
  const log = (what) => {
    const wasDemo = state.data.demo;
    closeSheet();
    commit((d) => d.meds.caffeine.push({ id: uid(), ts: now(), what }), { quiet: true });
    const n = meds().caffeine.filter((c) => c.ts >= startOfDay(now())).length;
    toast(`${caffeineLabel(what)} logged · ${n} today${wasDemo ? '. Examples cleared.' : ''}`);
  };
  openSheet('Caffeine', h('div', { class: 'med-form' },
    h('p', { class: 'fine', text: today ? `${today} logged today so far. Tap what you’re having now.` : 'Tap what you’re having now.' }),
    h('div', { class: 'med-caf-grid' },
      CAFFEINE_KINDS.map((k, i) => h('button', { class: 'choice med-caf', type: 'button', 'data-autofocus': i === 0 ? '' : null, onclick: () => log(k) }, h('span', { class: 'med-caf-ico', 'aria-hidden': 'true' }, cupIcon({ size: 18 })), caffeineLabel(k)))),
    state.data.demo ? h('p', { class: 'fine', text: 'Logging this clears the example data.' }) : null,
    h('p', { class: 'fine', text: 'Caffeine on top of a stimulant can make some people jittery or anxious. Logging it helps you see if that’s you.' })));
}

// ---------- pieces of the main view ----------
function dueBlock(dose, due, { compact = false } = {}) {
  if (!due) {
    return h('div', { class: 'med-due done', role: 'status' },
      h('span', { class: 'med-due-text' }, h('strong', { text: 'Check-ins done for today.' }), compact ? null : h('span', { text: ` The ${settings().hours}h tracking window has passed.` })),
      compact ? null : h('button', { class: 'text-btn', type: 'button', onclick: openCheckSheet }, 'Add one anyway'));
  }
  const when = fmtClock(due.dueTs);
  if (due.overdue) {
    return h('div', { class: 'med-due is-due', role: 'status' },
      h('span', { class: 'med-due-dot', 'aria-hidden': 'true' }),
      h('span', { class: 'med-due-text' }, h('strong', { text: 'Check-in due' }), h('span', { text: ` · ${fmtHours(due.hour)} mark, ${when}` })),
      h('button', { class: 'btn med-due-btn', type: 'button', onclick: openCheckSheet }, 'Check in'));
  }
  const mins = Math.max(1, Math.round((due.dueTs - now()) / MIN));
  return h('div', { class: 'med-due', role: 'status' },
    h('span', { class: 'med-due-text' }, h('strong', { text: `Next check-in ${when}` }), h('span', { text: ` · in ${fmtDur(mins * MIN)}` })),
    h('button', { class: `btn ghost med-due-btn`, type: 'button', onclick: openCheckSheet }, compact ? 'Check in' : 'Check in now'));
}

function trackLabel(dose, slots, t) {
  const done = slots.filter((x) => x.status === 'done').length;
  const missed = slots.filter((x) => x.status === 'missed').length;
  const due = nextDue(dose, meds().checks, t, settings());
  return `Timeline from ${fmtClock(dose.ts)}: ${fmtHours(hoursSince(dose, t))} since the dose. ${done} check-in${done === 1 ? '' : 's'} done${missed ? `, ${missed} missed` : ''}. ${due ? `Next at ${fmtClock(due.dueTs)}.` : 'No more check-ins today.'}`;
}

function heroToday(dose, t) {
  const st = settings();
  const slots = schedule(dose, meds().checks, t, st);
  const nowH = hoursSince(dose, t);
  return h('section', { class: 'med-hero', 'aria-labelledby': 'med-hero-h' },
    h('div', { class: 'med-hero-top' },
      h('span', { class: 'eyebrow', id: 'med-hero-h', text: `${doseLabel(dose)} · today` }),
      h('button', { class: 'text-btn med-edit', type: 'button', onclick: () => openDoseSheet(doseById(dose.id)) }, 'Edit')),
    h('p', { class: 'med-taken' },
      h('span', { class: 'med-taken-k', text: 'Taken ' }),
      h('span', { class: 'med-taken-v', text: fmtClock(dose.ts) })),
    h('p', { class: 'med-ago' }, h('span', { 'data-med-since': String(dose.ts), text: `${fmtDur(t - dose.ts)} ago` }),
      h('span', { class: 'med-ago-sub', text: ` · ${foodText(dose)}${dose.sleepHours != null ? ` · slept ${dose.sleepHours}h` : ''}` })),
    doseTrack({ dose, slots, nowH, events: dayEvents(dose), label: trackLabel(dose, slots, t) }),
    trackLegend(),
    h('p', { class: 'med-onset', text: ONSET_NOTE }));
}

function heroNoDose(t) {
  const st = settings();
  const last = pastDoses(t)[0];
  return h('section', { class: 'med-hero med-hero-empty', 'aria-labelledby': 'med-take-h' },
    h('span', { class: 'eyebrow', id: 'med-take-h', text: `${st.name} · ${fmtDay(t)}` }),
    h('button', { class: 'med-take', type: 'button', onclick: () => openDoseSheet() },
      h('span', { class: 'med-take-main', text: 'I took my meds' }),
      h('span', { class: 'med-take-sub', text: 'Logs the time, food, sleep and caffeine' })),
    h('p', { class: 'fine' }, last
      ? `Last logged ${dayKey(last.ts) === dayKey(t - 86400000) ? 'yesterday' : fmtDay(last.ts)} at ${fmtClock(last.ts)}.`
      : 'Then Mindset asks a few quick questions every hour, and draws your day.'));
}

function chartSection(dose, t, { title = 'Today’s curve', isToday = true } = {}) {
  const points = dayCurve(dose, meds().checks);
  const showTable = Boolean(state.ui.medTable);
  const tableId = `med-table-${dose.id}`;
  return h('section', { class: 'section med-chart-sec', 'aria-labelledby': 'med-chart-h' },
    h('div', { class: 'section-head' },
      h('h2', { id: 'med-chart-h', text: title }),
      h('span', { class: 'count', text: '1–5, by hours since dose' })),
    chartLegend(),
    points.length || isToday
      ? medChart({
        points,
        events: dayEvents(dose),
        nowH: isToday ? hoursSince(dose, t) : null,
        startTs: dose.ts,
        label: `Chart of focus, mood and anxiety by hours since the dose. ${curveSentence(points)}${points.length ? ' Use the left and right arrow keys to read each check-in.' : ''}`,
      })
      : null,
    points.length
      ? h('p', { class: 'fine med-chart-hint', text: 'Drag across the chart, or focus it and use the arrow keys, to read each check-in.' })
      : h('p', { class: 'empty', text: isToday ? 'Your first check-in draws the first points.' : 'No check-ins were logged this day.' }),
    points.length
      ? h('button', { class: 'text-btn med-table-toggle', type: 'button', 'aria-expanded': String(showTable), 'aria-controls': tableId, onclick: () => { state.ui.medTable = !showTable; render(); } }, showTable ? 'Hide table' : 'Show as table')
      : null,
    points.length && showTable ? h('div', { id: tableId }, medTable(points, `Check-ins on ${fmtDay(dose.ts)}`)) : null);
}

function remindersCard(dose, t) {
  const due = nextDue(dose, meds().checks, t, settings());
  if (!due) return null;
  const r = state.ui.medRemind;
  const on = Boolean(r && r.on && r.doseId === dose.id);
  const upcoming = schedule(dose, meds().checks, t, settings()).filter((x) => x.ts > t);
  const ics = () => buildIcs(dose, settings(), { from: t, stamp: now() });
  const fallback = state.ui.medIcs === dose.id;
  return h('section', { class: 'card med-remind', 'aria-labelledby': 'med-remind-h' },
    h('span', { class: 'eyebrow', id: 'med-remind-h', text: 'Reminders' }),
    h('p', { class: 'fine', text: 'The banner at the top always shows when a check-in is due.' }),
    on
      ? h('div', { class: 'med-remind-on' },
        h('span', { class: 'status', text: r.perm === 'granted' ? 'Reminding you while open' : 'Reminding you in the app' }),
        h('button', { class: 'text-btn', type: 'button', onclick: disableReminders }, 'Turn off'))
      : h('button', { class: 'btn ghost block', type: 'button', onclick: () => enableReminders(dose) }, 'Remind me'),
    h('p', { class: 'fine', text: 'Works while Mindset is open. For reliable reminders, add them to your calendar.' }),
    h('button', { class: 'btn ghost block', type: 'button', onclick: () => {
      downloadFile(`mindset-check-ins-${dayKey(t)}.ics`, ics(), 'text/calendar;charset=utf-8');
      state.ui.medIcs = dose.id;
      render();
    } }, 'Add today’s check-ins to my calendar'),
    fallback
      ? h('div', { class: 'med-ics-fallback' },
        h('p', { class: 'fine', text: `If nothing downloaded (some browsers block it here), copy the calendar file and save it as a .ics file, or add these times by hand: ${upcoming.map((x) => fmtClock(x.ts)).join(', ')}.` }),
        h('button', { class: 'text-btn', type: 'button', onclick: async () => {
          if (await copyText(ics())) toast('Calendar file copied');
          else { state.ui.medCopyFail = 'ics'; render(); }
        } }, 'Copy calendar file'),
        state.ui.medCopyFail === 'ics' ? h('textarea', { class: 'med-copy-box', readonly: true, 'aria-label': 'Calendar file text', rows: '6' }, ics()) : null)
      : null);
}

function historySection(t, today) {
  const list = pastDoses(t).filter((d) => !today || d.id !== today.id);
  const shown = state.ui.medAllDays ? list : list.slice(0, 10);
  return h('section', { class: 'section', 'aria-labelledby': 'med-hist-h' },
    h('div', { class: 'section-head' }, h('h2', { id: 'med-hist-h', text: 'History' }), h('span', { class: 'count', text: list.length ? 'Avg focus · peak' : '' })),
    list.length
      ? h('ul', { class: 'list' }, shown.map((d) => {
        const st = dayStats(d, meds().checks);
        const cups = caffeineFor(d, meds().caffeine).length;
        const firstNote = d.note || st.notes[0]?.note || '';
        return h('li', {}, h('button', { class: 'med-day-row', type: 'button', onclick: () => go(`meds-day/${d.id}`) },
          h('span', { class: 'med-day-main' },
            h('span', { class: 'med-day-date', text: fmtDay(d.ts) }),
            h('span', { class: 'med-day-meta', text: `${fmtClock(d.ts)} · ${d.sleepHours != null ? `slept ${d.sleepHours}h` : 'sleep –'} · caffeine ×${cups}` }),
            h('span', { class: 'med-day-meta', text: foodText(d) }),
            firstNote ? h('span', { class: 'med-day-note', text: `“${firstNote}”` }) : null),
          focusSpark(dayCurve(d, meds().checks)),
          h('span', { class: 'med-day-num' },
            h('span', { class: 'med-day-avg', text: st.avgFocus == null ? '–' : fmt1(st.avgFocus) }),
            h('span', { class: 'med-day-peak', text: st.peakFocus ? `peak ${st.peakFocus.value}` : 'no check-ins' }))));
      }))
      : h('p', { class: 'empty', text: 'Past days show up here, each with its own chart.' }),
    list.length > shown.length ? h('button', { class: 'btn ghost', type: 'button', onclick: () => { state.ui.medAllDays = true; render(); } }, `Show ${list.length - shown.length} more`) : null);
}

function patternsCard(t) {
  const doses = pastDoses(t);
  if (!doses.length) return null;
  const pats = patterns(doses, meds().checks, meds().caffeine);
  const pos = (v) => `${(((v - 1) / 4) * 100).toFixed(1)}%`;
  const daysUsed = doses.filter((d) => checksFor(d, meds().checks).length).length;
  return h('section', { class: 'card med-pats', 'aria-labelledby': 'med-pat-h' },
    h('div', { class: 'section-head' },
      h('span', { class: 'eyebrow', id: 'med-pat-h', text: 'Patterns' }),
      pats.length ? h('span', { class: 'count', text: `small sample · ${daysUsed} days` }) : null),
    pats.length
      ? [
        pats.map((p) => {
          const word = p.metric === 'focus' ? 'Focus' : 'Anxiety';
          const read = Math.abs(p.diff) <= 0.25 ? 'About the same either way.' : `${word} ${fmt1(Math.abs(p.diff))} ${p.diff > 0 ? 'higher' : 'lower'} on “${p.a.label.toLowerCase()}” days.`;
          return h('div', { class: 'med-pat', role: 'group', 'aria-label': `${p.title}. ${p.measure}. ${p.a.label}: ${fmt1(p.a.avg)} over ${p.a.n} days. ${p.b.label}: ${fmt1(p.b.avg)} over ${p.b.n} days.` },
            h('p', { class: 'med-pat-title' }, h('strong', { text: p.title }), h('span', { class: 'med-pat-measure', text: p.measure })),
            h('div', { class: 'med-dumbbell', 'aria-hidden': 'true' },
              h('span', { class: 'med-db-track' }),
              h('span', { class: 'med-db-span', style: `left:${pos(Math.min(p.a.avg, p.b.avg))};width:calc(${pos(Math.max(p.a.avg, p.b.avg))} - ${pos(Math.min(p.a.avg, p.b.avg))})` }),
              h('span', { class: 'med-db-dot a', style: `left:${pos(p.a.avg)}` }),
              h('span', { class: 'med-db-dot b', style: `left:${pos(p.b.avg)}` }),
              h('span', { class: 'med-db-scale' }, h('span', { text: '1' }), h('span', { text: '3' }), h('span', { text: '5' }))),
            h('div', { class: 'med-pat-rows' },
              h('span', { class: 'med-pat-row' }, h('span', { class: 'med-db-dot a key', 'aria-hidden': 'true' }), h('strong', { text: fmt1(p.a.avg) }), h('span', { text: `${p.a.label} · ${p.a.n} days` })),
              h('span', { class: 'med-pat-row' }, h('span', { class: 'med-db-dot b key', 'aria-hidden': 'true' }), h('strong', { text: fmt1(p.b.avg) }), h('span', { text: `${p.b.label} · ${p.b.n} days` }))),
            h('p', { class: 'fine med-pat-read', text: read }));
        }),
        h('p', { class: 'fine', text: 'Small sample. These are patterns in your own log, not proof: on real days lots of things change at once. Worth bringing to your prescriber rather than acting on alone.' }),
      ]
      : h('p', { class: 'fine', text: 'After a few more days, this compares days with and without breakfast, protein, a good sleep or lots of caffeine. It needs at least two days on each side before it says anything.' }));
}

function doctorCard(t) {
  if (!meds().doses.length) return null;
  const text = () => summaryText(meds().doses, meds().checks, meds().caffeine, meds().settings, now(), { days: 14 });
  const pre = h('pre', { class: 'med-summary', tabindex: '0', text: text() });
  const details = h('details', { class: 'med-summary-wrap', open: state.ui.medSummaryOpen ? true : null }, h('summary', { text: 'Preview the summary' }), pre);
  details.addEventListener('toggle', () => { state.ui.medSummaryOpen = details.open; });
  return h('section', { class: 'card med-doctor', 'aria-labelledby': 'med-doc-h' },
    h('span', { class: 'eyebrow', id: 'med-doc-h', text: 'For your doctor' }),
    h('p', { text: 'A plain-text summary of the last 14 days: dose times, how check-ins change hour by hour, food, sleep, caffeine and your notes. Paste it into an email or show it at your appointment.' }),
    h('button', { class: 'btn block', type: 'button', onclick: async () => {
      if (await copyText(text())) { toast('Summary copied'); return; }
      details.open = true;
      selectText(pre);
      toast('Copy isn’t allowed here. The text is selected so you can copy it yourself.');
    } }, 'Copy summary'),
    details,
    state.data.demo ? h('p', { class: 'fine', text: 'Right now this summarises the example data.' }) : null);
}

function settingsCard() {
  const st = settings();
  let every = st.everyMin;
  let hours = st.hours;
  const name = h('input', { type: 'text', id: 'med-set-name', maxlength: '40', value: st.name, autocomplete: 'off' });
  const mg = h('input', { type: 'number', id: 'med-set-mg', min: '0', max: '2000', step: 'any', inputmode: 'decimal', value: st.mg ?? '', placeholder: 'Optional' });
  const save = () => {
    const mgN = Number(mg.value);
    commit((d) => {
      d.meds.settings = cleanSettings({ ...d.meds.settings, name: name.value, mg: mg.value !== '' && mgN > 0 ? mgN : null, everyMin: every, hours });
    }, { keepDemo: true });
    scheduleReminder();
    toast('Saved');
  };
  return h('section', { class: 'card med-settings', id: 'med-settings', 'aria-labelledby': 'med-set-h' },
    h('span', { class: 'eyebrow', id: 'med-set-h', text: 'Medication settings' }),
    h('div', { class: 'med-form-row' },
      h('label', { class: 'field', for: 'med-set-name' }, h('span', { class: 'lbl', text: 'Name' }), name),
      h('label', { class: 'field med-mg-field', for: 'med-set-mg' }, h('span', { class: 'lbl', text: 'mg' }), mg)),
    h('div', { class: 'field' }, h('span', { class: 'lbl', text: 'Check in every' }),
      choiceChips(INTERVALS, { 30: '30 min', 60: '60 min', 90: '90 min' }, () => every, (v) => { every = v ?? every; }, 'Check-in interval')),
    h('div', { class: 'field' }, h('span', { class: 'lbl', text: 'Hours to track after a dose' }),
      choiceChips(TRACK_HOURS, Object.fromEntries(TRACK_HOURS.map((x) => [x, `${x}h`])), () => hours, (v) => { hours = v ?? hours; }, 'Hours to track')),
    h('p', { class: 'fine', text: 'Only used for the log and reminders. Your prescriber decides the dose.' }),
    h('button', { class: 'btn ghost', type: 'button', onclick: save }, 'Save settings'));
}

function safetyNote() {
  return h('p', { class: 'med-safety', role: 'note', text: SAFETY });
}

// ---------- views ----------
function medsView() {
  setAccent('calm');
  startTicker();
  scheduleIfNeeded();
  const t = now();
  const dose = doseToday(meds().doses, t);
  const due = dose ? nextDue(dose, meds().checks, t, settings()) : null;
  return [
    h('header', { class: 'topbar' },
      h('span', { class: 'brand', text: 'Meds' }),
      h('button', { class: 'text-btn med-top-link', type: 'button', onclick: () => document.getElementById('med-settings')?.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' }) }, 'Settings')),
    demoBanner(),
    dose ? heroToday(dose, t) : heroNoDose(t),
    dose ? dueBlock(dose, due) : null,
    h('div', { class: 'med-quick' },
      h('button', { class: 'btn ghost med-quick-btn', type: 'button', onclick: openCaffeineSheet }, h('span', { 'aria-hidden': 'true', class: 'med-quick-ico' }, cupIcon({ size: 16 })), '+ Caffeine'),
      dose ? h('button', { class: 'btn ghost med-quick-btn', type: 'button', onclick: openCheckSheet }, 'Check in') : null),
    dose ? chartSection(dose, t) : null,
    dose ? remindersCard(dose, t) : null,
    historySection(t, dose),
    patternsCard(t),
    doctorCard(t),
    safetyNote(),
    settingsCard(),
  ];
}

function dayView(id) {
  setAccent('calm');
  const dose = doseById(id);
  if (!dose) return [h('header', { class: 'topbar' }, backButton('Meds')), h('p', { class: 'empty', text: 'That day is no longer in your log.' })];
  const t = now();
  const st = dayStats(dose, meds().checks);
  const cups = caffeineFor(dose, meds().caffeine);
  const isToday = dayKey(dose.ts) === dayKey(t);
  return [
    h('header', { class: 'topbar' }, backButton('Meds'), h('button', { class: 'text-btn', type: 'button', onclick: () => openDoseSheet(doseById(id)) }, 'Edit')),
    h('section', { class: 'med-day-head' },
      h('span', { class: 'eyebrow', text: `${doseLabel(dose)} · ${fmtDay(dose.ts)}` }),
      h('h1', { class: 'page-title', text: `Taken ${fmtClock(dose.ts)}` }),
      h('p', { class: 'page-sub', text: `${foodText(dose)} · ${dose.sleepHours != null ? `slept ${dose.sleepHours}h` : 'sleep not logged'} · ${cups.length} caffeine${cups.length ? ` (${cups.map((c) => caffeineLabel(c.what).toLowerCase()).join(', ')})` : ''}` })),
    h('div', { class: 'stats' },
      stat(st.avgFocus == null ? '–' : fmt1(st.avgFocus), 'avg focus'),
      stat(st.peakFocus ? `${st.peakFocus.value}` : '–', st.peakFocus ? `peak, ~${fmtAbout(st.peakFocus.h)}` : 'peak'),
      stat(st.avgAnxiety == null ? '–' : fmt1(st.avgAnxiety), 'avg anxiety'),
      stat(String(st.count), st.count === 1 ? 'check-in' : 'check-ins')),
    st.focusWindow ? h('p', { class: 'fine', text: `Focus was 4 or 5 from about ${fmtAbout(st.focusWindow.from)} to ${fmtAbout(st.focusWindow.to)} after the dose.` }) : null,
    chartSection(dose, t, { title: 'The day’s curve', isToday }),
    dose.note || st.notes.length
      ? h('section', { class: 'section', 'aria-labelledby': 'med-notes-h' },
        h('div', { class: 'section-head' }, h('h2', { id: 'med-notes-h', text: 'Notes' })),
        h('ul', { class: 'list' },
          dose.note ? h('li', { class: 'med-note-row' }, h('span', { class: 'med-note-when', text: `${fmtClock(dose.ts)} · dose` }), h('p', { text: dose.note })) : null,
          st.notes.map((n) => h('li', { class: 'med-note-row' }, h('span', { class: 'med-note-when', text: `${fmtClock(n.ts)} · ${fmtHours(n.h)} in` }), h('p', { text: n.note })))))
      : null,
    safetyNote(),
  ];
}

// Re-arm the in-app reminder after a reload of the view (timers die with the page, not with renders).
function scheduleIfNeeded() {
  if (state.ui.medRemind?.on && !remindTimer) scheduleReminder();
}

// ---------- Today card ----------
export function medsCard() {
  const t = now();
  const dose = doseToday(meds().doses, t);
  if (!dose) return null;
  startTicker();
  const st = settings();
  const slots = schedule(dose, meds().checks, t, st);
  const due = nextDue(dose, meds().checks, t, st);
  return h('section', { class: 'card med-card', 'aria-labelledby': 'medcard-h' },
    h('div', { class: 'section-head' },
      h('span', { class: 'eyebrow', id: 'medcard-h', text: 'Meds' }),
      h('button', { class: 'text-btn', type: 'button', onclick: () => go('meds') }, 'Open')),
    h('p', { class: 'med-card-line' },
      h('strong', { text: dose.name || st.name }), ` · ${fmtClock(dose.ts)} · `,
      h('span', { 'data-med-since': String(dose.ts), text: `${fmtDur(t - dose.ts)} ago` })),
    doseTrack({ dose, slots, nowH: hoursSince(dose, t), compact: true, label: trackLabel(dose, slots, t) }),
    dueBlock(dose, due, { compact: true }));
}

registerView('meds', { tab: 'meds', render: () => medsView() });
registerView('meds-day', { tab: 'meds', render: (id) => dayView(id) });
registerAction('medDose', () => openDoseSheet());
registerAction('medCheckin', () => openCheckSheet());
registerAction('caffeine', () => openCaffeineSheet());
