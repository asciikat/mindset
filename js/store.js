// Everything lives in this browser's localStorage. Nothing is sent anywhere.
//
// Data shape (version 2) — see SCHEMA.md for every field.
//   profile   kid's name, your sleep need
//   checkins  mood check-ins (morning check-ins add sleep/mind/body fields)
//   worries   "positions"
//   body      overload/calm body-map logs + notes from calm me
//   kid       foods, activities, visit plan (libraries) + sleep/meal/activity logs
//   meds      doses, hourly check-ins, caffeine
//
// "Libraries" (foods, activities, plan, notes to self, med settings) are starter
// content the user edits. "Logs" are things that happened. Example data only
// ever fills logs, so clearing examples keeps the libraries.

import { isValidData } from './logic.js';
import { sampleMind } from './sample.js';
import { sampleMorning } from './logic/capacity.js';
import { starterBody, sampleBody } from './logic/body.js';
import { starterKid, sampleKid } from './logic/kid.js';
import { starterMeds, sampleMeds } from './logic/meds.js';

const KEY = 'mindset.v1'; // key kept from v1 so existing data is found and migrated

export function emptyData() {
  const kid = starterKid();
  const meds = starterMeds();
  return {
    version: 2,
    demo: false,
    profile: { kidName: '', sleepNeed: 8 },
    checkins: [],
    worries: [],
    body: { states: [], rules: starterBody().rules },
    kid: {
      foods: kid.foods,
      activities: kid.activities,
      plan: kid.plan,
      sleeps: [],
      nights: [],
      ratings: [],
      tries: [],
      day: null,
    },
    meds: { doses: [], checks: [], caffeine: [], settings: meds.settings },
  };
}

// Fill in any slice or field a saved copy is missing (older versions, partial imports).
export function normalize(raw) {
  const base = emptyData();
  const d = { ...base, ...raw, version: 2 };
  d.profile = { ...base.profile, ...(raw.profile || {}) };
  d.checkins = Array.isArray(raw.checkins) ? raw.checkins : [];
  d.worries = Array.isArray(raw.worries) ? raw.worries : [];
  d.body = { ...base.body, ...(raw.body || {}) };
  d.kid = { ...base.kid, ...(raw.kid || {}) };
  d.meds = { ...base.meds, ...(raw.meds || {}) };
  d.meds.settings = { ...base.meds.settings, ...((raw.meds || {}).settings || {}) };
  for (const [slice, keys] of [['body', ['states', 'rules']], ['kid', ['foods', 'activities', 'sleeps', 'nights', 'ratings', 'tries']], ['meds', ['doses', 'checks', 'caffeine']]]) {
    for (const k of keys) if (!Array.isArray(d[slice][k])) d[slice][k] = base[slice][k];
  }
  if (!d.kid.plan || !Array.isArray(d.kid.plan.main) || !Array.isArray(d.kid.plan.planB)) d.kid.plan = base.kid.plan;
  d.demo = Boolean(raw.demo);
  return d;
}

// Drop every log but keep libraries and the profile.
export function clearDemoLogs(data) {
  const fresh = emptyData();
  return {
    ...fresh,
    profile: data.profile,
    body: { ...fresh.body, rules: data.body.rules },
    kid: { ...fresh.kid, foods: data.kid.foods, activities: data.kid.activities, plan: data.kid.plan },
    meds: { ...fresh.meds, settings: data.meds.settings },
  };
}

export function sampleData(now) {
  const d = emptyData();
  const mind = sampleMind(now);
  d.demo = true;
  d.checkins = [...mind.checkins, ...sampleMorning(now)].sort((a, b) => a.ts - b.ts);
  d.worries = mind.worries;
  d.body.states = sampleBody(now).states;
  Object.assign(d.kid, sampleKid(now));
  Object.assign(d.meds, sampleMeds(now));
  return d;
}

export function load(now = Date.now()) {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (isValidData(data)) return normalize(data);
    }
  } catch {
    // Storage blocked or corrupt: fall through to example data.
  }
  return sampleData(now);
}

export function save(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}
