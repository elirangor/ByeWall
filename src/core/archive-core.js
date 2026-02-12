// archive-core.js — shared logic for ByeWall (MV3)

import {
  TIMEOUTS,
  SERVICES,
  SERVICE_NAMES,
  STORAGE_KEYS,
  ARCHIVE_URLS,
  ERROR_CODES,
} from './constants.js';
import {
  isValidUrl,
  isUnsupportedUrl,
  getStorage,
} from '../utils/utils.js';
import { saveToHistory } from '../storage/history-manager.js';

/* ---------- Archive.today precheck (HERMETIC) ---------- */
/**
 * Hermetic rule:
 * - If we end up STILL on /newest/ after fetch-follow redirects => treat as NO snapshot.
 * - If we are redirected away from /newest/ => snapshot exists, finalUrl is the snapshot.
 * - If request fails/timeouts => ok:false (uncertain) and we do NOT open.
 */
export async function precheckArchiveToday(
  targetUrl,
  timeoutMs = TIMEOUTS.ARCHIVE_TODAY_PRECHECK
) {
  if (!/^https?:\/\//i.test(targetUrl)) {
    return { ok: true, hasSnapshot: false, reason: 'unsupported' };
  }

  const checkedUrl = `${ARCHIVE_URLS.ARCHIVE_TODAY_BASE}${ARCHIVE_URLS.ARCHIVE_TODAY_NEWEST}${targetUrl}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const resp = await fetch(checkedUrl, {
      signal: ctrl.signal,
      redirect: 'follow',
      cache: 'no-store',
      credentials: 'omit',
      headers: { Accept: 'text/html' },
    });

    if (resp.status === 404) {
      return {
        ok: true,
        hasSnapshot: false,
        reason: 'not-found',
        checkedUrl,
        finalUrl: resp.url || checkedUrl,
      };
    }

    const finalUrl = resp.url || checkedUrl;

    // If we're still on /newest/ => hermetically treat as "no snapshot"
    if (finalUrl.includes('/' + ARCHIVE_URLS.ARCHIVE_TODAY_NEWEST)) {
      return {
        ok: true,
        hasSnapshot: false,
        reason: 'no-redirect',
        checkedUrl,
        finalUrl,
      };
    }

    // Redirected away from /newest/ => snapshot exists
    return { ok: true, hasSnapshot: true, checkedUrl, finalUrl };
  } catch (err) {
    if (err?.name === 'AbortError') {
      return { ok: false, error: ERROR_CODES.ARCHIVE_TODAY_TIMEOUT };
    }
    return { ok: false, error: ERROR_CODES.NETWORK_ERROR };
  } finally {
    clearTimeout(timer);
  }
}

/* ---------- Wayback quick precheck (fast) ---------- */
export async function waybackHasSnapshotQuick(
  url,
  timeoutMs = TIMEOUTS.WAYBACK_PRECHECK
) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const availUrl = `${ARCHIVE_URLS.WAYBACK_AVAILABLE}?url=${encodeURIComponent(url)}`;
    const resp = await fetch(availUrl, {
      signal: ctrl.signal,
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      redirect: 'follow',
      credentials: 'omit',
    });
    clearTimeout(timer);
    if (!resp.ok) return false;
    const data = await resp.json();
    const closest = data?.archived_snapshots?.closest;
    return !!(closest && closest.available && closest.url);
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

/* ---------- Wayback full lookup (slower, but capped) ---------- */
async function getLatestWaybackSnapshot(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUTS.WAYBACK_FULL);

  try {
    const cdxUrl = `${ARCHIVE_URLS.WAYBACK_CDX}?url=${encodeURIComponent(
      url
    )}&limit=1&sort=reverse`;
    const cdxResp = await fetch(cdxUrl, {
      signal: ctrl.signal,
      headers: { Accept: 'text/plain' },
    });
    if (cdxResp.ok) {
      const text = (await cdxResp.text()).trim();
      const line = text.split('\n')[0] || '';
      const parts = line.split(' ');
      if (parts.length >= 2) {
        const ts = parts[1];
        clearTimeout(timer);
        return `${ARCHIVE_URLS.WAYBACK_WEB}${ts}/${url}`;
      }
    }

    const availUrl = `${ARCHIVE_URLS.WAYBACK_AVAILABLE}?url=${encodeURIComponent(url)}`;
    const availResp = await fetch(availUrl, {
      signal: ctrl.signal,
      headers: { Accept: 'application/json' },
    });
    clearTimeout(timer);
    if (!availResp.ok) throw new Error(`HTTP ${availResp.status}`);

    const data = await availResp.json();
    const snapshot = data.archived_snapshots && data.archived_snapshots.closest;
    return snapshot && snapshot.available ? snapshot.url : null;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

/* ---------- The single action used by popup & shortcuts ---------- */
export async function performArchive() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = tab?.url || '';
  const title = tab?.title || '';
  const currentTabId = tab?.id;

  if (!isValidUrl(url)) {
    return { ok: false, error: ERROR_CODES.INVALID_URL };
  }
  if (isUnsupportedUrl(url)) {
    return { ok: false, error: ERROR_CODES.UNSUPPORTED_URL };
  }

  const {
    [STORAGE_KEYS.SELECTED_SERVICE]: selectedArchiveServicePref = SERVICES.ARCHIVE_TODAY,
    [STORAGE_KEYS.OPEN_IN_NEW_TAB]: openInNewTab = true,
  } = await getStorage([STORAGE_KEYS.SELECTED_SERVICE, STORAGE_KEYS.OPEN_IN_NEW_TAB]);

  let archiveUrl = null;

  if (selectedArchiveServicePref === SERVICES.ARCHIVE_TODAY) {
    // HERMETIC with RETRY:
    let pre = await precheckArchiveToday(url);

    // Retry once on timeout (common on first keyboard shortcut attempt)
    if (!pre.ok && pre.error === ERROR_CODES.ARCHIVE_TODAY_TIMEOUT) {
      console.log('[ByeWall] Archive.Today timeout on first attempt, retrying with longer timeout...');
      pre = await precheckArchiveToday(url, TIMEOUTS.ARCHIVE_TODAY_PRECHECK + TIMEOUTS.ARCHIVE_TODAY_RETRY_EXTRA);
    }

    if (!pre.ok) {
      return {
        ok: false,
        error: pre.error || ERROR_CODES.ARCHIVE_TODAY_UNCERTAIN,
      };
    }

    if (pre.hasSnapshot !== true) {
      return { ok: false, error: ERROR_CODES.NO_SNAPSHOT_ARCHIVE_TODAY };
    }

    archiveUrl = pre.finalUrl;
  } else {
    // Wayback: quick precheck. If "no", exit early.
    try {
      const has = await waybackHasSnapshotQuick(url);
      if (has === false) {
        return { ok: false, error: ERROR_CODES.NO_SNAPSHOT_WAYBACK };
      }
    } catch {
      // precheck failed/timeout—continue to full lookup just in case
    }
    try {
      archiveUrl = await getLatestWaybackSnapshot(url);
      if (!archiveUrl) return { ok: false, error: ERROR_CODES.NO_SNAPSHOT_WAYBACK };
    } catch (e) {
      return {
        ok: false,
        error: e?.name === 'AbortError' ? ERROR_CODES.WAYBACK_TIMEOUT : ERROR_CODES.WAYBACK_ERROR,
      };
    }
  }

  await saveToHistory(
    title,
    url,
    SERVICE_NAMES[selectedArchiveServicePref],
    archiveUrl
  );

  // Handle tab opening based on user preference
  if (openInNewTab) {
    await chrome.tabs.create({
      url: archiveUrl,
      index: tab.index + 1,
    });
  } else {
    // Navigate in same tab while preserving history
    try {
      await chrome.scripting.executeScript({
        target: { tabId: currentTabId },
        func: (archiveUrl) => {
          window.history.pushState(null, '', window.location.href);
          window.location.href = archiveUrl;
        },
        args: [archiveUrl],
      });
    } catch (err) {
      console.warn('Failed to use history navigation, falling back:', err);
      await chrome.tabs.update(currentTabId, { url: archiveUrl });
    }
  }

  return { ok: true, archiveUrl, openedInNewTab: openInNewTab };
}