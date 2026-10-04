// The Learn room: an illustrated, interactive explainer of the nervous system.
// Route 'learn' is the index; 'learn/<chapter>' renders one chapter.
// Chapters: window, alarm, trauma, kid, return, spirit, sources.
// No data writes. Diagrams live in learn-diagrams.js, practice tools in
// learn-practice.js, the maths in learn-model.js, references in learn-sources.js.

import { state, h, s, go, back, registerView, setAccent, kidName, KidName } from '../core.js';
import { windowSim, brainMap, twoSystems, kidWindows } from './learn-diagrams.js';
import { breathPacer, orientCard, hugTimer, guidedPractice, lovingKindness } from './learn-practice.js';
import { sourcesFor, allSources } from './learn-sources.js';

const CHAPTERS = [
  { id: 'window', title: 'Your window of tolerance', teaser: 'The zone where you can feel and still think, and what shrinks it.', kind: 'Live diagram' },
  { id: 'alarm', title: 'The alarm and the watchtower', teaser: 'What stress and a bad night do to the brain’s planner.', kind: 'Brain map' },
  { id: 'trauma', title: 'How long-term trauma shapes the system', teaser: 'Complex PTSD, triggers, and why this is adaptation, not weakness.', kind: 'Side by side' },
  { id: 'kid', title: 'Your kid’s nervous system', teaser: 'Borrowed calm, missed sleep, and repairing after a blow-up.', kind: 'Morning planner' },
  { id: 'return', title: 'Coming back into your window', teaser: 'Breath, cold water, looking around, moving, someone safe.', kind: 'Breathing pacer' },
  { id: 'spirit', title: 'The spiritual side', teaser: 'The witness, the sky and the weather, and kindness that includes you.', kind: 'Two-minute practice' },
  { id: 'sources', title: 'Sources, and what science doesn’t know yet', teaser: 'Every reference in plain words, and where the evidence is thin.', kind: 'Reading list' },
];
const byId = (id) => CHAPTERS.find((c) => c.id === id);
const titleOf = (c) => (c.id === 'kid' ? `${KidName()}’s nervous system` : c.title);
const TAG = { window: 'Window', alarm: 'Alarm', trauma: 'Trauma', kid: 'Kids', return: 'Return', spirit: 'Spirit', sources: 'Caveats' };

// ---------- small building blocks ----------
const P = (...parts) => h('p', {}, ...parts);
const prose = (...paras) => h('div', { class: 'learn-prose' }, paras.map((x) => (typeof x === 'string' ? P(x) : x)));
const pull = (text, cite = null) => h('blockquote', { class: 'learn-pull' }, h('p', { text }), cite ? h('cite', { text: cite }) : null);
const sub = (text, id) => h('h2', { class: 'learn-h2', id, text });

function tryBox(steps, extra = null) {
  return h('aside', { class: 'learn-try', 'aria-label': 'Try this now' },
    h('p', { class: 'learn-try-k', text: 'Try this now' }),
    h('ol', { class: 'learn-try-list' }, steps.map((t) => h('li', { text: t }))),
    extra);
}

function cite(src) {
  return h('li', { class: 'learn-cite' },
    h('span', { class: 'learn-cite-who', text: `${src.who} (${src.year}). ` }),
    h('cite', { text: src.title }), `. ${src.outlet}.`);
}

function sourcesMini(id) {
  const list = sourcesFor(id);
  return h('section', { class: 'learn-srcmini', 'aria-labelledby': `src-${id}` },
    h('h2', { class: 'learn-srcmini-h', id: `src-${id}`, text: 'Sources' }),
    h('ul', { class: 'learn-cites' }, list.map(cite)),
    h('button', { class: 'text-btn', type: 'button', onclick: () => go('learn/sources', { replace: true }) }, 'All sources, and what science doesn’t know yet'));
}

function chapterNav(id) {
  const i = CHAPTERS.findIndex((c) => c.id === id);
  const prev = CHAPTERS[i - 1];
  const next = CHAPTERS[i + 1];
  const link = (c, dir) => h('button', { class: `learn-navbtn ${dir}`, type: 'button', onclick: () => go(`learn/${c.id}`, { replace: true }) },
    h('span', { class: 'learn-navbtn-k', text: dir === 'prev' ? '‹ Previous' : 'Next ›' }),
    h('span', { class: 'learn-navbtn-t', text: titleOf(c) }));
  const contents = (dir) => h('button', { class: `learn-navbtn ${dir}`, type: 'button', onclick: () => go('learn') },
    h('span', { class: 'learn-navbtn-k', text: dir === 'prev' ? '‹ Contents' : 'Contents ›' }),
    h('span', { class: 'learn-navbtn-t', text: 'All chapters' }));
  return h('nav', { class: 'learn-nav', 'aria-label': 'Chapters' },
    prev ? link(prev, 'prev') : contents('prev'),
    next ? link(next, 'next') : contents('next'));
}

function helpLines() {
  return h('p', { class: 'learn-help' },
    'If it gets heavy, you don’t have to hold it alone. In Australia, call Lifeline on ', h('strong', { class: 'selectable', text: '13 11 14' }),
    ' or text ', h('strong', { class: 'selectable', text: '0477 13 11 14' }), '. In the US, call or text ', h('strong', { class: 'selectable', text: '988' }),
    '. Elsewhere, see ', h('a', { href: 'https://findahelpline.com', target: '_blank', rel: 'noopener' }, 'findahelpline.com'), '.');
}

// Little luminous glyphs for the contents cards.
function glyph(id) {
  const g = {
    window: [s('rect', { x: 4, y: 15, width: 36, height: 14, rx: 3, class: 'band' }), s('path', { d: 'M4 24 C10 14 14 30 20 22 S30 12 34 20 L40 17', class: 'line' })],
    alarm: [s('circle', { cx: 22, cy: 24, r: 5, class: 'hot' }), s('path', { d: 'M12 16 A13 13 0 0 0 12 32 M32 16 A13 13 0 0 1 32 32 M7 11 A20 20 0 0 0 7 37 M37 11 A20 20 0 0 1 37 37', class: 'line' })],
    trauma: [s('rect', { x: 4, y: 13, width: 15, height: 18, rx: 3, class: 'band' }), s('rect', { x: 25, y: 18, width: 15, height: 8, rx: 2, class: 'band' }), s('path', { d: 'M4 24 L19 24 M25 26 C29 10 33 34 40 20', class: 'line' })],
    kid: [s('circle', { cx: 18, cy: 22, r: 11, class: 'ring' }), s('circle', { cx: 29, cy: 26, r: 7, class: 'ring' })],
    return: [s('circle', { cx: 22, cy: 22, r: 15, class: 'ring faint' }), s('circle', { cx: 22, cy: 22, r: 9, class: 'ring' }), s('circle', { cx: 22, cy: 22, r: 3, class: 'dot' })],
    spirit: [s('path', { d: 'M27 8 A14 14 0 1 0 36 30 A11 11 0 1 1 27 8 Z', class: 'moon' }), s('circle', { cx: 35, cy: 12, r: 1.4, class: 'dot' }), s('circle', { cx: 9, cy: 36, r: 1, class: 'dot' })],
    sources: [s('path', { d: 'M9 12 H35 M9 20 H35 M9 28 H28 M9 36 H22', class: 'line' })],
  }[id];
  return s('svg', { viewBox: '0 0 44 44', class: 'learn-glyph', 'aria-hidden': 'true', focusable: 'false' }, g);
}

// A quiet, static night sky over a window band, for the contents page.
function heroArt() {
  const stars = [[22, 18, 1.2], [64, 40, 0.8], [118, 14, 1], [170, 34, 1.4], [228, 12, 0.9], [262, 44, 1.1], [306, 20, 0.8], [330, 50, 1.2], [92, 62, 0.7], [204, 58, 0.8]];
  let d = '';
  for (let i = 0; i <= 80; i += 1) {
    const x = (340 * i) / 80;
    const t = i / 8;
    const y = 112 - (Math.sin(0.83 * t) * 0.56 + Math.sin(2.11 * t + 1.3) * 0.3 + Math.sin(4.7 * t + 0.4) * 0.14) * 20;
    d += `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
  }
  return s('svg', { viewBox: '0 0 340 150', class: 'learn-hero-art', 'aria-hidden': 'true', focusable: 'false' },
    stars.map(([x, y, r]) => s('circle', { cx: x, cy: y, r, class: 'learn-star' })),
    s('rect', { x: 0, y: 88, width: 340, height: 48, class: 'learn-w-band' }),
    s('line', { x1: 0, x2: 340, y1: 88, y2: 88, class: 'learn-w-edge' }),
    s('line', { x1: 0, x2: 340, y1: 136, y2: 136, class: 'learn-w-edge' }),
    s('path', { d, class: 'learn-hero-line' }));
}

// ---------- contents ----------
function indexView() {
  setAccent('calm');
  return [
    h('header', { class: 'topbar' }, h('span', { class: 'brand', text: 'Learn' }), h('span', { class: 'learn-top-k', text: `${CHAPTERS.length} chapters` })),
    h('section', { class: 'learn-hero learn-panel', 'aria-labelledby': 'learn-hero-h' },
      heroArt(),
      h('h1', { class: 'learn-hero-title', id: 'learn-hero-h' }, 'Your nervous system isn’t broken. ', h('span', { class: 'learn-serif', text: 'It learned.' })),
      h('p', { class: 'learn-hero-dek', text: 'Short, interactive chapters on why you flip into overload, how to come back, and how to help your kid do the same.' }),
      h('button', { class: 'btn learn-btn', type: 'button', onclick: () => go('learn/window') }, 'Start with your window')),
    h('ol', { class: 'learn-toc', 'aria-label': 'Chapters' },
      CHAPTERS.map((c, i) => h('li', {},
        h('button', { class: 'learn-card', type: 'button', onclick: () => go(`learn/${c.id}`) },
          h('span', { class: 'learn-card-art' }, glyph(c.id)),
          h('span', { class: 'learn-card-body' },
            h('span', { class: 'learn-card-n', text: `${String(i + 1).padStart(2, '0')} · ${c.kind}` }),
            h('span', { class: 'learn-card-t', text: titleOf(c) }),
            h('span', { class: 'learn-card-d', text: c.teaser })),
          h('span', { class: 'learn-card-go', 'aria-hidden': 'true', text: '›' }))))),
    h('p', { class: 'fine learn-foot', text: 'Mindset is for understanding and reflection. It isn’t therapy or medical advice. A trauma-informed professional can help you go further.' }),
    helpLines(),
  ];
}

// ---------- chapters ----------
function door(title, line, body, open = false) {
  return h('details', { class: 'learn-door', open },
    h('summary', {}, h('span', { class: 'learn-door-t', text: title }), h('span', { class: 'learn-door-l', text: line })),
    h('div', { class: 'learn-door-body' }, body));
}

function unknown(title, text) {
  return h('div', { class: 'learn-unknown' }, h('b', { text: title }), P(text));
}

const RENDER = {
  window: () => [
    windowSim(),
    prose(
      'Psychiatrist Dan Siegel named it the window of tolerance: the range where you can feel what you feel and still think, plan and connect.',
      'Above the window is hyperarousal: fight or flight. Below it is hypoarousal: shutdown. Both are your body trying to protect you. Neither is a choice.'),
    pull('A narrow window isn’t a character flaw. It’s a nervous system doing its job with less fuel.'),
    prose(
      'The window changes size from day to day, even hour to hour. Short sleep, hunger, conflict, reminders of old pain and too many decisions all squeeze it.',
      'Rest, food, movement, slow breathing, people who feel safe, and a plan made while you were calm all give it room.',
      'Trauma therapists Pat Ogden, Kekuni Minton and Clare Pain built on this idea. Much of healing is learning to notice when you’re near the edge, and slowly widening the window.'),
    tryBox([
      'Ask yourself: where is my line right now? In the window, near the edge, above, or below?',
      'Say it, out loud or inside. Naming it is the first step back.',
      'Near the edge? Pick one widener: eat something, breathe out slowly three times, or step outside for two minutes.',
    ], h('button', { class: 'btn ghost learn-btn-small', type: 'button', onclick: () => go('learn/return', { replace: true }) }, 'Breathe with the pacer')),
  ],

  alarm: () => [
    brainMap(),
    prose(
      'Deep in the brain sits the amygdala. Bessel van der Kolk calls it the smoke detector: it sniffs for danger and sounds the alarm fast, before you’ve had a chance to think.',
      'Behind your forehead is the prefrontal cortex, the watchtower. It plans, chooses, puts on the brakes and checks whether the alarm is right. Psychologists call these skills executive function.',
      'Under stress the balance tips. Neuroscientist Amy Arnsten showed that stress chemistry can quickly take the prefrontal cortex offline, while faster, older circuits take over.'),
    h('div', { class: 'learn-fact' },
      h('span', { class: 'learn-fact-n', text: '~60%' }),
      h('p', { class: 'learn-fact-t', text: 'more amygdala reactivity to upsetting images after a night without sleep, with a weaker link to the prefrontal cortex.' }),
      h('p', { class: 'learn-fact-s', text: 'Yoo, Walker and colleagues, 2007. A small brain-scan study of healthy young adults.' })),
    pull('That’s why, after a bad night, you couldn’t answer calls or decide what to do. The planner was offline, not you.'),
    prose(
      'ADHD involves the same planning and braking systems, and big, fast emotions are a common part of it. So your watchtower may go offline sooner than other people’s. That’s wiring, not a failing.',
      'It works the other way too. Calm the body, and the watchtower comes back online.'),
    tryBox([
      'When the alarm is loud, don’t try to think your way out first. Body first, then decisions.',
      'Breathe out long and slow, splash cold water on your face, or walk for five minutes.',
      'Then make one decision only. The rest can wait for the watchtower.',
      'On a calm day, write down what to do on a hard one. A plan made in advance is the watchtower looking after future you.',
    ]),
  ],

  trauma: () => [
    h('p', { class: 'learn-gentle', text: 'This chapter talks about trauma in general terms. Go at your own pace, and stop whenever you like.' }),
    twoSystems(),
    prose(
      'When danger was frequent or went on for a long time, especially in childhood or in close relationships, the nervous system adapts. It learns to stay ready.',
      'In 2019 the World Health Organization’s ICD-11 described this as complex PTSD. It has two layers.'),
    h('div', { class: 'learn-layers' },
      h('div', { class: 'learn-layer' },
        h('p', { class: 'learn-layer-k', text: 'Core PTSD' }),
        h('ul', {},
          h('li', {}, h('b', { text: 'Re-experiencing ' }), 'the past in the present'),
          h('li', {}, h('b', { text: 'Avoidance ' }), 'of reminders'),
          h('li', {}, h('b', { text: 'A persistent sense ' }), 'of threat'))),
      h('div', { class: 'learn-layer' },
        h('p', { class: 'learn-layer-k', text: 'Plus: self-organisation' }),
        h('ul', {},
          h('li', {}, h('b', { text: 'Emotions ' }), 'that are hard to regulate'),
          h('li', {}, h('b', { text: 'A negative view ' }), 'of yourself'),
          h('li', {}, h('b', { text: 'Difficulty ' }), 'in relationships')))),
    prose('Research led by Marylène Cloitre helped show these belong together as their own pattern, not just “more PTSD”.'),
    pull('A trigger is the past arriving in the present. Your body is responding to then, as if it were now.'),
    prose(
      'None of this is weakness. A quick alarm kept you safe once. The trouble is it’s still set for a world that has changed.',
      'Brains keep changing all through life. That’s neuroplasticity, and it’s why things can get better.'),
    sub('What helps', 'learn-helps-h'),
    h('div', { class: 'learn-helps' },
      h('div', { class: 'learn-help-card' }, h('b', { text: 'Trauma-focused therapy' }),
        P('Major guidelines, including NICE (2018) and ISTSS (2018), recommend trauma-focused CBT and EMDR for PTSD.')),
      h('div', { class: 'learn-help-card' }, h('b', { text: 'Stabilisation first' }),
        P('For complex PTSD, many clinicians work in phases: safety and coping skills first, then memories, then reconnecting with life.')),
      h('div', { class: 'learn-help-card' }, h('b', { text: 'Working with the body' }),
        P('Somatic, body-based approaches are popular. Their evidence base is still emerging.'))),
    prose('A trauma-informed psychologist or counsellor can help you find the right fit. In Australia, your GP can refer you with a Mental Health Treatment Plan for subsidised sessions.'),
    tryBox([
      'When something hits harder than it should, try saying: “This is then, not now.”',
      'Then find three proofs that it’s now: today’s date, where you are, and one thing you can see that wasn’t there back then.',
    ]),
    helpLines(),
  ],

  kid: () => [
    kidWindows(),
    prose(
      'The watchtower in a child’s brain is still being built. The prefrontal cortex keeps maturing through childhood and the teenage years.',
      'So kids can’t always calm themselves down. They borrow calm from us. This is co-regulation: your slower breathing, softer voice and steady face help their nervous system settle.',
      `Sleep hits kids hard. In one study, toddlers who missed a single nap showed more negative and less positive emotion. If ${kidName()} slept badly, expect a narrower window, and lower the bar.`),
    h('div', { class: 'learn-maxims' },
      h('div', { class: 'learn-maxim' }, h('p', { class: 'learn-maxim-t', text: 'Can’t, not won’t.' }),
        P('A melting-down kid usually lacks the fuel or the skill right now, not the will. As Ross Greene puts it: kids do well if they can.')),
      h('div', { class: 'learn-maxim' }, h('p', { class: 'learn-maxim-t', text: 'Connect before you correct.' }),
        P('Get low, soften your voice, name the feeling. The lesson can wait until you’re both back in your windows.'))),
    sub('Rupture and repair', 'learn-repair'),
    prose('Every parent loses it sometimes. Ed Tronick’s research on parents and babies found that mismatches happen all the time, even in loving pairs. What matters most is coming back and repairing.'),
    h('figure', { class: 'learn-script' },
      h('figcaption', { class: 'learn-script-k', text: 'A repair script' }),
      h('p', { text: '“I got loud before. That wasn’t okay, and it wasn’t your fault.”' }),
      h('p', { text: '“My body got overloaded. I’m calm now.”' }),
      h('p', { text: '“I love you. Do you want a hug, or some space for a bit?”' })),
    prose(`Repair teaches ${kidName()} something powerful: big feelings happen, and love comes back.`),
    tryBox([
      'Pick one calm-down move you can do together: three slow balloon breaths, a long squeeze-hug, or a quiet game.',
      'Practise it on a good day, so it’s there on a hard one.',
    ]),
  ],

  return: () => [
    breathPacer(),
    prose('The fastest way back usually goes through the body, not through thinking. Pick one door. Use it for a minute. Then notice.'),
    h('div', { class: 'learn-doors' },
      door('Cyclic sighing', 'Two breaths in, one long breath out.', [
        P('Breathe in through your nose. At the top, take a second short sip of air. Then let it all out slowly through your mouth. Repeat for one to five minutes.'),
        P('In a month-long study, five minutes a day of cyclic sighing improved mood and lowered resting breathing rate more than mindfulness meditation did (Balban et al., 2023).'),
      ], true),
      door('A longer exhale', 'Out longer than in.', [
        P('Breathe in for about 4, and out for about 6 or more. Your heart naturally slows a little on each out-breath, so a longer one leans you toward calm.'),
        P('Slow breathing is linked to a calmer heart and nervous system (Zaccaro et al., 2018). Try the Longer exhale setting on the pacer.'),
      ]),
      door('Cold water on your face', 'A reset for the body.', [
        P('Splash cold water on your face, or hold something cold over your eyes and cheeks for up to 30 seconds.'),
        P('This can trigger the dive reflex, which slows the heart. If you have a heart condition, check with your doctor first.'),
      ]),
      door('Orienting', 'Let your eyes tell your body where you are.', [
        P('Slowly turn your head and let your eyes land on things. Name what you see. This tells your nervous system: I’m here, and it’s now.'),
        orientCard(),
      ]),
      door('Move to finish the stress cycle', 'Let the stress run its course.', [
        P('Walk fast, dance to one song, shake out your arms and legs, or push hard against a wall for 20 seconds.'),
        P('Emily and Amelia Nagoski describe stress as a cycle the body needs to complete. Moving is one of the most efficient ways to finish it (Nagoski & Nagoski, 2019).'),
      ]),
      door('A hug, or someone safe nearby', 'Borrow calm from someone else.', [
        P('A long hug (the Nagoskis suggest about 20 seconds) or just sitting close to someone safe. In one study, holding a trusted partner’s hand calmed the brain’s response to threat (Coan et al., 2006).'),
        P(`With ${kidName()}, this works both ways.`),
        hugTimer(),
      ])),
    tryBox(['Do one minute of the pacer above.', 'Then check in: is your line a little closer to the middle?']),
  ],

  spirit: () => [
    h('blockquote', { class: 'learn-sky' },
      h('p', { text: 'You are the sky. Everything else is just the weather.' }),
      h('cite', { text: 'Pema Chödrön' })),
    sub('The witness', 'learn-witness'),
    prose(
      'There’s a part of you that can notice the storm. It’s the part that says “anger is here” or “panic is here”.',
      h('p', { class: 'learn-big' }, 'The part of you that notices the storm is not the storm.'),
      'It has been there through every hard day, watching. It’s still here.'),
    sub('Two quiet minutes', 'learn-practice'),
    guidedPractice(),
    sub('Three parts of self-compassion', 'learn-sc'),
    h('div', { class: 'learn-three' },
      h('div', {}, h('span', { class: 'learn-three-n', text: '1' }), h('b', { text: 'Mindfulness' }), P('Notice the pain, without drowning in it or pushing it away.')),
      h('div', {}, h('span', { class: 'learn-three-n', text: '2' }), h('b', { text: 'Common humanity' }), P('Everyone struggles. You aren’t the only parent who has lost it.')),
      h('div', {}, h('span', { class: 'learn-three-n', text: '3' }), h('b', { text: 'Self-kindness' }), P('Talk to yourself the way you’d talk to someone you love.'))),
    prose(
      'Psychologist Kristin Neff describes these three parts. Self-compassion isn’t letting yourself off the hook. It’s what makes it possible to repair and try again.',
      'Try it now, slowly: “This is hard.” “Other people feel this too.” “May I be kind to myself.”'),
    sub('Loving-kindness', 'learn-lk-h'),
    prose('An old practice of sending good wishes, starting close and moving outward. Research links it to more positive and less negative emotion.'),
    lovingKindness(),
    sub('What the ache means', 'learn-ache'),
    prose(
      h('p', { class: 'learn-big' }, `Missing the days you and ${kidName()} used to share hurts because you love ${kidName()}.`),
      'The ache is a measure of that love. And the love didn’t go anywhere. It’s in every small plan you make, every repair, every time you come back.'),
    tryBox(['Tonight, before sleep, put a hand on your chest and say one kind sentence to yourself. Just one.']),
  ],

  sources: () => [
    sub('What science doesn’t know yet', 'learn-unknown'),
    h('div', { class: 'learn-unknowns' },
      unknown('Polyvagal theory is a metaphor, not settled science.', 'Stephen Porges’ polyvagal theory is a popular, useful way to talk about safety and shutdown. But some of its physiological claims are disputed (Grossman, 2023). This app uses plain words like “shutdown” instead.'),
      unknown('Brain-region stories are simplifications.', 'No single part of the brain “is” fear or “is” planning. Regions work in networks, and feelings involve the whole brain and body (LeDoux, 2015). The alarm and the watchtower are helpful pictures, not anatomy.'),
      unknown('The window of tolerance is a clinical model, not a measurement.', 'No scan or test shows your window. It’s a map, and it’s useful because it helps you notice where you are and choose what helps.'),
      unknown('Studies are small, and people differ.', 'Many findings here come from small studies or particular groups. They describe averages, and you may sit anywhere around them.'),
      unknown('ADHD and trauma overlap.', 'They can look alike and often occur together. Telling them apart is still an open question in research, and a good clinician can help.'),
      unknown('The diagrams are illustrations.', 'The moving lines and numbers in this room show direction, not size. They aren’t measuring you.')),
    sub('All sources', 'learn-all'),
    h('ul', { class: 'learn-refs' }, allSources().map((src) => h('li', { class: 'learn-ref' },
      h('p', { class: 'learn-ref-plain', text: src.plain }),
      h('p', { class: 'learn-ref-cite' }, h('span', { text: `${src.who} (${src.year}). ` }), h('cite', { text: src.title }), `. ${src.outlet}.`),
      h('p', { class: 'learn-ref-tags' }, src.ch.map((c) => h('span', { text: TAG[c] || c })))))),
    h('p', { class: 'fine', text: 'Mindset is for understanding and reflection. It isn’t therapy or medical advice.' }),
    helpLines(),
  ],
};

const DEKS = {
  window: 'There’s a zone where you can feel things and still think. It changes size every day.',
  alarm: 'A smoke detector and a lookout, and what stress and sleep do to the balance between them.',
  trauma: 'Long-term trauma can set the alarm to fire early and settle slowly. That’s adaptation, not weakness.',
  kid: 'Kids borrow calm from the adults around them. Here’s what that means on a hard morning.',
  return: 'Your body knows the way back. These are some of the doors with the best evidence.',
  spirit: 'Not religion. Old wisdom that sits well with what science is finding.',
  sources: 'Everything this room is built on, in plain words, and where the science is still unsure.',
};

function chapterView(id) {
  const c = byId(id);
  if (!c) return indexView();
  setAccent(id === 'spirit' ? 'low' : 'calm');
  const i = CHAPTERS.indexOf(c);
  // Came from another room (e.g. Today's "What is the window?")? Back goes there.
  const prevRoute = state.stack[state.stack.length - 1] || '';
  const fromLearn = !prevRoute || prevRoute.split('/')[0] === 'learn';
  const top = h('header', { class: 'topbar' },
    fromLearn
      ? h('button', { class: 'back', type: 'button', onclick: () => go('learn') }, '‹ Learn')
      : h('button', { class: 'back', type: 'button', onclick: back }, '‹ Back'),
    h('span', { class: 'learn-top-k', text: `${i + 1} / ${CHAPTERS.length}` }));
  const head = h('header', { class: 'learn-head' },
    h('p', { class: 'learn-eyebrow', text: id === 'sources' ? 'Chapter 7 · Reference' : `Chapter ${i + 1}` }),
    h('h1', { class: 'page-title learn-title', text: titleOf(c) }),
    h('p', { class: 'learn-dek', text: DEKS[id] }));
  const body = [head, ...RENDER[id](), id === 'sources' ? null : sourcesMini(id), chapterNav(id)];
  if (id === 'spirit') return [top, h('div', { class: 'learn-night' }, body)];
  return [top, ...body];
}

registerView('learn', { tab: 'learn', render: (param) => (param ? chapterView(param) : indexView()) });
