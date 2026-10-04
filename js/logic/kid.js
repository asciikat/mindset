// Pure logic for the Kid room: the starter food / activity / plan libraries,
// example logs, the "next meal not had" rule, food suggestions, the learned
// sleep → wake gap, and what has worked for outings. No DOM, no clock: every
// function that needs the time takes `now`.

const MIN = 60000;
const HOUR = 60 * MIN;

export const MEALS = ['breakfast', 'lunch', 'dinner'];
export const SLOTS = [...MEALS, 'snack'];
export const SLOT_LABELS = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack' };

// What to say when the list has nothing for a slot. Plain, cheap, always true.
export const SLOT_FALLBACK = {
  breakfast: 'Toast, cereal, a banana or a yoghurt all count as breakfast.',
  lunch: 'A sandwich, a wrap or last night’s leftovers all count as lunch.',
  dinner: 'Pasta, eggs on toast, or something from the freezer plus a veg all count. Fed is what matters.',
  snack: 'Fruit, cheese and crackers, or a yoghurt.',
};

// Five faces for "how much did they like it?". `mouth` is the smile curve the
// room draws (−1 frown … 1 big smile); the label always goes with it.
export const RATING_FACES = {
  1: { label: 'Refused', mouth: -1 },
  2: { label: 'A bite', mouth: -0.45 },
  3: { label: 'Some', mouth: 0 },
  4: { label: 'Most of it', mouth: 0.55 },
  5: { label: 'Loved it', mouth: 1 },
};
export const faceFor = (avg) => (avg == null ? null : Math.min(5, Math.max(1, Math.round(avg))));

export const COST_LABELS = { 1: 'Cheap', 2: 'Mid-price', 3: 'Pricier' };
export const HEALTHY_LABELS = { 1: 'Sometimes food', 2: 'Pretty good', 3: 'Very healthy' };
export const ENERGY = ['high', 'med', 'low'];
export const ENERGY_LABELS = { high: 'High energy', med: 'Some energy', low: 'Low energy' };
export const WHERE_LABELS = { out: 'Out', in: 'At home' };
export const ACTIVITY_COST_LABELS = { 1: 'Free', 2: 'Small cost', 3: 'Costs more' };
export const WORKED = ['yes', 'meh', 'no'];
export const WORKED_LABELS = { yes: 'Worked', meh: 'So-so', no: 'Didn’t' };
export const WHEN_LABELS = { pickup: 'Right after pickup', later: 'Later' };
export const QUALITY_LABELS = { good: 'Good', ok: 'OK', bad: 'Rough' };

// ---------- starter libraries ----------
const food = (id, name, slots, cost, healthy, notes) => ({ id, name, slots, cost, healthy, notes });
const activity = (id, name, energy, where, cost, notes) => ({ id, name, energy, where, cost, notes });
const step = (id, text, refId) => (refId ? { id, text, done: false, refId } : { id, text, done: false });

export function starterKid() {
  const foods = [
    food('f-weetbix', 'Weet-Bix with milk and banana', ['breakfast'], 1, 3, 'Warm milk in winter. Banana sliced on top.'),
    food('f-oats', 'Porridge with honey', ['breakfast'], 1, 3, 'Quick oats, two minutes in the microwave. Let it cool a bit.'),
    food('f-pb-toast', 'Wholegrain toast with peanut butter', ['breakfast', 'snack'], 1, 2, 'Add banana slices to make it a bigger breakfast.'),
    food('f-vegemite', 'Vegemite toast', ['breakfast', 'snack'], 1, 2, 'A thin scrape with butter. Fast when nothing else is landing.'),
    food('f-eggs-toast', 'Scrambled eggs on toast', ['breakfast', 'lunch'], 1, 3, 'Five minutes. A bit of grated cheese helps if plain eggs get refused.'),
    food('f-yoghurt', 'Yoghurt with berries', ['breakfast', 'snack'], 2, 3, 'Frozen berries are cheaper and just as good.'),
    food('f-pancakes', 'Banana pancakes', ['breakfast'], 1, 2, 'One banana, one egg, a spoon of flour. Good for a slow morning.'),
    food('f-smoothie', 'Banana and berry smoothie', ['breakfast', 'snack'], 1, 3, 'Milk, banana, frozen berries, a spoon of oats. A straw helps.'),
    food('f-banana', 'Banana', ['breakfast', 'snack'], 1, 3, 'The fastest food there is. Keep a couple in the bag.'),
    food('f-beans', 'Baked beans on toast', ['breakfast', 'lunch'], 1, 2, 'Salt-reduced tin. Cheese on top.'),
    food('f-toastie', 'Cheese and tomato toastie', ['lunch'], 1, 2, 'Sandwich press or frying pan. Cut into triangles.'),
    food('f-wrap', 'Tuna or chicken wrap', ['lunch'], 2, 3, 'Wholemeal wrap, lettuce, grated carrot, a little mayo.'),
    food('f-ham-sandwich', 'Ham and salad sandwich', ['lunch'], 1, 2, 'Keep the salad on the side if mixing it in gets a no.'),
    food('f-pita-pizza', 'Pita pizza with veg', ['lunch', 'dinner'], 1, 2, 'Pita, tomato paste, cheese, whatever veg is in the fridge. Kids can build their own.'),
    food('f-soup', 'Soup and bread', ['lunch', 'dinner'], 1, 3, 'Pumpkin or chicken noodle. Bread for dipping makes it a meal.'),
    food('f-pesto-pasta', 'Pasta with pesto and peas', ['lunch', 'dinner'], 1, 2, 'Ten minutes. Peas go in the pasta water for the last two.'),
    food('f-bolognese', 'Spaghetti bolognese with hidden veg', ['dinner'], 2, 3, 'Grate carrot and zucchini into the sauce. Makes leftovers.'),
    food('f-fried-rice', 'Fried rice with peas and egg', ['dinner'], 1, 2, 'Best with yesterday’s rice. Frozen peas and corn.'),
    food('f-drumsticks', 'Chicken drumsticks, corn and potato', ['dinner'], 2, 3, 'One tray in the oven, about 40 minutes.'),
    food('f-burgers', 'Homemade burgers', ['dinner'], 2, 2, 'Mince patties, wholemeal buns, lettuce and cheese.'),
    food('f-tacos', 'Mince tacos', ['dinner'], 2, 2, 'Everything in little bowls, so building it is part of the fun.'),
    food('f-fish-fingers', 'Fish fingers, peas and mash', ['dinner'], 2, 2, 'Oven, not fried. Instant mash is fine.'),
    food('f-sausages', 'Sausages, mash and veg', ['dinner'], 1, 2, 'Cheap, filling and familiar. Good for a rough day.'),
    food('f-apple-cheese', 'Apple slices and cheese', ['snack'], 1, 3, 'A squeeze of lemon stops the apple going brown.'),
    food('f-carrot-hummus', 'Carrot sticks and hummus', ['snack'], 1, 3, 'Cucumber works too.'),
    food('f-popcorn', 'Plain popcorn', ['snack'], 1, 2, 'Kernels in a pot or the microwave. A movie snack that isn’t lollies.'),
    food('f-boiled-egg', 'Boiled egg', ['snack', 'lunch'], 1, 3, 'Boil a few at once. They keep in the fridge for days.'),
    food('f-crackers', 'Rice crackers and cheese', ['snack'], 1, 2, 'Easy to pack for the car at pickup.'),
    food('f-fruit', 'Watermelon or orange wedges', ['snack'], 1, 3, 'Whatever fruit is in season is cheapest.'),
  ];

  const activities = [
    activity('a-scooter', 'Scooter at the path or skate park', 'high', 'out', 1, 'Leave the helmet by the door so it’s grab and go.'),
    activity('a-playground', 'Playground', 'high', 'out', 1, 'Pick one with a big slide or a flying fox.'),
    activity('a-bike', 'Bike ride', 'high', 'out', 1, 'A loop with a stop halfway: a bench, a shop, a lookout.'),
    activity('a-ball', 'Kick a ball at the park', 'high', 'out', 1, 'Goals between two jumpers. Ten minutes is plenty.'),
    activity('a-pool', 'Swimming pool', 'high', 'out', 2, 'Local pool entry is cheap. Often means a good sleep.'),
    activity('a-dance', 'Dance party', 'high', 'in', 1, 'A favourite playlist, lights down, five songs.'),
    activity('a-beach', 'Beach or creek', 'med', 'out', 1, 'Bucket, towel and spare clothes live in the car.'),
    activity('a-bushwalk', 'Bush walk', 'med', 'out', 1, 'A short loop with something to find: a creek, a big tree, a lookout.'),
    activity('a-chalk', 'Chalk drawing outside', 'med', 'out', 1, 'Driveway or footpath. Hopscotch counts.'),
    activity('a-bake', 'Bake something easy', 'med', 'in', 2, 'Banana bread or muffins. Measuring and stirring is the fun part.'),
    activity('a-cook', 'Cook dinner together', 'med', 'in', 1, 'One real job: stirring, grating cheese, setting the table.'),
    activity('a-cubby', 'Build a cubby or fort', 'med', 'in', 1, 'Couch cushions, a sheet and a torch inside.'),
    activity('a-library', 'Library', 'low', 'out', 1, 'Free, quiet and air-conditioned. Borrow a stack, read one there.'),
    activity('a-lego', 'Lego or building', 'low', 'in', 1, 'Build side by side. Nothing has to get finished.'),
    activity('a-drawing', 'Drawing or painting', 'low', 'in', 1, 'Old newspaper on the table. Draw the same thing and compare.'),
    activity('a-board-game', 'Board game or cards', 'low', 'in', 1, 'Uno, snap, Guess Who. Short games are best.'),
  ];

  const plan = {
    main: [
      step('p-pickup', 'Pickup, then straight out: scooter or the park while energy is high', 'a-scooter'),
      step('p-snack', 'Snack from the next-meal list'),
      step('p-home', 'Home: quiet time or screens, with a visible timer'),
      step('p-dinner', 'Dinner: one of the favourites'),
      step('p-bath', 'Bath, books, lights out'),
      step('p-sleep', 'Sleep when my kid sleeps: phone down, lights out for me too'),
    ],
    planB: [
      step('p-b-food', 'Food first: a snack in the car at pickup'),
      step('p-b-home', 'Straight home. Screens are fine today'),
      step('p-b-easy', 'One easy thing side by side: drawing, Lego or a cubby'),
      step('p-b-dinner', 'Easy dinner: a favourite, no new foods'),
      step('p-b-bed', 'Early bath and bed, then me straight after'),
    ],
  };

  return { foods, activities, plan };
}

// ---------- example logs ----------
function rng(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Four two-night visits over three weeks (pickup 21, 14, 7 and 2 days ago),
// the last one ending this morning. Deterministic and never in the future.
export function sampleKid(now) {
  const rand = rng(23);
  const at = (daysAgo, hours) => {
    // Set the local clock time directly, so a daylight-saving change day
    // still puts breakfast at 8am rather than 9am.
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - daysAgo);
    d.setHours(0, Math.round(hours * 60), 0, 0);
    return d.getTime();
  };
  const jitter = (maxMin) => Math.floor(rand() * maxMin) * MIN;

  // The morning after each night at yours: [daysAgo, quality, hours|null].
  const mornings = [
    [20, 'good', 10.5], [19, 'bad', 7.5],
    [13, 'ok', 9], [12, 'good', null],
    [6, 'bad', 7], [5, 'ok', 9.5],
    [1, 'good', 10], [0, 'bad', 7.5],
  ];
  const nights = [];
  const sleeps = [];
  mornings.forEach(([ago, quality, hours], i) => {
    const asleepTs = at(ago + 1, 19.75) + jitter(40);
    // First wake 2.5–3.5 hours after falling asleep, a little sooner on rough nights.
    const gap = (quality === 'bad' ? 150 : 155) + Math.floor(rand() * (quality === 'bad' ? 20 : 35));
    sleeps.push({ id: `ex-ks${i}`, asleepTs, wokeTs: asleepTs + gap * MIN });
    const night = { id: `ex-kn${i}`, ts: at(ago, 7.25) + jitter(30), quality };
    if (hours != null) night.hours = hours;
    nights.push(night);
  });

  // [daysAgo, hour, foodId, slot, score]
  const rated = [
    [21, 15.6, 'f-apple-cheese', 'snack', 4],
    [21, 18, 'f-bolognese', 'dinner', 5],
    [20, 8.2, 'f-weetbix', 'breakfast', 5],
    [20, 12.6, 'f-toastie', 'lunch', 4],
    [20, 18.1, 'f-fish-fingers', 'dinner', 3],
    [19, 8.4, 'f-eggs-toast', 'breakfast', 2],
    [14, 15.5, 'f-carrot-hummus', 'snack', 1],
    [14, 18.2, 'f-pita-pizza', 'dinner', 5],
    [13, 9.5, 'f-oats', 'breakfast', 3],
    [13, 12.9, 'f-soup', 'lunch', 2],
    [13, 15.8, 'f-yoghurt', 'snack', 5],
    [13, 18, 'f-tacos', 'dinner', 4],
    [12, 8, 'f-weetbix', 'breakfast', 4],
    [7, 15.4, 'f-banana', 'snack', 4],
    [7, 18.3, 'f-fried-rice', 'dinner', 3],
    [6, 11.9, 'f-smoothie', 'breakfast', 5], // a late breakfast is still breakfast
    [6, 13.5, 'f-wrap', 'lunch', 2],
    [6, 18, 'f-bolognese', 'dinner', 5],
    [5, 8.3, 'f-pancakes', 'breakfast', 5],
    [2, 15.5, 'f-popcorn', 'snack', 4],
    [2, 18.2, 'f-pesto-pasta', 'dinner', 2],
    [1, 8.1, 'f-yoghurt', 'breakfast', 4],
    [1, 12.4, 'f-eggs-toast', 'lunch', 3],
    [1, 18, 'f-drumsticks', 'dinner', 4],
  ];
  const ratings = rated.map(([ago, hr, foodId, slot, score], i) => ({ id: `ex-kr${i}`, ts: at(ago, hr) + jitter(20), foodId, slot, score }));

  // [daysAgo, hour, activityId, worked, when]. Straight after pickup mostly works.
  const tried = [
    [21, 15.3, 'a-scooter', 'yes', 'pickup'],
    [20, 10, 'a-bushwalk', 'no', 'later'],
    [20, 16, 'a-board-game', 'yes', 'later'],
    [14, 15.2, 'a-playground', 'yes', 'pickup'],
    [13, 10.5, 'a-library', 'meh', 'later'],
    [13, 16.5, 'a-scooter', 'no', 'later'],
    [7, 15.3, 'a-scooter', 'yes', 'pickup'],
    [6, 11, 'a-beach', 'meh', 'later'],
    [6, 16, 'a-bake', 'yes', 'later'],
    [2, 15.2, 'a-ball', 'meh', 'pickup'],
    [1, 10, 'a-playground', 'no', 'later'],
    [1, 15.5, 'a-chalk', 'no', 'later'],
  ];
  const tries = tried.map(([ago, hr, activityId, worked, when], i) => ({ id: `ex-kt${i}`, ts: at(ago, hr) + jitter(20), activityId, worked, when }));

  const past = (x) => x.ts <= now;
  return {
    sleeps: sleeps.filter((x) => x.wokeTs <= now),
    nights: nights.filter(past),
    ratings: ratings.filter(past),
    tries: tries.filter(past),
    day: null,
  };
}

// ---------- dates ----------
export function startOfLocalDay(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
export function localDayKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ---------- nights ----------
// The most recent night logged so far today (logged the morning after), or null.
export function nightToday(nights, now) {
  const start = startOfLocalDay(now);
  let best = null;
  for (const n of nights || []) {
    if (typeof n?.ts !== 'number' || n.ts < start || n.ts > now) continue;
    if (!best || n.ts > best.ts) best = n;
  }
  return best;
}

// The kid's window from how they slept. Zones use the app's colours:
// good → ok (green), ok → calm (teal), rough → edge (amber).
export function kidWindow(quality) {
  if (quality === 'good') return { zone: 'ok', label: 'Wide window' };
  if (quality === 'ok') return { zone: 'calm', label: 'Ordinary window' };
  if (quality === 'bad') return { zone: 'edge', label: 'Narrow window' };
  return { zone: 'calm', label: 'Not logged yet' };
}

// Signs the kid is with you today: a night logged this morning, a sleep in
// the last 14 hours, a meal ticked, or a food or outing logged today. Used to
// keep the Today card quiet on days apart.
export function togetherToday(kidData, now) {
  const k = kidData || {};
  const start = startOfLocalDay(now);
  const today = (x) => typeof x?.ts === 'number' && x.ts >= start && x.ts <= now;
  if (nightToday(k.nights, now)) return true;
  if ((k.sleeps || []).some((x) => typeof x?.asleepTs === 'number' && x.asleepTs <= now && now - x.asleepTs <= 14 * HOUR)) return true;
  if (k.day && k.day.date === localDayKey(now) && MEALS.some((m) => k.day.had?.[m])) return true;
  return (k.ratings || []).some(today) || (k.tries || []).some(today);
}

// ---------- meals ----------
export function freshDay(date) {
  return { date, had: { breakfast: false, lunch: false, dinner: false } };
}

// Today's meal record. A record from another date starts over.
export function dayFor(day, date) {
  if (!day || day.date !== date) return freshDay(date);
  const out = freshDay(date);
  for (const m of MEALS) out.had[m] = Boolean(day.had?.[m]);
  return out;
}

export function markHad(day, date, slot, on = true) {
  const d = dayFor(day, date);
  if (MEALS.includes(slot)) d.had[slot] = Boolean(on);
  return d;
}

// Breakfast is breakfast: the next meal is the first one not had today,
// whatever the clock says. null once all three are done (snacks only then).
export function nextMeal(day, date) {
  const d = dayFor(day, date);
  return MEALS.find((m) => !d.had[m]) || null;
}

// Foods for a slot, best bets first: liked foods (by average rating) at the
// top, unrated ones in the middle (counted as 3 out of 5), disliked at the
// bottom. Ties go to the healthier, then the cheaper, then list order.
export function foodSuggestions(foods, ratings, slot) {
  const by = new Map();
  for (const r of ratings || []) {
    if (!r || typeof r.score !== 'number') continue;
    const e = by.get(r.foodId) || { sum: 0, count: 0, lastTs: null, last: null };
    e.sum += r.score;
    e.count += 1;
    if (e.lastTs == null || r.ts > e.lastTs) { e.lastTs = r.ts; e.last = r.score; }
    by.set(r.foodId, e);
  }
  return (foods || [])
    .map((f, order) => ({ f, order }))
    .filter(({ f }) => !slot || (f.slots || []).includes(slot))
    .map(({ f, order }) => {
      const e = by.get(f.id);
      return { food: { ...f, avg: e ? e.sum / e.count : null, count: e ? e.count : 0, lastTs: e ? e.lastTs : null, last: e ? e.last : null }, order };
    })
    .sort((a, b) => (b.food.avg ?? 3) - (a.food.avg ?? 3) || (b.food.healthy || 0) - (a.food.healthy || 0) || (a.food.cost || 0) - (b.food.cost || 0) || a.order - b.order)
    .map((x) => x.food);
}

export function foodHistory(ratings, foodId) {
  return (ratings || []).filter((r) => r && r.foodId === foodId).sort((a, b) => b.ts - a.ts);
}

// ---------- sleep sync ----------
export const DEFAULT_GAP_MIN = 180; // "usually wakes about 3 hours later"
const MIN_GAP = 20;
const MAX_GAP = 12 * 60;

// Median minutes from falling asleep to first waking, over the last 14 complete
// nights. With fewer than two, the 3-hour pattern you described is used.
export function wakeGap(sleeps) {
  const gaps = (sleeps || [])
    .filter((x) => typeof x?.asleepTs === 'number' && typeof x?.wokeTs === 'number')
    .sort((a, b) => b.asleepTs - a.asleepTs)
    .map((x) => (x.wokeTs - x.asleepTs) / MIN)
    .filter((g) => g >= MIN_GAP && g <= MAX_GAP)
    .slice(0, 14)
    .sort((a, b) => a - b);
  const count = gaps.length;
  if (count < 2) return { median: DEFAULT_GAP_MIN, count, isDefault: true };
  const mid = Math.floor(count / 2);
  const median = count % 2 ? gaps[mid] : (gaps[mid - 1] + gaps[mid]) / 2;
  return { median: Math.round(median), count, isDefault: false };
}

// The sleep in progress: started in the last 14 hours and not woken yet.
export function activeSleep(sleeps, now) {
  let best = null;
  for (const x of sleeps || []) {
    if (typeof x?.asleepTs !== 'number' || x.wokeTs != null) continue;
    if (x.asleepTs > now || now - x.asleepTs > 14 * HOUR) continue;
    if (!best || x.asleepTs > best.asleepTs) best = x;
  }
  return best;
}

// The first time a clock time 'HH:MM' comes round after fromTs, or null if
// that is still in the future (nobody woke at a time that hasn't happened).
export function timeAfter(fromTs, hhmm, now) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '').trim());
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return null;
  const d = new Date(fromTs);
  d.setHours(Number(m[1]), Number(m[2]), 0, 0);
  if (d.getTime() <= fromTs) d.setDate(d.getDate() + 1);
  const ts = d.getTime();
  return ts > now ? null : ts;
}

// The most recent time a clock time 'HH:MM' happened, at or before now
// (today, or yesterday if that time hasn't come yet today).
export function timeBefore(now, hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '').trim());
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return null;
  const d = new Date(now);
  d.setHours(Number(m[1]), Number(m[2]), 0, 0);
  if (d.getTime() > now) d.setDate(d.getDate() - 1);
  return d.getTime();
}

const NUM_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
// Time you could sleep, rounded down to the half hour, in words:
// 'two and a half hours', 'an hour', 'half an hour'. null under 30 minutes.
export function sleepWords(ms) {
  const halves = Math.floor(Math.max(0, ms) / (30 * MIN));
  if (halves < 1) return null;
  const whole = Math.floor(halves / 2);
  const half = halves % 2 === 1;
  if (whole === 0) return 'half an hour';
  if (whole === 1) return half ? 'an hour and a half' : 'an hour';
  return `${NUM_WORDS[whole] ?? whole} ${half ? 'and a half ' : ''}hours`;
}

// ---------- activities ----------
const WORK_SCORE = { yes: 1, meh: 0.5, no: 0 };
const rate = (yes, n) => (n ? yes / n : null);

// Per activity, plus "straight after pickup" vs "later" across every logged
// try (including tries of activities deleted since).
export function activityStats(tries, activities) {
  const list = (tries || []).filter((t) => t && WORK_SCORE[t.worked] != null);
  const total = { pickup: { n: 0, yes: 0 }, later: { n: 0, yes: 0 } };
  for (const t of list) {
    const k = t.when === 'pickup' ? 'pickup' : 'later';
    total[k].n += 1;
    if (t.worked === 'yes') total[k].yes += 1;
  }
  const byActivity = (activities || []).map((a) => {
    const s = { id: a.id, n: 0, yes: 0, meh: 0, no: 0, pickup: { n: 0, yes: 0 }, later: { n: 0, yes: 0 }, lastTs: null, last: null };
    for (const t of list) {
      if (t.activityId !== a.id) continue;
      s.n += 1;
      s[t.worked] += 1;
      const k = t.when === 'pickup' ? 'pickup' : 'later';
      s[k].n += 1;
      if (t.worked === 'yes') s[k].yes += 1;
      if (s.lastTs == null || t.ts > s.lastTs) { s.lastTs = t.ts; s.last = t.worked; }
    }
    s.rate = rate(s.yes, s.n);
    return s;
  });
  return {
    byActivity,
    pickup: { ...total.pickup, rate: rate(total.pickup.yes, total.pickup.n) },
    later: { ...total.later, rate: rate(total.later.yes, total.later.n) },
  };
}

// "Straight after pickup: 4 of 5 worked. Later: 1 of 4." plus a verdict once
// both sides have at least two tries and differ clearly.
export function pickupInsight(stats) {
  const p = stats?.pickup || { n: 0, yes: 0 };
  const l = stats?.later || { n: 0, yes: 0 };
  if (!p.n && !l.n) return null;
  const pickupPart = p.n ? `Straight after pickup: ${p.yes} of ${p.n} worked.` : 'Nothing logged straight after pickup yet.';
  const laterPart = l.n ? `Later: ${l.yes} of ${l.n}.` : 'Nothing logged later in the day yet.';
  let verdict = null;
  if (p.n >= 2 && l.n >= 2) {
    const diff = p.yes / p.n - l.yes / l.n;
    verdict = diff >= 0.2 ? 'pickup' : diff <= -0.2 ? 'later' : 'same';
  }
  return { text: `${pickupPart} ${laterPart}`, verdict, pickup: p, later: l };
}

// Ideas ranked for today: what has worked rises (tries straight after pickup
// count a bit more), and the night's sleep tilts toward high or low energy.
export function rankActivities(activities, tries, { quality = null } = {}) {
  const list = (tries || []).filter((t) => t && WORK_SCORE[t.worked] != null);
  return (activities || [])
    .map((a, order) => {
      let w = 0;
      let n = 0;
      for (const t of list) {
        if (t.activityId !== a.id) continue;
        const k = t.when === 'pickup' ? 1.5 : 1;
        w += k * WORK_SCORE[t.worked];
        n += k;
      }
      // Smoothed toward 0.5 so one try doesn't decide everything.
      let score = (w + 1) / (n + 2);
      if (quality === 'bad') score += a.energy === 'low' ? 0.3 : a.energy === 'med' ? 0.05 : -0.3;
      else if (quality === 'good') score += a.energy === 'high' ? 0.15 : a.energy === 'med' ? 0.05 : 0;
      score -= ((a.cost || 1) - 1) * 0.03;
      return { activity: a, score, order };
    })
    .sort((x, y) => y.score - x.score || x.order - y.order)
    .map(({ activity: a, score }) => ({ ...a, score }));
}

// ---------- lists ----------
// Move the item with `id` one place up (dir −1) or down (dir 1). Returns a new array.
export function moveById(list, id, dir) {
  const out = [...(list || [])];
  const i = out.findIndex((x) => x.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= out.length) return out;
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

export function planProgress(steps) {
  const list = steps || [];
  return { done: list.filter((x) => x.done).length, total: list.length, next: list.find((x) => !x.done) || null };
}
