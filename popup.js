/* popup.js – (delegates to background, shows pending messages, warms prechecks) */
/* eslint-env browser, webextensions */

/* ============================================================================
 * Keyboard shortcut display (dynamic, reflects chrome://extensions/shortcuts)
 * ==========================================================================*/
function formatShortcut(s) {
  if (!s) return "";
  return s
    .replaceAll("Command", "⌘")
    .replaceAll("Ctrl", "Ctrl")
    .replaceAll("Alt", "Alt")
    .replaceAll("Shift", "Shift");
}

function updateShortcutHints() {
  const s1 = document.getElementById("shortcut1");
  const s2 = document.getElementById("shortcut2");
  if (!s1 || !s2) return;

  chrome.commands.getAll((commands) => {
    const openCmd = commands.find((c) => c.name === "open_extension");
    const archiveCmd = commands.find((c) => c.name === "archive_current");

    s1.textContent = openCmd?.shortcut
      ? formatShortcut(openCmd.shortcut)
      : "Not set";

    s2.textContent = archiveCmd?.shortcut
      ? formatShortcut(archiveCmd.shortcut)
      : "Not set";
  });
}

/* ============================================================================
 * 1) Small utilities
 * ==========================================================================*/
function showMessageBox(message) {
  const msgBox = document.getElementById("messageBox");
  const msgText = document.getElementById("messageText");
  if (!msgBox || !msgText) return;
  msgText.textContent = message;
  msgBox.style.display = "flex";
}

function getCurrentTabInfo() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const t = tabs && tabs[0] ? tabs[0] : { url: "", title: "" };
      resolve({ url: t.url || "", title: t.title || "" });
    });
  });
}

const debounce = (fn, wait) => {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), wait);
  };
};

const isRTL = (str) => /[\u0590-\u05FF\u0600-\u06FF]/.test(str);

const getStorage = (key) =>
  new Promise((r) => chrome.storage.local.get(key, r));
const setStorage = (key, val) =>
  new Promise((r) => chrome.storage.local.set({ [key]: val }, r));

/* Normalize URLs so the same page (with utm params, ports, hash) dedupes */
function normalizeHistoryUrl(raw) {
  try {
    const u = new URL(raw);
    u.hash = "";
    u.hostname = u.hostname.toLowerCase();

    // drop common trackers
    const drop = [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "utm_id",
      "gclid",
      "fbclid",
      "mc_cid",
      "mc_eid",
      "gift",
    ];
    drop.forEach((k) => u.searchParams.delete(k));
    const qs = u.searchParams.toString();
    u.search = qs ? "?" + qs : "";

    // tidy path (keep "/" for root)
    const clean = u.pathname.replace(/\/+$/, "");
    u.pathname = clean || "/";

    // remove default ports
    if (
      (u.protocol === "https:" && u.port === "443") ||
      (u.protocol === "http:" && u.port === "80")
    )
      u.port = "";

    return u.toString();
  } catch {
    return raw;
  }
}

/* ============================================================================
 * 2) Archive.today quick precheck via background (optional warm-up)
 * ==========================================================================*/
function hasArchiveTodaySnapshotQuick(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { type: "archiveTodayPrecheck", url, timeoutMs },
      (res) => {
        if (chrome.runtime.lastError) return reject(chrome.runtime.lastError);
        if (!res || res.ok === false) {
          if (res?.error === "ARCHIVE_TODAY_TIMEOUT")
            return reject(new Error("ARCHIVE_TODAY_TIMEOUT"));
          return reject(new Error(res?.error || "PRECHECK_FAILED"));
        }
        resolve(res.hasSnapshot);
      }
    );
  });
}

/* Wayback quick precheck (via background) */
function hasWaybackSnapshotQuick(url, timeoutMs) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { type: "waybackPrecheck", url, timeoutMs },
      (res) => {
        if (chrome.runtime.lastError || !res || res.ok === false) {
          return resolve(null); // treat as unknown
        }
        resolve(res.hasSnapshot);
      }
    );
  });
}

/* ============================================================================
 * 3) History (render only; background saves)
 * ==========================================================================*/
async function loadHistory() {
  const { archiveHistory = [] } = await getStorage("archiveHistory");

  // Keep only the newest item per normalized URL
  const seen = new Set();
  const unique = [];
  for (const it of archiveHistory) {
    const key = it.normUrl || normalizeHistoryUrl(it.url);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push({ ...it, normUrl: key });
  }

  // Persist cleaned list and cap at 5
  if (unique.length !== archiveHistory.length) {
    await setStorage("archiveHistory", unique.slice(0, 5));
  }

  const list = document.getElementById("historyList");
  const section = document.getElementById("history-section");
  if (!list || !section) return;

  list.innerHTML = "";
  if (!unique.length) {
    section.style.display = "none";
    return;
  }

  section.style.display = "block";
  unique.slice(0, 5).forEach((item) => {
    const li = document.createElement("li");
    const a = document.createElement("a");
    a.href = item.archiveUrl;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.className = "history-item";

    const rtl = isRTL(item.title);
    if (rtl) {
      a.classList.add("rtl");
      a.dir = "rtl";
    }

    const dt = new Date(item.timestamp);
    const pad = (n) => String(n).padStart(2, "0");
    const hours = pad(dt.getHours());
    const minutes = pad(dt.getMinutes());

    const detailsDiv = document.createElement("div");
    detailsDiv.className = "history-item-content";

    const titleEl = document.createElement("span");
    titleEl.className = "title";
    titleEl.textContent = item.title;

    const meta = document.createElement("div");
    meta.className = "details";

    const svc = document.createElement("span");
    svc.className = "service"; // Add class for badge styling
    svc.textContent = item.service;

    const ts = document.createElement("span");
    ts.className = "timestamp"; // Add class for bolder timestamp
    ts.textContent = rtl
      ? `${dt.getDate()}/${dt.getMonth() + 1}/${String(dt.getFullYear()).slice(
          2
        )}, ${hours}:${minutes}`
      : `${hours}:${minutes}, ${dt.getDate()}/${dt.getMonth() + 1}/${String(
          dt.getFullYear()
        ).slice(2)}`;

    meta.appendChild(svc);
    meta.appendChild(ts);
    detailsDiv.appendChild(titleEl);
    detailsDiv.appendChild(meta);
    a.appendChild(detailsDiv);
    li.appendChild(a);
    list.appendChild(li);
  });
}

/* ============================================================================
 * 4) Pending message support (background opens popup after shortcut fail)
 * ==========================================================================*/
function messageFromErrorCode(code) {
  switch (code) {
    case "INVALID_URL":
      return "Invalid URL detected.";
    case "UNSUPPORTED_URL":
      return "Cannot archive this type of page.";
    case "NO_SNAPSHOT_ARCHIVE_TODAY":
      return "No snapshot available on Archive.Today for this URL.";
    case "NO_SNAPSHOT_WAYBACK":
      return "No archived version found in Wayback Machine for this URL.";
    case "WAYBACK_TIMEOUT":
      return "Request timed out. The archive service might be slow.";

    // NEW (hermetic) cases:
    case "ARCHIVE_TODAY_TIMEOUT":
    case "ARCHIVE_TODAY_UNCERTAIN":
    case "NETWORK_ERROR":
      return "Couldn't verify a snapshot on Archive.Today (blocked or timed out).";

    default:
      return "Service unavailable. Please try again or use the other archive option.";
  }
}

async function showPendingMessageIfAny() {
  const { byewallPendingMessage } = await getStorage("byewallPendingMessage");
  if (!byewallPendingMessage) return;

  const { code, time } = byewallPendingMessage;
  if (typeof time === "number" && Date.now() - time < 30_000) {
    const msg = messageFromErrorCode(code);
    showMessageBox(msg);
  }
  await setStorage("byewallPendingMessage", null);
}

/* ============================================================================
 * 5) Main
 * ==========================================================================*/
let warmPrecheckPromise = null;
let warmPrecheckUrl = null;

document.addEventListener("DOMContentLoaded", () => {
  // 0) Make Google Font apply (CSP-safe replacement for onload)
  const fl = document.getElementById("fontLink");
  if (fl) fl.media = "all";

  // 1) Close button for modal
  const btn = document.getElementById("messageBoxClose");
  if (btn)
    btn.addEventListener("click", () => {
      const box = document.getElementById("messageBox");
      if (box) box.style.display = "none";
    });

  // 2) Load history (render only)
  loadHistory();

  // 2.5) If background opened the popup due to a failed shortcut action, show its message
  showPendingMessageIfAny();

  // 3) Restore selected service
  getStorage("selectedArchiveServicePref").then(
    ({ selectedArchiveServicePref = "archiveToday" }) => {
      const radio = document.getElementById(
        selectedArchiveServicePref + "Radio"
      );
      if (radio) radio.checked = true;
    }
  );

  // 4) Remember preference
  document.querySelectorAll('input[name="archiveService"]').forEach((r) => {
    r.addEventListener("change", () =>
      setStorage("selectedArchiveServicePref", r.value)
    );
  });

  // 5) Tab behavior choice - restore and save preference
  (async () => {
    const { openInNewTab = true } = await getStorage("openInNewTab");
    const tabChoice = document.getElementById("tabChoice");
    if (!tabChoice) return;

    const options = tabChoice.querySelectorAll(".tab-option");

    function updateActive(isNewTab) {
      options.forEach((opt) => opt.classList.remove("active"));
      const activeOpt = tabChoice.querySelector(
        `.tab-option[data-value="${isNewTab ? "new" : "same"}"]`
      );
      if (activeOpt) activeOpt.classList.add("active");
    }

    options.forEach((opt) => {
      opt.addEventListener("click", () => {
        const isNewTab = opt.dataset.value === "new";
        setStorage("openInNewTab", isNewTab);
        updateActive(isNewTab);
      });
    });

    // initialize state on load
    updateActive(openInNewTab !== false);
  })();

  // 6) Dark mode toggle (mirror to localStorage to prevent next-open flash)
  (async () => {
    const { darkModeEnabled } = await getStorage("darkModeEnabled");
    const toggle = document.getElementById("darkModeToggle");

    if (darkModeEnabled) {
      document.body.classList.add("dark-mode");
      if (toggle) toggle.checked = true;
    }
    if (toggle) {
      toggle.addEventListener("change", () => {
        document.body.classList.toggle("dark-mode", toggle.checked);
        setStorage("darkModeEnabled", toggle.checked);
        try {
          localStorage.setItem("darkModeEnabled", String(toggle.checked));
        } catch {}
      });
    }
  })();

  // 7) Warm the pre-check on open for the selected service (shorter defaults)
  (async () => {
    const { url } = await getCurrentTabInfo();
    const { selectedArchiveServicePref = "archiveToday" } = await getStorage(
      "selectedArchiveServicePref"
    );
    try {
      warmPrecheckUrl = url;
      if (selectedArchiveServicePref === "archiveToday") {
        warmPrecheckPromise = hasArchiveTodaySnapshotQuick(url).catch(
          () => null
        );
      } else {
        warmPrecheckPromise = hasWaybackSnapshotQuick(url).catch(() => null);
      }
    } catch {
      warmPrecheckPromise = null;
    }
  })();

  // 8) Archive button -> delegate to background (shared logic)
  const archiveBtn = document.getElementById("archive");
  const doArchive = debounce(async () => {
    const original = archiveBtn.textContent;
    archiveBtn.disabled = true;
    archiveBtn.textContent = "Opening…";
    document.body.classList.add("busy");

    try {
      const res = await new Promise((resolve) =>
        chrome.runtime.sendMessage({ type: "performArchive" }, resolve)
      );

      if (!res || res.ok === false) {
        showMessageBox(messageFromErrorCode(res?.error));
        return;
      }

      // Background already saved to history & opened new/same tab; refresh list.
      await loadHistory();

      // If opened in same tab, close popup since user is navigating away
      if (!res.openedInNewTab) {
        window.close();
      }
    } finally {
      document.body.classList.remove("busy");
      archiveBtn.disabled = false;
      archiveBtn.textContent = original;
    }
  }, 50);

  // 9) Dynamic shortcut hints (reflects chrome://extensions/shortcuts)
  updateShortcutHints();

  if (archiveBtn) archiveBtn.addEventListener("click", doArchive);
});

/* ============================================================================
 * 6) Overlay style (dark-friendly)
 * ==========================================================================*/
const style = document.createElement("style");
style.textContent = `
  body.busy::before {
    content: '';
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, .15);
    cursor: progress;
    z-index: 9999;
  }
  .dark-mode.busy::before {
    background: rgba(0, 0, 0, .35);
  }
`;
document.head.appendChild(style);