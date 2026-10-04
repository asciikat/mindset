import {
  DAY, RANGES, RANGE_LABELS, TAGS, OUTCOMES,
  moodLabel, sortByTs, average, rangeWindow, change, formatDelta,
  suggestTicker, cleanTicker, worryStats, lookBack, tagInsights, needsSupport, weeklyRecap, isValidData,
} from './logic.js';
import { load, save, uid, emptyData } from './store.js';
import { renderChart, sparkline } from './chart.js';

const state = {
  data: load(),
  view: 'home', // 'home' | 'insights' | worry id
  range: '1M',
  pending: null, // in-page confirmations on the insights screen
};

const $main = document.getElementById('main');
const $layer = document.getElementById('layer');
const $toast = document.getElementById('toast');

// ---------- tiny DOM helper (all user text goes in via textContent) ----------
function h(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2).toLowerCase(), v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

const now = () => Date.now();
const worriesOpen = () => state.data.worries.filter((w) => w.closedTs == null).sort((a, b) => b.openedTs - a.openedTs);
const worryById = (id) => state.data.worries.find((w) => w.id === id);
const fmt1 = (n) => (n == null ? '–' : (Math.round(n * 10) / 10).toFixed(1));

function fmtWhen(ts) {
  const d = new Date(ts);
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.floor((today.getTime() - new Date(ts).setHours(0, 0, 0, 0)) / DAY);
  if (diff === 0) return `Today, ${time}`;
  if (diff === 1) return `Yesterday, ${time}`;
  return `${d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}, ${time}`;
}

function persist() {
  if (!save(state.data)) toast('Couldn’t save. This browser is blocking storage.');
}

let toastTimer;
function toast(msg) {
  $toast.textContent = msg;
  $toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $toast.hidden = true; }, 2800);
}

function setTrend(up) {
  document.body.classList.toggle('trend-up', up);
  document.body.classList.toggle('trend-down', !up);
}

// ---------- routing ----------
function go(view) {
  state.view = view;
  state.pending = null;
  render();
  window.scrollTo(0, 0);
  $main.focus({ preventScroll: true });
}

function render() {
  const v = state.view;
  const parts = v === 'home' ? homeView() : v === 'insights' ? insightsView() : worryById(v) ? worryView(worryById(v)) : null;
  if (parts) $main.replaceChildren(...parts.filter(Boolean));
  else { state.view = 'home'; return render(); }
  for (const t of document.querySelectorAll('.tab')) {
    if (t.dataset.view === (v === 'insights' ? 'insights' : 'home')) t.setAttribute('aria-current', 'page');
    else t.removeAttribute('aria-current');
  }
  drawCharts();
}

// Charts need the element to be in the DOM to measure its width.
let pendingCharts = [];
function chartSlot(opts) {
  const host = h('div', { class: 'chart' });
  pendingCharts.push([host, opts]);
  return host;
}
function drawCharts() {
  for (const [host, opts] of pendingCharts) renderChart(host, opts);
  pendingCharts = [];
}

// ---------- shared pieces ----------
function demoBanner() {
  if (!state.data.demo) return null;
  return h('div', { class: 'banner' },
    h('span', {}, h('strong', { text: 'Example data. ' }), 'Your first check-in replaces it.'),
    h('button', { class: 'text-btn', type: 'button', onclick: () => { state.data = emptyData(); persist(); render(); toast('Examples cleared'); } }, 'Clear now'));
}

function supportBanner() {
  if (state.data.demo || !needsSupport(state.data.checkins, now())) return null;
  return h('div', { class: 'banner support', role: 'note' },
    h('strong', { text: 'Your last few check-ins have been rough.' }),
    h('p', { text: 'You don’t have to carry this alone. Talking to someone you trust helps, and so can a trained listener.' }),
    h('p', {}, 'In the US, call or text ', h('strong', { text: '988' }), '. Elsewhere, find a free line at ',
      h('a', { href: 'https://findahelpline.com', target: '_blank', rel: 'noopener' }, 'findahelpline.com'), '.'));
}

function entryRow(c, { showTicker = true } = {}) {
  const w = c.worryId ? worryById(c.worryId) : null;
  return h('li', { class: 'entry' },
    h('span', { class: 'mood-dot', 'aria-label': `Mood ${c.mood} of 10` }, String(c.mood)),
    h('span', { class: 'meta' }, fmtWhen(c.ts), showTicker && w ? h('span', { class: 'ticker', text: w.ticker }) : null,
      (c.tags || []).length ? h('span', { text: c.tags.join(' · ') }) : null),
    c.note ? h('p', { class: 'note', text: c.note }) : h('p', { class: 'note none', text: 'No note' }));
}

function positionRow(w) {
  const s = worryStats(w, state.data.checkins, now());
  const overall = average(state.data.checkins.map((c) => c.mood));
  const first = s.points[0]?.mood, last = s.points[s.points.length - 1]?.mood;
  const dir = s.points.length > 1 ? (last >= first ? 'up' : 'down') : 'flat';
  const vs = s.avgMood == null || overall == null ? 'flat' : s.avgMood >= overall ? 'up' : 'down';
  const spark = sparkline(s.points);
  spark.classList.add(dir === 'flat' ? 'up' : dir);
  return h('li', {},
    h('button', { class: 'position', type: 'button', onclick: () => go(w.id) },
      h('span', { style: 'min-width:0;display:grid;gap:2px' },
        h('span', { class: 'ticker', text: w.ticker }),
        h('span', { class: 'name', text: w.name })),
      spark,
      h('span', { class: `pill ${vs}`, title: 'Average mood on check-ins about this' }, s.avgMood == null ? 'new' : fmt1(s.avgMood))));
}

function lookBackCard() {
  const lb = lookBack(state.data.worries, now(), 30);
  if (!lb.opened) return null;
  const pct = (n) => `${(n / lb.opened) * 100}%`;
  return h('section', { class: 'card', 'aria-labelledby': 'lb-h' },
    h('span', { class: 'eyebrow', id: 'lb-h' }, 'Look back · 30 days'),
    h('p', { class: 'lookback-line' },
      'You opened ', h('b', {}, `${lb.opened} ${lb.opened === 1 ? 'worry' : 'worries'}`), '. ',
      lb.closed ? h('b', {}, `${lb.closed} ${lb.closed === 1 ? 'is' : 'are'} already closed.`) : 'None closed yet. Give it time.'),
    h('div', { class: 'outcome-bar', role: 'img', 'aria-label': `${lb.resolved} resolved, ${lb.faded} faded, ${lb.letGo} let go, ${lb.stillOpen} open` },
      lb.resolved ? h('span', { class: 'seg-resolved', style: `width:${pct(lb.resolved)}` }) : null,
      lb.faded ? h('span', { class: 'seg-faded', style: `width:${pct(lb.faded)}` }) : null,
      lb.letGo ? h('span', { class: 'seg-letgo', style: `width:${pct(lb.letGo)}` }) : null,
      lb.stillOpen ? h('span', { class: 'seg-open', style: `width:${pct(lb.stillOpen)}` }) : null),
    h('div', { class: 'legend' },
      h('span', {}, h('i', { class: 'seg-resolved' }), `Resolved ${lb.resolved}`),
      h('span', {}, h('i', { class: 'seg-faded' }), `Faded ${lb.faded}`),
      h('span', {}, h('i', { class: 'seg-letgo' }), `Let go ${lb.letGo}`),
      h('span', {}, h('i', { class: 'seg-open' }), `Open ${lb.stillOpen}`)));
}

// ---------- home ----------
function homeView() {
  const t = now();
  const win = rangeWindow(state.data.checkins, state.range, t);
  const ch = change(win);
  setTrend(ch ? ch.up : true);

  const num = h('span', { class: 'hero-num' });
  const word = h('span', { class: 'hero-word' });
  const move = h('span', { class: 'move' });
  const when = h('span', { class: 'when' });
  const readout = h('div', { class: 'readout', 'aria-live': 'polite' });

  const showResting = () => {
    if (!ch) {
      num.replaceChildren('–');
      word.textContent = '';
      move.textContent = '';
      when.textContent = state.data.checkins.length ? `No check-ins ${RANGE_LABELS[state.range].toLowerCase()}` : 'No check-ins yet';
      readout.replaceChildren(h('span', { class: 'hint', text: 'Tap Check in to log how you feel and what’s on your mind.' }));
      return;
    }
    num.replaceChildren(String(ch.last), h('small', { text: '/10' }));
    word.textContent = moodLabel(ch.last);
    move.textContent = `${ch.delta >= 0 ? '▲' : '▼'} ${formatDelta(ch.delta, ch.pct)}`;
    when.textContent = RANGE_LABELS[state.range];
    readout.replaceChildren(h('span', { class: 'hint', text: win.points.length > 1 ? 'Drag across the line to read past check-ins.' : 'Check in again to draw your line.' }));
  };

  const onScrub = (p) => {
    if (!p) return showResting();
    const d = p.mood - win.baseline;
    num.replaceChildren(String(p.mood), h('small', { text: '/10' }));
    word.textContent = moodLabel(p.mood);
    move.textContent = `${d >= 0 ? '▲' : '▼'} ${formatDelta(d, win.baseline ? (d / win.baseline) * 100 : 0)}`;
    when.textContent = fmtWhen(p.ts);
    const w = p.worryId ? worryById(p.worryId) : null;
    readout.replaceChildren(
      p.note ? h('q', { text: p.note }) : h('span', { class: 'hint', text: 'No note on this check-in.' }),
      w ? h('span', {}, '  ', h('span', { class: 'ticker', text: w.ticker })) : null);
  };
  showResting();

  const ranges = h('div', { class: 'ranges', role: 'group', 'aria-label': 'Time range' },
    Object.keys(RANGES).map((r) => h('button', {
      class: 'range', type: 'button', 'aria-pressed': String(r === state.range),
      onclick: () => { state.range = r; render(); },
    }, r)));

  const open = worriesOpen();
  const recent = sortByTs(state.data.checkins).slice(-5).reverse();

  return [
    h('header', { class: 'topbar' },
      h('span', { class: 'brand', text: 'Mindset' }),
      h('span', { class: 'topdate', text: new Date(t).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' }) })),
    demoBanner(),
    supportBanner(),
    h('section', { class: 'quote', 'aria-label': 'Your mood' },
      h('span', { class: 'eyebrow', text: 'Your mood' }),
      h('div', { class: 'hero-row' }, num, word),
      h('div', { class: 'delta' }, move, when),
      chartSlot({ ...win, onScrub, label: `Mood line, ${RANGE_LABELS[state.range].toLowerCase()}. Use arrow keys to read check-ins.` }),
      readout,
      ranges),
    h('section', { class: 'section', 'aria-labelledby': 'pos-h' },
      h('div', { class: 'section-head' }, h('h2', { id: 'pos-h', text: 'Positions' }), h('span', { class: 'count', text: 'Avg mood when it comes up' })),
      open.length
        ? h('ul', { class: 'list' }, open.map(positionRow))
        : h('p', { class: 'empty', text: 'Nothing weighing on you right now. When something is, add it from Check in.' })),
    lookBackCard(),
    h('section', { class: 'section', 'aria-labelledby': 'recent-h' },
      h('div', { class: 'section-head' }, h('h2', { id: 'recent-h', text: 'Recent' }),
        recent.length ? h('button', { class: 'text-btn', type: 'button', onclick: () => go('insights') }, 'All check-ins') : null),
      recent.length ? h('ul', { class: 'list' }, recent.map((c) => entryRow(c))) : h('p', { class: 'empty', text: 'Your check-ins will show up here.' })),
  ];
}

// ---------- worry detail ----------
function worryView(w) {
  const t = now();
  const s = worryStats(w, state.data.checkins, t);
  const overall = average(state.data.checkins.map((c) => c.mood));
  const first = s.points[0]?.mood, last = s.points[s.points.length - 1]?.mood;
  setTrend(s.points.length < 2 || last >= first);
  const isOpen = w.closedTs == null;

  const readout = h('div', { class: 'readout', 'aria-live': 'polite' },
    h('span', { class: 'hint', text: s.points.length > 1 ? 'Dotted line is your overall average. Drag to read each check-in.' : 'Each check-in about this adds a point.' }));
  const onScrub = (p) => {
    if (!p) return readout.replaceChildren(h('span', { class: 'hint', text: 'Dotted line is your overall average. Drag to read each check-in.' }));
    readout.replaceChildren(h('span', {}, `${p.mood}/10 · ${fmtWhen(p.ts)}  `), p.note ? h('q', { text: p.note }) : null);
  };

  const vsAvg = s.avgMood != null && overall != null ? s.avgMood - overall : null;

  const control = isOpen ? controlCard(w) : null;

  return [
    h('header', { class: 'topbar' },
      h('button', { class: 'back', type: 'button', onclick: () => go('home') }, '‹ Home'),
      h('span', { class: `status ${isOpen ? '' : 'closed'}` }, isOpen ? 'Open' : OUTCOMES[w.outcome] || 'Closed')),
    h('section', { class: 'pos-head' },
      h('span', { class: 'ticker', text: w.ticker }),
      h('h1', { text: w.name })),
    h('div', { class: 'stats' },
      stat(`${s.heldDays}`, s.heldDays === 1 ? 'day held' : 'days held'),
      stat(`${s.mentions}`, s.mentions === 1 ? 'check-in' : 'check-ins'),
      stat(fmt1(s.avgMood), 'avg mood'),
      stat(vsAvg == null ? '–' : `${vsAvg >= 0 ? '+' : '−'}${fmt1(Math.abs(vsAvg))}`, 'vs average')),
    h('section', { class: 'quote' },
      chartSlot({ points: s.points, baseline: overall, start: w.openedTs, end: w.closedTs ?? t, onScrub, height: 170, label: `Mood on check-ins about ${w.ticker}` }),
      readout),
    control,
    h('section', { class: 'section' },
      isOpen
        ? h('div', { class: 'btn-row' },
          h('button', { class: 'btn ghost', type: 'button', onclick: () => openCheckin(w.id) }, 'Log about this'),
          h('button', { class: 'btn', type: 'button', onclick: () => openSell(w) }, `Close $${w.ticker}`))
        : h('div', { class: 'btn-row' },
          h('button', { class: 'btn ghost', type: 'button', onclick: () => { w.closedTs = null; w.outcome = null; persist(); render(); toast(`$${w.ticker} reopened`); } }, 'Reopen'))),
    h('section', { class: 'section', 'aria-labelledby': 'hist-h' },
      h('div', { class: 'section-head' }, h('h2', { id: 'hist-h', text: 'Check-ins' })),
      s.points.length
        ? h('ul', { class: 'list' }, [...s.points].reverse().map((c) => entryRow(c, { showTicker: false })))
        : h('p', { class: 'empty', text: 'None yet.' })),
  ];
}

function stat(v, k) {
  return h('div', { class: 'stat' }, h('span', { class: 'v', text: v }), h('span', { class: 'k', text: k }));
}

function controlCard(w) {
  const pick = (val) => { w.control = w.control === val ? null : val; persist(); render(); };
  const body = [];
  if (w.control === 'mine') {
    const input = h('input', { type: 'text', id: `step-${w.id}`, value: w.nextStep || '', placeholder: 'e.g. Email Sam by noon', maxlength: '140' });
    body.push(
      h('label', { class: 'field', for: `step-${w.id}` }, h('span', { class: 'lbl', text: 'One small next step' }), input),
      h('button', { class: 'btn ghost', type: 'button', onclick: () => { w.nextStep = input.value.trim(); persist(); toast('Next step saved'); } }, 'Save step'));
  } else if (w.control === 'not-mine') {
    body.push(
      h('p', { text: 'You can’t steer this one. Notice it, and close it as “Let it go” when you’re ready.' }),
      h('p', { class: 'prompt-q', text: 'What would you tell a friend who was carrying this?' }));
  }
  return h('section', { class: 'card', 'aria-labelledby': `ctl-${w.id}` },
    h('span', { class: 'eyebrow', id: `ctl-${w.id}`, text: 'Is this in your control?' }),
    h('div', { class: 'choice-row' },
      h('button', { class: 'choice', type: 'button', 'aria-pressed': String(w.control === 'mine'), onclick: () => pick('mine') }, 'Some of it', h('span', { text: 'Pick one step' })),
      h('button', { class: 'choice', type: 'button', 'aria-pressed': String(w.control === 'not-mine'), onclick: () => pick('not-mine') }, 'Not really', h('span', { text: 'Practice letting go' }))),
    body);
}

// ---------- insights ----------
function insightsView() {
  const t = now();
  const all = state.data.checkins;
  setTrend((change(rangeWindow(all, '1W', t)) || { up: true }).up);
  const recap = weeklyRecap(all, state.data.worries, t);
  const tags = tagInsights(all);
  const closed = state.data.worries.filter((w) => w.closedTs != null).sort((a, b) => b.closedTs - a.closedTs);
  const history = sortByTs(all).reverse();
  const shown = state.showAll ? history : history.slice(0, 20);
  const maxDiff = Math.max(1, ...tags.map((r) => Math.abs(r.diff)));

  return [
    h('header', { class: 'topbar' }, h('span', { class: 'brand', text: 'Insights' })),
    demoBanner(),
    recap
      ? h('section', { class: 'card', 'aria-labelledby': 'wk-h' },
        h('span', { class: 'eyebrow', id: 'wk-h', text: 'This week' }),
        h('div', { class: 'stats' },
          stat(String(recap.count), recap.count === 1 ? 'check-in' : 'check-ins'),
          stat(fmt1(recap.avg), 'avg mood'),
          stat(String(recap.closed.length), 'closed')),
        h('p', {}, h('strong', { text: `Best moment: ${recap.best.mood}/10 · ${fmtWhen(recap.best.ts)}` }),
          recap.best.note ? h('span', {}, ' ', h('q', { text: recap.best.note })) : null),
        recap.heaviest
          ? h('p', {}, 'Heaviest: ', h('button', { class: 'text-btn', type: 'button', onclick: () => go(recap.heaviest.worry.id) }, `$${recap.heaviest.worry.ticker}`),
            ` came up ${recap.heaviest.mentions}× at an average of ${fmt1(recap.heaviest.avgMood)}.`)
          : null)
      : h('p', { class: 'empty', text: 'No check-ins this week yet.' }),
    lookBackCard(),
    h('section', { class: 'section', 'aria-labelledby': 'tag-h' },
      h('div', { class: 'section-head' }, h('h2', { id: 'tag-h', text: 'Patterns' }), h('span', { class: 'count', text: 'Mood vs your average' })),
      tags.length
        ? h('div', {}, tags.map((r) => {
          const dir = r.diff >= 0 ? 'up' : 'down';
          return h('div', { class: 'tagrow' },
            h('span', { class: 'tagname', text: r.tag }),
            h('span', { class: 'diverge', 'aria-hidden': 'true' }, h('span', { class: dir, style: `width:${(Math.abs(r.diff) / maxDiff) * 50}%` })),
            h('span', { class: `val ${dir}`, title: `${r.count} check-ins` }, `${r.diff >= 0 ? '+' : '−'}${fmt1(Math.abs(r.diff))}`));
        }), h('p', { class: 'fine', text: 'Based on tags you add when you check in. Needs at least two check-ins per tag.' }))
        : h('p', { class: 'empty', text: 'Add tags when you check in, and patterns show up here.' })),
    h('section', { class: 'section', 'aria-labelledby': 'closed-h' },
      h('div', { class: 'section-head' }, h('h2', { id: 'closed-h', text: 'Closed positions' }), h('span', { class: 'count', text: `${closed.length}` })),
      closed.length
        ? h('ul', { class: 'list' }, closed.map((w) => {
          const s = worryStats(w, all, t);
          return h('li', {}, h('button', { class: 'position', type: 'button', onclick: () => go(w.id) },
            h('span', { style: 'min-width:0;display:grid;gap:2px' }, h('span', { class: 'ticker', text: w.ticker }), h('span', { class: 'name', text: `${OUTCOMES[w.outcome] || 'Closed'} · held ${s.heldDays} ${s.heldDays === 1 ? 'day' : 'days'}` })),
            h('span'),
            h('span', { class: 'pill flat' }, fmt1(s.avgMood))));
        }))
        : h('p', { class: 'empty', text: 'When you close a worry, it lands here.' })),
    h('section', { class: 'section', 'aria-labelledby': 'all-h' },
      h('div', { class: 'section-head' }, h('h2', { id: 'all-h', text: 'All check-ins' }), h('span', { class: 'count', text: `${history.length}` })),
      history.length ? h('ul', { class: 'list' }, shown.map((c) => entryRow(c))) : h('p', { class: 'empty', text: 'None yet.' }),
      history.length > shown.length ? h('button', { class: 'btn ghost', type: 'button', onclick: () => { state.showAll = true; render(); } }, `Show ${history.length - shown.length} more`) : null),
    dataCard(),
    h('p', { class: 'fine' }, 'Mindset is a reflection tool, not therapy. If things feel heavy for a while, talk to someone. In the US, call or text 988. Elsewhere, see ',
      h('a', { href: 'https://findahelpline.com', target: '_blank', rel: 'noopener' }, 'findahelpline.com'), '.'),
  ];
}

function dataCard() {
  const fileInput = h('input', { type: 'file', id: 'import-file', accept: 'application/json,.json', class: 'visually-hidden' });
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      if (!isValidData(parsed)) throw new Error('shape');
      state.pending = { kind: 'import', data: { version: 1, demo: false, checkins: parsed.checkins, worries: parsed.worries } };
    } catch {
      toast('That file isn’t a Mindset backup.');
    }
    render();
  });

  const json = () => JSON.stringify({ ...state.data, demo: false, exportedAt: new Date().toISOString() }, null, 2);
  const download = () => {
    const url = URL.createObjectURL(new Blob([json()], { type: 'application/json' }));
    const a = h('a', { href: url, download: `mindset-${new Date().toISOString().slice(0, 10)}.json` });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const copy = () => navigator.clipboard.writeText(json()).then(() => toast('Backup copied'), () => toast('Copy isn’t allowed here. Use Download.'));

  let confirmRow = null;
  const p = state.pending;
  if (p?.kind === 'import') {
    confirmRow = h('div', { class: 'banner' },
      h('span', {}, `Replace everything with ${p.data.checkins.length} check-ins and ${p.data.worries.length} positions from the file?`),
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn', type: 'button', onclick: () => { state.data = p.data; state.pending = null; persist(); render(); toast('Backup imported'); } }, 'Replace'),
        h('button', { class: 'btn ghost', type: 'button', onclick: () => { state.pending = null; render(); } }, 'Cancel')));
  } else if (p?.kind === 'wipe') {
    confirmRow = h('div', { class: 'banner' },
      h('span', {}, 'Delete every check-in and position? This can’t be undone.'),
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn danger', type: 'button', onclick: () => { state.data = emptyData(); state.pending = null; persist(); go('home'); toast('Everything deleted'); } }, 'Delete everything'),
        h('button', { class: 'btn ghost', type: 'button', onclick: () => { state.pending = null; render(); } }, 'Cancel')));
  }

  return h('section', { class: 'card', 'aria-labelledby': 'data-h' },
    h('span', { class: 'eyebrow', id: 'data-h', text: 'Your data' }),
    h('p', { class: 'fine', text: 'Everything stays on this device. Nothing is uploaded. Back it up if you switch phones or clear your browser.' }),
    h('div', { class: 'btn-row' },
      h('button', { class: 'btn ghost', type: 'button', onclick: download }, 'Download backup'),
      h('button', { class: 'btn ghost', type: 'button', onclick: copy }, 'Copy backup'),
      h('label', { class: 'btn ghost', for: 'import-file', tabindex: '0', role: 'button', onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); } } }, 'Import backup'),
      fileInput),
    h('button', { class: 'text-btn', type: 'button', style: 'justify-self:start;color:var(--down-ink)', onclick: () => { state.pending = { kind: 'wipe' }; render(); } }, 'Delete all data'),
    confirmRow);
}

// ---------- sheets ----------
let lastFocus = null;
function openSheet(title, content) {
  lastFocus = document.activeElement;
  $toast.hidden = true;
  const close = () => closeSheet();
  const sheet = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'sheet-title' },
    h('span', { class: 'grab', 'aria-hidden': 'true' }),
    h('div', { class: 'sheet-head' }, h('h2', { id: 'sheet-title', text: title }), h('button', { class: 'close-x', type: 'button', 'aria-label': 'Close', onclick: close }, '✕')),
    content);
  const scrim = h('div', { class: 'scrim', onclick: (e) => { if (e.target === scrim) close(); } }, sheet);
  scrim.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  $layer.replaceChildren(scrim);
  document.body.style.overflow = 'hidden';
  (sheet.querySelector('[data-autofocus]') || sheet.querySelector('button, input, textarea'))?.focus();
  return sheet;
}
function closeSheet() {
  $layer.replaceChildren();
  document.body.style.overflow = '';
  lastFocus?.focus?.();
}

function openCheckin(presetWorryId = null) {
  const demo = state.data.demo;
  const last = sortByTs(state.data.checkins).at(-1);
  const form = { mood: demo || !last ? 5 : last.mood, worry: demo ? null : presetWorryId, tags: new Set(), tickerEdited: false };
  const open = demo ? [] : worriesOpen();
  const takenTickers = () => (demo ? [] : state.data.worries.map((w) => w.ticker));

  const n = h('span', { class: 'n' });
  const wd = h('span', { class: 'w' });
  const syncMood = () => { n.textContent = form.mood; wd.textContent = moodLabel(form.mood); };
  const slider = h('input', { type: 'range', id: 'mood', min: '1', max: '10', step: '1', value: String(form.mood), 'aria-label': 'Mood from 1 to 10', 'data-autofocus': '' });
  slider.addEventListener('input', () => { form.mood = Number(slider.value); syncMood(); });
  syncMood();

  const note = h('textarea', { id: 'note', maxlength: '500', placeholder: 'Say it in a sentence or two. Only you can see this.' });

  const newName = h('input', { type: 'text', id: 'new-worry', maxlength: '60', placeholder: 'e.g. Rent going up' });
  const newTicker = h('input', { type: 'text', id: 'new-ticker', class: 'ticker-input', maxlength: '5', placeholder: 'RENT', 'aria-label': 'Ticker' });
  newName.addEventListener('input', () => { if (!form.tickerEdited) newTicker.value = newName.value.trim() ? suggestTicker(newName.value, takenTickers()) : ''; });
  newTicker.addEventListener('input', () => { form.tickerEdited = true; newTicker.value = cleanTicker(newTicker.value); });
  const newFields = h('div', { class: 'field', hidden: true },
    h('label', { class: 'field', for: 'new-worry' }, h('span', { class: 'lbl', text: 'Name it' }), newName),
    h('label', { class: 'field', for: 'new-ticker' }, h('span', { class: 'fine', text: 'Ticker (up to 5 letters)' }), newTicker));

  const worryChips = h('div', { class: 'chips', role: 'group', 'aria-label': 'Which worry is this?' });
  const drawWorryChips = () => {
    worryChips.replaceChildren(
      h('button', { class: 'chip', type: 'button', 'aria-pressed': String(form.worry === null), onclick: () => { form.worry = null; drawWorryChips(); } }, 'Nothing specific'),
      open.map((w) => h('button', { class: 'chip ticker-chip', type: 'button', 'aria-pressed': String(form.worry === w.id), onclick: () => { form.worry = w.id; drawWorryChips(); } }, `$${w.ticker}`)),
      h('button', { class: 'chip', type: 'button', 'aria-pressed': String(form.worry === 'new'), onclick: () => { form.worry = 'new'; drawWorryChips(); newName.focus(); } }, '+ Something new'));
    newFields.hidden = form.worry !== 'new';
  };
  drawWorryChips();

  const tagChips = h('div', { class: 'chips', role: 'group', 'aria-label': 'Tags' },
    TAGS.map((t) => {
      const b = h('button', { class: 'chip', type: 'button', 'aria-pressed': 'false' }, t);
      b.addEventListener('click', () => { form.tags.has(t) ? form.tags.delete(t) : form.tags.add(t); b.setAttribute('aria-pressed', String(form.tags.has(t))); });
      return b;
    }));

  const submit = () => {
    if (form.worry === 'new' && !newName.value.trim()) { toast('Give the new worry a name, or pick “Nothing specific”.'); newName.focus(); return; }
    if (state.data.demo) state.data = emptyData();
    let worryId = form.worry;
    let opened = null;
    if (worryId === 'new') {
      const taken = state.data.worries.map((w) => w.ticker);
      let ticker = cleanTicker(newTicker.value) || suggestTicker(newName.value, taken);
      if (taken.includes(ticker)) ticker = suggestTicker(ticker, taken);
      opened = { id: uid(), ticker, name: newName.value.trim(), openedTs: now(), closedTs: null, outcome: null, control: null, nextStep: '' };
      state.data.worries.push(opened);
      worryId = opened.id;
    }
    state.data.checkins.push({ id: uid(), ts: now(), mood: form.mood, note: note.value.trim(), tags: [...form.tags], worryId });
    persist();
    closeSheet();
    render();
    toast(demo ? 'First check-in logged. Examples cleared.' : opened ? `Logged. Opened $${opened.ticker}.` : 'Logged');
  };

  openSheet('Check in', h('form', { style: 'display:grid;gap:22px', onsubmit: (e) => { e.preventDefault(); submit(); } },
    h('div', { class: 'mood-pick' },
      h('span', { class: 'lbl', style: 'font-weight:600', text: 'How do you feel right now?' }),
      h('div', { class: 'mood-read' }, n, wd),
      slider,
      h('div', { class: 'scale', 'aria-hidden': 'true' }, h('span', { text: '1 · rough' }), h('span', { text: '10 · great' }))),
    h('label', { class: 'field', for: 'note' }, h('span', { class: 'lbl', text: 'What’s bothering you right now?' }), note),
    h('div', { class: 'field' }, h('span', { class: 'lbl', text: 'Is it one of your positions?' }), worryChips, newFields),
    h('div', { class: 'field' }, h('span', { class: 'lbl', text: 'Tags' }), tagChips),
    demo ? h('p', { class: 'fine', text: 'Saving clears the example data and starts your own history.' }) : null,
    h('button', { class: 'btn block', type: 'submit' }, 'Log check-in')));
}

function openSell(w) {
  let outcome = null;
  const options = [
    ['resolved', 'Resolved', 'You dealt with it.'],
    ['faded', 'Faded on its own', 'It stopped mattering.'],
    ['let-go', 'Let it go', 'You chose to stop carrying it.'],
  ];
  const confirm = h('button', { class: 'btn block', type: 'button', disabled: true }, `Close $${w.ticker}`);
  const group = h('div', { style: 'display:grid;gap:8px', role: 'group', 'aria-label': 'How did it end?' });
  const draw = () => group.replaceChildren(...options.map(([key, label, sub]) =>
    h('button', { class: 'choice', type: 'button', 'aria-pressed': String(outcome === key), onclick: () => { outcome = key; confirm.disabled = false; draw(); } }, label, h('span', { text: sub }))));
  draw();

  const sheet = openSheet(`Close $${w.ticker}`, h('div', { style: 'display:grid;gap:16px' },
    h('p', { class: 'fine', text: w.name }),
    h('span', { class: 'lbl', style: 'font-weight:600', text: 'How did it end?' }),
    group, confirm));

  confirm.addEventListener('click', () => {
    if (!outcome) return;
    w.closedTs = now();
    w.outcome = outcome;
    persist();
    const s = worryStats(w, state.data.checkins, now());
    const lb = lookBack(state.data.worries, now(), 30);
    const done = h('div', { class: 'closed-card' },
      h('span', { class: 'tick', 'aria-hidden': 'true' },
        h('span', { style: 'font:700 2rem/1 var(--display)' }, '✓')),
      h('h2', { text: `$${w.ticker} closed` }),
      h('p', { text: `Held ${s.heldDays} ${s.heldDays === 1 ? 'day' : 'days'} · ${s.mentions} ${s.mentions === 1 ? 'check-in' : 'check-ins'} · ${OUTCOMES[outcome]}` }),
      lb.closed > 1 ? h('p', { text: `That’s ${lb.closed} worries closed in the last 30 days.` }) : null,
      h('button', { class: 'btn block', type: 'button', 'data-autofocus': '', onclick: () => { closeSheet(); go('home'); } }, 'Done'));
    sheet.querySelector('.sheet-head h2').textContent = 'Position closed';
    sheet.querySelector('.sheet-head').nextSibling.replaceWith(done);
    done.querySelector('[data-autofocus]').focus();
  });
}

// ---------- boot ----------
document.getElementById('tab-home').addEventListener('click', () => go('home'));
document.getElementById('tab-insights').addEventListener('click', () => go('insights'));
document.getElementById('tab-checkin').addEventListener('click', () => openCheckin(worryById(state.view) && worryById(state.view).closedTs == null ? state.view : null));

let resizeTimer;
let lastWidth = window.innerWidth;
window.addEventListener('resize', () => {
  if (window.innerWidth === lastWidth) return; // ignore mobile URL-bar height changes
  lastWidth = window.innerWidth;
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(render, 150);
});

render();

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  try { navigator.serviceWorker.register('sw.js').catch(() => {}); } catch { /* not available here */ }
}
