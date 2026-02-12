// utils.js — shared utility functions

import { TRACKING_PARAMS, UNSUPPORTED_PREFIXES } from '../core/constants.js';

/* ---------- Storage helpers ---------- */
export const getStorage = (key) =>
  new Promise((r) => chrome.storage.local.get(key, r));

export const setStorage = (key, val) =>
  new Promise((r) => chrome.storage.local.set({ [key]: val }, r));

/* ---------- URL validation ---------- */
export function isValidUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

export function isUnsupportedUrl(url) {
  return UNSUPPORTED_PREFIXES.some((p) => url.startsWith(p));
}

/* ---------- URL normalization ---------- */
export function normalizeHistoryUrl(raw) {
  try {
    const u = new URL(raw);
    u.hash = '';
    u.hostname = u.hostname.toLowerCase();
    
    TRACKING_PARAMS.forEach((k) => u.searchParams.delete(k));
    
    const qs = u.searchParams.toString();
    u.search = qs ? '?' + qs : '';
    
    const clean = u.pathname.replace(/\/+$/, '');
    u.pathname = clean || '/';
    
    if (
      (u.protocol === 'https:' && u.port === '443') ||
      (u.protocol === 'http:' && u.port === '80')
    )
      u.port = '';
    
    return u.toString();
  } catch {
    return raw;
  }
}

/* ---------- Text utilities ---------- */
export const isRTL = (str) => /[\u0590-\u05FF\u0600-\u06FF]/.test(str);

export const debounce = (fn, wait) => {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), wait);
  };
};

/* ---------- Keyboard shortcut formatting ---------- */
export function formatShortcut(s) {
  if (!s) return '';
  return s
    .replaceAll('Command', '⌘')
    .replaceAll('Ctrl', 'Ctrl')
    .replaceAll('Alt', 'Alt')
    .replaceAll('Shift', 'Shift');
}