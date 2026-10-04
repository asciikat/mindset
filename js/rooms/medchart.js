// Drawing for the Meds room: the day chart (focus / mood / anxiety by hours since
// the dose), its table twin, and the dose timeline track. No data changes here.
//
// Chart rules: three categorical series in fixed colours (tokens in css/meds.css),
// each with its own marker shape so identity never rests on colour alone; a legend
// is always shown and each line is labelled at its end; a crosshair snaps to the
// nearest check-in and the tooltip lists every series; arrow keys do the same.
// Text is always ink, never a series colour.

import { h, s, afterRender } from '../core.js';
import { CHART_HOURS, fmtClock, fmtHours, groupEvents } from '../logic/meds.js';

const HOUR = 3600000;

// dodge: scores are whole numbers, so the three lines often share a value. Each
// series sits a few pixels off the gridline (under a tenth of a point) so
// overlapping lines read as parallel strands instead of hiding each other.
export const SERIES = [
  { key: 'focus', label: 'Focus', cls: 'focus', shape: 'circle', dodge: -3.5 },
  { key: 'mood', label: 'Mood', cls: 'mood', shape: 'square', dodge: 0 },
  { key: 'anxiety', label: 'Anxiety', cls: 'anx', shape: 'diamond', dodge: 3.5 },
];

const CAFFEINE_LABELS = { coffee: 'Coffee', tea: 'Tea', 'energy drink': 'Energy drink', cola: 'Cola' };
export const caffeineLabel = (what) => CAFFEINE_LABELS[what] || 'Caffeine';

// ---------- small marks ----------
export function markShape(shape, cx, cy, r, cls) {
  if (shape === 'square') {
    const a = r * 0.9;
    return s('rect', { x: (cx - a).toFixed(1), y: (cy - a).toFixed(1), width: (a * 2).toFixed(1), height: (a * 2).toFixed(1), rx: 1.5, class: cls });
  }
  if (shape === 'diamond') {
    const d = r * 1.25;
    return s('path', { d: `M${cx.toFixed(1)},${(cy - d).toFixed(1)}L${(cx + d).toFixed(1)},${cy.toFixed(1)}L${cx.toFixed(1)},${(cy + d).toFixed(1)}L${(cx - d).toFixed(1)},${cy.toFixed(1)}Z`, class: cls });
  }
  return s('circle', { cx: cx.toFixed(1), cy: cy.toFixed(1), r, class: cls });
}

// A line key with the series' marker, for legends and the tooltip.
export function seriesKey(sr) {
  return s('svg', { viewBox: '0 0 22 12', width: 22, height: 12, 'aria-hidden': 'true', class: 'med-key-svg' },
    s('line', { x1: 1, x2: 21, y1: 6, y2: 6, class: `med-line ${sr.cls}` }),
    markShape(sr.shape, 11, 6, 3.6, `med-mark ${sr.cls}`));
}

// Cup and plate glyphs (currentColor). Pass x/y to nest inside a chart SVG.
export function cupIcon({ size = 14, x = null, y = null } = {}) {
  return s('svg', { viewBox: '0 0 16 16', width: size, height: size, x, y, 'aria-hidden': 'true', class: 'med-ico' },
    s('path', { d: 'M2.5 5.5h8.5v4a3.5 3.5 0 0 1-3.5 3.5h-1.5A3.5 3.5 0 0 1 2.5 9.5z', fill: 'currentColor' }),
    s('path', { d: 'M11 6.6h1.1a1.9 1.9 0 0 1 0 3.8H11', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.5' }),
    s('path', { d: 'M5.2 1.6v2.2M8.2 1.6v2.2', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.4', 'stroke-linecap': 'round' }));
}
export function plateIcon({ size = 14, x = null, y = null } = {}) {
  return s('svg', { viewBox: '0 0 16 16', width: size, height: size, x, y, 'aria-hidden': 'true', class: 'med-ico' },
    s('circle', { cx: 8, cy: 8, r: 6.2, fill: 'none', stroke: 'currentColor', 'stroke-width': '1.6' }),
    s('circle', { cx: 8, cy: 8, r: 2.8, fill: 'currentColor' }));
}

// One glyph per drink for the caffeine buttons (the chart uses the plain cup).
export function drinkIcon(what, { size = 18 } = {}) {
  const svg = (...kids) => s('svg', { viewBox: '0 0 16 16', width: size, height: size, 'aria-hidden': 'true', class: 'med-ico' }, ...kids);
  const line = (d, w = 1.4) => s('path', { d, fill: 'none', stroke: 'currentColor', 'stroke-width': String(w), 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
  if (what === 'tea') {
    // A low cup with a tea-bag string and tag.
    return svg(
      s('path', { d: 'M2 7.5h10v1.5a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4z', fill: 'currentColor' }),
      line('M12 8.4h.7a1.6 1.6 0 0 1 0 3.2H11.6'),
      line('M7 7.5V3.2l2.6-1', 1.1),
      s('rect', { x: 9.1, y: 0.9, width: 2.6, height: 2.6, rx: 0.5, fill: 'currentColor' }));
  }
  if (what === 'energy drink') {
    // A tall can.
    return svg(
      s('path', { d: 'M4.6 2.6h6.8l.6 1.4v9.6l-.6 1.1H4.6L4 13.6V4z', fill: 'currentColor' }),
      s('path', { d: 'M6.2 6.2l2.6-.9-1 2.4 2.1-.4-3 3.3.8-2.4-1.9.3z', class: 'med-ico-cut' }));
  }
  if (what === 'cola') {
    // A glass with a straw.
    return svg(
      s('path', { d: 'M3.6 5.2h8.8l-1 9.1H4.6z', fill: 'currentColor' }),
      line('M9.3 7.6l2.3-6.4h2', 1.3));
  }
  return cupIcon({ size });
}

export function chartLegend({ events = true } = {}) {
  return h('div', { class: 'med-legend' },
    SERIES.map((sr) => h('span', { class: 'med-key' }, seriesKey(sr), sr.label)),
    events ? h('span', { class: 'med-key med-key-ev' }, cupIcon({ size: 13 }), 'Caffeine') : null,
    events ? h('span', { class: 'med-key med-key-ev' }, plateIcon({ size: 13 }), 'Food') : null);
}

// ---------- the day chart ----------
// points: dayCurve() output. events: [{ kind: 'cup'|'plate', h, label }].
// nowH: hours since the dose right now (today only) — draws "now" and washes the future.
export function medChart({ points, events = [], nowH = null, startTs = null, label = 'Focus, mood and anxiety by hours since the dose' }) {
  const H = 262;
  const wrap = h('div', { class: 'med-chart', style: `min-height:${H}px` });
  const tip = h('div', { class: 'med-tip', hidden: true });
  const live = h('div', { class: 'visually-hidden', 'aria-live': 'polite' });
  wrap.append(tip, live);
  afterRender(() => draw(wrap, { points, events, nowH, startTs, label, H, tip, live }));
  return wrap;
}

const LABEL_CH = 6.4; // approx. width of one end-label character (11px semibold), for layout before measuring
const LANE = { cup: 7, plate: 23 }; // icon tops below the baseline: caffeine lane, then food lane

function draw(host, o) {
  host.querySelector('svg.med-svg')?.remove();
  const { points, events, nowH, startTs, H, tip, live } = o;
  const W = Math.max(280, Math.round(host.clientWidth || 340));
  const padL = 22, padT = 22, padB = 76;
  const plotH = H - padT - padB;

  // End labels ("Focus 4") sit just right of each line's last point. Give the plot
  // only as much right-hand room as those labels need, so the hours get the width.
  const ends = [];
  for (const sr of SERIES) {
    const last = [...points].reverse().find((p) => p[sr.key] != null);
    if (last) ends.push({ sr, p: last, text: `${sr.label} ${last[sr.key]}` });
  }
  const labelW = Math.max(0, ...ends.map((e) => e.text.length * LABEL_CH));
  const r = ends.length ? Math.min(Math.max(...ends.map((e) => e.p.h)), CHART_HOURS) / CHART_HOURS : 0;
  let padR = 16;
  if (r > 0) padR = Math.max(padR, Math.ceil(W - padL - (W - padL - 14 - labelW - 4) / r));
  padR = Math.min(padR, 84);
  const plotW = W - padL - padR;
  const X = (hr) => padL + (Math.min(Math.max(hr, 0), CHART_HOURS) / CHART_HOURS) * plotW;
  const Y = (v) => padT + ((5 - v) / 4) * plotH;
  const base = Y(1);

  const svg = s('svg', { class: 'med-svg', viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', tabindex: points.length ? '0' : null, 'aria-label': o.label });
  host.insertBefore(svg, host.firstChild);

  // Still to come (today): a quiet wash right of "now".
  if (nowH != null && nowH < CHART_HOURS) {
    svg.append(s('rect', { x: X(nowH).toFixed(1), y: padT - 8, width: (X(CHART_HOURS) - X(nowH)).toFixed(1), height: plotH + 16, rx: 6, class: 'med-future' }));
  }

  // Recessive scale: hairlines at 1–5, labelled on the left.
  for (let v = 1; v <= 5; v++) {
    svg.append(s('line', { x1: padL, x2: padL + plotW, y1: Y(v), y2: Y(v), class: v === 1 ? 'med-axis' : 'med-grid' }));
    svg.append(s('text', { x: padL - 8, y: Y(v) + 3.5, 'text-anchor': 'end', class: 'med-tick', text: String(v) }));
  }

  // X axis: hours since the dose, with the clock time underneath.
  // Clock labels ("11:40am", 10px mono, about 6px a character) every 2h when they fit, else every 4h.
  const clockEvery = plotW / (CHART_HOURS / 2) < 56 ? 4 : 2;
  for (let hr = 0; hr <= CHART_HOURS; hr += 2) {
    const x = X(hr);
    svg.append(s('line', { x1: x, x2: x, y1: base, y2: base + 4, class: 'med-axis' }));
    svg.append(s('text', { x, y: base + 52, 'text-anchor': 'middle', class: 'med-tick med-tick-h', text: `${hr}h` }));
    if (startTs != null && hr % clockEvery === 0) {
      const text = fmtClock(startTs + hr * HOUR);
      const half = text.length * 3.1;
      svg.append(s('text', { x: Math.min(Math.max(x, half), W - half).toFixed(1), y: base + 66, 'text-anchor': 'middle', class: 'med-tick', text }));
    }
  }

  // Caffeine and food in two lanes under the axis, each at its real time; marks
  // too close to draw apart merge into one with a count.
  for (const g of groupEvents(events, X, 15)) {
    const y = base + LANE[g.kind];
    const icon = (g.kind === 'cup' ? cupIcon : plateIcon)({ size: 13, x: (g.p - 6.5).toFixed(1), y });
    svg.append(s('g', { class: 'med-ev-mark' }, icon,
      g.n > 1 ? s('text', { x: (g.p + 8).toFixed(1), y: y + 10, class: 'med-ev-count', text: `×${g.n}` }) : null));
  }

  // Now.
  if (nowH != null && nowH <= CHART_HOURS) {
    const x = X(nowH);
    svg.append(s('line', { x1: x, x2: x, y1: padT - 8, y2: base + 4, class: 'med-now-line' }));
    svg.append(s('text', { x: Math.min(Math.max(x, padL + 12), W - 14), y: padT - 11, 'text-anchor': 'middle', class: 'med-tick med-now-text', text: 'now' }));
  }

  // Series: 2px lines broken where a score was skipped, ≥8px markers with a surface ring.
  const marks = [];
  for (const sr of SERIES) {
    let d = '';
    let joined = false;
    for (const p of points) {
      const v = p[sr.key];
      if (v == null) { joined = false; continue; }
      d += `${joined ? 'L' : 'M'}${X(p.h).toFixed(1)},${(Y(v) + sr.dodge).toFixed(1)}`;
      joined = true;
      marks.push([sr, p]);
    }
    if (d.includes('L')) svg.append(s('path', { d, class: `med-line ${sr.cls}` }));
  }
  // Markers after every line, so a ringed marker always sits on top of the other lines.
  for (const [sr, p] of marks) svg.append(markShape(sr.shape, X(p.h), Y(p[sr.key]) + sr.dodge, 4.5, `med-mark ${sr.cls}`));

  // Direct end labels in ink, spaced so they never overlap; a leader joins any label moved off its point.
  const GAP = 15;
  for (const e of ends) { e.x = X(e.p.h); e.y = Y(e.p[e.sr.key]) + e.sr.dodge; }
  ends.sort((a, b) => a.y - b.y);
  for (let i = 0; i < ends.length; i++) ends[i].ly = Math.max(ends[i].y, i ? ends[i - 1].ly + GAP : padT - 4);
  const overflow = ends.length ? ends[ends.length - 1].ly - (base + 4) : 0;
  if (overflow > 0) for (const e of ends) e.ly -= overflow;
  for (let i = ends.length - 2; i >= 0; i--) ends[i].ly = Math.min(ends[i].ly, ends[i + 1].ly - GAP);
  for (const e of ends) {
    const t = s('text', { x: 0, y: e.ly + 4, class: 'med-end-label', text: e.text });
    svg.append(t);
    let w = e.text.length * LABEL_CH;
    try { w = t.getComputedTextLength() || w; } catch { /* not measurable here */ }
    const lx = Math.max(e.x + 10, Math.min(e.x + 12, W - w - 2));
    t.setAttribute('x', lx.toFixed(1));
    if (Math.abs(e.ly - e.y) > 2) svg.insertBefore(s('path', { d: `M${(e.x + 6).toFixed(1)},${e.y.toFixed(1)}L${(lx - 3).toFixed(1)},${e.ly.toFixed(1)}`, class: 'med-leader' }), t);
  }

  // Crosshair + highlighted markers, drawn on top.
  const cross = s('g', { class: 'med-cross', visibility: 'hidden' });
  const hair = s('line', { y1: padT - 6, y2: base + 4, class: 'med-hair' });
  const hiMarks = s('g');
  cross.append(hair, hiMarks);
  svg.append(cross);

  if (!points.length) return;

  const xs = points.map((p) => X(p.h));
  let cur = -1;
  const show = (i, announce = false) => {
    cur = i;
    if (i < 0) {
      cross.setAttribute('visibility', 'hidden');
      tip.hidden = true;
      return;
    }
    const p = points[i];
    const x = xs[i];
    hair.setAttribute('x1', x);
    hair.setAttribute('x2', x);
    hiMarks.replaceChildren(...SERIES.filter((sr) => p[sr.key] != null).map((sr) => markShape(sr.shape, x, Y(p[sr.key]) + sr.dodge, 6, `med-mark ${sr.cls} hi`)));
    cross.setAttribute('visibility', 'visible');
    // Caffeine logged since the check-in before this one (or since the dose).
    const fromH = i ? points[i - 1].h : -Infinity;
    const cups = events.filter((ev) => ev.kind === 'cup' && ev.h > fromH && ev.h <= p.h).map((ev) => ev.label.toLowerCase());
    const extra = [p.appetite != null ? `Appetite ${p.appetite}` : null, p.energy != null ? `Energy ${p.energy}` : null].filter(Boolean).join(' · ');
    const lines = [
      h('div', { class: 'med-tip-when' }, `${fmtHours(p.h)} after · ${fmtClock(p.ts)}`),
      ...SERIES.map((sr) => h('div', { class: 'med-tip-row' },
        seriesKey(sr),
        h('span', { text: sr.label }),
        h('strong', { text: p[sr.key] == null ? '–' : String(p[sr.key]) }))),
      extra ? h('div', { class: 'med-tip-extra', text: extra }) : null,
      p.ate ? h('div', { class: 'med-tip-extra', text: `Ate${p.ateWhat ? `: ${p.ateWhat}` : ' something'}` }) : null,
      cups.length ? h('div', { class: 'med-tip-extra', text: `Caffeine: ${cups.join(', ')}` }) : null,
      p.note ? h('div', { class: 'med-tip-note', text: `“${p.note}”` }) : null,
    ];
    tip.replaceChildren(...lines.filter(Boolean));
    tip.hidden = false;
    // Sit beside the crosshair on whichever side has more room, at the top of the plot.
    const tw = tip.offsetWidth;
    const scale = (svg.getBoundingClientRect().width || W) / W;
    const px = x * scale;
    const hostW = host.clientWidth || W;
    let left = px + 12;
    if (left + tw > hostW && px - 12 - tw >= 0) left = px - 12 - tw;
    tip.style.left = `${Math.max(0, Math.min(left, hostW - tw))}px`;
    tip.style.top = `${Math.round((padT - 6) * scale)}px`;
    if (announce) {
      live.textContent = `${fmtHours(p.h)} after the dose, ${fmtClock(p.ts)}. ${SERIES.map((sr) => `${sr.label} ${p[sr.key] ?? 'not rated'}`).join(', ')}.${extra ? ` ${extra}.` : ''}${p.ate ? ` Ate${p.ateWhat ? `: ${p.ateWhat}` : ' something'}.` : ''}${cups.length ? ` Caffeine: ${cups.join(', ')}.` : ''}${p.note ? ` Note: ${p.note}` : ''}`;
    }
  };
  const nearest = (e) => {
    const box = svg.getBoundingClientRect();
    const px = ((e.clientX - box.left) / box.width) * W;
    let best = 0;
    for (let i = 1; i < xs.length; i++) if (Math.abs(xs[i] - px) < Math.abs(xs[best] - px)) best = i;
    return best;
  };
  svg.addEventListener('pointerdown', (e) => show(nearest(e)));
  svg.addEventListener('pointermove', (e) => show(nearest(e)));
  svg.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') show(-1); });
  svg.addEventListener('blur', () => show(-1));
  svg.addEventListener('keydown', (e) => {
    const last = points.length - 1;
    if (e.key === 'ArrowLeft') show(cur < 0 ? last : Math.max(0, cur - 1), true);
    else if (e.key === 'ArrowRight') show(cur < 0 ? 0 : Math.min(last, cur + 1), true);
    else if (e.key === 'Home') show(0, true);
    else if (e.key === 'End') show(last, true);
    else if (e.key === 'Escape') show(-1);
    else return;
    e.preventDefault();
  });
}

// ---------- table twin ----------
// One row per check-in; anything eaten and the note go in a full-width row under it,
// so the numbers fit a phone screen without sideways scrolling.
export function medTable(points, caption = 'Check-ins') {
  const cell = (v) => h('td', { class: 'num', text: v == null ? '–' : String(v) });
  const cols = ['Focus', 'Mood', 'Anxiety', 'Appetite', 'Energy'];
  return h('div', { class: 'med-table-wrap', tabindex: '0', role: 'region', 'aria-label': caption },
    h('table', { class: 'med-table' },
      h('caption', { class: 'visually-hidden', text: `${caption}. Scores from 1 (low) to 5 (high).` }),
      h('thead', {}, h('tr', {},
        h('th', { scope: 'col', text: 'Time' }),
        cols.map((c) => h('th', { scope: 'col', class: 'num', text: c })))),
      h('tbody', {}, points.map((p) => {
        const extra = [p.ate ? `Ate${p.ateWhat ? `: ${p.ateWhat}` : ''}` : '', p.note ? `“${p.note}”` : ''].filter(Boolean).join(' · ');
        return [
          h('tr', { class: extra ? 'has-sub' : null },
            h('th', { scope: 'row' }, fmtClock(p.ts), h('span', { class: 'med-table-h', text: `${fmtHours(p.h)} in` })),
            cell(p.focus), cell(p.mood), cell(p.anxiety), cell(p.appetite), cell(p.energy)),
          extra ? h('tr', { class: 'med-table-sub' }, h('td', { colspan: '6', text: extra })) : null,
        ];
      }))));
}

// ---------- dose timeline track ----------
// A 0–14h rail: check-in slots (done / missed / due / later), "now", and lanes for
// caffeine and food under it.
export function doseTrack({ dose, slots, nowH = null, events = [], compact = false, label = '' }) {
  const frac = (hr) => (Math.min(Math.max(hr, 0), CHART_HOURS) / CHART_HOURS) * 100;
  const pct = (hr) => `${frac(hr).toFixed(2)}%`;
  const evs = compact ? [] : groupEvents(events, frac, 4.5, 8).map((g) => h('span', { class: `med-ev ${g.kind}`, style: `left:${g.p.toFixed(2)}%` },
    g.kind === 'cup' ? cupIcon({ size: 13 }) : plateIcon({ size: 13 }),
    g.n > 1 ? h('span', { class: 'med-ev-n', text: `×${g.n}` }) : null));
  const inner = h('div', { class: 'med-track-inner' },
    h('span', { class: 'med-rail' }),
    nowH != null ? h('span', { class: 'med-rail-fill', style: `width:${pct(nowH)}` }) : null,
    h('span', { class: 'med-dose-pin', style: 'left:0%' }),
    slots.map((sl) => h('span', { class: `med-slot ${sl.status}`, style: `left:${pct(sl.h)}` })),
    nowH != null && nowH <= CHART_HOURS ? h('span', { class: 'med-now-pin', style: `left:${pct(nowH)}` }, compact ? null : h('span', { class: 'med-now-lbl', text: 'now' })) : null,
    evs);
  const axis = h('div', { class: 'med-track-axis', 'aria-hidden': 'true' },
    h('span', { text: compact ? fmtClock(dose.ts) : `0h · ${fmtClock(dose.ts)}` }),
    h('span', { text: compact ? fmtClock(dose.ts + 7 * HOUR) : `7h · ${fmtClock(dose.ts + 7 * HOUR)}` }),
    h('span', { text: compact ? fmtClock(dose.ts + CHART_HOURS * HOUR) : `14h · ${fmtClock(dose.ts + CHART_HOURS * HOUR)}` }));
  const hasEvents = evs.length > 0;
  return h('div', { class: `med-track${compact ? ' compact' : ''}${hasEvents ? ' has-ev' : ''}`, role: 'img', 'aria-label': label }, inner, axis);
}

export function trackLegend() {
  const dot = (cls, text) => h('span', { class: 'med-key' }, h('span', { class: `med-slot-key ${cls}`, 'aria-hidden': 'true' }), text);
  return h('div', { class: 'med-legend med-track-legend', 'aria-hidden': 'true' },
    dot('done', 'Done'), dot('due', 'Due'), dot('missed', 'Missed'), dot('upcoming', 'Later'),
    h('span', { class: 'med-key med-key-ev' }, cupIcon({ size: 13 }), 'Caffeine'),
    h('span', { class: 'med-key med-key-ev' }, plateIcon({ size: 13 }), 'Food'));
}

// A tiny focus line for history rows (single series, so no legend).
export function focusSpark(points, { width = 64, height = 26 } = {}) {
  const svg = s('svg', { viewBox: `0 0 ${width} ${height}`, width, height, 'aria-hidden': 'true', class: 'med-spark' });
  const pts = points.filter((p) => p.focus != null);
  if (pts.length < 2) {
    svg.append(s('line', { x1: 2, x2: width - 2, y1: height / 2, y2: height / 2, class: 'med-grid' }));
    return svg;
  }
  const X = (hr) => 2 + (Math.min(hr, CHART_HOURS) / CHART_HOURS) * (width - 4);
  const Y = (v) => 3 + ((5 - v) / 4) * (height - 6);
  svg.append(s('line', { x1: 2, x2: width - 2, y1: Y(1), y2: Y(1), class: 'med-grid' }));
  svg.append(s('path', { d: pts.map((p, i) => `${i ? 'L' : 'M'}${X(p.h).toFixed(1)},${Y(p.focus).toFixed(1)}`).join(''), class: 'med-line focus' }));
  return svg;
}
