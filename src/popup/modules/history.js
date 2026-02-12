// history.js - History loading and clearing logic

import { STORAGE_KEYS } from "../../core/constants.js";
import { setStorage } from "../../utils/utils.js";
import {
  getHistory,
  clearHistory as clearHistoryStorage,
} from "../../storage/history-manager.js";
import { renderHistory, showToast } from "../../ui/popup-ui.js";

// State for undo functionality
let recentlyClearedHistory = null;
let undoTimeoutId = null;

/**
 * Load and render history items
 */
export async function loadHistory() {
  const historyItems = await getHistory();
  renderHistory(historyItems);
}

/**
 * Clear history with smooth animation and undo support
 */
export async function handleClearHistory() {
  // Get current history before clearing
  const currentHistory = await getHistory();

  if (!currentHistory || currentHistory.length === 0) {
    showToast("No history to clear", { type: "default", duration: 2000 });
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
  const historyItems = document.querySelectorAll(".history-item");
  historyItems.forEach((item, index) => {
    setTimeout(() => {
      item.classList.add("removing");
    }, index * 50); // Stagger the animation
  });

  // Wait for animation to complete, then clear
  setTimeout(
    async () => {
      await clearHistoryStorage();
      await loadHistory();

      // Show success toast with undo option
      showToast("History cleared", {
        type: "success",
        duration: 5000,
        onUndo: async () => {
          if (recentlyClearedHistory && recentlyClearedHistory.length > 0) {
            // Restore history by setting the storage directly
            await setStorage(
              STORAGE_KEYS.ARCHIVE_HISTORY,
              recentlyClearedHistory,
            );
            await loadHistory();
            showToast("History restored", { type: "success", duration: 2000 });

            // Clear the timeout since undo was used
            if (undoTimeoutId) {
              clearTimeout(undoTimeoutId);
              undoTimeoutId = null;
            }
            recentlyClearedHistory = null;
          }
        },
      });

      // Clear the undo buffer after toast duration
      undoTimeoutId = setTimeout(() => {
        recentlyClearedHistory = null;
        undoTimeoutId = null;
      }, 5000);
    },
    historyItems.length * 50 + 500,
  );
}
