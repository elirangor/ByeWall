/* popup.js – main popup logic */

import { SERVICES, STORAGE_KEYS, HISTORY_CONFIG } from './constants.js';
import { getStorage, setStorage, debounce, formatShortcut } from './utils.js';
import { getHistory, clearHistory } from './history-manager.js';
import { messageFromErrorCode } from './error-messages.js';
import {
  renderHistory,
  showMessageBox,
  showConfirmBox,
  hideMessageBox,
  getCurrentTabInfo,
  updateShortcutHints,
} from './popup-ui.js';

/* ============================================================================
 * Precheck functions (communicate with background)
 * ==========================================================================*/
function hasArchiveTodaySnapshotQuick(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { type: 'archiveTodayPrecheck', url, timeoutMs },
      (res) => {
        if (chrome.runtime.lastError) return reject(chrome.runtime.lastError);
        if (!res || res.ok === false) {
          if (res?.error === 'ARCHIVE_TODAY_TIMEOUT')
            return reject(new Error('ARCHIVE_TODAY_TIMEOUT'));
          return reject(new Error(res?.error || 'PRECHECK_FAILED'));
        }
        resolve(res.hasSnapshot);
      }
    );
  });
}

function hasWaybackSnapshotQuick(url, timeoutMs) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { type: 'waybackPrecheck', url, timeoutMs },
      (res) => {
        if (chrome.runtime.lastError || !res || res.ok === false) {
          return resolve(null);
        }
        resolve(res.hasSnapshot);
      }
    );
  });
}

/* ============================================================================
 * Load and render history
 * ==========================================================================*/
async function loadHistory() {
  const historyItems = await getHistory();
  renderHistory(historyItems);
}

/* ============================================================================
 * Pending message support
 * ==========================================================================*/
async function showPendingMessageIfAny() {
  const { [STORAGE_KEYS.PENDING_MESSAGE]: byewallPendingMessage } = await getStorage(
    STORAGE_KEYS.PENDING_MESSAGE
  );
  if (!byewallPendingMessage) return;

  const { code, time } = byewallPendingMessage;
  if (typeof time === 'number' && Date.now() - time < HISTORY_CONFIG.MESSAGE_TIMEOUT) {
    const msg = messageFromErrorCode(code);
    showMessageBox(msg);
  }
  await setStorage(STORAGE_KEYS.PENDING_MESSAGE, null);
}

/* ============================================================================
 * Clear history with confirmation
 * ==========================================================================*/
async function handleClearHistory() {
  showConfirmBox('Are you sure you want to clear all archive history?', async () => {
    await clearHistory();
    await loadHistory();
    showMessageBox('History cleared successfully.');
  });
}

/* ============================================================================
 * Main initialization
 * ==========================================================================*/
let warmPrecheckPromise = null;
let warmPrecheckUrl = null;

document.addEventListener('DOMContentLoaded', () => {
  // Make Google Font apply (CSP-safe)
  const fl = document.getElementById('fontLink');
  if (fl) fl.media = 'all';

  // Close button for modal
  const btn = document.getElementById('messageBoxClose');
  if (btn) btn.addEventListener('click', hideMessageBox);

  // Load history
  loadHistory();

  // Show pending message if any
  showPendingMessageIfAny();

  // Restore selected service
  getStorage(STORAGE_KEYS.SELECTED_SERVICE).then(
    ({ [STORAGE_KEYS.SELECTED_SERVICE]: selectedArchiveServicePref = SERVICES.ARCHIVE_TODAY }) => {
      const radio = document.getElementById(selectedArchiveServicePref + 'Radio');
      if (radio) radio.checked = true;
    }
  );

  // Remember service preference
  document.querySelectorAll('input[name="archiveService"]').forEach((r) => {
    r.addEventListener('change', () =>
      setStorage(STORAGE_KEYS.SELECTED_SERVICE, r.value)
    );
  });

  // Tab behavior choice - restore and save preference
  (async () => {
    const { [STORAGE_KEYS.OPEN_IN_NEW_TAB]: openInNewTab = true } = await getStorage(
      STORAGE_KEYS.OPEN_IN_NEW_TAB
    );
    const tabChoice = document.getElementById('tabChoice');
    if (!tabChoice) return;

    const options = tabChoice.querySelectorAll('.tab-option');

    function updateActive(isNewTab) {
      options.forEach((opt) => opt.classList.remove('active'));
      const activeOpt = tabChoice.querySelector(
        `.tab-option[data-value="${isNewTab ? 'new' : 'same'}"]`
      );
      if (activeOpt) activeOpt.classList.add('active');
    }

    options.forEach((opt) => {
      opt.addEventListener('click', () => {
        const isNewTab = opt.dataset.value === 'new';
        setStorage(STORAGE_KEYS.OPEN_IN_NEW_TAB, isNewTab);
        updateActive(isNewTab);
      });
    });

    updateActive(openInNewTab !== false);
  })();

  // Dark mode toggle
  (async () => {
    const { [STORAGE_KEYS.DARK_MODE]: darkModeEnabled } = await getStorage(
      STORAGE_KEYS.DARK_MODE
    );
    const toggle = document.getElementById('darkModeToggle');

    if (darkModeEnabled) {
      document.body.classList.add('dark-mode');
      if (toggle) toggle.checked = true;
    }
    if (toggle) {
      toggle.addEventListener('change', () => {
        document.body.classList.toggle('dark-mode', toggle.checked);
        setStorage(STORAGE_KEYS.DARK_MODE, toggle.checked);
        try {
          localStorage.setItem(STORAGE_KEYS.DARK_MODE, String(toggle.checked));
        } catch {}
      });
    }
  })();

  // Warm the pre-check on open for the selected service
  (async () => {
    const { url } = await getCurrentTabInfo();
    const { [STORAGE_KEYS.SELECTED_SERVICE]: selectedArchiveServicePref = SERVICES.ARCHIVE_TODAY } =
      await getStorage(STORAGE_KEYS.SELECTED_SERVICE);
    try {
      warmPrecheckUrl = url;
      if (selectedArchiveServicePref === SERVICES.ARCHIVE_TODAY) {
        warmPrecheckPromise = hasArchiveTodaySnapshotQuick(url).catch(() => null);
      } else {
        warmPrecheckPromise = hasWaybackSnapshotQuick(url).catch(() => null);
      }
    } catch {
      warmPrecheckPromise = null;
    }
  })();

  // Archive button -> delegate to background
  const archiveBtn = document.getElementById('archive');
  const doArchive = debounce(async () => {
    const original = archiveBtn.textContent;
    archiveBtn.disabled = true;
    archiveBtn.textContent = 'Opening…';
    document.body.classList.add('busy');

    try {
      const res = await new Promise((resolve) =>
        chrome.runtime.sendMessage({ type: 'performArchive' }, resolve)
      );

      if (!res || res.ok === false) {
        showMessageBox(messageFromErrorCode(res?.error));
        return;
      }

      await loadHistory();

      // If opened in same tab, close popup
      if (!res.openedInNewTab) {
        window.close();
      }
    } finally {
      document.body.classList.remove('busy');
      archiveBtn.disabled = false;
      archiveBtn.textContent = original;
    }
  }, 50);

  if (archiveBtn) archiveBtn.addEventListener('click', doArchive);

  // Clear history button
  const clearBtn = document.getElementById('clearHistory');
  if (clearBtn) clearBtn.addEventListener('click', handleClearHistory);

  // Dynamic shortcut hints
  updateShortcutHints(formatShortcut);
});