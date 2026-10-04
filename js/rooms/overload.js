// The Overload button: a full-screen, calm takeover for the worst moments.
// Six short steps, every one skippable, with "I'm okay now" always in reach:
// arrive, breathe (cyclic sighing), notes from calm you, ground, log it, next 30 minutes.
// The body map, the calm log and the Body views live in body.js (imported here).

import { state, h, render, go, setAccent, openSheet, closeSheet, setSheetTitle, registerAction, kidName } from '../core.js';
import { newDraft, logFields, saveLog } from './body.js';

const STEPS = [
  { id: 'arrive', title: 'Overload' },
  { id: 'breathe', title: 'Breathe' },
  { id: 'notes', title: 'Notes from calm you' },
  { id: 'ground', title: 'Ground' },
  { id: 'log', title: 'Log it' },
  { id: 'next', title: 'Next 30 minutes' },
];

// Cyclic sighing: two inhales through the nose, then a long, slow exhale.
const PHASES = [
  { word: 'In', cue: 'Breathe in through your nose', ms: 2500, scale: 0.84 },
  { word: 'More', cue: 'And a little more', ms: 1200, scale: 1 },
  { word: 'Out', cue: 'Long, slow breath out through your mouth', ms: 6500, scale: 0.5 },
];
const ROUND_GOAL = 5;

const SENSES = [
  [5, 'things you can see'],
  [4, 'things you can feel', 'Your feet, the chair, your clothes, the air.'],
  [3, 'things you can hear'],
  [2, 'things you can smell'],
  [1, 'thing you can taste'],
];

function reducedMotion() {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
}

// Which accent the page had before the takeover, so it can be put back.
function currentAccent() {
  const map = { 'trend-up': 'up', 'trend-down': 'down', 'zone-ok': 'ok', 'zone-edge': 'edge', 'zone-over': 'over', 'zone-low': 'low', 'zone-calm': 'calm' };
  for (const [cls, kind] of Object.entries(map)) if (document.body.classList.contains(cls)) return kind;
  return 'calm';
}

function openOverload(startAt = 'arrive') {
  const start = STEPS.findIndex((x) => x.id === startAt);
  const flow = {
    step: start < 0 ? 0 : start,
    done: new Set(),
    draft: newDraft(),
    saved: false,
    noteIdx: 0,
    ground: { mode: 'senses', sense: 0, count: 0 },
    choice: null,
    rounds: 0,
    stop: null,
    autoStart: false,
  };
  const prevAccent = currentAccent();
  setAccent('calm');

  const root = h('div', { class: 'body-flow' });
  let sheet = null;

  const stopActive = () => { flow.stop?.(); flow.stop = null; };
  const close = () => closeSheet();
  const goStep = (i) => {
    stopActive();
    flow.step = Math.max(0, Math.min(STEPS.length - 1, i));
    draw();
    if (sheet) sheet.scrollTop = 0;
    const target = root.querySelector('[data-step-focus]') || root.querySelector('.body-stage-h');
    target?.focus({ preventScroll: true });
  };
  const markDone = (id) => {
    flow.done.add(id);
    const fwd = root.querySelector('[data-flow-next]');
    if (fwd && STEPS[flow.step].id === id) fwd.textContent = 'Next ›';
  };

  function stepper() {
    const i = flow.step;
    return h('div', { class: 'body-steps' },
      h('span', { class: 'visually-hidden', text: `Step ${i + 1} of ${STEPS.length}: ${STEPS[i].title}` }),
      h('span', { class: 'body-steps-bar', 'aria-hidden': 'true' },
        STEPS.map((_, j) => h('i', { class: j < i ? 'past' : j === i ? 'now' : '' }))),
      h('span', { class: 'body-steps-n', 'aria-hidden': 'true', text: `${i + 1} of ${STEPS.length}` }));
  }

  function footer() {
    const i = flow.step;
    const last = i === STEPS.length - 1;
    const id = STEPS[i].id;
    return h('div', { class: 'body-flow-foot' },
      h('div', { class: 'body-flow-nav' },
        h('button', { class: 'btn ghost body-nav', type: 'button', style: i === 0 ? 'visibility:hidden' : null, onclick: () => goStep(i - 1), 'aria-label': 'Back a step' }, '‹ Back'),
        last
          ? h('span')
          : h('button', { class: 'btn ghost body-nav', type: 'button', 'data-flow-next': '', onclick: () => goStep(i + 1) }, flow.done.has(id) ? 'Next ›' : 'Skip ›')),
      last ? null : h('button', { class: 'body-okay', type: 'button', onclick: close }, 'I’m okay now'));
  }

  function draw() {
    const st = STEPS[flow.step];
    setSheetTitle(st.title);
    const stage = h('div', { class: `body-stage body-stage-${st.id}` }, STEP_RENDER[st.id]());
    root.replaceChildren(stepper(), stage, footer());
  }

  // ---------- a. arrive ----------
  function arrive() {
    return [
      h('div', { class: 'body-glow', 'aria-hidden': 'true' }, h('span')),
      h('h3', { class: 'body-stage-h body-arrive-h', tabindex: '-1' }, 'You pressed Overload. That was the right move.'),
      h('p', { class: 'body-arrive-sub', text: 'Nothing needs deciding or answering right now.' }),
      h('button', { class: 'btn block body-big', type: 'button', 'data-autofocus': '', onclick: () => { flow.autoStart = true; markDone('arrive'); goStep(1); } }, 'Start breathing'),
    ];
  }

  // ---------- b. breathe ----------
  function breathe() {
    const rm = reducedMotion();
    let running = false;
    let rounds = flow.rounds;
    let phase = -1;
    let timer = null;
    let tick = null;
    let phaseEnd = 0;

    const circle = h('span', { class: 'body-breath-fill' });
    const word = h('span', { class: 'body-breath-word', text: rm ? 'Ready' : '' });
    const secs = h('span', { class: 'body-breath-secs' });
    const ring = h('div', { class: `body-breath${rm ? ' still' : ''}`, 'aria-hidden': 'true' },
      h('span', { class: 'body-breath-ring' }), circle, h('span', { class: 'body-breath-label' }, word, rm ? secs : null));
    const cue = h('p', { class: 'body-cue', 'aria-live': 'polite', text: 'Two breaths in through your nose. One long breath out.' });
    const dots = h('span', { class: 'body-round-dots', 'aria-hidden': 'true' });
    const count = h('span', { class: 'body-round-n' });
    const btn = h('button', { class: 'btn block body-big', type: 'button', 'data-step-focus': '' }, 'Start');

    const goal = () => Math.max(ROUND_GOAL, Math.ceil((rounds + (running ? 1 : 0)) / ROUND_GOAL) * ROUND_GOAL);
    const drawRounds = () => {
      const g = goal();
      const doneInSet = rounds - (g - ROUND_GOAL);
      dots.replaceChildren(...Array.from({ length: ROUND_GOAL }, (_, k) => h('i', { class: k < doneInSet ? 'on' : k === doneInSet && running ? 'now' : '' })));
      count.textContent = running ? `Round ${rounds + 1} of ${g}` : rounds ? `${rounds} ${rounds === 1 ? 'round' : 'rounds'} done` : `Aim for ${ROUND_GOAL} rounds`;
    };
    const showSecs = () => {
      if (!rm || !running) return;
      secs.textContent = String(Math.max(1, Math.ceil((phaseEnd - performance.now()) / 1000)));
    };
    const setPhase = (k) => {
      phase = k;
      const p = PHASES[k];
      cue.textContent = p.cue;
      word.textContent = p.word;
      if (!rm) {
        circle.style.transitionDuration = `${p.ms}ms`;
        circle.style.transform = `scale(${p.scale})`;
      }
      phaseEnd = performance.now() + p.ms;
      showSecs();
      timer = setTimeout(advance, p.ms);
    };
    const stop = (msg) => {
      running = false;
      clearTimeout(timer);
      clearInterval(tick);
      timer = null;
      tick = null;
      if (!rm) {
        circle.style.transitionDuration = '1500ms';
        circle.style.transform = 'scale(0.62)';
      }
      word.textContent = rm ? 'Ready' : '';
      secs.textContent = '';
      btn.textContent = rounds ? 'Keep going' : 'Start';
      if (msg) cue.textContent = msg;
      drawRounds();
    };
    const advance = () => {
      if (!circle.isConnected) { stop(); return; }
      if (phase === PHASES.length - 1) {
        rounds += 1;
        flow.rounds = rounds;
        if (rounds % ROUND_GOAL === 0) {
          stop(`${rounds} rounds. Notice anything that softened, even a little.`);
          markDone('breathe');
          return;
        }
        drawRounds();
      }
      setPhase((phase + 1) % PHASES.length);
    };
    const begin = () => {
      running = true;
      btn.textContent = 'Pause';
      drawRounds();
      setPhase(0);
      if (rm) tick = setInterval(showSecs, 250);
    };
    btn.addEventListener('click', () => (running ? stop('Paused. Start again whenever you like.') : begin()));
    flow.stop = () => stop();
    drawRounds();
    if (flow.autoStart) {
      flow.autoStart = false;
      setTimeout(() => { if (btn.isConnected && !running) begin(); }, 400);
    }

    return [
      h('h3', { class: 'visually-hidden body-stage-h', tabindex: '-1' }, 'Breathe'),
      ring,
      cue,
      h('div', { class: 'body-rounds' }, dots, count),
      btn,
      h('p', { class: 'fine body-why', text: rm
        ? 'Follow the words and the count. Two breaths in, one long breath out.'
        : 'This is cyclic sighing. In one study, five minutes a day of it lifted mood and slowed breathing (Balban and colleagues, Cell Reports Medicine, 2023). The long breath out seems to be the part that helps.' }),
    ];
  }

  // ---------- c. notes from calm you ----------
  function notes() {
    const rules = state.data.body.rules;
    if (!rules.length) {
      return [
        h('h3', { class: 'body-stage-h body-calm-h', tabindex: '-1' }, 'No notes yet'),
        h('p', { class: 'body-arrive-sub', text: 'Later, when you’re calm, write a few in Notes from calm me. They’ll be here next time.' }),
      ];
    }
    markDone('notes');
    const idx = flow.noteIdx % rules.length;
    const quote = h('blockquote', { class: 'body-note', 'aria-live': 'polite' }, h('p', { text: rules[idx].text }));
    const n = h('span', { class: 'body-note-n', text: `${idx + 1} of ${rules.length}` });
    const another = rules.length > 1
      ? h('button', { class: 'btn ghost block body-big', type: 'button', 'data-step-focus': '', onclick: () => {
        flow.noteIdx = (flow.noteIdx + 1) % rules.length;
        quote.firstChild.textContent = rules[flow.noteIdx].text;
        n.textContent = `${flow.noteIdx + 1} of ${rules.length}`;
      } }, 'Another note')
      : null;
    return [
      h('h3', { class: 'body-stage-h body-calm-h', tabindex: '-1' }, 'From you, when you were calm'),
      h('div', { class: 'body-note-card' }, quote, n),
      another,
    ];
  }

  // ---------- d. ground ----------
  function ground() {
    const g = flow.ground;
    const redraw = (focusSel) => {
      const stage = root.querySelector('.body-stage');
      stage.replaceChildren(...ground());
      stage.querySelector(focusSel)?.focus();
    };
    if (g.mode === 'feet') {
      markDone('ground');
      return [
        h('h3', { class: 'body-stage-h body-calm-h', tabindex: '-1' }, 'Feel your feet on the floor'),
        h('p', { class: 'body-ground-p', text: 'Press them down a little. Notice the weight of your body, and whatever is holding you up. Stay with it for three slow breaths.' }),
        h('button', { class: 'text-btn body-alt', type: 'button', 'data-ground-alt': '', onclick: () => { g.mode = 'senses'; redraw('[data-ground-tap]'); } }, 'Try 5 4 3 2 1 instead'),
      ];
    }
    if (g.sense >= SENSES.length) {
      markDone('ground');
      return [
        h('h3', { class: 'body-stage-h body-calm-h', tabindex: '-1', 'data-step-focus': '' }, 'You’re here. In this room, right now.'),
        h('p', { class: 'body-ground-p', text: 'That’s all grounding is: your senses telling your brain where you are.' }),
        h('button', { class: 'text-btn body-alt', type: 'button', onclick: () => { g.sense = 0; g.count = 0; redraw('[data-ground-tap]'); } }, 'Go round again'),
      ];
    }
    const [n, what, hint] = SENSES[g.sense];
    const left = n - g.count;
    const tap = h('button', { class: 'body-tap', type: 'button', 'data-ground-tap': '', 'data-step-focus': '', 'aria-label': `${left} to go. Tap for each one you find.`, onclick: () => {
      g.count += 1;
      if (g.count >= n) { g.sense += 1; g.count = 0; }
      redraw(g.sense >= SENSES.length ? '[data-step-focus]' : '[data-ground-tap]');
    } },
    h('span', { class: 'body-tap-n', text: String(left) }),
    h('span', { class: 'body-tap-k', text: 'to go' }));
    return [
      h('h3', { class: 'body-stage-h body-ground-h', tabindex: '-1', 'aria-live': 'polite' }, `Find ${n} ${what}`),
      h('p', { class: 'body-ground-hint', text: `${hint ? `${hint} ` : ''}Name each one in your head, then tap.` }),
      tap,
      h('span', { class: 'body-round-dots', 'aria-hidden': 'true' }, Array.from({ length: n }, (_, k) => h('i', { class: k < g.count ? 'on' : '' }))),
      h('button', { class: 'text-btn body-alt', type: 'button', onclick: () => { g.mode = 'feet'; redraw('.body-stage-h'); } }, 'Too much? Just feel your feet instead'),
    ];
  }

  // ---------- e. log it ----------
  function logIt() {
    if (flow.saved) {
      return [
        h('h3', { class: 'body-stage-h body-calm-h', tabindex: '-1' }, 'Saved. Thank you for noticing.'),
        h('p', { class: 'body-ground-p', text: 'Every log makes your early signs a little clearer.' }),
        flow.clearedDemo ? h('p', { class: 'fine', text: 'The example logs are cleared. This is your own history now.' }) : null,
      ];
    }
    const save = () => {
      flow.clearedDemo = state.data.demo;
      saveLog(flow.draft, 'overload');
      setAccent('calm');
      flow.saved = true;
      markDone('log');
      goStep(flow.step);
    };
    return [
      h('h3', { class: 'body-stage-h body-log-h', tabindex: '-1' }, 'Only if you can'),
      h('p', { class: 'body-ground-hint', text: 'Tap what’s there. Skip the rest. Nothing here is required.' }),
      h('div', { class: 'body-form' }, logFields(flow.draft, 'overload')),
      h('button', { class: 'btn block body-big', type: 'button', onclick: save }, 'Save to my log'),
    ];
  }

  // ---------- f. next 30 minutes ----------
  function next() {
    const options = [
      ['kid', `Low-demand time with ${kidName()}`, 'Screens are okay right now. Sit nearby. A snack.'],
      ['outside', 'Step outside for 2 minutes', 'Fresh air. Look at something far away.'],
      ['food', 'Water and something to eat', 'Anything easy counts.'],
      ['phone', 'Phone face-down until I’ve slept', 'Messages can wait. Nothing needs answering.'],
    ];
    const group = h('div', { class: 'body-next', role: 'group', 'aria-label': 'Pick one for the next 30 minutes' });
    const note = h('p', { class: 'body-next-ok', 'aria-live': 'polite' });
    const drawChoices = () => {
      group.replaceChildren(...options.map(([id, label, sub]) => h('button', {
        class: 'choice body-choice', type: 'button', 'aria-pressed': String(flow.choice === id),
        onclick: () => { flow.choice = flow.choice === id ? null : id; drawChoices(); group.querySelector(`[data-choice="${id}"]`)?.focus(); },
        'data-choice': id,
      }, label, h('span', { text: sub }))));
      note.textContent = flow.choice ? 'That’s the plan. Nothing else needs doing.' : '';
    };
    drawChoices();
    return [
      h('h3', { class: 'body-stage-h body-calm-h', tabindex: '-1' }, 'Pick one. Just one.'),
      group,
      note,
      h('section', { class: 'body-repair', 'aria-labelledby': 'body-repair-h' },
        h('span', { class: 'eyebrow', id: 'body-repair-h', text: 'If you snapped' }),
        h('p', { text: 'You can repair later, once you’re both calm. Something like:' }),
        h('blockquote', { class: 'body-repair-q' }, h('p', { text: '“I got too frustrated. That wasn’t your fault. I’m sorry.”' })),
        h('button', { class: 'text-btn', type: 'button', onclick: () => { closeSheet(); go('learn/kid'); } }, 'Why repair matters for kids')),
      h('button', { class: 'btn block body-big', type: 'button', onclick: close }, 'I’m okay now'),
      h('p', { class: 'fine body-crisis' },
        'If you might hurt yourself or someone else, or anyone is in danger, call 000. ',
        'To talk to someone now: Lifeline ', h('strong', { class: 'selectable', text: '13 11 14' }), ' (or text ', h('strong', { class: 'selectable', text: '0477 13 11 14' }),
        '). In the US, call or text ', h('strong', { class: 'selectable', text: '988' }), '. Elsewhere, ',
        h('a', { href: 'https://findahelpline.com', target: '_blank', rel: 'noopener' }, 'findahelpline.com'), '.'),
    ];
  }

  const STEP_RENDER = { arrive, breathe, notes, ground, log: logIt, next };

  draw();
  sheet = openSheet(STEPS[flow.step].title, root, {
    full: true,
    label: 'I’m okay now. Close.',
    onClose: () => {
      stopActive();
      setAccent(prevAccent);
      render();
    },
  });
  sheet.classList.add('body-takeover', 'zone-calm');
  if (flow.step > 0) root.querySelector('.body-stage-h')?.focus({ preventScroll: true });
}

registerAction('overload', (startAt) => openOverload(typeof startAt === 'string' ? startAt : 'arrive'));
