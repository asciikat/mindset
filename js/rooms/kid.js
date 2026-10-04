// STUB — replaced by the kid room build.
import { h, registerView } from '../core.js';
registerView('kid', { tab: 'kid', render: () => [h('header', { class: 'topbar' }, h('span', { class: 'brand', text: 'kid' })), h('p', { class: 'empty', text: 'Coming soon.' })] });
// Contract: a compact card for the Today screen (or null).
export function kidCard() { return null; }
