// The Mind room: mood as a stock-style line, worries as "positions" you open and close,
// and the insights that come out of them. Reached from Today (tab: today).

import {
  RANGES, RANGE_LABELS, TAGS, OUTCOMES,
  moodLabel, sortByTs, average, rangeWindow, change, formatDelta,
  suggestTicker, cleanTicker, worryStats, lookBack, tagInsights, needsSupport, weeklyRecap,
} from '../logic.js';
import { sparkline } from '../chart.js';
import {
  state, h, now, uid, fmt1, fmtWhen, commit, toast, go, back, backButton, render, setAccent,
  chartSlot, openSheet, closeSheet, setSheetTitle, demoBanner, stat, registerView, registerAction,
} from '../core.js';

state.ui.mindRange ??= '1M';

const worriesOpen = () => state.data.worries.filter((w) => w.closedTs == null).sort((a, b) => b.openedTs - a.openedTs);
const worryById = (id) => state.data.worries.find((w) => w.id === id);

// ---------- shared pieces ----------
export function supportBanner() {
  if (state.data.demo || !needsSupport(state.data.checkins, now())) return null;
  return h('div', { class: 'banner support', role: 'note' },
    h('strong', { text: 'Your last few check-ins have been rough.' }),
    h('p', { text: 'You don’t have to carry this alone. Talking to someone you trust helps, and so can a trained listener.' }),
    h('p', {}, 'In Australia, call Lifeline on ', h('strong', { class: 'selectable', text: '13 11 14' }), ' or text ', h('strong', { class: 'selectable', text: '0477 13 11 14' }),
      '. In the US, call or text ', h('strong', { class: 'selectable', text: '988' }), '. Elsewhere, find a free line at ',
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
    h('button', { class: 'position', type: 'button', onclick: () => go(`worry/${w.id}`) },
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

// ---------- mind (mood line + positions) ----------
function mindView() {
  const t = now();
  const win = rangeWindow(state.data.checkins, state.ui.mindRange, t);
  const ch = change(win);
  setAccent(!ch || ch.up ? 'up' : 'down');

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
      when.textContent = state.data.checkins.length ? `No check-ins ${RANGE_LABELS[state.ui.mindRange].toLowerCase()}` : 'No check-ins yet';
      readout.replaceChildren(h('span', { class: 'hint', text: 'Tap Check in to log how you feel and what’s on your mind.' }));
      return;
    }
    num.replaceChildren(String(ch.last), h('small', { text: '/10' }));
    word.textContent = moodLabel(ch.last);
    move.textContent = `${ch.delta >= 0 ? '▲' : '▼'} ${formatDelta(ch.delta, ch.pct)}`;
    when.textContent = RANGE_LABELS[state.ui.mindRange];
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
      class: 'range', type: 'button', 'aria-pressed': String(r === state.ui.mindRange),
      onclick: () => { state.ui.mindRange = r; render(); },
    }, r)));

  const open = worriesOpen();
  const recent = sortByTs(state.data.checkins).slice(-5).reverse();

  return [
    h('header', { class: 'topbar' },
      backButton('Today'),
      h('button', { class: 'text-btn', type: 'button', onclick: () => go('insights') }, 'Insights')),
    h('h1', { class: 'page-title', text: 'Mind' }),
    demoBanner(),
    supportBanner(),
    h('section', { class: 'quote', 'aria-label': 'Your mood' },
      h('span', { class: 'eyebrow', text: 'Your mood' }),
      h('div', { class: 'hero-row' }, num, word),
      h('div', { class: 'delta' }, move, when),
      chartSlot({ ...win, onScrub, label: `Mood line, ${RANGE_LABELS[state.ui.mindRange].toLowerCase()}. Use arrow keys to read check-ins.` }),
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
function worryView(id) {
  const w = worryById(id);
  if (!w) return [backButton(), h('p', { class: 'empty', text: 'That position no longer exists.' })];
  const t = now();
  const s = worryStats(w, state.data.checkins, t);
  const overall = average(state.data.checkins.map((c) => c.mood));
  const first = s.points[0]?.mood, last = s.points[s.points.length - 1]?.mood;
  setAccent(s.points.length < 2 || last >= first ? 'up' : 'down');
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
      backButton(),
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
          h('button', { class: 'btn ghost', type: 'button', onclick: () => { commit((d) => { const x = d.worries.find((y) => y.id === w.id); x.closedTs = null; x.outcome = null; }, { keepDemo: true }); toast(`$${w.ticker} reopened`); } }, 'Reopen'))),
    h('section', { class: 'section', 'aria-labelledby': 'hist-h' },
      h('div', { class: 'section-head' }, h('h2', { id: 'hist-h', text: 'Check-ins' })),
      s.points.length
        ? h('ul', { class: 'list' }, [...s.points].reverse().map((c) => entryRow(c, { showTicker: false })))
        : h('p', { class: 'empty', text: 'None yet.' })),
  ];
}

function controlCard(w) {
  const pick = (val) => commit((d) => { const x = d.worries.find((y) => y.id === w.id); x.control = x.control === val ? null : val; }, { keepDemo: true });
  const body = [];
  if (w.control === 'mine') {
    const input = h('input', { type: 'text', id: `step-${w.id}`, value: w.nextStep || '', placeholder: 'e.g. Email Sam by noon', maxlength: '140' });
    body.push(
      h('label', { class: 'field', for: `step-${w.id}` }, h('span', { class: 'lbl', text: 'One small next step' }), input),
      h('button', { class: 'btn ghost', type: 'button', onclick: () => { const v = input.value.trim(); commit((d) => { d.worries.find((y) => y.id === w.id).nextStep = v; }, { keepDemo: true }); toast('Next step saved'); } }, 'Save step'));
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
  setAccent((change(rangeWindow(all, '1W', t)) || { up: true }).up ? 'up' : 'down');
  const recap = weeklyRecap(all, state.data.worries, t);
  const tags = tagInsights(all);
  const closed = state.data.worries.filter((w) => w.closedTs != null).sort((a, b) => b.closedTs - a.closedTs);
  const history = sortByTs(all).reverse();
  const shown = state.ui.mindShowAll ? history : history.slice(0, 20);
  const maxDiff = Math.max(1, ...tags.map((r) => Math.abs(r.diff)));

  return [
    h('header', { class: 'topbar' }, backButton()),
    h('h1', { class: 'page-title', text: 'Insights' }),
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
          ? h('p', {}, 'Heaviest: ', h('button', { class: 'text-btn', type: 'button', onclick: () => go(`worry/${recap.heaviest.worry.id}`) }, `$${recap.heaviest.worry.ticker}`),
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
          return h('li', {}, h('button', { class: 'position', type: 'button', onclick: () => go(`worry/${w.id}`) },
            h('span', { style: 'min-width:0;display:grid;gap:2px' }, h('span', { class: 'ticker', text: w.ticker }), h('span', { class: 'name', text: `${OUTCOMES[w.outcome] || 'Closed'} · held ${s.heldDays} ${s.heldDays === 1 ? 'day' : 'days'}` })),
            h('span'),
            h('span', { class: 'pill flat' }, fmt1(s.avgMood))));
        }))
        : h('p', { class: 'empty', text: 'When you close a worry, it lands here.' })),
    h('section', { class: 'section', 'aria-labelledby': 'all-h' },
      h('div', { class: 'section-head' }, h('h2', { id: 'all-h', text: 'All check-ins' }), h('span', { class: 'count', text: `${history.length}` })),
      history.length ? h('ul', { class: 'list' }, shown.map((c) => entryRow(c))) : h('p', { class: 'empty', text: 'None yet.' }),
      history.length > shown.length ? h('button', { class: 'btn ghost', type: 'button', onclick: () => { state.ui.mindShowAll = true; render(); } }, `Show ${history.length - shown.length} more`) : null),
    h('p', {}, h('button', { class: 'text-btn', type: 'button', onclick: () => go('settings') }, 'Backup, import and settings')),
    h('p', { class: 'fine' }, 'Mindset is a reflection tool, not therapy. If things feel heavy for a while, talk to someone. In Australia, call Lifeline on 13 11 14. In the US, call or text 988. Elsewhere, see ',
      h('a', { href: 'https://findahelpline.com', target: '_blank', rel: 'noopener' }, 'findahelpline.com'), '.'),
  ];
}

export function openCheckin(presetWorryId = null) {
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
    let opened = null;
    closeSheet();
    commit((d) => {
      let worryId = form.worry;
      if (worryId === 'new') {
        const taken = d.worries.map((w) => w.ticker);
        let ticker = cleanTicker(newTicker.value) || suggestTicker(newName.value, taken);
        if (taken.includes(ticker)) ticker = suggestTicker(ticker, taken);
        opened = { id: uid(), ticker, name: newName.value.trim(), openedTs: now(), closedTs: null, outcome: null, control: null, nextStep: '' };
        d.worries.push(opened);
        worryId = opened.id;
      }
      d.checkins.push({ id: uid(), ts: now(), mood: form.mood, note: note.value.trim(), tags: [...form.tags], worryId });
    }, { quiet: true });
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
    commit((d) => { const x = d.worries.find((y) => y.id === w.id); x.closedTs = now(); x.outcome = outcome; }, { keepDemo: true });
    w = worryById(w.id);
    const s = worryStats(w, state.data.checkins, now());
    const lb = lookBack(state.data.worries, now(), 30);
    const done = h('div', { class: 'closed-card' },
      h('span', { class: 'tick', 'aria-hidden': 'true' },
        h('span', { style: 'font:700 2rem/1 var(--display)' }, '✓')),
      h('h2', { text: `$${w.ticker} closed` }),
      h('p', { text: `Held ${s.heldDays} ${s.heldDays === 1 ? 'day' : 'days'} · ${s.mentions} ${s.mentions === 1 ? 'check-in' : 'check-ins'} · ${OUTCOMES[outcome]}` }),
      lb.closed > 1 ? h('p', { text: `That’s ${lb.closed} worries closed in the last 30 days.` }) : null,
      h('button', { class: 'btn block', type: 'button', 'data-autofocus': '', onclick: () => { closeSheet(); go('mind', { replace: true }); } }, 'Done'));
    setSheetTitle('Position closed');
    sheet.querySelector('.sheet-head').nextSibling.replaceWith(done);
    done.querySelector('[data-autofocus]').focus();
  });
}


// Compact card for the Today screen: this week's mood line and open positions.
export function mindCard() {
  const t = now();
  const win = rangeWindow(state.data.checkins, '1W', t);
  const ch = change(win);
  const open = worriesOpen();
  const cls = !ch || ch.up ? 'trend-up' : 'trend-down';
  return h('section', { class: `card mind-card ${cls}`, 'aria-labelledby': 'mindcard-h' },
    h('div', { class: 'section-head' },
      h('span', { class: 'eyebrow', id: 'mindcard-h', text: 'Mind · past week' }),
      h('button', { class: 'text-btn', type: 'button', onclick: () => go('mind') }, 'Open')),
    h('div', { class: 'hero-row' },
      h('span', { class: 'mini-num', text: ch ? `${ch.last}/10` : '–' }),
      ch ? h('span', { class: 'delta' }, h('span', { class: 'move', text: `${ch.delta >= 0 ? '▲' : '▼'} ${formatDelta(ch.delta, ch.pct)}` })) : h('span', { class: 'fine', text: 'No mood check-ins this week' })),
    chartSlot({ ...win, height: 90, label: 'Mood this week' }, 'chart mini'),
    h('p', { class: 'fine' }, open.length ? `${open.length} open ${open.length === 1 ? 'position' : 'positions'}: ` : 'No open positions.',
      open.slice(0, 4).map((w, i) => [i ? ' ' : '', h('span', { class: 'ticker', text: w.ticker })])));
}

registerView('mind', { tab: 'today', render: () => mindView() });
registerView('worry', { tab: 'today', render: (id) => worryView(id) });
registerView('insights', { tab: 'today', render: () => insightsView() });
registerAction('checkin', (presetWorryId) => openCheckin(presetWorryId));
