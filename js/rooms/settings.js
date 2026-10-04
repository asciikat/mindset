// Settings: who you're planning for, your sleep need, backups, and the safety note.

import { isValidData } from '../logic.js';
import { emptyData, normalize } from '../store.js';
import { state, h, go, toast, render, persist, backButton, registerView } from '../core.js';

function profileCard() {
  const p = state.data.profile;
  const name = h('input', { type: 'text', id: 'kid-name', maxlength: '40', value: p.kidName || '', placeholder: 'Their first name', autocomplete: 'off' });
  const need = h('input', { type: 'number', id: 'sleep-need', min: '4', max: '12', step: '0.5', value: String(p.sleepNeed ?? 8), inputmode: 'decimal' });
  const saveProfile = () => {
    const n = Number(need.value);
    state.data.profile = { ...state.data.profile, kidName: name.value.trim(), sleepNeed: Number.isFinite(n) && n >= 4 && n <= 12 ? n : 8 };
    persist();
    render();
    toast('Saved');
  };
  return h('section', { class: 'card', 'aria-labelledby': 'profile-h' },
    h('span', { class: 'eyebrow', id: 'profile-h', text: 'About you two' }),
    h('label', { class: 'field', for: 'kid-name' }, h('span', { class: 'lbl', text: 'Your kid’s name' }), name,
      h('span', { class: 'fine', text: 'Used on the Kid tab. It stays on this device only.' })),
    h('label', { class: 'field', for: 'sleep-need' }, h('span', { class: 'lbl', text: 'Hours of sleep you need' }), need,
      h('span', { class: 'fine', text: 'Most adults need 7–9. The Today tab uses this to work out sleep debt.' })),
    h('button', { class: 'btn', type: 'button', onclick: saveProfile }, 'Save'));
}

function dataCard() {
  const fileInput = h('input', { type: 'file', id: 'import-file', accept: 'application/json,.json', class: 'visually-hidden' });
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      if (!isValidData(parsed)) throw new Error('shape');
      state.ui.pending = { kind: 'import', data: normalize({ ...parsed, demo: false }) };
    } catch {
      toast('That file isn’t a Mindset backup.');
    }
    render();
  });

  const json = () => JSON.stringify({ ...state.data, demo: false, exportedAt: new Date().toISOString() }, null, 2);
  const download = () => {
    const url = URL.createObjectURL(new Blob([json()], { type: 'application/json' }));
    const a = h('a', { href: url, download: `mindset-${new Date().toISOString().slice(0, 10)}.json` });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const copy = () => navigator.clipboard.writeText(json()).then(() => toast('Backup copied'), () => toast('Copy isn’t allowed here. Use Download.'));

  let confirmRow = null;
  const p = state.ui.pending;
  if (p?.kind === 'import') {
    const d = p.data;
    confirmRow = h('div', { class: 'banner' },
      h('span', {}, `Replace everything with the backup (${d.checkins.length} check-ins, ${d.body.states.length} body logs, ${d.meds.doses.length} doses)?`),
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn', type: 'button', onclick: () => { state.data = d; state.ui.pending = null; persist(); render(); toast('Backup imported'); } }, 'Replace'),
        h('button', { class: 'btn ghost', type: 'button', onclick: () => { state.ui.pending = null; render(); } }, 'Cancel')));
  } else if (p?.kind === 'wipe') {
    confirmRow = h('div', { class: 'banner' },
      h('span', {}, 'Delete everything, including your food and activity lists? This can’t be undone.'),
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn danger', type: 'button', onclick: () => { state.data = emptyData(); state.ui.pending = null; persist(); go('today'); toast('Everything deleted'); } }, 'Delete everything'),
        h('button', { class: 'btn ghost', type: 'button', onclick: () => { state.ui.pending = null; render(); } }, 'Cancel')));
  }

  return h('section', { class: 'card', 'aria-labelledby': 'data-h' },
    h('span', { class: 'eyebrow', id: 'data-h', text: 'Your data' }),
    h('p', { class: 'fine', text: 'Everything stays on this device. Nothing is uploaded. Back it up if you switch phones or clear your browser.' }),
    h('div', { class: 'btn-row' },
      h('button', { class: 'btn ghost', type: 'button', onclick: download }, 'Download backup'),
      h('button', { class: 'btn ghost', type: 'button', onclick: copy }, 'Copy backup'),
      h('label', { class: 'btn ghost', for: 'import-file', tabindex: '0', role: 'button', onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); } } }, 'Import backup'),
      fileInput),
    h('button', { class: 'text-btn danger-text', type: 'button', onclick: () => { state.ui.pending = { kind: 'wipe' }; render(); } }, 'Delete all data'),
    confirmRow);
}

function settingsView() {
  return [
    h('header', { class: 'topbar' }, backButton()),
    h('h1', { class: 'page-title', text: 'Settings' }),
    profileCard(),
    dataCard(),
    h('section', { class: 'card', 'aria-labelledby': 'safety-h' },
      h('span', { class: 'eyebrow', id: 'safety-h', text: 'If it gets too heavy' }),
      h('p', { text: 'Mindset is a tool for noticing and planning. It isn’t therapy or medical advice, and it can’t respond in an emergency.' }),
      h('p', {}, 'In Australia, call Lifeline on ', h('strong', { class: 'selectable', text: '13 11 14' }), ' or text ', h('strong', { class: 'selectable', text: '0477 13 11 14' }),
        '. In the US, call or text ', h('strong', { class: 'selectable', text: '988' }), '. Elsewhere, find a free line at ',
        h('a', { href: 'https://findahelpline.com', target: '_blank', rel: 'noopener' }, 'findahelpline.com'), '. If anyone is in danger, call your local emergency number.')),
  ];
}

registerView('settings', { tab: 'today', render: () => settingsView() });
