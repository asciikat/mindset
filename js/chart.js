// The stock-style mood line: one series, no axes to read, a dotted "previous close"
// baseline, and a crosshair you drag to read any past check-in.

const NS = 'http://www.w3.org/2000/svg';
let gradientCount = 0;

function el(name, attrs = {}, style = {}) {
  const node = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  Object.assign(node.style, style);
  return node;
}

export function renderChart(host, { points, baseline, start, end, onScrub, height = 210, label = 'Mood over time' }) {
  host.replaceChildren();
  const width = Math.max(260, host.clientWidth || 340);
  const padT = 14, padB = 14, padL = 4, padR = 26;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  const span = end - start;
  const x = (ts) => padL + (span > 0 ? ((ts - start) / span) * plotW : plotW / 2);
  const y = (m) => padT + ((10 - m) / 9) * plotH;

  const svg = el('svg', { viewBox: `0 0 ${width} ${height}`, width, height, role: 'img', 'aria-label': label, tabindex: '0', class: 'chart-svg' });

  // Recessive scale: three faint rules at 10, 5 and 1, labelled at the right edge.
  for (const m of [10, 5, 1]) {
    svg.append(el('line', { x1: padL, x2: padL + plotW, y1: y(m), y2: y(m) }, { stroke: 'var(--rule)', strokeWidth: '1' }));
    const t = el('text', { x: width - 2, y: y(m) + 4, 'text-anchor': 'end', class: 'chart-tick' }, { fill: 'var(--muted)' });
    t.textContent = m;
    svg.append(t);
  }

  if (baseline != null) {
    svg.append(el('line', { x1: padL, x2: padL + plotW, y1: y(baseline), y2: y(baseline) }, { stroke: 'var(--muted)', strokeWidth: '1.5', strokeDasharray: '1 5', strokeLinecap: 'round' }));
  }

  if (!points.length) {
    host.append(svg);
    return;
  }

  const coords = points.map((p) => [x(p.ts), y(p.mood)]);
  const gid = `trend-fill-${++gradientCount}`;
  const defs = el('defs');
  const grad = el('linearGradient', { id: gid, x1: '0', x2: '0', y1: '0', y2: '1' });
  grad.append(el('stop', { offset: '0%' }, { stopColor: 'var(--trend)', stopOpacity: '0.22' }));
  grad.append(el('stop', { offset: '100%' }, { stopColor: 'var(--trend)', stopOpacity: '0' }));
  defs.append(grad);
  svg.append(defs);

  if (coords.length > 1) {
    const line = coords.map(([cx, cy], i) => `${i ? 'L' : 'M'}${cx.toFixed(1)},${cy.toFixed(1)}`).join('');
    const area = `${line}L${coords[coords.length - 1][0].toFixed(1)},${padT + plotH}L${coords[0][0].toFixed(1)},${padT + plotH}Z`;
    svg.append(el('path', { d: area }, { fill: `url(#${gid})` }));
    svg.append(el('path', { d: line, class: 'chart-line' }, { fill: 'none', stroke: 'var(--trend)', strokeWidth: '2', strokeLinejoin: 'round', strokeLinecap: 'round' }));
  }

  const [lx, ly] = coords[coords.length - 1];
  svg.append(el('circle', { cx: lx, cy: ly, r: 5 }, { fill: 'var(--trend)', stroke: 'var(--surface)', strokeWidth: '2' }));

  const cross = el('g', { visibility: 'hidden' });
  const hair = el('line', { y1: padT - 6, y2: padT + plotH + 6 }, { stroke: 'var(--muted)', strokeWidth: '1' });
  const dot = el('circle', { r: 5 }, { fill: 'var(--trend)', stroke: 'var(--surface)', strokeWidth: '2' });
  cross.append(hair, dot);
  svg.append(cross);

  let current = -1;
  const show = (i) => {
    if (i < 0) {
      current = -1;
      cross.setAttribute('visibility', 'hidden');
      onScrub?.(null);
      return;
    }
    current = i;
    const [cx, cy] = coords[i];
    hair.setAttribute('x1', cx);
    hair.setAttribute('x2', cx);
    dot.setAttribute('cx', cx);
    dot.setAttribute('cy', cy);
    cross.setAttribute('visibility', 'visible');
    onScrub?.(points[i]);
  };

  const nearest = (evt) => {
    const box = svg.getBoundingClientRect();
    const px = ((evt.clientX - box.left) / box.width) * width;
    let best = 0;
    for (let i = 1; i < coords.length; i++) {
      if (Math.abs(coords[i][0] - px) < Math.abs(coords[best][0] - px)) best = i;
    }
    return best;
  };

  svg.addEventListener('pointerdown', (e) => show(nearest(e)));
  svg.addEventListener('pointermove', (e) => show(nearest(e)));
  svg.addEventListener('pointerleave', () => show(-1));
  svg.addEventListener('pointercancel', () => show(-1));
  svg.addEventListener('blur', () => show(-1));
  svg.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') show(current < 0 ? coords.length - 1 : Math.max(0, current - 1));
    else if (e.key === 'ArrowRight') show(current < 0 ? coords.length - 1 : Math.min(coords.length - 1, current + 1));
    else if (e.key === 'Escape') show(-1);
    else return;
    e.preventDefault();
  });

  host.append(svg);
}

export function sparkline(points, { width = 72, height = 28 } = {}) {
  const svg = el('svg', { viewBox: `0 0 ${width} ${height}`, width, height, 'aria-hidden': 'true', class: 'spark' });
  if (points.length < 2) {
    svg.append(el('line', { x1: 2, x2: width - 2, y1: height / 2, y2: height / 2 }, { stroke: 'var(--rule)', strokeWidth: '2', strokeDasharray: '2 4', strokeLinecap: 'round' }));
    return svg;
  }
  const start = points[0].ts, span = points[points.length - 1].ts - start || 1;
  const d = points
    .map((p, i) => `${i ? 'L' : 'M'}${(2 + ((p.ts - start) / span) * (width - 4)).toFixed(1)},${(3 + ((10 - p.mood) / 9) * (height - 6)).toFixed(1)}`)
    .join('');
  svg.append(el('path', { d }, { fill: 'none', stroke: 'currentColor', strokeWidth: '2', strokeLinejoin: 'round', strokeLinecap: 'round' }));
  return svg;
}
