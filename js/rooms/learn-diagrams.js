// Learn room: the interactive diagrams. Each builder returns one node that
// updates itself in place (no full re-render), keeps its choices in
// state.ui.learn, and stops animating once it leaves the page.

import { state, h, s, now, startOfDay, afterRender, kidName, KidName, go } from '../core.js';
import {
  NARROW, WIDEN, VIEW, windowParams, windowWord, toggleFactor, arousal, zoneOf, ZONE_TEXT, typicalExits, sleepHint,
  SYSTEMS, T_END, response, responseStats, responseWords, kidMorning,
} from './learn-model.js';

export function learnUi() {
  state.ui.learn ??= {
    win: [], winSeeded: false, winPaused: false,
    brainMode: 'calm', brainRegion: 'amygdala',
    stress: 4,
    kid: { parentSlept: false, kidSlept: false, ate: true },
    pacer: { pattern: 'sigh', mins: 2, startedAt: null },
    orient: 0, lk: 'self', practiceAt: null, hugAt: null,
  };
  return state.ui.learn;
}

export function reducedMotion() {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
}

let uidN = 0;
const nextId = (p) => `${p}${(uidN += 1)}`;
const pct = (x) => `${Math.round(x * 100)}%`;
const ZONE_CLASS = { ok: 'ok', edge: 'edge', hyper: 'hyper', hypo: 'hypo' };

// A row of toggle buttons that redraws itself; isOn(id) / onToggle(id).
function toggleRow(items, isOn, onToggle, label, cls = '') {
  const row = h('div', { class: `chips learn-chips ${cls}`, role: 'group', 'aria-label': label });
  const draw = () => row.replaceChildren(...items.map((it) =>
    h('button', { class: 'chip learn-chip', type: 'button', 'aria-pressed': String(isOn(it.id)), onclick: () => { onToggle(it.id); draw(); } }, it.label)));
  draw();
  return { node: row, draw };
}

// ============ 1. window of tolerance ============
export function windowSim() {
  const ui = learnUi();
  const hint = sleepHint(state.data.checkins, startOfDay(now()), state.data.profile?.sleepNeed);
  if (!ui.winSeeded) {
    ui.winSeeded = true;
    ui.win = hint?.preset ? [hint.preset] : [];
  }
  const rm = reducedMotion();
  const id = nextId('lw');
  const W = 340, H = 214, HEADX = W - 24, MID = H / 2, SCALE = H / 2 - 8;
  const py = (y) => MID - y * SCALE;

  const target = () => windowParams(ui.win);
  const cur = { ...target() };
  let t0 = 0;

  const hiRect = s('rect', { x: 0, y: 0, width: W, class: 'learn-w-hi' });
  const loRect = s('rect', { x: 0, width: W, class: 'learn-w-lo' });
  const band = s('rect', { x: 0, width: W, class: 'learn-w-band' });
  const edgeTop = s('line', { x1: 0, x2: W, class: 'learn-w-edge' });
  const edgeBot = s('line', { x1: 0, x2: W, class: 'learn-w-edge' });
  const clipHi = s('rect', { x: 0, y: 0, width: W });
  const clipIn = s('rect', { x: 0, width: W });
  const clipLo = s('rect', { x: 0, width: W });
  // Each zone gets a soft halo under a crisp line, clipped to its part of the chart.
  const lines = ['hi', 'in', 'lo'].flatMap((k) => [
    s('path', { class: `learn-w-halo ${k}`, 'clip-path': `url(#${id}-${k})` }),
    s('path', { class: `learn-w-line ${k}`, 'clip-path': `url(#${id}-${k})` }),
  ]);
  const glow = s('circle', { r: 12, class: 'learn-w-glow' });
  const head = s('circle', { r: 5, class: 'learn-w-head' });
  const lblBand = s('text', { x: 12, class: 'learn-svg-label band' }, 'YOUR WINDOW');

  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'learn-w-svg', role: 'img', 'aria-labelledby': `${id}-t`, focusable: 'false' },
    s('title', { id: `${id}-t` }, 'The window of tolerance: a wavy line for your arousal moves through a horizontal band, your window. Above the band is fight or flight; below it is shutdown. The band gets narrower or wider as you switch the factors below.'),
    s('defs', {},
      s('clipPath', { id: `${id}-hi` }, clipHi),
      s('clipPath', { id: `${id}-in` }, clipIn),
      s('clipPath', { id: `${id}-lo` }, clipLo),
      s('linearGradient', { id: `${id}-g`, x1: 0, x2: 1, y1: 0, y2: 0 },
        s('stop', { offset: '0', 'stop-color': '#fff', 'stop-opacity': '0.08' }),
        s('stop', { offset: '0.45', 'stop-color': '#fff', 'stop-opacity': '0.7' }),
        s('stop', { offset: '1', 'stop-color': '#fff', 'stop-opacity': '1' })),
      s('mask', { id: `${id}-m`, maskUnits: 'userSpaceOnUse', x: 0, y: 0, width: W, height: H },
        s('rect', { x: 0, y: 0, width: W, height: H, fill: `url(#${id}-g)` }))),
    hiRect, loRect, band, edgeTop, edgeBot,
    s('text', { x: 12, y: 20, class: 'learn-svg-label hi' }, 'ABOVE · FIGHT OR FLIGHT'),
    s('text', { x: 12, y: H - 10, class: 'learn-svg-label lo' }, 'BELOW · SHUTDOWN'),
    lblBand,
    s('g', { mask: `url(#${id}-m)` }, lines),
    s('line', { x1: HEADX, x2: HEADX, y1: 6, y2: H - 6, class: 'learn-w-now' }),
    glow, head);

  const nowDot = h('span', { class: 'learn-dot', 'aria-hidden': 'true' });
  const nowText = h('span', { class: 'learn-now-text' });
  const nowRow = h('p', { class: 'learn-now' }, nowDot, h('span', { class: 'learn-now-k', text: 'Now' }), nowText);
  const nowWrap = h('div', { class: 'learn-now-row' }, nowRow);
  const statN = h('span', { class: 'v' });
  const statNk = h('span', { class: 'k' });
  const statOut = h('span', { class: 'v' });
  const statWord = h('span', { class: 'v' });
  const summary = h('p', { class: 'visually-hidden', 'aria-live': 'polite' });

  let lastZone = null;
  const draw = () => {
    let d = '';
    const N = 140;
    for (let i = 0; i <= N; i += 1) {
      const x = (HEADX * i) / N;
      const y = arousal(t0 + (i / N) * VIEW, cur);
      d += `${i ? 'L' : 'M'}${x.toFixed(1)} ${py(y).toFixed(1)}`;
    }
    for (const l of lines) l.setAttribute('d', d);
    const top = py(cur.width), bot = py(-cur.width);
    hiRect.setAttribute('height', top.toFixed(1));
    loRect.setAttribute('y', bot.toFixed(1));
    loRect.setAttribute('height', (H - bot).toFixed(1));
    band.setAttribute('y', top.toFixed(1));
    band.setAttribute('height', (bot - top).toFixed(1));
    clipHi.setAttribute('height', top.toFixed(1));
    clipIn.setAttribute('y', top.toFixed(1));
    clipIn.setAttribute('height', (bot - top).toFixed(1));
    clipLo.setAttribute('y', bot.toFixed(1));
    clipLo.setAttribute('height', (H - bot).toFixed(1));
    for (const [ln, y] of [[edgeTop, top], [edgeBot, bot]]) { ln.setAttribute('y1', y.toFixed(1)); ln.setAttribute('y2', y.toFixed(1)); }
    lblBand.setAttribute('y', (top + Math.min(15, (bot - top) / 2 + 4)).toFixed(1));
    const yHead = arousal(t0 + VIEW, cur);
    for (const c of [head, glow]) { c.setAttribute('cx', HEADX); c.setAttribute('cy', py(yHead).toFixed(1)); }
    const z = zoneOf(yHead, cur.width);
    if (z !== lastZone) {
      lastZone = z;
      head.setAttribute('class', `learn-w-head ${ZONE_CLASS[z]}`);
      glow.setAttribute('class', `learn-w-glow ${ZONE_CLASS[z]}`);
      nowRow.dataset.zone = z;
      nowText.textContent = ZONE_TEXT[z];
    }
  };

  const updateStats = () => {
    const p = target();
    const st = typicalExits(p);
    const word = windowWord(p.width);
    statWord.textContent = word.replace(/^./, (c) => c.toUpperCase());
    statN.textContent = String(st.perStretch);
    statNk.textContent = st.perStretch === 1 ? 'exit per stretch' : 'exits per stretch';
    statOut.textContent = pct(st.outside);
    const lean = st.outside < 0.02 ? '' : st.hyper > st.hypo * 1.5 ? ' Mostly above: fight or flight.' : st.hypo > st.hyper * 1.5 ? ' Mostly below: shutdown.' : ' Both above and below.';
    summary.textContent = `Window ${word}. ${st.perStretch ? `The line leaves it about ${st.perStretch} ${st.perStretch === 1 ? 'time' : 'times'} per stretch and is outside ${pct(st.outside)} of the time.${lean}` : 'The line stays inside.'}`;
  };

  // ---- animation ----
  let raf = 0;
  let last = null;
  const settled = () => {
    const tg = target();
    return Math.abs(tg.width - cur.width) < 0.001 && Math.abs(tg.amp - cur.amp) < 0.001 && Math.abs(tg.bias - cur.bias) < 0.001 && Math.abs(tg.spike - cur.spike) < 0.001;
  };
  const frame = (ts) => {
    raf = 0;
    if (!svg.isConnected) return; // the view was replaced
    const dt = last == null ? 0 : Math.min(0.1, (ts - last) / 1000);
    last = ts;
    if (!ui.winPaused) t0 += dt * 0.9;
    const k = 1 - Math.exp(-dt * 5);
    const tg = target();
    for (const key of ['width', 'amp', 'bias', 'spike']) cur[key] += (tg[key] - cur[key]) * k;
    draw();
    if (!ui.winPaused || !settled()) raf = requestAnimationFrame(frame);
    else last = null;
  };
  const kick = () => {
    if (rm) { Object.assign(cur, target()); draw(); return; }
    if (!raf) raf = requestAnimationFrame(frame);
  };

  const pauseBtn = rm ? null : h('button', { class: 'learn-pause', type: 'button', 'aria-pressed': String(ui.winPaused) });
  const drawPause = () => {
    if (!pauseBtn) return;
    pauseBtn.textContent = ui.winPaused ? 'Play' : 'Pause';
    pauseBtn.setAttribute('aria-label', ui.winPaused ? 'Play the moving line' : 'Pause the moving line');
    pauseBtn.setAttribute('aria-pressed', String(ui.winPaused));
  };
  pauseBtn?.addEventListener('click', () => { ui.winPaused = !ui.winPaused; drawPause(); kick(); });
  drawPause();
  if (pauseBtn) nowWrap.append(pauseBtn);

  const rows = [];
  const onToggle = (fid) => {
    ui.win = toggleFactor(ui.win, fid);
    for (const r of rows) r.draw();
    updateStats();
    kick();
  };
  const isOn = (fid) => ui.win.includes(fid);
  const narrowRow = toggleRow(NARROW, isOn, onToggle, 'Things that narrow the window', 'narrow');
  const widenRow = toggleRow(WIDEN, isOn, onToggle, 'Things that widen the window', 'widen');
  rows.push(narrowRow, widenRow);

  let note = null;
  if (hint) {
    const hrs = `${Number.isInteger(hint.hours) ? hint.hours : hint.hours.toFixed(1)}h`;
    const ex = state.data.demo ? ' (example data)' : '';
    note = h('p', { class: 'learn-personal' },
      h('span', { class: 'learn-personal-k', text: 'From your check-in' }),
      hint.preset === 'short-sleep'
        ? `You logged ${hrs} sleep${ex}. Your window may be narrower today, so Short sleep is switched on.`
        : hint.preset === 'slept'
          ? `You logged ${hrs} sleep${ex}. That helps keep your window wider today, so Slept is switched on.`
          : `You logged ${hrs} sleep${ex}. Close to what you need.`);
  }

  updateStats();
  afterRender(() => { draw(); kick(); });

  return h('figure', { class: 'learn-fig learn-panel' },
    note,
    h('div', { class: 'learn-w-stage' }, svg),
    nowWrap,
    h('div', { class: 'learn-wstats' },
      h('div', { class: 'learn-wstat' }, statWord, h('span', { class: 'k', text: 'window' })),
      h('div', { class: 'learn-wstat' }, statN, statNk),
      h('div', { class: 'learn-wstat' }, statOut, h('span', { class: 'k', text: 'time outside' }))),
    summary,
    h('div', { class: 'learn-togroup' },
      h('p', { class: 'learn-tolabel narrow' }, h('span', { 'aria-hidden': 'true', text: '→←' }), ' Narrows it'),
      narrowRow.node,
      h('p', { class: 'learn-tolabel widen' }, h('span', { 'aria-hidden': 'true', text: '←→' }), ' Widens it'),
      widenRow.node,
      h('button', { class: 'learn-reset', type: 'button', onclick: () => { ui.win = []; for (const r of rows) r.draw(); updateStats(); kick(); } }, 'Clear all')),
    h('figcaption', { class: 'learn-legend' },
      h('p', { class: 'hyper' }, h('b', { text: 'Above · fight or flight. ' }), 'Anger, panic, racing thoughts, can’t sit still.'),
      h('p', { class: 'ok' }, h('b', { text: 'In your window. ' }), 'You can feel it and still think, choose and connect.'),
      h('p', { class: 'hypo' }, h('b', { text: 'Below · shutdown. ' }), 'Numb, foggy, frozen, can’t start anything.'),
      h('p', { class: 'learn-fine-n', text: 'An illustration, not a measurement. The numbers show direction, not size.' })));
}

// ============ 2. the alarm and the watchtower ============
const MODES = [
  { id: 'calm', label: 'Calm' },
  { id: 'over', label: 'Overloaded' },
  { id: 'night', label: 'After a bad night' },
];
const MODE_LINE = {
  calm: 'Calm: the alarm is quiet and the watchtower is online. You can notice a problem, think it through and choose.',
  over: 'Overloaded: the alarm is blaring. Stress chemistry dims the watchtower, so planning, choosing and braking all get much harder.',
  night: 'After a bad night: the alarm reacts more strongly and the line from the watchtower is weaker. Small things land like big ones.',
};
const STATUS = {
  // [word, level 0–1, zone]
  alarm: { label: 'Alarm', calm: ['Quiet', 0.2, 'ok'], over: ['Blaring', 0.95, 'hyper'], night: ['Jumpy', 0.7, 'edge'] },
  pfc: { label: 'Watchtower', calm: ['Online', 0.9, 'ok'], over: ['Dimmed', 0.2, 'hyper'], night: ['Flickering', 0.45, 'edge'] },
  brake: { label: 'Brake line', calm: ['Strong', 0.85, 'ok'], over: ['Weak', 0.2, 'hyper'], night: ['Weaker', 0.35, 'edge'] },
  body: { label: 'Heart & breath', calm: ['Steady', 0.25, 'ok'], over: ['Racing', 0.95, 'hyper'], night: ['On edge', 0.6, 'edge'] },
};
const REGIONS = {
  amygdala: {
    name: 'The alarm', sci: 'amygdala',
    body: 'Two almond-shaped clusters deep in the brain, one on each side. They scan for danger and can start the body’s stress response in a split second, before you’ve had time to think. Bessel van der Kolk calls this the smoke detector.',
    calm: 'Quiet. Scanning in the background.',
    over: 'Blaring. Almost everything looks like a threat.',
    night: 'Turned up. It fires at smaller things than usual.',
  },
  pfc: {
    name: 'The watchtower', sci: 'prefrontal cortex',
    body: 'Behind your forehead. It plans, chooses, holds back the first impulse and checks whether the alarm is right. This is where executive function lives.',
    calm: 'Online. You can weigh options and pick one.',
    over: 'Dimmed. Stress chemistry can take planning offline within minutes (Arnsten, 2009).',
    night: 'Flickering. After sleep loss its link to the alarm is weaker (Yoo et al., 2007).',
  },
  hippo: {
    name: 'The time-and-place stamp', sci: 'hippocampus',
    body: 'Curled right next to the alarm. It files memories with when and where they happened, so the past can stay in the past.',
    calm: 'Stamping clearly: that was then, this is now.',
    over: 'Under extreme stress the stamp can be weaker. That’s one reason old fear can feel like it’s happening now.',
    night: 'Sleep is when the day gets filed. Less sleep, messier filing.',
  },
  body: {
    name: 'The body', sci: 'brainstem, heart, breath, hormones',
    body: 'The alarm reaches the body two ways. Fast, through nerves and adrenaline: heart and breath speed up. Slower, through the HPA axis, a chain from the hypothalamus to the pituitary to the adrenal glands that releases stress hormones like cortisol. It works the other way too: a slow breath out sends a safety signal back up.',
    calm: 'Heart and breath steady.',
    over: 'Heart racing, breath fast and high, muscles ready to run or fight.',
    night: 'Running hotter than usual, so it takes less to tip over.',
  },
};
const REGION_ORDER = ['amygdala', 'pfc', 'hippo', 'body'];

export function brainMap() {
  const ui = learnUi();
  const id = nextId('lb');

  const region = (key, children, hit) => s('g', {
    class: 'learn-region', 'data-region': key,
    onclick: () => select(key),
  }, children, hit);

  const svg = s('svg', { viewBox: '0 0 360 330', class: 'learn-brain', 'data-mode': ui.brainMode, role: 'img', 'aria-labelledby': `${id}-t`, focusable: 'false' },
    s('title', { id: `${id}-t` }, 'Schematic side view of the brain, facing left, not to scale. The watchtower (prefrontal cortex) is at the front, behind the forehead. The alarm (amygdala) sits deep and low in the middle, with the hippocampus curled just behind it. The brainstem runs down from the base of the brain to the body: heart, breath and stress hormones.'),
    // faint head outline, facing left
    s('path', { class: 'learn-b-head', d: 'M70 300 C70 280 64 262 52 252 C40 244 30 238 34 226 C36 218 26 214 30 204 C33 196 20 190 26 180 L36 160 C30 120 40 70 96 38 C150 8 250 6 300 44 C346 80 352 150 330 196 C318 224 300 240 296 270 L294 300' }),
    // cerebellum and brainstem sit behind the cerebrum
    s('ellipse', { class: 'learn-b-cb', cx: 290, cy: 197, rx: 34, ry: 20 }),
    s('path', { class: 'learn-b-folia', d: 'M262 192 C276 186 302 186 318 194 M262 202 C278 198 302 198 320 204 M268 211 C282 208 300 208 312 212' }),
    region('body', [
      s('path', { class: 'learn-b-stem', d: 'M216 192 C222 214 226 242 227 272 L243 272 C243 244 248 220 256 196 C246 200 228 200 216 192 Z' }),
      s('path', { class: 'learn-b-nerve', d: 'M235 272 L235 292' }),
      s('path', { class: 'learn-b-heart', d: 'M235 318 C226 311 216 304 216 296 C216 290 221 286 226 286 C230 286 233 288 235 291 C237 288 240 286 244 286 C249 286 254 290 254 296 C254 304 244 311 235 318 Z' }),
      s('circle', { class: 'learn-b-hpa', cx: 196, cy: 170, r: 3.2 }),
    ], s('rect', { class: 'learn-hit', x: 196, y: 180, width: 72, height: 146, rx: 12 })),
    // cerebrum
    s('path', { class: 'learn-b-brain', d: 'M58 170 C36 128 52 70 112 46 C160 26 236 24 284 52 C322 74 338 124 322 160 C312 180 290 188 268 184 C250 196 222 202 200 196 C178 212 132 214 108 202 C86 198 66 190 58 170 Z' }),
    s('path', { class: 'learn-b-sulcus', d: 'M98 166 C140 150 182 146 226 128 M198 32 C188 66 194 96 180 126 M262 50 C250 86 270 104 258 140 M300 82 C290 104 306 124 296 152 M128 58 C140 84 126 104 136 128' }),
    region('pfc', [
      s('path', { class: 'learn-b-pfc', d: 'M58 170 C36 128 52 70 112 46 C128 40 142 36 156 34 C150 72 140 110 112 160 C100 168 80 174 58 170 Z' }),
    ], s('rect', { class: 'learn-hit', x: 40, y: 34, width: 112, height: 136, rx: 20 })),
    s('path', { class: 'learn-b-brake', d: 'M112 124 C120 152 138 170 156 180' }),
    region('hippo', [
      s('path', { class: 'learn-b-hippo', d: 'M176 178 C194 168 214 166 230 172 C240 176 242 184 234 188' }),
    ], s('rect', { class: 'learn-hit', x: 178, y: 150, width: 70, height: 44, rx: 12 })),
    region('amygdala', [
      s('circle', { class: 'learn-b-glow', cx: 164, cy: 182, r: 24 }),
      s('ellipse', { class: 'learn-b-amy', cx: 164, cy: 182, rx: 10, ry: 7, transform: 'rotate(-20 164 182)' }),
    ], s('circle', { class: 'learn-hit', cx: 164, cy: 182, r: 26 })),
    // labels
    s('path', { class: 'learn-b-lead', d: 'M44 34 L74 78' }),
    s('text', { class: 'learn-svg-label strong', x: 10, y: 18 }, 'WATCHTOWER'),
    s('text', { class: 'learn-svg-label', x: 10, y: 30 }, 'prefrontal cortex'),
    s('path', { class: 'learn-b-lead', d: 'M84 242 L152 192' }),
    s('text', { class: 'learn-svg-label strong', x: 10, y: 252 }, 'ALARM'),
    s('text', { class: 'learn-svg-label', x: 10, y: 264 }, 'amygdala'),
    s('path', { class: 'learn-b-lead', d: 'M236 112 L214 166' }),
    s('text', { class: 'learn-svg-label strong', x: 200, y: 94 }, 'TIME STAMP'),
    s('text', { class: 'learn-svg-label', x: 200, y: 106 }, 'hippocampus'),
    s('text', { class: 'learn-svg-label strong', x: 262, y: 298 }, 'BODY'),
    s('text', { class: 'learn-svg-label', x: 262, y: 310 }, 'heart · breath'),
    s('text', { class: 'learn-svg-label', x: 262, y: 322 }, 'stress hormones'),
    s('text', { class: 'learn-svg-label faint', x: 10, y: 322 }, 'SCHEMATIC · NOT TO SCALE'));

  const modeLine = h('p', { class: 'learn-mode-line', 'aria-live': 'polite' });
  const statusGrid = h('div', { class: 'learn-status' });
  const panelTitle = h('h3', { class: 'learn-region-name' });
  const panelSci = h('span', { class: 'learn-region-sci' });
  const panelBody = h('p', { class: 'learn-region-body' });
  const panelNow = h('p', { class: 'learn-region-now' });
  const panel = h('div', { class: 'learn-region-panel', 'aria-live': 'polite' }, h('div', { class: 'learn-region-head' }, panelTitle, panelSci), panelBody, panelNow);

  const modeRow = h('div', { class: 'learn-seg', role: 'group', 'aria-label': 'Brain state' });
  const regionRow = h('div', { class: 'chips learn-chips', role: 'group', 'aria-label': 'Explain a part' });

  const draw = () => {
    const m = ui.brainMode;
    svg.dataset.mode = m;
    for (const g of svg.querySelectorAll('.learn-region')) g.classList.toggle('on', g.dataset.region === ui.brainRegion);
    modeRow.replaceChildren(...MODES.map((x) => h('button', { type: 'button', 'aria-pressed': String(x.id === m), onclick: () => { ui.brainMode = x.id; draw(); } }, x.label)));
    regionRow.replaceChildren(...REGION_ORDER.map((k) => h('button', { class: 'chip learn-chip', type: 'button', 'aria-pressed': String(k === ui.brainRegion), onclick: () => select(k) }, `${REGIONS[k].name.replace(/^The /, '').replace(/^./, (c) => c.toUpperCase())}`)));
    modeLine.textContent = MODE_LINE[m];
    statusGrid.replaceChildren(...Object.values(STATUS).map((st) => {
      const [word, level, zone] = st[m];
      return h('div', { class: `learn-stat ${zone}` },
        h('span', { class: 'learn-stat-k', text: st.label }),
        h('span', { class: 'learn-stat-v', text: word }),
        h('span', { class: 'learn-meter', 'aria-hidden': 'true' }, h('i', { style: `width:${Math.round(level * 100)}%` })));
    }));
    const r = REGIONS[ui.brainRegion];
    panelTitle.textContent = r.name;
    panelSci.textContent = r.sci;
    panelBody.textContent = r.body;
    panelNow.replaceChildren(h('b', { text: `${MODES.find((x) => x.id === m).label}: ` }), r[m]);
  };
  function select(k) {
    ui.brainRegion = k;
    draw();
  }
  draw();

  return h('figure', { class: 'learn-fig learn-panel learn-brain-fig' },
    modeRow,
    h('div', { class: 'learn-brain-stage' }, svg),
    h('p', { class: 'learn-hint', text: 'Tap a part of the brain, or pick one below.' }),
    regionRow,
    panel,
    modeLine,
    statusGrid);
}

// ============ 3. same stressor, two nervous systems ============
const STRESS_WORDS = ['nothing', 'a tiny hassle', 'a small hassle', 'a hard message', 'a hard message', 'an argument', 'a big argument', 'a serious shock', 'a serious shock', 'overwhelming', 'overwhelming'];

function systemChart(key, stress) {
  const sys = SYSTEMS[key];
  const W = 160, H = 150, L = 6, R = 154, MID = 78, SC = 62;
  const px = (t) => L + ((R - L) * t) / T_END;
  const py = (y) => MID - y * SC;
  let d = '';
  const N = 120;
  for (let i = 0; i <= N; i += 1) {
    const t = (T_END * i) / N;
    d += `${i ? 'L' : 'M'}${px(t).toFixed(1)} ${py(response(t, stress, sys)).toFixed(1)}`;
  }
  const top = py(sys.width), bot = py(-sys.width);
  return s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'learn-sys-svg', 'aria-hidden': 'true', focusable: 'false' },
    s('defs', {},
      s('clipPath', { id: `cp-${key}-hi` }, s('rect', { x: 0, y: 0, width: W, height: top })),
      s('clipPath', { id: `cp-${key}-in` }, s('rect', { x: 0, y: top, width: W, height: bot - top })),
      s('clipPath', { id: `cp-${key}-lo` }, s('rect', { x: 0, y: bot, width: W, height: H - bot }))),
    s('rect', { class: 'learn-w-hi', x: 0, y: 0, width: W, height: top }),
    s('rect', { class: 'learn-w-band', x: 0, y: top, width: W, height: bot - top }),
    s('rect', { class: 'learn-w-lo', x: 0, y: bot, width: W, height: H - bot }),
    s('line', { class: 'learn-w-edge', x1: 0, x2: W, y1: top, y2: top }),
    s('line', { class: 'learn-w-edge', x1: 0, x2: W, y1: bot, y2: bot }),
    s('line', { class: 'learn-sys-stressor', x1: px(1), x2: px(1), y1: 4, y2: H - 4 }),
    s('text', { class: 'learn-svg-label faint', x: px(1) + 4, y: H - 8 }, 'STRESSOR'),
    ['hi', 'in', 'lo'].map((k) => s('path', { class: `learn-w-line ${k}`, d, 'clip-path': `url(#cp-${key}-${k})` })));
}

export function twoSystems() {
  const ui = learnUi();
  const valueOut = h('output', { class: 'learn-range-v', for: 'learn-stress' });
  const slider = h('input', { type: 'range', id: 'learn-stress', min: '0', max: '10', step: '1', value: String(ui.stress), class: 'learn-range' });
  const charts = {};
  const words = {};
  const bars = {};
  const cols = Object.keys(SYSTEMS).map((key) => {
    charts[key] = h('div', { class: 'learn-sys-chart' });
    words[key] = h('p', { class: 'learn-sys-words' });
    bars[key] = h('i');
    return h('div', { class: `learn-sys ${key}` },
      h('p', { class: 'learn-sys-name', text: SYSTEMS[key].label }),
      charts[key],
      h('div', { class: 'learn-sys-out' }, h('span', { class: 'k', text: 'Time outside' }), h('span', { class: 'learn-meter', 'aria-hidden': 'true' }, bars[key])),
      words[key]);
  });
  const summary = h('p', { class: 'visually-hidden', 'aria-live': 'polite' });

  const draw = () => {
    const st = ui.stress;
    valueOut.textContent = `${st} · ${STRESS_WORDS[st]}`;
    const parts = [];
    for (const key of Object.keys(SYSTEMS)) {
      charts[key].replaceChildren(systemChart(key, st));
      const r = responseStats(st, SYSTEMS[key]);
      words[key].textContent = responseWords(r);
      bars[key].style.width = `${Math.min(100, (r.outside / 6) * 100)}%`;
      parts.push(`${SYSTEMS[key].label}: ${responseWords(r)}`);
    }
    summary.textContent = `Stressor ${st} of 10. ${parts.join(' ')}`;
  };
  slider.addEventListener('input', () => { ui.stress = Number(slider.value); draw(); });
  draw();

  return h('figure', { class: 'learn-fig learn-panel' },
    h('label', { class: 'learn-range-l', for: 'learn-stress' }, h('span', { text: 'How big is the stressor?' }), valueOut),
    slider,
    h('div', { class: 'learn-range-ends', 'aria-hidden': 'true' }, h('span', { text: 'none' }), h('span', { text: 'overwhelming' })),
    h('div', { class: 'learn-sys-grid', role: 'img', 'aria-label': 'Two charts side by side. Each shows arousal over time after the same stressor. The window on the right is narrower; its line rises sooner, goes higher and takes longer to come back down.' }, cols),
    summary,
    h('ul', { class: 'learn-diffs' },
      h('li', {}, h('b', { text: 'Narrower window. ' }), 'Less room before you tip out.'),
      h('li', {}, h('b', { text: 'More sensitive alarm. ' }), 'Smaller things set it off.'),
      h('li', {}, h('b', { text: 'Faster flip. ' }), 'Out of the window in a moment.'),
      h('li', {}, h('b', { text: 'Slower return. ' }), 'The body takes longer to believe it’s over.')),
    h('figcaption', { class: 'learn-fine-n', text: 'An illustration of a common pattern, not anyone’s data. Every nervous system is different.' }));
}

// ============ 4. two windows on a hard morning ============
const PLAN = {
  home: { title: 'Stay home, keep it cosy.', body: 'Quiet and familiar: blankets, a show together, drawing, a bath. No new places, no big asks. A calm day is a good day.' },
  low: { title: 'A low-demand day.', body: 'Home base with one small outing: a short scooter ride, the park around the corner, one thing at the shops. Easy exits, snacks packed, nothing that has to go well.' },
  outing: { title: 'A good day for an outing.', body: 'You both have room. Go out early while energy is high: the scooter track, the playground, somewhere new. Pack a snack and a plan B.' },
};

export function kidWindows() {
  const ui = learnUi();
  const k = ui.kid;
  const W = 340, X0 = 16, X1 = 324, SPAN = X1 - X0;
  const xAt = (v) => X0 + SPAN * v;

  const youBar = s('rect', { class: 'learn-k-bar you', x: X0, y: 34, height: 26, rx: 13 });
  const kidBar = s('rect', { class: 'learn-k-bar kid', x: X0, y: 92, height: 26, rx: 13 });
  const shared = s('rect', { class: 'learn-k-shared', x: X0 - 6, y: 22, height: 108, rx: 16 });
  const sharedEdge = s('line', { class: 'learn-k-edge', y1: 16, y2: 136 });
  const youVal = s('text', { class: 'learn-svg-label learn-k-val', y: 51 });
  const kidVal = s('text', { class: 'learn-svg-label learn-k-val', y: 109 });
  // Each kind of day sits at the size of shared window it needs (see kidMorning).
  const marks = [['home', 0.25, 'STAY HOME'], ['low', 0.5, 'LOW-DEMAND'], ['outing', 0.8, 'OUTING']].map(([key, v, label]) => {
    const g = s('g', { class: 'learn-k-mark', 'data-plan': key },
      s('circle', { cx: xAt(v), cy: 156, r: 4.5 }),
      s('text', { class: 'learn-svg-label', x: xAt(v), y: 177, 'text-anchor': 'middle' }, label));
    return { g, v, key };
  });
  const svg = s('svg', { viewBox: `0 0 ${W} 184`, class: 'learn-k-svg', 'aria-hidden': 'true', focusable: 'false' },
    shared, sharedEdge,
    s('text', { class: 'learn-svg-label', x: X0, y: 26 }, 'YOU'),
    s('text', { class: 'learn-svg-label', x: X0, y: 84 }, kidName().toUpperCase()),
    s('rect', { class: 'learn-k-track', x: X0, y: 34, width: SPAN, height: 26, rx: 13 }),
    s('rect', { class: 'learn-k-track', x: X0, y: 92, width: SPAN, height: 26, rx: 13 }),
    youBar, kidBar, youVal, kidVal,
    s('line', { class: 'learn-k-axis', x1: X0, x2: X1, y1: 156, y2: 156 }),
    marks.map((m) => m.g));

  const planTitle = h('p', { class: 'learn-plan-title' });
  const planBody = h('p', { class: 'learn-plan-body' });
  const planFirst = h('p', { class: 'learn-plan-first' });
  const planLimit = h('p', { class: 'learn-plan-limit' });
  const plan = h('div', { class: 'learn-plan', 'aria-live': 'polite' }, planFirst, planTitle, planBody, planLimit);

  const items = [
    { id: 'parentSlept', label: 'You slept' },
    { id: 'kidSlept', label: `${KidName()} slept` },
    { id: 'ate', label: 'You both ate' },
  ];
  const chips = toggleRow(items, (i) => Boolean(k[i]), (i) => { k[i] = !k[i]; draw(); }, 'This morning');

  function draw() {
    const m = kidMorning(k);
    youBar.setAttribute('width', (SPAN * m.parent).toFixed(1));
    kidBar.setAttribute('width', (SPAN * m.kid).toFixed(1));
    shared.setAttribute('width', (SPAN * m.shared + 12).toFixed(1));
    sharedEdge.setAttribute('x1', xAt(m.shared).toFixed(1));
    sharedEdge.setAttribute('x2', xAt(m.shared).toFixed(1));
    for (const [t, v] of [[youVal, m.parent], [kidVal, m.kid]]) {
      t.setAttribute('x', (xAt(v) - 10).toFixed(1));
      t.setAttribute('text-anchor', 'end');
      t.textContent = v >= 0.8 ? 'WIDE' : v >= 0.5 ? 'MEDIUM' : 'NARROW';
    }
    for (const mk of marks) {
      mk.g.classList.toggle('in', mk.v <= m.shared + 0.001);
      mk.g.classList.toggle('pick', mk.key === m.plan);
    }
    planFirst.textContent = m.eatFirst ? 'First: food. Hungry windows are narrow windows.' : '';
    planFirst.hidden = !m.eatFirst;
    planTitle.textContent = PLAN[m.plan].title;
    planBody.textContent = PLAN[m.plan].body;
    planLimit.textContent = m.limit === 'parent'
      ? 'Your window is the smaller one today. Plan around it. A steady parent matters more than a big day.'
      : m.limit === 'kid'
        ? `${KidName()}’s window is the smaller one today. Meet ${kidName()} there.`
        : 'Your windows are about the same size today.';
  }
  draw();

  return h('figure', { class: 'learn-fig learn-panel' },
    h('p', { class: 'learn-hint', text: 'This morning…' }),
    chips.node,
    h('div', { class: 'learn-k-stage', role: 'img', 'aria-label': `Two bars show how much room you and ${kidName()} have today. The highlighted part is the size of day that fits inside both windows.` }, svg),
    plan,
    h('div', { class: 'btn-row' }, h('button', { class: 'btn ghost learn-btn-ghost', type: 'button', onclick: () => go('kid') }, 'Open the visit plan')),
    h('figcaption', { class: 'learn-fine-n', text: 'A rule of thumb, not a prediction. You know your kid best.' }));
}
