// src/background/service-worker.js
import {
  performArchive,
  precheckArchiveToday,
  waybackHasSnapshotQuick,
} from "../core/archive-core.js";
import { STORAGE_KEYS, ERROR_CODES } from "../core/constants.js";
import { setStorage } from "../utils/utils.js";

// Messages from popup
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  // Archive.today quick precheck (used by popup warm-up)
  if (msg?.type === "archiveTodayPrecheck") {
    precheckArchiveToday(msg.url, msg.timeoutMs || undefined)
      .then(sendResponse)
      .catch((err) =>
        sendResponse({ ok: false, error: err?.message || String(err) }),
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
          error:
            err?.name === "AbortError"
              ? ERROR_CODES.WAYBACK_TIMEOUT
              : ERROR_CODES.NETWORK_ERROR,
        }),
      );
    return true; // async
  }

  // Run the single shared action
  if (msg?.type === "performArchive") {
    performArchive()
      .then(sendResponse)
      .catch((err) =>
        sendResponse({
          ok: false,
          error: err?.message || ERROR_CODES.UNKNOWN_ERROR,
        }),
      );
    return true; // async
  }
});

// Keyboard shortcuts
// Note: _execute_action (open popup) is handled natively by Chrome — no handler needed here.
chrome.commands.onCommand.addListener(async (command) => {
  console.log("[ByeWall Background] Command received:", command);
  try {
    if (command === "archive_current") {
      console.log("[ByeWall Background] Running performArchive from shortcut");
      const res = await performArchive();
      console.log("[ByeWall Background] performArchive result:", res);

      if (!res || res.ok === false) {
        console.log("[ByeWall Background] Failed, opening popup with error");
        await setStorage(STORAGE_KEYS.PENDING_MESSAGE, {
          code: res?.error || ERROR_CODES.UNKNOWN_ERROR,
          time: Date.now(),
        });
        await chrome.action.openPopup();
      } else {
        // Success — show green badge then step-fade out
        await chrome.action.setBadgeBackgroundColor({ color: "#34a853" });
        await chrome.action.setBadgeText({ text: "✓" });

setTimeout(async () => {
  const steps = ["✓", "·", ""];
  for (const text of steps) {
    await chrome.action.setBadgeText({ text });
    await new Promise((r) => setTimeout(r, 200));
  }
}, 2000);
      }
    }
  } catch (err) {
    console.error("[ByeWall Background] Error:", err);
  }
});