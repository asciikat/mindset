import test from 'node:test';
import assert from 'node:assert/strict';
import {
  REGIONS, SENSATIONS, SENSATIONS_HARD, SENSATIONS_CALM, EMOTIONS_HARD, EMOTIONS_CALM, BREATHING,
  THOUGHT_CHIPS_HARD, THOUGHT_CHIPS_CALM, TRIGGERS,
  starterBody, sampleBody, buildState, thoughtLines, thoughtKey, signature, ranked, earlySigns, recentCounts,
  regionLabel, breathingLabel, triggerLabel,
} from '../js/logic/body.js';

const DAY = 86400000;
const NOW = new Date(2026, 9, 4, 14, 30).getTime();
let n = 0;
const log = (kind, fields = {}, daysAgo = 1) => ({
  id: `t${n++}`, ts: NOW - daysAgo * DAY, kind, regions: [], sensations: [], emotions: [],
  breathing: null, thoughts: '', triggers: [], intensity: null, ...fields,
});

test('vocabulary has unique ids and labels', () => {
  const ids = (list) => list.map((x) => x.id ?? x);
  for (const list of [REGIONS, BREATHING, TRIGGERS, SENSATIONS_HARD, SENSATIONS_CALM, EMOTIONS_HARD, EMOTIONS_CALM, THOUGHT_CHIPS_HARD, THOUGHT_CHIPS_CALM]) {
    assert.equal(new Set(ids(list)).size, list.length);
  }
  assert.deepEqual(SENSATIONS, [...SENSATIONS_HARD, ...SENSATIONS_CALM]);
  for (const r of REGIONS) assert.ok(r.label && r.id);
  for (const b of BREATHING) assert.ok(b.label && b.phrase);
  assert.ok(REGIONS.length >= 12);
});

test('labels resolve and fall back to the id', () => {
  assert.equal(regionLabel('gut'), 'Lower belly');
  assert.equal(regionLabel('elbow'), 'elbow');
  assert.equal(breathingLabel('fast'), 'Fast and shallow');
  assert.equal(triggerLabel('kid-food'), 'My kid not eating');
  assert.equal(triggerLabel('kid-food', 'Robin'), 'Robin not eating');
  assert.equal(triggerLabel('sleep', 'Robin'), 'Not enough sleep');
  assert.equal(triggerLabel('unknown'), 'unknown');
});

test('starterBody gives stable notes in the user’s voice', () => {
  const { rules } = starterBody();
  assert.ok(rules.length >= 5 && rules.length <= 6);
  assert.equal(new Set(rules.map((r) => r.id)).size, rules.length);
  for (const r of rules) {
    assert.match(r.id, /^r-/);
    assert.equal(r.ts, 0);
    assert.ok(r.text.length > 10);
  }
  assert.deepEqual(starterBody(), starterBody());
  assert.ok(rules.some((r) => /apps/.test(r.text)));
});

test('sampleBody is deterministic, about three weeks, never in the future', () => {
  const a = sampleBody(NOW);
  assert.deepEqual(a, sampleBody(NOW));
  const { states } = a;
  const over = states.filter((s) => s.kind === 'overload');
  const calm = states.filter((s) => s.kind === 'calm');
  assert.ok(over.length >= 5 && over.length <= 7, `overloads: ${over.length}`);
  assert.ok(calm.length >= 5 && calm.length <= 7, `calm: ${calm.length}`);
  assert.equal(new Set(states.map((s) => s.id)).size, states.length);
  const first = Math.min(...states.map((s) => s.ts));
  assert.ok(NOW - first > 18 * DAY && NOW - first < 23 * DAY);
  for (const s of states) assert.ok(s.ts <= NOW, 'no future logs');
});

test('sample logs only use known vocabulary', () => {
  const regionIds = new Set(REGIONS.map((r) => r.id));
  const emotions = new Set([...EMOTIONS_HARD, ...EMOTIONS_CALM]);
  const breathing = new Set(BREATHING.map((b) => b.id));
  const triggers = new Set(TRIGGERS.map((t) => t.id));
  for (const s of sampleBody(NOW).states) {
    for (const r of s.regions) assert.ok(regionIds.has(r), r);
    for (const x of s.sensations) assert.ok(SENSATIONS.includes(x), x);
    for (const e of s.emotions) assert.ok(emotions.has(e), e);
    for (const t of s.triggers) assert.ok(triggers.has(t), t);
    assert.ok(s.breathing === null || breathing.has(s.breathing));
    assert.equal(typeof s.thoughts, 'string');
    if (s.kind === 'overload') assert.ok(s.intensity >= 1 && s.intensity <= 10);
  }
});

test('sampleBody works right after midnight (nothing lands in the future)', () => {
  const justAfter = new Date(2026, 9, 4, 0, 5).getTime();
  for (const s of sampleBody(justAfter).states) assert.ok(s.ts <= justAfter);
});

test('buildState orders lists by vocabulary, joins thoughts, validates intensity', () => {
  const s = buildState({
    regions: new Set(['jaw', 'head']),
    sensations: new Set(['hot', 'tight']),
    emotions: ['overwhelmed', 'angry'],
    breathing: 'fast',
    thoughtChips: new Set(['I can’t do this']),
    text: '  Too loud in here \n\nI can’t do this ',
    triggers: new Set(['message', 'sleep']),
    intensity: 8,
  }, 'overload', NOW, 'x1');
  assert.deepEqual(s.regions, ['head', 'jaw']);
  assert.deepEqual(s.sensations, ['tight', 'hot']);
  assert.deepEqual(s.emotions, ['angry', 'overwhelmed']);
  assert.deepEqual(s.triggers, ['sleep', 'message']);
  assert.equal(s.thoughts, 'I can’t do this\nToo loud in here');
  assert.equal(s.intensity, 8);
  assert.equal(s.kind, 'overload');
  assert.equal(s.id, 'x1');
  assert.equal(s.ts, NOW);

  const empty = buildState({}, 'calm', NOW, 'x2');
  assert.deepEqual(empty, { id: 'x2', ts: NOW, kind: 'calm', regions: [], sensations: [], emotions: [], breathing: null, thoughts: '', triggers: [], intensity: null });
  assert.equal(buildState({ intensity: 11 }, 'overload', NOW, 'x3').intensity, null);
  assert.equal(buildState({ intensity: null }, 'overload', NOW, 'x4').intensity, null);
});

test('thought lines and keys normalise punctuation and apostrophes', () => {
  assert.deepEqual(thoughtLines(' a \n\n b\n'), ['a', 'b']);
  assert.deepEqual(thoughtLines(null), []);
  assert.equal(thoughtKey('I can’t do this.'), thoughtKey("i can't do this"));
  assert.equal(thoughtKey('Stop!!  '), 'stop');
});

test('signature gives each item a share of that kind’s logs', () => {
  const states = [
    log('overload', { regions: ['jaw', 'chest'], sensations: ['tight'], emotions: ['angry'], breathing: 'fast', triggers: ['sleep'], intensity: 8, thoughts: 'I can’t do this' }),
    log('overload', { regions: ['jaw', 'jaw'], sensations: ['hot'], emotions: ['angry'], breathing: 'fast', intensity: 6, thoughts: "I can't do this.\nToo much" }),
    log('overload', { regions: ['shoulders'], breathing: null, thoughts: 'Too much' }),
    log('overload', { regions: ['jaw'], breathing: 'holding', thoughts: 'I can’t do this' }),
    log('calm', { regions: ['chest'], breathing: 'slow' }),
  ];
  const sig = signature(states, 'overload');
  assert.equal(sig.count, 4);
  assert.equal(sig.regions.jaw, 0.75); // counted once per log, even if repeated
  assert.equal(sig.regions.chest, 0.25);
  assert.equal(sig.breathing.fast, 0.5);
  assert.equal(sig.breathing.holding, 0.25);
  assert.equal(sig.triggers.sleep, 0.25);
  assert.equal(sig.intensity, 7);
  assert.equal(sig.thoughts[0].text, 'I can’t do this');
  assert.equal(sig.thoughts[0].count, 3);
  assert.equal(sig.thoughts[1].count, 2);
  const calm = signature(states, 'calm');
  assert.equal(calm.count, 1);
  assert.deepEqual(calm.regions, { chest: 1 });
  assert.equal(calm.intensity, null);
});

test('signature of nothing is empty, not NaN', () => {
  const sig = signature([], 'calm');
  assert.equal(sig.count, 0);
  assert.deepEqual(sig.regions, {});
  assert.deepEqual(sig.thoughts, []);
  assert.equal(signature(undefined, 'overload').count, 0);
});

test('ranked sorts by share then name and limits', () => {
  assert.deepEqual(ranked({ b: 0.5, a: 0.5, c: 1 }), [['c', 1], ['a', 0.5], ['b', 0.5]]);
  assert.deepEqual(ranked({ b: 0.5, a: 0.5, c: 1 }, 1), [['c', 1]]);
  assert.deepEqual(ranked(null), []);
});

test('earlySigns finds what is common in overload but rare when calm', () => {
  const states = [
    log('overload', { regions: ['jaw', 'chest'], sensations: ['tight'], breathing: 'fast', emotions: ['angry'] }),
    log('overload', { regions: ['jaw', 'chest'], sensations: ['tight'], breathing: 'fast' }),
    log('overload', { regions: ['jaw', 'chest', 'hands'], breathing: 'fast' }),
    log('calm', { regions: ['chest'], breathing: 'slow' }),
    log('calm', { regions: ['chest'], breathing: 'fast' }),
  ];
  const signs = earlySigns(states);
  const ids = signs.map((s) => `${s.type}:${s.id}`);
  assert.ok(ids.includes('regions:jaw'));
  assert.ok(ids.includes('sensations:tight'));
  assert.ok(ids.includes('breathing:fast')); // 100% vs 50%: still double and 0.5 apart
  assert.ok(!ids.includes('regions:chest'), 'chest shows up when calm too');
  assert.ok(!ids.includes('regions:hands'), 'only once: below minCount');
  assert.ok(!ids.includes('emotions:angry'), 'only once');
  assert.equal(signs[0].id, 'jaw'); // biggest gap, then region before others
  const jaw = signs.find((s) => s.id === 'jaw');
  assert.equal(jaw.overload, 1);
  assert.equal(jaw.calm, 0);
  assert.equal(jaw.count, 3);
  assert.equal(jaw.phrase, 'jaw');
  const breath = signs.find((s) => s.id === 'fast');
  assert.equal(breath.phrase, 'fast, shallow breathing');
});

test('earlySigns needs at least two overloads and respects minCount', () => {
  assert.deepEqual(earlySigns([log('overload', { regions: ['jaw'] })]), []);
  assert.deepEqual(earlySigns([]), []);
  const two = [log('overload', { regions: ['jaw'] }), log('overload', { regions: ['jaw'] })];
  assert.equal(earlySigns(two).length, 1);
  assert.equal(earlySigns(two, { minCount: 3 }).length, 0);
});

test('earlySigns includes repeated overload thoughts but not ones shared with calm', () => {
  const states = [
    log('overload', { thoughts: 'I can’t do this\nIt will pass' }),
    log('overload', { thoughts: "I can't do this.\nIt will pass" }),
    log('calm', { thoughts: 'It will pass' }),
    log('calm', { thoughts: 'It will pass' }),
  ];
  const signs = earlySigns(states);
  assert.equal(signs.length, 1);
  assert.equal(signs[0].type, 'thoughts');
  assert.equal(signs[0].label, '“I can’t do this”');
});

test('sample data has a clear overload signature', () => {
  const { states } = sampleBody(NOW);
  const signs = earlySigns(states);
  const ids = signs.map((s) => s.id);
  assert.ok(ids.includes('jaw'));
  assert.ok(ids.includes('tight'));
  assert.ok(ids.includes('fast'));
  assert.ok(!ids.includes('chest'), 'chest is in both signatures');
  const calm = signature(states, 'calm');
  assert.ok(calm.breathing.slow >= 0.5);
  assert.ok(calm.regions.chest >= 0.8);
});

test('recentCounts counts the last week by kind', () => {
  const states = [log('overload', {}, 1), log('overload', {}, 3), log('calm', {}, 2), log('overload', {}, 9), log('overload', {}, -1)];
  const r = recentCounts(states, NOW, 7);
  assert.equal(r.overload, 2);
  assert.equal(r.calm, 1);
  assert.equal(r.lastOverloadTs, NOW - DAY);
  assert.equal(recentCounts([], NOW).lastOverloadTs, null);
});
