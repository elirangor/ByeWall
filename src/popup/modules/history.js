// history.js - History loading and clearing logic

import { STORAGE_KEYS } from "../../core/constants.js";
import { setStorage } from "../../utils/utils.js";
import {
  getHistory,
  clearHistory as clearHistoryStorage,
  deleteHistoryItem,
  restoreHistoryItem,
} from "../../storage/history-manager.js";
import { renderHistory, showToast } from "../../ui/popup-ui.js";

// State for undo functionality
let recentlyClearedHistory = null;
let undoTimeoutId = null;

// State for individual item deletion
let recentlyDeletedItem = null;
let recentlyDeletedIndex = null;
let deleteUndoTimeoutId = null;

/**
 * Load and render history items with delete handlers
 */
export async function loadHistory() {
  const historyItems = await getHistory();
  renderHistory(historyItems, handleDeleteItem);
}

/**
 * Handle deletion of a single history item
 */
async function handleDeleteItem(item, index) {
  // Clear any existing delete undo timeout
  if (deleteUndoTimeoutId) {
    clearTimeout(deleteUndoTimeoutId);
    deleteUndoTimeoutId = null;
  }

  // Store for potential undo
  recentlyDeletedItem = JSON.parse(JSON.stringify(item));
  recentlyDeletedIndex = index;

  // Animate the item out
  const historyList = document.getElementById("historyList");
  if (historyList) {
    const listItem = historyList.children[index];
    if (listItem) {
      const historyItem = listItem.querySelector(".history-item");
      if (historyItem) {
        historyItem.classList.add("removing");
      }
    }
  }

  // Wait for animation, then delete
  setTimeout(async () => {
    await deleteHistoryItem(index);
    await loadHistory();

    // Show success toast with undo option
    showToast("Item deleted", {
      type: "success",
      duration: 5000,
      onUndo: async () => {
        if (recentlyDeletedItem && recentlyDeletedIndex !== null) {
          // Restore the item
          await restoreHistoryItem(recentlyDeletedItem, recentlyDeletedIndex);
          
          // Reload history
          await loadHistory();
          
          // Add restoring animation class to the newly restored item
          const historyList = document.getElementById("historyList");
          if (historyList && historyList.children[recentlyDeletedIndex]) {
            const restoredListItem = historyList.children[recentlyDeletedIndex];
            const historyItem = restoredListItem.querySelector(".history-item");
            if (historyItem) {
              historyItem.classList.add("restoring");
              
              // Remove the class after animation completes
              setTimeout(() => {
                historyItem.classList.remove("restoring");
              }, 400); // Match animation duration
            }
          }
          
          showToast("Item restored", { type: "success", duration: 2000 });

          // Clear the timeout since undo was used
          if (deleteUndoTimeoutId) {
            clearTimeout(deleteUndoTimeoutId);
            deleteUndoTimeoutId = null;
          }
          recentlyDeletedItem = null;
          recentlyDeletedIndex = null;
        }
      },
    });

    // Clear the undo buffer after toast duration
    deleteUndoTimeoutId = setTimeout(() => {
      recentlyDeletedItem = null;
      recentlyDeletedIndex = null;
      deleteUndoTimeoutId = null;
    }, 5000);
  }, 500); // Match animation duration
}

/**
 * Clear all history with smooth animation and undo support
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
            
            // Add restoring animation to all restored items
            const historyList = document.getElementById("historyList");
            if (historyList) {
              const items = historyList.querySelectorAll(".history-item");
              items.forEach((item, index) => {
                setTimeout(() => {
                  item.classList.add("restoring");
                  
                  // Remove the class after animation completes
                  setTimeout(() => {
                    item.classList.remove("restoring");
                  }, 400); // Match animation duration
                }, index * 50); // Stagger the animation
              });
            }
            
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