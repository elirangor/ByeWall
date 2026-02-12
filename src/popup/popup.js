/* popup.js – main popup initialization and coordination */

// Module imports
import { loadHistory, handleClearHistory } from "./modules/history.js";
import { showPendingMessageIfAny } from "./modules/pending-messages.js";
import { initializeShortcutHints } from "./modules/shortcuts.js";
import {
  initializeFonts,
  initializeModalClose,
  initializeServiceSelection,
  initializeTabBehavior,
  initializeDarkMode,
  initializeWarmPrecheck,
  initializeArchiveButton,
} from "./modules/ui-handlers.js";

/* ============================================================================
 * Main initialization - runs when DOM is ready
 * ==========================================================================*/
document.addEventListener("DOMContentLoaded", async () => {
  // Initialize fonts (CSP-safe)
  initializeFonts();

  // Initialize modal close button
  initializeModalClose();

  // Load and display history
  await loadHistory();

  // Show any pending error messages from background script
  await showPendingMessageIfAny();

  // Initialize archive service selection (Archive.Today vs Wayback)
  await initializeServiceSelection();

  // Initialize tab behavior selection (new tab vs same tab)
  await initializeTabBehavior();

  // Initialize dark mode toggle
  await initializeDarkMode();

  // Warm up the precheck for faster archive opening
  await initializeWarmPrecheck();

  // Initialize the main archive button
  initializeArchiveButton();

  // Initialize clear history button
  const clearBtn = document.getElementById("clearHistory");
  if (clearBtn) {
    clearBtn.addEventListener("click", handleClearHistory);
  }

  // Initialize keyboard shortcut hints with symbols
  initializeShortcutHints();
});