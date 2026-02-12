// history-manager.js — archive history management

import { STORAGE_KEYS, HISTORY_CONFIG } from '../core/constants.js';
import { normalizeHistoryUrl, getStorage, setStorage } from '../utils/utils.js';

/**
 * Save an archive entry to history
 */
export async function saveToHistory(title, url, service, archiveUrl) {
  const norm = normalizeHistoryUrl(url);
  const { [STORAGE_KEYS.ARCHIVE_HISTORY]: archiveHistory = [] } = await getStorage(
    STORAGE_KEYS.ARCHIVE_HISTORY
  );
  
  const filtered = archiveHistory.filter(
    (it) => (it.normUrl || normalizeHistoryUrl(it.url)) !== norm
  );
  
  filtered.unshift({
    title,
    url,
    normUrl: norm,
    service,
    archiveUrl,
    timestamp: Date.now(),
  });
  
  await setStorage(STORAGE_KEYS.ARCHIVE_HISTORY, filtered.slice(0, HISTORY_CONFIG.MAX_ITEMS));
}

/**
 * Get deduplicated history items
 */
export async function getHistory() {
  const { [STORAGE_KEYS.ARCHIVE_HISTORY]: archiveHistory = [] } = await getStorage(
    STORAGE_KEYS.ARCHIVE_HISTORY
  );
  
  // Keep only the newest item per normalized URL
  const seen = new Set();
  const unique = [];
  
  for (const it of archiveHistory) {
    const key = it.normUrl || normalizeHistoryUrl(it.url);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push({ ...it, normUrl: key });
  }
  
  // Persist cleaned list if duplicates were found
  if (unique.length !== archiveHistory.length) {
    await setStorage(STORAGE_KEYS.ARCHIVE_HISTORY, unique.slice(0, HISTORY_CONFIG.MAX_ITEMS));
  }
  
  return unique.slice(0, HISTORY_CONFIG.MAX_ITEMS);
}

/**
 * Clear all history
 */
export async function clearHistory() {
  await setStorage(STORAGE_KEYS.ARCHIVE_HISTORY, []);
}