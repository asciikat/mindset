// Boot: load every room (each registers its views), wire the tab bar, draw.

import { state, go, render, runAction, currentTab } from './core.js';
import './rooms/today.js';
import './rooms/mind.js';
import './rooms/overload.js';
import './rooms/kid.js';
import './rooms/meds.js';
import './rooms/learn.js';
import './rooms/settings.js';

for (const tab of document.querySelectorAll('.tab[data-view]')) {
  tab.addEventListener('click', () => go(tab.dataset.view));
}
document.getElementById('tab-overload').addEventListener('click', () => runAction('overload'));

let resizeTimer;
let lastWidth = window.innerWidth;
window.addEventListener('resize', () => {
  if (window.innerWidth === lastWidth) return; // ignore mobile URL-bar height changes
  lastWidth = window.innerWidth;
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(render, 150);
});

// Re-draw when the app comes back to the foreground so "due" prompts and timers are fresh.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && !document.querySelector('#layer .scrim')) render();
});

state.view = currentTab();
render();

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  try { navigator.serviceWorker.register('sw.js').catch(() => {}); } catch { /* not available here */ }
}
