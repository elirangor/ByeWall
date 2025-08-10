/* popup.js – ByeWall v1.7.3 (CSP-safe, faster pre-check, deduped history) */
/* eslint-env browser, webextensions */

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

function isValidUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function isUnsupportedUrl(url) {
  const unsupported = [
    "chrome://",
    "chrome-extension://",
    "edge://",
    "edge-extension://",
    "about:",
    "file://",
    "moz-extension://",
    "opera://"
  ];
  return unsupported.some((p) => url.startsWith(p));
}

const debounce = (fn, wait) => {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), wait);
  };
};

const isRTL = (str) => /[\u0590-\u05FF\u0600-\u06FF]/.test(str);

const getStorage = (key) => new Promise((r) => chrome.storage.local.get(key, r));
const setStorage = (key, val) => new Promise((r) => chrome.storage.local.set({ [key]: val }, r));

/* Normalize URLs so the same page (with utm params, ports, hash) dedupes */
function normalizeHistoryUrl(raw) {
  try {
    const u = new URL(raw);
    u.hash = "";
    u.hostname = u.hostname.toLowerCase();

    // drop common trackers
    const drop = ["utm_source","utm_medium","utm_campaign","utm_term","utm_content","utm_id","gclid","fbclid","mc_cid","mc_eid"];
    drop.forEach((k) => u.searchParams.delete(k));
    const qs = u.searchParams.toString();
    u.search = qs ? "?" + qs : "";

    // tidy path (keep "/" for root)
    const clean = u.pathname.replace(/\/+$/,"");
    u.pathname = clean || "/";

    // remove default ports
    if ((u.protocol === "https:" && u.port === "443") || (u.protocol === "http:" && u.port === "80")) u.port = "";

    return u.toString();
  } catch {
    return raw;
  }
}

/* ============================================================================
 * 2) Archive.today quick pre-check via background (message-based)
 * ==========================================================================*/
function hasArchiveTodaySnapshotQuick(url, timeoutMs = 1000) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { type: "archiveTodayPrecheck", url, timeoutMs },
      (res) => {
        if (chrome.runtime.lastError) return reject(chrome.runtime.lastError);
        if (!res || res.ok === false) {
          if (res?.error === "ARCHIVE_TODAY_TIMEOUT") return reject(new Error("ARCHIVE_TODAY_TIMEOUT"));
          return reject(new Error(res?.error || "PRECHECK_FAILED"));
        }
        resolve(res.hasSnapshot);
      }
    );
  });
}

/* ============================================================================
 * 3) History (dedup on save, keep newest only)
 * ==========================================================================*/
async function saveToHistory(title, url, service, archiveUrl) {
  const norm = normalizeHistoryUrl(url);
  const { archiveHistory = [] } = await getStorage("archiveHistory");

  // Remove older entries for the same normalized URL
  const filtered = archiveHistory.filter(
    (it) => (it.normUrl || normalizeHistoryUrl(it.url)) !== norm
  );

  // Add fresh entry at the top
  filtered.unshift({
    title,
    url,
    normUrl: norm,
    service,
    archiveUrl,
    timestamp: Date.now()
  });

  await setStorage("archiveHistory", filtered.slice(0, 5));
  loadHistory();
}

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
    svc.textContent = item.service;

    const ts = document.createElement("span");
    ts.textContent = rtl
      ? `${dt.getDate()}/${dt.getMonth() + 1}/${String(dt.getFullYear()).slice(2)}, ${hours}:${minutes}`
      : `${hours}:${minutes}, ${dt.getDate()}/${dt.getMonth() + 1}/${String(dt.getFullYear()).slice(2)}`;

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
 * 4) Wayback helper
 * ==========================================================================*/
async function getLatestWaybackSnapshot(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);

  try {
    const cdxUrl = `https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(url)}&limit=1&sort=reverse`;
    const cdxResp = await fetch(cdxUrl, { signal: ctrl.signal, headers: { Accept: "text/plain" } });
    if (cdxResp.ok) {
      const text = (await cdxResp.text()).trim();
      const line = text.split("\n")[0] || "";
      const parts = line.split(" ");
      if (parts.length >= 2) {
        const ts = parts[1];
        clearTimeout(timer);
        return `https://web.archive.org/web/${ts}/${url}`;
      }
    }

    const availUrl = `https://archive.org/wayback/available?url=${encodeURIComponent(url)}`;
    const availResp = await fetch(availUrl, { signal: ctrl.signal, headers: { Accept: "application/json" } });
    clearTimeout(timer);
    if (!availResp.ok) throw new Error(`HTTP ${availResp.status}`);

    const data = await availResp.json();
    const snapshot = data.archived_snapshots && data.archived_snapshots.closest;
    return snapshot && snapshot.available ? snapshot.url : null;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
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
  if (btn) btn.addEventListener("click", () => {
    const box = document.getElementById("messageBox");
    if (box) box.style.display = "none";
  });

  // 2) Load history (dedup happens inside)
  loadHistory();

  // 3) Restore selected service
  getStorage("selectedArchiveServicePref").then(({ selectedArchiveServicePref = "archiveToday" }) => {
    const radio = document.getElementById(selectedArchiveServicePref + "Radio");
    if (radio) radio.checked = true;
  });

  // 4) Remember preference
  document.querySelectorAll('input[name="archiveService"]').forEach((r) => {
    r.addEventListener("change", () => setStorage("selectedArchiveServicePref", r.value));
  });

  // 5) Dark mode toggle (mirror to localStorage to prevent next-open flash)
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
        try { localStorage.setItem("darkModeEnabled", String(toggle.checked)); } catch {}
      });
    }
  })();

  // 6) Warm the Archive.today pre-check on open
  (async () => {
    const { url } = await getCurrentTabInfo();
    if (isValidUrl(url) && !isUnsupportedUrl(url)) {
      warmPrecheckUrl = url;
      warmPrecheckPromise = hasArchiveTodaySnapshotQuick(url, 1000).catch(() => null);
    }
  })();

  // 7) Archive button with tighter debounce
  const archiveBtn = document.getElementById("archive");
  let lastRequest = 0;
  const MIN_REQUEST_INTERVAL = 2000;

  const doArchive = debounce(async () => {
    const selRadio = document.querySelector('input[name="archiveService"]:checked');
    if (!selRadio) return showMessageBox("Please select an archive service.");

    const now = Date.now();
    if (now - lastRequest < MIN_REQUEST_INTERVAL) {
      showMessageBox("Please wait before trying again.");
      return;
    }
    lastRequest = now;

    const originalLabel = archiveBtn.textContent;
    archiveBtn.disabled = true;
    archiveBtn.textContent = "Searching…";
    document.body.classList.add("busy");

    try {
      const { url, title } = await getCurrentTabInfo();
      if (!isValidUrl(url)) return showMessageBox("Invalid URL detected.");
      if (isUnsupportedUrl(url)) return showMessageBox("Cannot archive this type of page.");

      let archiveUrl = null;

      if (selRadio.value === "archiveToday") {
        try {
          let hasSnapshot;
          if (warmPrecheckPromise && warmPrecheckUrl === url) {
            hasSnapshot = await warmPrecheckPromise;
            if (hasSnapshot === null) {
              hasSnapshot = await hasArchiveTodaySnapshotQuick(url, 1000);
            }
          } else {
            hasSnapshot = await hasArchiveTodaySnapshotQuick(url, 1000);
          }

          if (!hasSnapshot) {
            showMessageBox("No snapshot available for this site.");
            return;
          }
          // open /newest/ and let Archive.today redirect to the snapshot
          archiveUrl = `https://archive.today/newest/${url}`;
        } catch (e) {
          console.error("Archive.today pre-check error:", e);
          if (e && e.message === "ARCHIVE_TODAY_TIMEOUT") {
            showMessageBox("Archive.today timed out. Try again or use Wayback.");
          } else {
            showMessageBox("Archive.today seems unavailable right now.");
          }
          return;
        }
      } else {
        // Wayback Machine
        try {
          archiveUrl = await getLatestWaybackSnapshot(url);
          if (!archiveUrl) {
            showMessageBox("No archived version found in Wayback Machine for this URL.");
            return;
          }
        } catch (error) {
          console.error("Wayback Machine error:", error);
          if (error.name === "AbortError") {
            showMessageBox("Request timed out. The archive service might be slow.");
          } else if (error.message && error.message.includes("HTTP 429")) {
            showMessageBox("Rate limited. Please try again in a minute.");
          } else {
            showMessageBox("Wayback Machine service unavailable. Try Archive.Today instead.");
          }
          return;
        }
      }

      if (archiveUrl) {
        await saveToHistory(
          title,
          url,
          selRadio.value === "archiveToday" ? "Archive.Today" : "Wayback Machine",
          archiveUrl
        );
        chrome.tabs.create({ url: archiveUrl });
      }
    } catch (err) {
      console.error("Archive error:", err);
      showMessageBox("Service unavailable. Please try again or use the other archive option.");
    } finally {
      document.body.classList.remove("busy");
      archiveBtn.disabled = false;
      archiveBtn.textContent = originalLabel;
    }
  }, 100); // was 500

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
