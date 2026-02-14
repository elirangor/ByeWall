// ui-handlers.js - Event handlers and UI interactions

import { SERVICES, STORAGE_KEYS } from "../../core/constants.js";
import { getStorage, setStorage, debounce } from "../../utils/utils.js";
import { messageFromErrorCode } from "../../core/error-messages.js";
import {
  showMessageBox,
  hideMessageBox,
  getCurrentTabInfo,
} from "../../ui/popup-ui.js";
import { loadHistory } from "./history.js";
import { warmPrecheck } from "./precheck.js";

// State for warm precheck
let warmPrecheckPromise = null;
let warmPrecheckUrl = null;

/**
 * Initialize font loading (CSP-safe)
 */
export function initializeFonts() {
  const fl = document.getElementById("fontLink");
  if (fl) fl.media = "all";
}

/**
 * Initialize modal close button
 */
export function initializeModalClose() {
  const btn = document.getElementById("messageBoxClose");
  if (btn) btn.addEventListener("click", hideMessageBox);
}

/**
 * Restore and set up archive service selection
 */
export async function initializeServiceSelection() {
  // Restore selected service
  const {
    [STORAGE_KEYS.SELECTED_SERVICE]:
      selectedArchiveServicePref = SERVICES.ARCHIVE_TODAY,
  } = await getStorage(STORAGE_KEYS.SELECTED_SERVICE);

  const radio = document.getElementById(selectedArchiveServicePref + "Radio");
  if (radio) radio.checked = true;

  // Remember service preference on change
  document.querySelectorAll('input[name="archiveService"]').forEach((r) => {
    r.addEventListener("change", () =>
      setStorage(STORAGE_KEYS.SELECTED_SERVICE, r.value),
    );
  });
}

/**
 * Initialize tab behavior selection (new tab vs same tab)
 */
export async function initializeTabBehavior() {
  const { [STORAGE_KEYS.OPEN_IN_NEW_TAB]: openInNewTab = true } =
    await getStorage(STORAGE_KEYS.OPEN_IN_NEW_TAB);

  const tabChoice = document.getElementById("tabChoice");
  if (!tabChoice) return;

  const options = tabChoice.querySelectorAll(".tab-option");

  function updateActive(isNewTab) {
    options.forEach((opt) => opt.classList.remove("active"));
    const activeOpt = tabChoice.querySelector(
      `.tab-option[data-value="${isNewTab ? "new" : "same"}"]`,
    );
    if (activeOpt) activeOpt.classList.add("active");
  }

  options.forEach((opt) => {
    opt.addEventListener("click", () => {
      const isNewTab = opt.dataset.value === "new";
      setStorage(STORAGE_KEYS.OPEN_IN_NEW_TAB, isNewTab);
      updateActive(isNewTab);
    });
  });

  updateActive(openInNewTab !== false);
}

/**
 * Initialize dark mode toggle - applies to html element
 */
export async function initializeDarkMode() {
  const { [STORAGE_KEYS.DARK_MODE]: darkModeEnabled } = await getStorage(
    STORAGE_KEYS.DARK_MODE,
  );

  const toggle = document.getElementById("darkModeToggle");

  // Set initial state SYNCHRONOUSLY before enabling transitions
  if (darkModeEnabled) {
    document.documentElement.classList.add("dark-mode");
    if (toggle) {
      toggle.checked = true;
      // Force a reflow to ensure the checked state is applied immediately
      toggle.offsetHeight;
    }
  }

  // Enable transitions AFTER initial state is set
  // Use setTimeout to ensure it happens after the current render frame
  setTimeout(() => {
    document.body.classList.add("loaded");
  }, 50); // Small delay to ensure toggle is fully rendered in checked state

  if (toggle) {
    toggle.addEventListener("change", () => {
      // Apply to html element for instant effect
      document.documentElement.classList.toggle("dark-mode", toggle.checked);
      setStorage(STORAGE_KEYS.DARK_MODE, toggle.checked);
      try {
        localStorage.setItem(STORAGE_KEYS.DARK_MODE, String(toggle.checked));
      } catch {}
    });
  }
}

/**
 * Warm the pre-check on popup open for the selected service
 */
export async function initializeWarmPrecheck() {
  const { url } = await getCurrentTabInfo();
  const {
    [STORAGE_KEYS.SELECTED_SERVICE]:
      selectedArchiveServicePref = SERVICES.ARCHIVE_TODAY,
  } = await getStorage(STORAGE_KEYS.SELECTED_SERVICE);

  warmPrecheckUrl = url;
  warmPrecheckPromise = warmPrecheck(url, selectedArchiveServicePref);
}

/**
 * Initialize archive button click handler
 */
export function initializeArchiveButton() {
  const archiveBtn = document.getElementById("archive");
  if (!archiveBtn) return;

  const doArchive = debounce(async () => {
    const original = archiveBtn.textContent;
    archiveBtn.disabled = true;
    archiveBtn.textContent = "Opening…";
    document.body.classList.add("busy");

    try {
      const res = await new Promise((resolve) =>
        chrome.runtime.sendMessage({ type: "performArchive" }, resolve),
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
      document.body.classList.remove("busy");
      archiveBtn.disabled = false;
      archiveBtn.textContent = original;
    }
  }, 50);

  archiveBtn.addEventListener("click", doArchive);
}