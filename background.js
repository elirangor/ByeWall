// background.js — MV3 module glue: messages + keyboard shortcuts

import {
  performArchive,
  precheckArchiveToday,
  waybackHasSnapshotQuick,
} from './archive-core.js';
import { STORAGE_KEYS, ERROR_CODES } from './constants.js';
import { setStorage } from './utils.js';

// Messages from popup
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  // Archive.today quick precheck (used by popup warm-up)
  if (msg?.type === 'archiveTodayPrecheck') {
    precheckArchiveToday(msg.url, msg.timeoutMs || undefined)
      .then(sendResponse)
      .catch((err) =>
        sendResponse({ ok: false, error: err?.message || String(err) })
      );
    return true; // async
  }

  // Wayback quick precheck (optional warm-up)
  if (msg?.type === 'waybackPrecheck') {
    waybackHasSnapshotQuick(msg.url, msg.timeoutMs || undefined)
      .then((has) => sendResponse({ ok: true, hasSnapshot: !!has }))
      .catch((err) =>
        sendResponse({
          ok: false,
          error: err?.name === 'AbortError' ? ERROR_CODES.WAYBACK_TIMEOUT : ERROR_CODES.NETWORK_ERROR,
        })
      );
    return true; // async
  }

  // Run the single shared action
  if (msg?.type === 'performArchive') {
    performArchive()
      .then(sendResponse)
      .catch((err) =>
        sendResponse({ ok: false, error: err?.message || ERROR_CODES.UNKNOWN_ERROR })
      );
    return true; // async
  }
});

// Keyboard shortcuts
chrome.commands.onCommand.addListener(async (command) => {
  console.log('[ByeWall Background] Command received:', command);
  try {
    if (command === 'open_extension') {
      const wins = await chrome.windows.getAll({ populate: false });
      const hasNormalWin = wins.some((w) => w.type === 'normal');
      if (!hasNormalWin) return;

      try {
        await chrome.action.openPopup();
      } catch (e) {
        console.debug('[ByeWall Background] openPopup failed:', e?.message || e);
      }
    } else if (command === 'archive_current') {
      console.log('[ByeWall Background] Running performArchive from shortcut');
      const res = await performArchive();
      console.log('[ByeWall Background] performArchive result:', res);
      if (!res || res.ok === false) {
        console.log('[ByeWall Background] Failed, opening popup with error');
        // Stash message for the popup and open it so the user sees feedback
        await setStorage(STORAGE_KEYS.PENDING_MESSAGE, {
          code: res?.error || ERROR_CODES.UNKNOWN_ERROR,
          time: Date.now(),
        });
        await chrome.action.openPopup();
      }
    }
  } catch (err) {
    console.error('[ByeWall Background] Error:', err);
  }
});