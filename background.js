// background.js — MV3 module glue: messages + keyboard shortcuts
import {
  performArchive,
  precheckArchiveToday,
  waybackHasSnapshotQuick,
} from "./archive-core.js";

// Messages from popup
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  // Archive.today quick precheck (used by popup warm-up)
  if (msg?.type === "archiveTodayPrecheck") {
    precheckArchiveToday(msg.url, msg.timeoutMs || undefined)
      .then(sendResponse)
      .catch((err) =>
        sendResponse({ ok: false, error: err?.message || String(err) })
      );
    return true; // async
  }

  // Wayback quick precheck (optional warm-up)
  if (msg?.type === "waybackPrecheck") {
    waybackHasSnapshotQuick(msg.url, msg.timeoutMs || undefined)
      .then((has) => sendResponse({ ok: true, hasSnapshot: !!has }))
      .catch((err) =>
        sendResponse({
          ok: false,
          error: err?.name === "AbortError" ? "WAYBACK_TIMEOUT" : "NETWORK_ERROR",
        })
      );
    return true; // async
  }

  // Run the single shared action
  if (msg?.type === "performArchive") {
    performArchive()
      .then(sendResponse)
      .catch((err) =>
        sendResponse({ ok: false, error: err?.message || "UNKNOWN_ERROR" })
      );
    return true; // async
  }
});

// Keyboard shortcuts
chrome.commands.onCommand.addListener(async (command) => {
  try {
    if (command === "open_extension") {
      await chrome.action.openPopup();
    } else if (command === "archive_current") {
      const res = await performArchive();
      if (!res || res.ok === false) {
        // Stash message for the popup and open it so the user sees feedback
        await chrome.storage.local.set({
          byewallPendingMessage: {
            code: res?.error || "UNKNOWN_ERROR",
            time: Date.now(),
          },
        });
        await chrome.action.openPopup();
      }
    }
  } catch {
    // Avoid unhandled rejections in the service worker
  }
});
