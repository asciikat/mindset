// STUB — replaced by the meds room build.
import { h, registerView } from '../core.js';
registerView('meds', { tab: 'meds', render: () => [h('header', { class: 'topbar' }, h('span', { class: 'brand', text: 'meds' })), h('p', { class: 'empty', text: 'Coming soon.' })] });
// Contract: a compact card for the Today screen when a dose is active today (or null).
export function medsCard() { return null; }
