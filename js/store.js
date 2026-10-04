// Everything lives in this browser's localStorage. Nothing is sent anywhere.

import { isValidData } from './logic.js';
import { sampleData } from './sample.js';

const KEY = 'mindset.v1';

export function emptyData() {
  return { version: 1, demo: false, checkins: [], worries: [] };
}

export function load(now = Date.now()) {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (isValidData(data)) return data;
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

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
