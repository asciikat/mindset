// The Body room: the body map, calm-moment logging, "Your two signatures"
// (overload vs calm) and "Notes from calm me". The overload flow itself lives in
// overload.js, which imports this file. Reached from Today (tab: today).

import {
  REGIONS, SENSATIONS_HARD, SENSATIONS_CALM, EMOTIONS_HARD, EMOTIONS_CALM, BREATHING,
  THOUGHT_CHIPS_HARD, THOUGHT_CHIPS_CALM, TRIGGERS,
  regionLabel, breathingLabel, triggerLabel, starterBody, buildState, thoughtLines,
  signature, ranked, earlySigns,
} from '../logic/body.js';
import {
  state, h, s, now, uid, commit, toast, go, render, setAccent, openSheet, closeSheet,
  registerView, registerAction, runAction, backButton, demoBanner, sectionHead, chipGroup, scalePicker,
  fmtWhen, kidName, afterRender,
} from '../core.js';

const cap = (w) => String(w).replace(/^./, (c) => c.toUpperCase());
const pct = (share) => `${Math.round(share * 100)}%`;

// Move focus to something after the next render (render() rebuilds the page).
function focusAfterRender(selector) {
  state.ui.bodyFocus = selector;
}
function applyPendingFocus() {
  const sel = state.ui.bodyFocus;
  if (!sel) return;
  state.ui.bodyFocus = null;
  afterRender(() => document.querySelector(sel)?.focus());
}

// ---------- body map ----------
// A front-view figure made of simple shapes. Each region is its own shape so it can be
// tapped, filled when selected, or shaded by how often it shows up (heat mode).
const W = 200;
const flip = (d) => d.replace(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g, (_, x, y) => `${W - Number(x)} ${y}`);
const ARM = 'M 39 129 L 56 129 C 56 140 55 150 54 160 L 49 202 C 47 220 45 236 44 250 L 31 250 C 30 236 30 220 31 200 L 34 158 C 35 147 37 137 39 129 Z';
const HAND = 'M 31 253 L 44 253 C 47 262 47 271 43 280 C 40 286 34 286 31 280 C 28 271 28 262 31 253 Z';
const LEG = 'M 56 274 L 98 274 L 97 300 C 96 330 94 362 92 402 L 74 402 C 72 362 68 330 63 300 C 60 290 57 282 56 274 Z';
const FOOT = 'M 74 405 L 92 405 C 93 411 93 416 91 420 C 87 424 73 425 69 421 C 67 417 71 411 74 405 Z';

// Every region shape gets .body-shape; face parts are .body-soft (no outline until marked);
// closed eyes are a decorative .body-feature inside the face region.
const sh = (tag, attrs, extra = '') => s(tag, { ...attrs, class: `body-shape${extra}` });
const SHAPES = {
  throat: () => [sh('rect', { x: 90, y: 66, width: 20, height: 20, rx: 5 })],
  head: () => [sh('ellipse', { cx: 100, cy: 38, rx: 24, ry: 29 })],
  // The 'eyes' region is the band around the eyes and brow.
  eyes: () => [
    sh('rect', { x: 80, y: 29, width: 40, height: 17, rx: 8.5 }, ' body-soft'),
    s('path', { class: 'body-feature', d: 'M 85 38 Q 90 41.5 95 38 M 105 38 Q 110 41.5 115 38' }),
  ],
  jaw: () => [sh('path', { d: 'M 78 48 C 79 60 88 67 100 67 C 112 67 121 60 122 48 C 114 54 107 56 100 56 C 93 56 86 54 78 48 Z' }, ' body-soft')],
  arms: () => [sh('path', { d: ARM }), sh('path', { d: flip(ARM) })],
  shoulders: () => [sh('path', { d: 'M 88 86 L 112 86 C 128 88 146 92 156 100 C 163 106 164 116 160 127 C 140 129 120 129 100 129 C 80 129 60 129 40 127 C 36 116 37 106 44 100 C 54 92 72 88 88 86 Z' })],
  hands: () => [sh('path', { d: HAND }), sh('path', { d: flip(HAND) })],
  chest: () => [sh('path', { d: 'M 58 130 L 142 130 C 143 146 141 160 137 173 L 63 173 C 59 160 57 146 58 130 Z' })],
  heart: () => [sh('circle', { cx: 113, cy: 149, r: 10 })],
  stomach: () => [sh('path', { d: 'M 63 174 L 137 174 C 135 186 134 196 135 205 L 65 205 C 66 196 65 186 63 174 Z' })],
  gut: () => [sh('path', { d: 'M 65 206 L 135 206 C 136 216 138 226 141 236 L 59 236 C 62 226 64 216 65 206 Z' })],
  hips: () => [sh('path', { d: 'M 59 237 L 141 237 C 145 248 146 260 145 272 L 55 272 C 54 260 55 248 59 237 Z' })],
  legs: () => [sh('path', { d: LEG }), sh('path', { d: flip(LEG) })],
  feet: () => [sh('path', { d: FOOT }), sh('path', { d: flip(FOOT) })],
};
// Paint order: overlays last (face parts over the head, heart over the chest).
const PAINT = ['throat', 'head', 'eyes', 'jaw', 'arms', 'shoulders', 'hands', 'chest', 'heart', 'stomach', 'gut', 'hips', 'legs', 'feet'];

// bodyMap({ selected: Set, onToggle(regionId, isOn), heat: {regionId: 0..1} | null, readonly, label }) -> Node
// Interactive by default: tapping a region (or its chip) adds/removes it from `selected`
// (the Set is updated in place), then calls onToggle. With `heat`, regions are shaded by
// share and a legend is shown. With `readonly` (no heat), selected regions are filled.
export function bodyMap({ selected = new Set(), onToggle = null, heat = null, readonly = false, label = 'Body map' } = {}) {
  const interactive = !readonly && !heat;
  const groups = new Map();
  const chips = new Map();

  const sync = (id) => {
    const on = selected.has(id);
    groups.get(id)?.classList.toggle('on', on);
    groups.get(id)?.setAttribute('aria-pressed', String(on));
    chips.get(id)?.setAttribute('aria-pressed', String(on));
  };
  const toggle = (id) => {
    if (selected.has(id)) selected.delete(id);
    else selected.add(id);
    sync(id);
    onToggle?.(id, selected.has(id));
  };

  let summary = label;
  if (heat) {
    const top = ranked(heat).filter(([, v]) => v > 0);
    summary = top.length
      ? `${label}. ${top.map(([id, v]) => `${regionLabel(id)} ${pct(v)}`).join(', ')}.`
      : `${label}. Nothing logged yet.`;
  } else if (readonly) {
    summary = selected.size ? `${label}: ${REGIONS.filter((r) => selected.has(r.id)).map((r) => r.label).join(', ')}.` : `${label}: nothing marked.`;
  }

  const svg = s('svg', {
    class: 'body-fig', viewBox: '0 0 200 430', focusable: 'false',
    role: interactive ? 'group' : 'img', 'aria-label': summary,
  });
  for (const id of PAINT) {
    const r = REGIONS.find((x) => x.id === id);
    const g = s('g', { class: 'body-region', 'data-region': id }, SHAPES[id]());
    if (interactive) {
      g.setAttribute('role', 'button');
      g.setAttribute('tabindex', '0');
      g.setAttribute('aria-label', r.label);
      g.setAttribute('aria-pressed', String(selected.has(id)));
      g.prepend(s('title', { text: r.label }));
      g.addEventListener('click', () => toggle(id));
      g.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(id); }
      });
      if (selected.has(id)) g.classList.add('on');
    } else if (heat) {
      const v = Math.max(0, Math.min(1, Number(heat[id]) || 0));
      if (v > 0) {
        g.classList.add('hot');
        g.style.setProperty('fill-opacity', String(0.16 + 0.84 * v));
      }
      g.prepend(s('title', { text: `${r.label}: ${pct(v)}` }));
    } else if (selected.has(id)) {
      g.classList.add('on');
    }
    groups.set(id, g);
    svg.append(g);
  }

  if (interactive) {
    const chipRow = h('div', { class: 'chips body-chips body-map-chips', role: 'group', 'aria-label': `${label}, as a list` },
      REGIONS.map((r) => {
        const b = h('button', { class: 'chip body-chip', type: 'button', 'aria-pressed': String(selected.has(r.id)), onclick: () => toggle(r.id) }, r.label);
        chips.set(r.id, b);
        return b;
      }));
    return h('div', { class: 'body-map' }, h('div', { class: 'body-map-fig' }, svg), chipRow);
  }
  if (heat) {
    return h('div', { class: 'body-map is-heat' }, svg,
      h('div', { class: 'body-legend', 'aria-hidden': 'true' },
        h('span', { class: 'body-ramp' }, [0.2, 0.4, 0.6, 0.8, 1].map((v) => h('i', { style: `opacity:${0.16 + 0.84 * v}` }))),
        h('span', { class: 'body-legend-k' }, h('span', { text: 'rarely' }), h('span', { text: 'often' }))));
  }
  return h('div', { class: 'body-map is-static' }, svg);
}

// ---------- log form (shared by the calm sheet and the overload flow) ----------
export function newDraft() {
  return { regions: new Set(), sensations: new Set(), emotions: new Set(), breathing: null, thoughtChips: new Set(), text: '', triggers: new Set(), intensity: null };
}

function multiChips(options, set, label, labels = {}) {
  return chipGroup(options, (o) => set.has(o), (o) => (set.has(o) ? set.delete(o) : set.add(o)), { label, labels, cls: 'body-chip' });
}

// Single choice that can be un-picked by tapping it again.
function singleChips(options, get, put, label) {
  const btns = options.map((o) => h('button', { class: 'chip body-chip', type: 'button', 'aria-pressed': String(get() === o.id) }, o.label));
  btns.forEach((b, i) => b.addEventListener('click', () => {
    put(get() === options[i].id ? null : options[i].id);
    btns.forEach((x, j) => x.setAttribute('aria-pressed', String(get() === options[j].id)));
  }));
  return h('div', { class: 'chips body-chips', role: 'group', 'aria-label': label }, btns);
}

function field(lbl, ...nodes) {
  return h('div', { class: 'field body-field' }, h('span', { class: 'lbl', text: lbl }), ...nodes);
}

// The fields for one log. `draft` (from newDraft) is updated as the person taps.
export function logFields(draft, kind) {
  const hard = kind !== 'calm';
  const textId = `body-text-${kind}-${uid()}`;
  const text = h('textarea', { id: textId, maxlength: '400', rows: '2', placeholder: hard ? 'Anything else in your head?' : 'Anything else? What helped?' });
  text.value = draft.text;
  text.addEventListener('input', () => { draft.text = text.value; });

  const nodes = [
    field('Where do you feel it?', bodyMap({ selected: draft.regions, label: 'Where in your body' })),
    field(hard ? 'What does it feel like?' : 'How does your body feel?',
      multiChips(hard ? SENSATIONS_HARD : SENSATIONS_CALM, draft.sensations, 'Sensations')),
    hard
      ? field('Feelings',
        multiChips(EMOTIONS_HARD, draft.emotions, 'Hard feelings'),
        h('span', { class: 'fine', text: 'Anything softer in there too?' }),
        multiChips(EMOTIONS_CALM, draft.emotions, 'Softer feelings'))
      : field('Feelings', multiChips(EMOTIONS_CALM, draft.emotions, 'Feelings')),
    field('Breathing', singleChips(BREATHING, () => draft.breathing, (v) => { draft.breathing = v; }, 'Breathing')),
    field('Thoughts',
      multiChips(hard ? THOUGHT_CHIPS_HARD : THOUGHT_CHIPS_CALM, draft.thoughtChips, 'Thoughts'),
      h('label', { class: 'visually-hidden', for: textId }, hard ? 'Anything else in your head?' : 'Anything else, or what helped?'),
      text),
  ];
  if (hard) {
    const labels = Object.fromEntries(TRIGGERS.map((t) => [t.id, triggerLabel(t.id, kidName())]));
    nodes.push(field('What came before?', multiChips(TRIGGERS.map((t) => t.id), draft.triggers, 'What came before', labels)));
    const pick = scalePicker(`body-size-${uid()}`, { min: 1, max: 10, value: draft.intensity, low: '1 · a little', high: '10 · everything', label: 'How big is it, from 1 to 10' });
    pick.row.addEventListener('change', () => { draft.intensity = pick.get(); });
    nodes.push(field('How big is it?', pick.node));
  }
  return nodes;
}

// Save a draft as a body log. Returns the saved entry.
export function saveLog(draft, kind) {
  const entry = buildState(draft, kind, now(), uid());
  commit((d) => { d.body.states.push(entry); }, { quiet: true });
  return entry;
}

// ---------- calm log sheet ----------
export function openCalmLog() {
  const draft = newDraft();
  const demo = state.data.demo;
  const form = h('form', { class: 'body-form', onsubmit: (e) => {
    e.preventDefault();
    closeSheet();
    saveLog(draft, 'calm');
    toast(demo ? 'Calm moment logged. Examples cleared.' : 'Calm moment logged');
  } },
  h('p', { class: 'body-lede', text: 'Log when you feel good, so the app learns your calm signature too.' }),
  logFields(draft, 'calm'),
  demo ? h('p', { class: 'fine', text: 'Saving clears the example data and starts your own history.' }) : null,
  h('button', { class: 'btn block', type: 'submit' }, 'Save calm moment'));
  const sheet = openSheet('Log a calm moment', form);
  sheet.classList.add('zone-calm', 'body-sheet');
}

// ---------- your two signatures ----------
function barRow(label, share) {
  return h('div', { class: 'body-bar' },
    h('span', { class: 'body-bar-k', text: label }),
    h('span', { class: 'body-bar-track', 'aria-hidden': 'true' }, h('span', { style: `width:${Math.max(3, share * 100)}%` })),
    h('span', { class: 'body-bar-v', text: pct(share) }));
}

// Both heat maps next to each other: the clearest way to see two different signatures.
function pairCard(over, calm) {
  const col = (kind, sig) => {
    const isOver = kind === 'overload';
    const title = isOver ? 'Overloaded' : 'Calm';
    return h('div', { class: `body-pair-col ${isOver ? 'zone-over' : 'zone-calm'}` },
      h('h3', { class: 'body-pair-h' }, h('span', { class: 'body-dot', 'aria-hidden': 'true' }), title),
      h('span', { class: 'body-pair-n', text: sig.count ? `${sig.count} ${sig.count === 1 ? 'log' : 'logs'}` : 'no logs yet' }),
      bodyMap({ heat: sig.regions, readonly: true, label: `Where you feel it when ${isOver ? 'overloaded' : 'calm'}` }),
      sig.count ? null : isOver
        ? h('p', { class: 'fine', text: 'The Overload button’s “Log it” step adds one.' })
        : h('button', { class: 'text-btn', type: 'button', onclick: openCalmLog }, 'Log a calm moment'));
  };
  return h('section', { class: 'card body-pair', 'aria-labelledby': 'body-pair-h' },
    h('h2', { class: 'eyebrow', id: 'body-pair-h', text: 'Where you feel it' }),
    h('div', { class: 'body-pair-grid' }, col('overload', over), col('calm', calm)),
    h('p', { class: 'fine', text: 'Darker means it shows up in more of those logs.' }));
}

// One table: each item's share of overload logs next to its share of calm logs.
function compareCard(over, calm) {
  const cats = [
    ['Where', 'regions', regionLabel],
    ['Feels', 'sensations', cap],
    ['Breathing', 'breathing', breathingLabel],
    ['Feelings', 'emotions', cap],
  ];
  const cell = (sig, key, id, zone) => {
    if (!sig.count) return h('td', { class: `body-cell ${zone}` }, h('span', { class: 'body-cell-v', text: '–' }));
    const v = sig[key][id] || 0;
    return h('td', { class: `body-cell ${zone}` },
      h('span', { class: 'body-bar-track', 'aria-hidden': 'true' }, v ? h('span', { style: `width:${Math.max(4, v * 100)}%` }) : null),
      h('span', { class: 'body-cell-v', text: pct(v) }));
  };
  const groups = cats.map(([title, key, labelFn]) => {
    const ids = [...new Set([...ranked(over[key], 3), ...ranked(calm[key], 3)].map(([id]) => id))]
      .sort((a, b) => Math.max(over[key][b] || 0, calm[key][b] || 0) - Math.max(over[key][a] || 0, calm[key][a] || 0))
      .slice(0, 4);
    if (!ids.length) return null;
    return h('tbody', {},
      h('tr', { class: 'body-cat' }, h('th', { scope: 'colgroup', colspan: '3', text: title })),
      ids.map((id) => h('tr', {},
        h('th', { scope: 'row', text: labelFn(id) }),
        cell(over, key, id, 'zone-over'),
        cell(calm, key, id, 'zone-calm'))));
  });

  const thoughts = (sig, kind) => {
    if (!sig.thoughts.length) return null;
    const isOver = kind === 'overload';
    return h('div', { class: `body-thought-group ${isOver ? 'zone-over' : 'zone-calm'}` },
      h('h3', { class: 'body-stat-h' }, h('span', { class: 'body-dot', 'aria-hidden': 'true' }), isOver ? 'Thoughts when overloaded' : 'Thoughts when calm'),
      h('ul', { class: 'body-thoughts' }, sig.thoughts.slice(0, 3).map((t) =>
        h('li', {}, h('q', { text: t.text }), h('span', { class: 'body-times', text: t.count === 1 ? 'once' : `${t.count}×` })))));
  };

  return h('section', { class: 'card body-compare-card', 'aria-labelledby': 'body-cmp-h' },
    h('div', { class: 'section-head' },
      h('h2', { id: 'body-cmp-h', class: 'body-sig-title', text: 'Side by side' }),
      h('span', { class: 'count', text: 'share of logs' })),
    h('table', { class: 'body-compare' },
      h('caption', { class: 'visually-hidden', text: 'How often each thing shows up in overload logs and in calm logs' }),
      h('thead', {}, h('tr', {},
        h('td', {}),
        h('th', { scope: 'col', class: 'zone-over' }, h('span', { class: 'body-dot', 'aria-hidden': 'true' }), 'Overload'),
        h('th', { scope: 'col', class: 'zone-calm' }, h('span', { class: 'body-dot', 'aria-hidden': 'true' }), 'Calm'))),
      groups),
    thoughts(over, 'overload'),
    thoughts(calm, 'calm'),
    over.intensity != null ? h('p', { class: 'fine', text: `Overloads you logged averaged ${Math.round(over.intensity * 10) / 10} out of 10 in size.` }) : null);
}

const SIGN_KIND = { regions: 'where', sensations: 'feels', breathing: 'breathing', emotions: 'feeling', thoughts: 'thought' };

function earlyCard(states, over, calm) {
  const signs = earlySigns(states);
  const shell = (...kids) => h('section', { class: 'card body-early zone-edge', 'aria-labelledby': 'body-early-h' },
    h('span', { class: 'eyebrow body-early-eyebrow', id: 'body-early-h' }, h('span', { class: 'body-dot', 'aria-hidden': 'true' }), 'Early signs'),
    ...kids);

  if (over.count < 2) {
    return shell(h('p', { text: 'Log a couple of overloads and a few calm moments. The things that only show up when you’re overloaded become your early signs, here.' }));
  }
  if (!signs.length) {
    return shell(h('p', { text: 'Nothing stands out yet. Your overload and calm logs look alike so far. Keep logging both and this will sharpen.' }));
  }
  const top = signs.slice(0, 6);
  const calmText = (sg) => {
    if (!calm.count) return 'no calm logs yet';
    const n = Math.round(sg.calm * calm.count);
    return n ? `${n} of ${calm.count} calm` : 'never when calm';
  };
  return shell(
    h('p', { class: 'body-early-lead' }, 'When these show up, you’re heading toward overload: ',
      h('strong', { text: top.slice(0, 3).map((x) => x.phrase).join(', ') }), '.'),
    h('ul', { class: 'body-signs' }, top.map((sg) => h('li', {},
      h('span', { class: 'body-sign-name' }, sg.label, h('span', { class: 'body-sign-type', text: SIGN_KIND[sg.type] })),
      h('span', { class: 'body-sign-n' }, h('span', { text: `${sg.count} of ${over.count} overloads` }), h('span', { class: 'fine', text: calmText(sg) }))))),
    h('p', { text: 'Noticing early is the whole point. These are easier to work with at a 3 than at a 9. When one shows up: eat something, drink water, lower the demands, and don’t start anything new.' }),
    calm.count < 3 ? h('p', { class: 'fine', text: 'Log a few calm moments too, so the app can tell which signs belong only to overload.' }) : null);
}

function triggersCard(over) {
  const top = ranked(over.triggers, 5);
  if (!top.length) return null;
  return h('section', { class: 'card body-sig zone-over', 'aria-labelledby': 'body-trig-h' },
    h('div', { class: 'section-head' }, h('h2', { id: 'body-trig-h', class: 'body-sig-title', text: 'What came before' }), h('span', { class: 'count', text: 'in overload logs' })),
    h('div', { class: 'body-stat-group' }, top.map(([id, share]) => barRow(triggerLabel(id, kidName()), share))));
}

function detailRows(st) {
  const rows = [
    ['Where', st.regions.map(regionLabel).join(', ')],
    ['Felt', st.sensations.join(', ')],
    ['Feelings', st.emotions.join(', ')],
    ['Breathing', st.breathing ? breathingLabel(st.breathing) : ''],
    ['Before', (st.triggers || []).map((t) => triggerLabel(t, kidName())).join(', ')],
    ['Size', st.intensity ? `${st.intensity} out of 10` : ''],
  ].filter(([, v]) => v);
  return rows;
}

function logDetail(st) {
  const isOver = st.kind === 'overload';
  const lines = thoughtLines(st.thoughts);
  const confirming = state.ui.bodyDelLog === st.id;
  return h('div', { class: `body-log-detail ${isOver ? 'zone-over' : 'zone-calm'}`, id: `body-log-${st.id}` },
    h('div', { class: 'body-detail-grid' },
      bodyMap({ selected: new Set(st.regions), readonly: true, label: 'Where you felt it' }),
      h('dl', { class: 'body-dl' }, detailRows(st).map(([k, v]) => [h('dt', { text: k }), h('dd', { text: v })]),
        detailRows(st).length ? null : [h('dt', { text: 'Logged' }), h('dd', { text: 'Just the moment, nothing marked' })])),
    lines.length ? h('ul', { class: 'body-thoughts' }, lines.map((l) => h('li', {}, h('q', { text: l })))) : null,
    confirming
      ? h('div', { class: 'banner', role: 'group', 'aria-label': 'Confirm delete' },
        h('span', { text: 'Delete this log? This can’t be undone.' }),
        h('div', { class: 'btn-row' },
          h('button', { class: 'btn danger', type: 'button', 'data-body-confirm': st.id, onclick: () => {
            state.ui.bodyDelLog = null;
            state.ui.bodyOpenLog = null;
            commit((d) => { d.body.states = d.body.states.filter((x) => x.id !== st.id); }, { keepDemo: true });
            toast('Log deleted');
          } }, 'Delete'),
          h('button', { class: 'btn ghost', type: 'button', onclick: () => { state.ui.bodyDelLog = null; focusAfterRender(`[data-body-del="${st.id}"]`); render(); } }, 'Cancel')))
      : h('button', { class: 'text-btn danger-text', type: 'button', 'data-body-del': st.id, onclick: () => { state.ui.bodyDelLog = st.id; focusAfterRender(`[data-body-confirm="${st.id}"]`); render(); } }, 'Delete this log'));
}

function logRow(st) {
  const open = state.ui.bodyOpenLog === st.id;
  const isOver = st.kind === 'overload';
  const bits = [...st.regions.slice(0, 3).map(regionLabel), ...st.emotions.slice(0, 2)];
  return h('li', {},
    h('button', {
      class: 'body-log', type: 'button', 'aria-expanded': String(open), 'aria-controls': open ? `body-log-${st.id}` : null, 'data-body-log': st.id,
      onclick: () => { state.ui.bodyOpenLog = open ? null : st.id; state.ui.bodyDelLog = null; focusAfterRender(`[data-body-log="${st.id}"]`); render(); },
    },
    h('span', { class: `body-kind ${isOver ? 'zone-over' : 'zone-calm'}` }, h('span', { class: 'body-dot', 'aria-hidden': 'true' }), isOver ? 'Overload' : 'Calm'),
    h('span', { class: 'body-log-main' },
      h('span', { class: 'body-log-when', text: fmtWhen(st.ts) }),
      h('span', { class: 'body-log-sum', text: bits.length ? bits.join(' · ') : 'Just the moment' })),
    h('span', { class: 'body-log-end' }, isOver && st.intensity ? `${st.intensity}/10` : '', h('span', { class: 'body-chev', 'aria-hidden': 'true' }, open ? '–' : '+'))),
    open ? logDetail(st) : null);
}

function logsSection(states) {
  const sorted = [...states].sort((a, b) => b.ts - a.ts);
  const shown = state.ui.bodyAllLogs ? sorted : sorted.slice(0, 8);
  return h('section', { class: 'section', 'aria-labelledby': 'body-logs-h' },
    sectionHead('Recent logs', `${sorted.length}`, 'body-logs-h'),
    h('ul', { class: 'list body-logs' }, shown.map(logRow)),
    sorted.length > shown.length
      ? h('button', { class: 'btn ghost', type: 'button', onclick: () => { state.ui.bodyAllLogs = true; render(); } }, `Show ${sorted.length - shown.length} more`)
      : null);
}

function bodyView() {
  setAccent('calm');
  applyPendingFocus();
  const states = state.data.body.states;
  const over = signature(states, 'overload');
  const calm = signature(states, 'calm');

  const actions = h('div', { class: 'btn-row' },
    h('button', { class: 'btn', type: 'button', onclick: openCalmLog }, 'Log a calm moment'),
    h('button', { class: 'btn ghost', type: 'button', onclick: () => runAction('overload', 'log') }, 'Log an overload'));

  return [
    h('header', { class: 'topbar' },
      backButton(),
      h('button', { class: 'text-btn', type: 'button', onclick: () => go('rules') }, 'Notes from calm me')),
    h('div', { class: 'body-head' },
      h('span', { class: 'eyebrow', text: 'Body' }),
      h('h1', { class: 'page-title', text: 'Your two signatures' }),
      h('p', { class: 'page-sub', text: 'How your body feels when you’re overloaded, and when you’re calm. The difference between them is your early warning.' })),
    demoBanner(),
    actions,
    states.length
      ? [pairCard(over, calm), earlyCard(states, over, calm), over.count || calm.count ? compareCard(over, calm) : null, triggersCard(over), logsSection(states)]
      : h('section', { class: 'card body-empty', 'aria-labelledby': 'body-empty-h' },
        h('h2', { id: 'body-empty-h', class: 'body-lede', text: 'Nothing logged yet.' }),
        h('p', { text: 'Each log adds to a picture: how overload feels in your body, and how calm feels. Once there are a few of each, the difference shows up here as your early signs.' }),
        h('p', { class: 'fine', text: 'Start with a calm moment. It’s easier to log when you’re okay.' })),
    h('p', { class: 'fine' }, 'These patterns come from your own logs, not a test or a diagnosis. ',
      h('button', { class: 'text-btn', type: 'button', onclick: () => go('learn') }, 'How stress shows up in the body')),
  ];
}

// ---------- notes from calm me ----------
function moveRule(id, dir) {
  commit((d) => {
    const i = d.body.rules.findIndex((r) => r.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= d.body.rules.length) return;
    [d.body.rules[i], d.body.rules[j]] = [d.body.rules[j], d.body.rules[i]];
  }, { keepDemo: true });
}

function ruleItem(r, i, total) {
  const editing = state.ui.bodyRuleEdit === r.id;
  const confirming = state.ui.bodyRuleDel === r.id;

  if (editing) {
    const id = `body-rule-edit-${r.id}`;
    const input = h('textarea', { id, maxlength: '240', rows: '3', class: 'body-rule-input', 'data-body-edit': r.id });
    input.value = r.text;
    const save = () => {
      const v = input.value.trim();
      if (!v) { toast('Write something, or delete the note instead.'); input.focus(); return; }
      state.ui.bodyRuleEdit = null;
      focusAfterRender(`[data-body-rule-edit="${r.id}"]`);
      commit((d) => { const x = d.body.rules.find((y) => y.id === r.id); if (x) { x.text = v; x.ts = now(); } }, { keepDemo: true });
      toast('Note saved');
    };
    return h('li', { class: 'body-rule editing' },
      h('label', { class: 'visually-hidden', for: id }, 'Edit note'),
      input,
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn', type: 'button', onclick: save }, 'Save'),
        h('button', { class: 'btn ghost', type: 'button', onclick: () => { state.ui.bodyRuleEdit = null; focusAfterRender(`[data-body-rule-edit="${r.id}"]`); render(); } }, 'Cancel')));
  }

  return h('li', { class: 'body-rule' },
    h('p', { class: 'body-rule-text', text: r.text }),
    confirming
      ? h('div', { class: 'banner', role: 'group', 'aria-label': 'Confirm delete' },
        h('span', { text: 'Delete this note?' }),
        h('div', { class: 'btn-row' },
          h('button', { class: 'btn danger', type: 'button', 'data-body-rule-confirm': r.id, onclick: () => {
            state.ui.bodyRuleDel = null;
            commit((d) => { d.body.rules = d.body.rules.filter((x) => x.id !== r.id); }, { keepDemo: true });
            toast('Note deleted');
          } }, 'Delete'),
          h('button', { class: 'btn ghost', type: 'button', onclick: () => { state.ui.bodyRuleDel = null; focusAfterRender(`[data-body-rule-del="${r.id}"]`); render(); } }, 'Cancel')))
      : h('div', { class: 'body-rule-tools' },
        h('button', { class: 'body-tool', type: 'button', 'aria-label': `Move up: ${r.text}`, disabled: i === 0, 'data-body-up': r.id,
          onclick: () => { focusAfterRender(i - 1 === 0 ? `[data-body-down="${r.id}"]` : `[data-body-up="${r.id}"]`); moveRule(r.id, -1); } }, '↑'),
        h('button', { class: 'body-tool', type: 'button', 'aria-label': `Move down: ${r.text}`, disabled: i === total - 1, 'data-body-down': r.id,
          onclick: () => { focusAfterRender(i + 1 === total - 1 ? `[data-body-up="${r.id}"]` : `[data-body-down="${r.id}"]`); moveRule(r.id, 1); } }, '↓'),
        h('span', { class: 'body-tool-gap' }),
        h('button', { class: 'body-tool text', type: 'button', 'data-body-rule-edit': r.id,
          onclick: () => { state.ui.bodyRuleEdit = r.id; state.ui.bodyRuleDel = null; focusAfterRender(`[data-body-edit="${r.id}"]`); render(); } }, 'Edit'),
        h('button', { class: 'body-tool text danger', type: 'button', 'data-body-rule-del': r.id,
          onclick: () => { state.ui.bodyRuleDel = r.id; state.ui.bodyRuleEdit = null; focusAfterRender(`[data-body-rule-confirm="${r.id}"]`); render(); } }, 'Delete')));
}

function rulesView() {
  setAccent('calm');
  applyPendingFocus();
  const rules = state.data.body.rules;
  const draft = h('textarea', { id: 'body-rule-new', maxlength: '240', rows: '3', placeholder: 'e.g. Ask for help before 5pm, not after.' });
  draft.value = state.ui.bodyRuleDraft || '';
  draft.addEventListener('input', () => { state.ui.bodyRuleDraft = draft.value; });
  const add = () => {
    const v = draft.value.trim();
    if (!v) { toast('Write the note first.'); draft.focus(); return; }
    state.ui.bodyRuleDraft = '';
    focusAfterRender('#body-rule-new');
    commit((d) => { d.body.rules.push({ id: `r-${uid()}`, text: v, ts: now() }); }, { keepDemo: true });
    toast('Note added');
  };
  const missing = starterBody().rules.filter((sr) => !rules.some((r) => r.id === sr.id));

  return [
    h('header', { class: 'topbar' },
      backButton(),
      h('button', { class: 'text-btn', type: 'button', onclick: () => go('body') }, 'Your two signatures')),
    h('div', { class: 'body-head' },
      h('span', { class: 'eyebrow', text: 'Notes from calm me' }),
      h('h1', { class: 'page-title body-rules-title', text: 'Written now, for the version of you that’s overloaded later.' }),
      h('p', { class: 'page-sub', text: 'These come up when you press Overload. Short, kind and practical works best. Put the most important one first.' })),
    rules.length
      ? h('ol', { class: 'body-rules', 'aria-label': 'Your notes' }, rules.map((r, i) => ruleItem(r, i, rules.length)))
      : h('p', { class: 'empty', text: 'No notes yet. What would you want to hear at your worst moment?' }),
    h('section', { class: 'card', 'aria-labelledby': 'body-add-h' },
      h('h2', { id: 'body-add-h', class: 'eyebrow', text: 'Add a note' }),
      h('label', { class: 'visually-hidden', for: 'body-rule-new' }, 'New note'),
      draft,
      h('button', { class: 'btn', type: 'button', onclick: add }, 'Add note')),
    missing.length
      ? h('section', { class: 'section', 'aria-labelledby': 'body-starters-h' },
        sectionHead('Starter notes', 'Tap to bring one back', 'body-starters-h'),
        h('ul', { class: 'list' }, missing.map((sr) => h('li', {},
          h('button', { class: 'body-starter', type: 'button', onclick: () => {
            focusAfterRender('#body-rule-new');
            commit((d) => { if (!d.body.rules.some((r) => r.id === sr.id)) d.body.rules.push({ ...sr, ts: now() }); }, { keepDemo: true });
            toast('Note added back');
          } }, h('span', { class: 'body-plus', 'aria-hidden': 'true' }, '+'), h('span', { text: sr.text }))))))
      : null,
  ];
}

registerView('body', { tab: 'today', render: () => bodyView() });
registerView('rules', { tab: 'today', render: () => rulesView() });
registerAction('logCalm', () => openCalmLog());
