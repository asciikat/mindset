// Learn room: the small practice tools — breathing pacer, orienting prompts,
// a 20-second hug timer, the two-minute guided practice and loving-kindness
// phrases. Timers are time-based (they work out where they are from the start
// time), so they survive a redraw, and they stop once they leave the page.

import { h, s, now, kidName, KidName } from '../core.js';
import { PATTERNS, cycleSecs, pacerPhase, practiceStep, clock } from './learn-model.js';
import { learnUi, reducedMotion } from './learn-diagrams.js';

// Run fn every `ms` while `node` is on the page; returns a stop function.
function every(node, ms, fn) {
  let started = false;
  let waited = 0;
  const t = setInterval(() => {
    if (node.isConnected) started = true;
    else if (started || (waited += ms) > 5000) { clearInterval(t); return; } // left the page, or never arrived
    else return; // not mounted yet
    fn();
  }, ms);
  return () => clearInterval(t);
}

// ============ breathing pacer ============
export function breathPacer() {
  const ui = learnUi();
  const p = ui.pacer;
  const rm = reducedMotion();

  const fill = h('span', { class: 'learn-breath-fill' });
  const word = h('span', { class: 'learn-breath-word' });
  const secs = h('span', { class: 'learn-breath-secs' });
  const stage = h('div', { class: `learn-breath${rm ? ' still' : ''}`, 'aria-hidden': 'true' },
    h('span', { class: 'learn-breath-ring' }), fill, h('span', { class: 'learn-breath-label' }, word, secs));
  const cue = h('p', { class: 'learn-breath-cue' });
  const live = h('p', { class: 'visually-hidden', 'aria-live': 'polite' });
  const meta = h('p', { class: 'learn-breath-meta' });
  const btn = h('button', { class: 'btn learn-btn', type: 'button' });
  const patRow = h('div', { class: 'learn-seg', role: 'group', 'aria-label': 'Breathing pattern' });
  const minRow = h('div', { class: 'chips learn-chips', role: 'group', 'aria-label': 'How long' });

  let stop = null;
  let lastKey = '';

  const pattern = () => PATTERNS[p.pattern] || PATTERNS.sigh;
  const rest = () => {
    if (!rm) {
      fill.style.transitionDuration = '0.8s';
      fill.style.transform = 'scale(0.42)';
    }
    stage.dataset.phase = 'rest';
  };
  const idle = (doneText = null) => {
    rest();
    word.textContent = doneText ? 'Done' : 'Ready';
    secs.textContent = '';
    const pat = pattern();
    const breaths = Math.round((p.mins * 60) / cycleSecs(pat));
    cue.textContent = doneText || (p.pattern === 'sigh'
      ? 'In through your nose, a second short sip in, then a long slow breath out through your mouth.'
      : 'In gently for 4, out slowly for 6. Let the out-breath be the longer one.');
    meta.textContent = `${p.mins} min · about ${breaths} breaths`;
    btn.textContent = 'Start';
  };

  const tick = () => {
    if (p.startedAt == null) return;
    const el = now() - p.startedAt;
    const total = p.mins * 60000;
    if (el >= total) { finish('Done. Notice how you feel now. Even a little calmer counts.'); live.textContent = 'Done'; return; }
    const ph = pacerPhase(pattern(), el);
    const key = `${ph.breaths}:${ph.index}`;
    if (key !== lastKey) {
      lastKey = key;
      if (!rm) {
        fill.style.transitionDuration = `${Math.max(0.1, ph.left).toFixed(2)}s`;
        fill.style.transform = `scale(${ph.phase.scale})`;
      }
      stage.dataset.phase = ph.phase.key;
      word.textContent = ph.phase.word;
      cue.textContent = ph.phase.cue;
      live.textContent = ph.phase.word;
    }
    secs.textContent = String(Math.ceil(ph.left));
    meta.textContent = `${clock((total - el) / 1000)} left · ${ph.breaths} ${ph.breaths === 1 ? 'breath' : 'breaths'} done`;
  };

  function start() {
    p.startedAt = now();
    lastKey = '';
    btn.textContent = 'Stop';
    stop?.();
    stop = every(stage, 100, tick);
    // first frame right away so the circle starts moving with the button press
    requestAnimationFrame(tick);
  }
  function finish(text) {
    p.startedAt = null;
    stop?.();
    stop = null;
    lastKey = '';
    idle(text);
  }
  btn.addEventListener('click', () => (p.startedAt == null ? start() : finish('Stopped. You can come back any time.')));

  const drawControls = () => {
    patRow.replaceChildren(...Object.entries(PATTERNS).map(([key, pat]) => h('button', {
      type: 'button', 'aria-pressed': String(p.pattern === key),
      onclick: () => { p.pattern = key; if (p.startedAt != null) finish(null); drawControls(); idle(); },
    }, pat.label)));
    minRow.replaceChildren(...[1, 2, 5].map((m) => h('button', {
      class: 'chip learn-chip', type: 'button', 'aria-pressed': String(p.mins === m),
      onclick: () => { p.mins = m; drawControls(); if (p.startedAt == null) idle(); },
    }, `${m} min`)));
  };
  drawControls();
  idle();
  if (p.startedAt != null) { btn.textContent = 'Stop'; stop = every(stage, 100, tick); }

  return h('figure', { class: 'learn-fig learn-panel learn-pacer' },
    patRow,
    stage,
    cue, live,
    h('div', { class: 'learn-pacer-row' }, minRow, meta),
    btn,
    h('figcaption', { class: 'learn-fine-n', text: rm ? 'Motion is reduced on this device, so the circle stays still. Follow the words and the count.' : 'Follow the circle: it grows as you breathe in and shrinks as you breathe out.' }));
}

// ============ orienting ============
const ORIENT = [
  'Let your eyes move slowly around the space. No rush.',
  'Find something blue.',
  'Find something round.',
  'Find where the light is coming from.',
  'Find something soft.',
  'Find the furthest thing you can see.',
  'Notice a sound outside the room.',
  'Notice what is holding you up: the chair, the floor, the bed.',
  'Say it quietly: I’m here. It’s now.',
];

export function orientCard() {
  const ui = learnUi();
  const text = h('p', { class: 'learn-orient-text', 'aria-live': 'polite' });
  const count = h('span', { class: 'learn-orient-n' });
  const draw = () => {
    text.textContent = ORIENT[ui.orient % ORIENT.length];
    count.textContent = `${(ui.orient % ORIENT.length) + 1} / ${ORIENT.length}`;
  };
  draw();
  return h('div', { class: 'learn-tool' },
    h('div', { class: 'learn-tool-head' }, h('span', { class: 'learn-tool-k', text: 'Orienting prompts' }), count),
    text,
    h('button', { class: 'btn ghost learn-btn-small', type: 'button', onclick: () => { ui.orient = (ui.orient + 1) % ORIENT.length; draw(); } }, 'Next'));
}

// ============ 20-second hug timer ============
export function hugTimer() {
  const ui = learnUi();
  const LEN = 20000;
  const n = h('span', { class: 'learn-hug-n' });
  const bar = h('i');
  const live = h('p', { class: 'visually-hidden', 'aria-live': 'polite' });
  const btn = h('button', { class: 'btn ghost learn-btn-small', type: 'button' });
  const node = h('div', { class: 'learn-tool' },
    h('div', { class: 'learn-tool-head' }, h('span', { class: 'learn-tool-k', text: 'A 20-second hug' }), n),
    h('span', { class: 'learn-meter wide', 'aria-hidden': 'true' }, bar),
    live, btn);
  let stop = null;
  const show = () => {
    if (ui.hugAt == null) {
      n.textContent = '0:20';
      bar.style.width = '0%';
      btn.textContent = 'Start the timer';
      return;
    }
    const el = now() - ui.hugAt;
    if (el >= LEN) {
      ui.hugAt = null;
      stop?.(); stop = null;
      n.textContent = 'Done';
      bar.style.width = '100%';
      btn.textContent = 'Again';
      live.textContent = 'Twenty seconds. Notice your shoulders.';
      return;
    }
    n.textContent = clock((LEN - el) / 1000);
    bar.style.width = `${(el / LEN) * 100}%`;
  };
  btn.addEventListener('click', () => {
    if (ui.hugAt != null) { ui.hugAt = null; stop?.(); stop = null; show(); live.textContent = 'Stopped'; return; }
    ui.hugAt = now();
    btn.textContent = 'Stop';
    live.textContent = 'Started. Twenty seconds.';
    stop?.();
    stop = every(node, 200, show);
  });
  show();
  if (ui.hugAt != null) { btn.textContent = 'Stop'; stop = every(node, 200, show); }
  return node;
}

// ============ the two-minute practice ============
export const PRACTICE = [
  { k: 'Arrive', t: 'Let your feet rest on the floor. Feel the weight of your body, and whatever is holding it up.' },
  { k: 'Notice the weather', t: 'What’s here right now? Name it softly, without fixing it. Tiredness is here. Worry is here. Anger is here.' },
  { k: 'Be the sky', t: 'Feelings move through like weather. You are the space they move through. Let them come, and let them go.' },
  { k: 'This is hard', t: 'If it feels okay, put a hand on your heart. Say inside: this is a hard moment.' },
  { k: 'You’re not alone', t: 'Other parents feel this too, tonight, all over the world. Struggling is part of being human.' },
  { k: 'Be kind', t: 'May I be kind to myself. May I give myself what I need. Stay here for one more slow breath.' },
];
const STEP_SECS = 20;

export function guidedPractice() {
  const ui = learnUi();
  const R = 52, C = 2 * Math.PI * R;
  const arc = s('circle', { class: 'learn-prac-arc', cx: 60, cy: 60, r: R, 'stroke-dasharray': C.toFixed(1), 'stroke-dashoffset': C.toFixed(1), transform: 'rotate(-90 60 60)' });
  const ring = s('svg', { viewBox: '0 0 120 120', class: 'learn-prac-ring', 'aria-hidden': 'true', focusable: 'false' },
    s('circle', { class: 'learn-prac-track', cx: 60, cy: 60, r: R }), arc);
  const left = h('span', { class: 'learn-prac-left' });
  const stepK = h('p', { class: 'learn-prac-k' });
  const stepT = h('p', { class: 'learn-prac-t' });
  const live = h('div', { 'aria-live': 'polite', class: 'learn-prac-live' }, stepK, stepT);
  const btn = h('button', { class: 'btn learn-btn', type: 'button' });
  const dots = h('div', { class: 'learn-prac-dots', 'aria-hidden': 'true' });
  const node = h('div', { class: 'learn-prac' },
    h('div', { class: 'learn-prac-dial' }, ring, left),
    live, dots, btn);
  let stop = null;
  let lastIndex = -1;

  const drawDots = (active, done) => dots.replaceChildren(...PRACTICE.map((_, i) => h('i', { class: done || i < active ? 'done' : i === active ? 'on' : '' })));

  const idle = (end = false) => {
    lastIndex = -1;
    arc.setAttribute('stroke-dashoffset', end ? '0' : C.toFixed(1));
    left.textContent = end ? '' : '2:00';
    stepK.textContent = end ? 'Welcome back' : 'Two minutes';
    stepT.textContent = end
      ? 'The sky is still here. So are you.'
      : 'Six short steps, twenty seconds each. Read slowly, or close your eyes between steps.';
    btn.textContent = end ? 'Again' : 'Begin';
    drawDots(end ? PRACTICE.length : -1, end);
  };
  const tick = () => {
    if (ui.practiceAt == null) return;
    const st = practiceStep(PRACTICE.length, STEP_SECS, now() - ui.practiceAt);
    if (st.done) { ui.practiceAt = null; stop?.(); stop = null; idle(true); return; }
    const total = PRACTICE.length * STEP_SECS;
    arc.setAttribute('stroke-dashoffset', (C * (st.totalLeft / total)).toFixed(1));
    left.textContent = clock(st.totalLeft);
    if (st.index !== lastIndex) {
      lastIndex = st.index;
      stepK.textContent = `${st.index + 1} · ${PRACTICE[st.index].k}`;
      stepT.textContent = PRACTICE[st.index].t;
      stepT.classList.remove('fade');
      void stepT.offsetWidth; // restart the fade
      stepT.classList.add('fade');
      drawDots(st.index, false);
    }
  };
  btn.addEventListener('click', () => {
    if (ui.practiceAt != null) { ui.practiceAt = null; stop?.(); stop = null; idle(); return; }
    ui.practiceAt = now();
    btn.textContent = 'Stop';
    stop?.();
    stop = every(node, 250, tick);
    tick();
  });
  idle();
  if (ui.practiceAt != null) { btn.textContent = 'Stop'; stop = every(node, 250, tick); tick(); }
  return node;
}

// ============ loving-kindness ============
export function lovingKindness() {
  const ui = learnUi();
  const sets = {
    self: { label: 'You', intro: 'Start here. It’s often the hardest one.', lines: ['May I be safe.', 'May I be gentle with myself.', 'May I rest when I need to.', 'May I know I’m doing my best.'] },
    kid: { label: KidName(), intro: `Picture ${kidName()} on a good day.`, lines: ['May you be safe.', 'May you feel loved, even on hard days.', 'May you grow at your own pace.', 'May you always know I come back.'] },
    hurt: { label: 'Someone who hurt you', intro: 'From a distance, with boundaries. Only if it feels okay. Skip it any time.', lines: ['May you find your own peace.', 'May you cause less harm.', 'May I be free of carrying this.'] },
  };
  const intro = h('p', { class: 'learn-lk-intro' });
  const list = h('ul', { class: 'learn-lk-lines' });
  const note = h('p', { class: 'learn-lk-note' });
  const row = h('div', { class: 'learn-seg wrap', role: 'group', 'aria-label': 'Who the phrases are for' });
  const draw = () => {
    const cur = sets[ui.lk] || sets.self;
    row.replaceChildren(...Object.entries(sets).map(([key, v]) => h('button', { type: 'button', 'aria-pressed': String(ui.lk === key), onclick: () => { ui.lk = key; draw(); } }, v.label)));
    intro.textContent = cur.intro;
    list.replaceChildren(...cur.lines.map((l) => h('li', { text: l })));
    note.textContent = ui.lk === 'hurt'
      ? 'Wishing someone well doesn’t mean letting them back in, or saying what happened was okay. Boundaries are part of kindness.'
      : 'Say each line slowly, two or three times. It’s fine if it feels awkward. Warmth often comes later.';
  };
  draw();
  return h('div', { class: 'learn-lk' }, row, h('div', { 'aria-live': 'polite' }, intro, list), note);
}
