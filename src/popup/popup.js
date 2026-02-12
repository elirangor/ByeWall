/* popup.js – main popup logic */

import { SERVICES, STORAGE_KEYS, HISTORY_CONFIG } from '../core/constants.js';
import { getStorage, setStorage, debounce, formatShortcut } from '../utils/utils.js';
import { getHistory, clearHistory } from '../storage/history-manager.js';
import { messageFromErrorCode } from '../core/error-messages.js';
import {
  renderHistory,
  showMessageBox,
  showConfirmBox,
  showToast,
  hideMessageBox,
  getCurrentTabInfo,
  updateShortcutHints,
} from '../ui/popup-ui.js';

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
 * Clear history with smooth animation and undo
 * ==========================================================================*/
let recentlyClearedHistory = null;
let undoTimeoutId = null;

async function handleClearHistory() {
  // Get current history before clearing
  const currentHistory = await getHistory();
  
  if (!currentHistory || currentHistory.length === 0) {
    showToast('No history to clear', { type: 'default', duration: 2000 });
    return;
  }
  
  // Clear any existing undo timeout
  if (undoTimeoutId) {
    clearTimeout(undoTimeoutId);
    undoTimeoutId = null;
  }
  
  // Store for potential undo (create a deep copy)
  recentlyClearedHistory = JSON.parse(JSON.stringify(currentHistory));
  
  // Animate history items out
  const historyItems = document.querySelectorAll('.history-item');
  historyItems.forEach((item, index) => {
    setTimeout(() => {
      item.classList.add('removing');
    }, index * 50); // Stagger the animation
  });
  
  // Wait for animation to complete, then clear
  setTimeout(async () => {
    await clearHistory();
    await loadHistory();
    
    // Show success toast with undo option
    showToast('History cleared', {
      type: 'success',
      duration: 5000,
      onUndo: async () => {
        if (recentlyClearedHistory && recentlyClearedHistory.length > 0) {
          // Restore history by setting the storage directly
          await setStorage(STORAGE_KEYS.ARCHIVE_HISTORY, recentlyClearedHistory);
          await loadHistory();
          showToast('History restored', { type: 'success', duration: 2000 });
          
          // Clear the timeout since undo was used
          if (undoTimeoutId) {
            clearTimeout(undoTimeoutId);
            undoTimeoutId = null;
          }
          recentlyClearedHistory = null;
        }
      }
    });
    
    // Clear the undo buffer after toast duration
    undoTimeoutId = setTimeout(() => {
      recentlyClearedHistory = null;
      undoTimeoutId = null;
    }, 5000);
  }, historyItems.length * 50 + 500);
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

  // Clear history button with new smooth animation
  const clearBtn = document.getElementById('clearHistory');
  if (clearBtn) clearBtn.addEventListener('click', handleClearHistory);

  // Dynamic shortcut hints with modern styling
  updateShortcutHints((shortcut) => {
    if (!shortcut) return '';
    // Split by + and wrap each key
    const keys = shortcut.split('+').map(key => {
      const formatted = key
        .replace('Command', '⌘')
        .replace('Ctrl', 'Ctrl')
        .replace('Alt', 'Alt')
        .replace('Shift', '⇧');
      return `<kbd>${formatted}</kbd>`;
    });
    // Join with styled plus sign
    return keys.join('<span class="shortcut-plus">+</span>');
  });
});