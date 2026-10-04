// Shared runtime for every room: app state, saving, routing, DOM helper,
// sheets, toasts and time formatting. Rooms import from here and register
// their views with registerView(); app.js wires the tab bar and boots.

import { load, save, clearDemoLogs } from './store.js';
import { renderChart } from './chart.js';

export const HOUR = 3600000;
export const DAY = 24 * HOUR;

export const state = {
  data: load(),
  view: 'today', // current route, e.g. 'today', 'kid', 'worry/abc123'
  stack: [], // back stack of routes (cleared when a tab is tapped)
  ui: {}, // per-session UI state rooms may use freely (selected ranges, open panels…)
};

const $main = () => document.getElementById('main');
const $layer = () => document.getElementById('layer');
const $toast = () => document.getElementById('toast');

// ---------- DOM helper (all user text goes in via textContent) ----------
// h('button', { class: 'btn', onclick: fn, 'aria-pressed': 'true' }, 'Label', childNode, [more], null)
// props: class, text, style (string), on<Event> handlers, anything else -> setAttribute.
// null/false props and children are skipped.
export function h(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

// SVG version of h() for diagrams.
const SVGNS = 'http://www.w3.org/2000/svg';
export function s(tag, attrs = {}, ...children) {
  const node = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'text') node.textContent = v;
    else node.setAttribute(k, v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

// ---------- time & number formatting ----------
export const now = () => Date.now();
export const fmt1 = (n) => (n == null || Number.isNaN(n) ? '–' : (Math.round(n * 10) / 10).toFixed(1));

export function startOfDay(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// Local calendar day as 'YYYY-MM-DD'.
export function dayKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function fmtTime(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function fmtWhen(ts) {
  const diff = Math.round((startOfDay(Date.now()) - startOfDay(ts)) / DAY);
  if (diff === 0) return `Today, ${fmtTime(ts)}`;
  if (diff === 1) return `Yesterday, ${fmtTime(ts)}`;
  return `${new Date(ts).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}, ${fmtTime(ts)}`;
}

export function fmtDur(ms) {
  const m = Math.max(0, Math.round(ms / 60000));
  const hh = Math.floor(m / 60);
  const mm = m % 60;
  if (!hh) return `${mm}m`;
  return mm ? `${hh}h ${mm}m` : `${hh}h`;
}

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// The kid's name lives only in this browser (Settings), never in the code.
export function kidName() {
  return state.data.profile.kidName?.trim() || 'your kid';
}
export function KidName() {
  const n = kidName();
  return n === 'your kid' ? 'Your kid' : n;
}

// ---------- saving ----------
export function persist() {
  if (!save(state.data)) toast('Couldn’t save. This browser is blocking storage.');
}

// The one way rooms change data.
// commit(data => { data.kid.tries.push({...}) })
// While example data is showing, the first real entry clears the example *logs*
// (starter libraries like foods, activities and notes-to-self are kept).
// Inside the mutator, look things up by id on the `data` argument; objects you
// captured before calling commit() may have been replaced by the clear.
export function commit(mutate, { keepDemo = false, quiet = false } = {}) {
  let cleared = false;
  if (state.data.demo && !keepDemo) {
    state.data = clearDemoLogs(state.data);
    cleared = true;
  }
  mutate(state.data);
  persist();
  render();
  if (cleared && !quiet) toast('Examples cleared. This is your own data now.');
}

let toastTimer;
export function toast(msg) {
  const t = $toast();
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 3200);
}

// ---------- accent ----------
// The accent color follows state: 'up' / 'down' for the mood line,
// 'ok' / 'edge' / 'over' / 'low' for nervous-system zones, 'calm' for neutral.
const ACCENTS = ['trend-up', 'trend-down', 'zone-ok', 'zone-edge', 'zone-over', 'zone-low', 'zone-calm'];
export function setAccent(kind) {
  const cls = { up: 'trend-up', down: 'trend-down', ok: 'zone-ok', edge: 'zone-edge', over: 'zone-over', low: 'zone-low', calm: 'zone-calm' }[kind] || 'zone-calm';
  document.body.classList.remove(...ACCENTS);
  document.body.classList.add(cls);
}

// ---------- routing ----------
// registerView('kid', { tab: 'kid', render: (param) => [nodes] })
// A route is 'name' or 'name/param' (e.g. 'worry/abc123'); param is passed to render.
const views = new Map();
export function registerView(name, def) {
  views.set(name, def);
}

const actions = new Map();
// registerAction('overload', () => …) lets one room open another room's flow.
export function registerAction(name, fn) {
  actions.set(name, fn);
}
export function runAction(name, ...args) {
  const fn = actions.get(name);
  if (fn) return fn(...args);
  toast('That part of the app isn’t built yet.');
}

export const TABS = ['today', 'kid', 'meds', 'learn'];

export function go(route, { replace = false } = {}) {
  const name = route.split('/')[0];
  if (TABS.includes(route)) state.stack = [];
  else if (!replace && state.view !== route) state.stack.push(state.view);
  state.view = route;
  render();
  window.scrollTo(0, 0);
  $main()?.focus({ preventScroll: true });
  return name;
}

export function back() {
  const prev = state.stack.pop();
  state.view = prev || currentTab();
  render();
  window.scrollTo(0, 0);
}

export function currentTab() {
  const name = state.view.split('/')[0];
  const def = views.get(name);
  return def?.tab || (TABS.includes(name) ? name : 'today');
}

// A back button for non-tab screens.
export function backButton(label = 'Back') {
  return h('button', { class: 'back', type: 'button', onclick: back }, `‹ ${label}`);
}

let afterRenderQueue = [];
// Run fn once the current view is in the DOM (for things that measure width).
export function afterRender(fn) {
  afterRenderQueue.push(fn);
}

// Line chart that draws after mount. opts are passed to chart.js renderChart.
export function chartSlot(opts, className = 'chart') {
  const host = h('div', { class: className });
  afterRender(() => renderChart(host, opts));
  return host;
}

export function render() {
  const [name, ...rest] = state.view.split('/');
  const def = views.get(name);
  if (!def) {
    state.view = 'today';
    if (views.has('today')) return render();
    return;
  }
  afterRenderQueue = [];
  let parts;
  try {
    parts = def.render(rest.join('/') || null) || [];
  } catch (err) {
    console.error(err);
    parts = [h('div', { class: 'banner' }, 'Something went wrong drawing this screen. Your data is safe. ', h('button', { class: 'text-btn', type: 'button', onclick: () => go('today') }, 'Go to Today'))];
  }
  $main().replaceChildren(...(Array.isArray(parts) ? parts : [parts]).flat().filter(Boolean));
  const tab = def.tab || name;
  for (const t of document.querySelectorAll('.tab[data-view]')) {
    if (t.dataset.view === tab) t.setAttribute('aria-current', 'page');
    else t.removeAttribute('aria-current');
  }
  const kidTab = document.getElementById('tab-kid-label');
  if (kidTab) kidTab.textContent = state.data.profile.kidName?.trim() || 'Kid';
  const q = afterRenderQueue;
  afterRenderQueue = [];
  for (const fn of q) fn();
}

// ---------- sheets ----------
// openSheet('Title', contentNode, { full: true, onClose }) -> the sheet element.
// `full` makes it a full-screen takeover (used by the overload flow).
let lastFocus = null;
let sheetOnClose = null;
export function openSheet(title, content, { full = false, onClose = null, label = null } = {}) {
  lastFocus = document.activeElement;
  sheetOnClose = onClose;
  $toast().hidden = true;
  const titleId = 'sheet-title';
  const sheet = h('div', { class: `sheet${full ? ' full' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId },
    full ? null : h('span', { class: 'grab', 'aria-hidden': 'true' }),
    h('div', { class: 'sheet-head' },
      h('h2', { id: titleId, text: title }),
      h('button', { class: 'close-x', type: 'button', 'aria-label': label || 'Close', onclick: () => closeSheet() }, '✕')),
    content);
  const scrim = h('div', { class: `scrim${full ? ' full' : ''}`, onclick: (e) => { if (e.target === scrim) closeSheet(); } }, sheet);
  scrim.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });
  $layer().replaceChildren(scrim);
  document.body.style.overflow = 'hidden';
  (sheet.querySelector('[data-autofocus]') || sheet.querySelector('.sheet-head ~ * button, .sheet-head ~ * input, .sheet-head ~ * textarea') || sheet.querySelector('button'))?.focus();
  return sheet;
}

export function setSheetTitle(text) {
  const t = document.getElementById('sheet-title');
  if (t) t.textContent = text;
}

export function closeSheet() {
  $layer().replaceChildren();
  document.body.style.overflow = '';
  const cb = sheetOnClose;
  sheetOnClose = null;
  cb?.();
  lastFocus?.focus?.();
}

// ---------- shared UI pieces ----------
export function demoBanner() {
  if (!state.data.demo) return null;
  return h('div', { class: 'banner' },
    h('span', {}, h('strong', { text: 'Example data. ' }), 'Your first real entry clears it.'),
    h('button', { class: 'text-btn', type: 'button', onclick: () => commit(() => {}, { quiet: true }) }, 'Clear now'));
}

export function stat(v, k) {
  return h('div', { class: 'stat' }, h('span', { class: 'v', text: v }), h('span', { class: 'k', text: k }));
}

export function sectionHead(title, aside = null, id = null) {
  return h('div', { class: 'section-head' }, h('h2', { id, text: title }), aside ? (aside instanceof Node ? aside : h('span', { class: 'count', text: aside })) : null);
}

// Toggle chips. chips(['a','b'], selectedSet, onToggle, {labels}) — multi-select.
export function chipGroup(options, isOn, onToggle, { label = '', labels = {}, cls = '' } = {}) {
  return h('div', { class: 'chips', role: 'group', 'aria-label': label },
    options.map((o) => {
      const b = h('button', { class: `chip ${cls}`, type: 'button', 'aria-pressed': String(isOn(o)) }, labels[o] || o);
      b.addEventListener('click', () => { onToggle(o); b.setAttribute('aria-pressed', String(isOn(o))); });
      return b;
    }));
}

// A 1–N rating row of buttons (single select). Returns { node, get() }.
export function scalePicker(id, { min = 1, max = 5, value = null, low = '', high = '', label = '' } = {}) {
  let current = value;
  const row = h('div', { class: 'scale-pick', role: 'radiogroup', 'aria-label': label, id });
  const draw = () => row.replaceChildren(...Array.from({ length: max - min + 1 }, (_, i) => {
    const v = min + i;
    return h('button', { type: 'button', class: 'scale-btn', role: 'radio', 'aria-checked': String(current === v), onclick: () => { current = v; draw(); row.dispatchEvent(new Event('change')); } }, String(v));
  }));
  draw();
  const node = h('div', { class: 'scale-wrap' }, row, low || high ? h('div', { class: 'scale' }, h('span', { text: low }), h('span', { text: high })) : null);
  return { node, row, get: () => current, set: (v) => { current = v; draw(); } };
}
