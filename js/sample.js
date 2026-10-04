// Example data shown on first open so the app isn't an empty screen.
// It is flagged `demo: true` and cleared the moment you log your first real check-in.

import { DAY, HOUR } from './logic.js';

function rng(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function sampleData(now) {
  const rand = rng(7);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const day0 = today.getTime() - 44 * DAY;

  const worries = [
    { id: 'ex-work', ticker: 'WORK', name: 'Project deadline at work', openedTs: day0 + 2 * DAY, closedTs: null, outcome: null, control: 'mine', nextStep: 'Block 9–11am tomorrow for the first draft' },
    { id: 'ex-rent', ticker: 'RENT', name: 'Rent going up next lease', openedTs: day0 + 5 * DAY, closedTs: day0 + 26 * DAY, outcome: 'resolved', control: 'mine', nextStep: 'Ask the landlord about a 12-month rate' },
    { id: 'ex-exam', ticker: 'EXAM', name: 'Driving test retake', openedTs: day0 + 9 * DAY, closedTs: day0 + 30 * DAY, outcome: 'faded', control: 'not-mine', nextStep: '' },
    { id: 'ex-sleep', ticker: 'SLEEP', name: 'Not sleeping well', openedTs: day0 + 18 * DAY, closedTs: null, outcome: null, control: 'mine', nextStep: 'Phone stays in the kitchen after 11' },
    { id: 'ex-text', ticker: 'TEXT', name: 'Friend left me on read', openedTs: day0 + 35 * DAY, closedTs: day0 + 37 * DAY, outcome: 'let-go', control: 'not-mine', nextStep: '' },
  ];

  const notes = {
    'ex-work': ['Deadline moved up to Friday and I haven’t started the deck.', 'Got through half the slides. Less scary now.', 'Manager liked the outline.', 'Still behind on the numbers section.'],
    'ex-rent': ['Lease renewal letter says +12%.', 'Looked at other places. Everything is worse.', 'Landlord agreed to +4% for 12 months.'],
    'ex-exam': ['Retake is in two weeks. Parallel parking again.', 'Practiced with Sam, went okay.'],
    'ex-sleep': ['Up at 3am again.', 'Slept 7 hours for once.', 'Scrolled until 1am. Tired all day.'],
    'ex-text': ['Sent a long message, no reply for two days.', 'They were just busy. All good.'],
    none: ['Nothing specific, just flat.', 'Good walk by the river.', 'Coffee with Jo, felt lighter after.', 'Quiet evening, cooked dinner.'],
  };
  const tagFor = { 'ex-work': ['work'], 'ex-rent': ['money'], 'ex-exam': ['people'], 'ex-sleep': ['sleep', 'body'], 'ex-text': ['people'], none: [] };

  const checkins = [];
  let mood = 6;
  for (let d = 0; d <= 44; d++) {
    const perDay = rand() < 0.35 ? 2 : 1;
    for (let k = 0; k < perDay; k++) {
      const ts = day0 + d * DAY + (k === 0 ? 9 : 20) * HOUR + Math.floor(rand() * 90) * 60000;
      if (ts > now) continue;
      const open = worries.filter((w) => w.openedTs <= ts && (w.closedTs == null || w.closedTs >= ts));
      const w = open.length && rand() < 0.7 ? open[Math.floor(rand() * open.length)] : null;
      const key = w ? w.id : 'none';
      // Drift with a pull toward 6, dips while worries are open, a lift after RENT resolves.
      mood += (6 - mood) * 0.3 + (rand() - 0.5) * 2.4 - (w ? 0.6 : -0.4) + (d > 26 ? 0.25 : 0);
      mood = Math.max(1, Math.min(10, mood));
      const tags = [...tagFor[key]];
      if (!w && rand() < 0.5) tags.push('walk');
      const pool = notes[key];
      checkins.push({
        id: `ex-c${checkins.length}`,
        ts,
        mood: Math.round(mood),
        note: pool[Math.floor(rand() * pool.length)],
        tags,
        worryId: w ? w.id : null,
      });
    }
  }
  return { version: 1, demo: true, checkins, worries };
}
