// archive-core.js — shared logic for ByeWall (MV3)

// -------- Tunable timeouts (ms) --------
const AT_PRECHECK_TIMEOUT_MS = 2000; // Archive.today precheck - increased for reliability
const WB_PRECHECK_TIMEOUT_MS = 700; // Wayback precheck (was 1000)
const WB_FULL_TIMEOUT_MS = 8000; // Wayback full lookup cap (was 15000)

const NEWEST_PATH = "newest/";

/* ---------- storage helpers ---------- */
const getStorage = (key) =>
  new Promise((r) => chrome.storage.local.get(key, r));
const setStorage = (key, val) =>
  new Promise((r) => chrome.storage.local.set({ [key]: val }, r));

/* ---------- small utils ---------- */
function isValidUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function isUnsupportedUrl(url) {
  return [
    "chrome://",
    "chrome-extension://",
    "edge://",
    "edge-extension://",
    "about:",
    "file://",
    "moz-extension://",
    "opera://",
  ].some((p) => url.startsWith(p));
}

function normalizeHistoryUrl(raw) {
  try {
    const u = new URL(raw);
    u.hash = "";
    u.hostname = u.hostname.toLowerCase();
    [
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
    ].forEach((k) => u.searchParams.delete(k));
    const qs = u.searchParams.toString();
    u.search = qs ? "?" + qs : "";
    const clean = u.pathname.replace(/\/+$/, "");
    u.pathname = clean || "/";
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

/* ---------- history (no DOM here) ---------- */
async function saveToHistory(title, url, service, archiveUrl) {
  const norm = normalizeHistoryUrl(url);
  const { archiveHistory = [] } = await getStorage("archiveHistory");
  const filtered = archiveHistory.filter(
    (it) => (it.normUrl || normalizeHistoryUrl(it.url)) !== norm
  );
  filtered.unshift({
    title,
    url,
    normUrl: norm,
    service,
    archiveUrl,
    timestamp: Date.now(),
  });
  await setStorage("archiveHistory", filtered.slice(0, 5));
}

/* ---------- Archive.today precheck (HERMETIC) ---------- */
/**
 * Hermetic rule:
 * - If we end up STILL on /newest/ after fetch-follow redirects => treat as NO snapshot.
 * - If we are redirected away from /newest/ => snapshot exists, finalUrl is the snapshot.
 * - If request fails/timeouts => ok:false (uncertain) and we do NOT open.
 */
export async function precheckArchiveToday(
  targetUrl,
  timeoutMs = AT_PRECHECK_TIMEOUT_MS
) {
  if (!/^https?:\/\//i.test(targetUrl)) {
    return { ok: true, hasSnapshot: false, reason: "unsupported" };
  }

  const checkedUrl = `https://archive.today/${NEWEST_PATH}${targetUrl}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const resp = await fetch(checkedUrl, {
      signal: ctrl.signal,
      redirect: "follow",
      cache: "no-store",
      credentials: "omit",
      headers: { Accept: "text/html" },
    });


    if (resp.status === 404) {
      // 404 from /newest/ means: no snapshot exists
      return {
        ok: true,
        hasSnapshot: false,
        reason: "not-found",
        checkedUrl,
        finalUrl: resp.url || checkedUrl,
      };
    }

    const finalUrl = resp.url || checkedUrl;

    // If we're still on /newest/ => hermetically treat as "no snapshot"
    if (finalUrl.includes("/" + NEWEST_PATH)) {
      return {
        ok: true,
        hasSnapshot: false,
        reason: "no-redirect",
        checkedUrl,
        finalUrl,
      };
    }

    // Redirected away from /newest/ => snapshot exists
    return { ok: true, hasSnapshot: true, checkedUrl, finalUrl };
  } catch (err) {
    if (err?.name === "AbortError") {
      return { ok: false, error: "ARCHIVE_TODAY_TIMEOUT" };
    }
    return { ok: false, error: "NETWORK_ERROR" };
  } finally {
    clearTimeout(timer);
  }
}

/* ---------- Wayback quick precheck (fast) ---------- */
export async function waybackHasSnapshotQuick(
  url,
  timeoutMs = WB_PRECHECK_TIMEOUT_MS
) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const availUrl = `https://archive.org/wayback/available?url=${encodeURIComponent(
      url
    )}`;
    const resp = await fetch(availUrl, {
      signal: ctrl.signal,
      headers: { Accept: "application/json" },
      cache: "no-store",
      redirect: "follow",
      credentials: "omit",
    });
    clearTimeout(timer);
    if (!resp.ok) return false;
    const data = await resp.json();
    const closest = data?.archived_snapshots?.closest;
    return !!(closest && closest.available && closest.url);
  } catch (e) {
    clearTimeout(timer);
    // Let caller decide—throw to allow fallback to full lookup
    throw e;
  }
}

/* ---------- Wayback full lookup (slower, but capped) ---------- */
async function getLatestWaybackSnapshot(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), WB_FULL_TIMEOUT_MS);

  try {
    const cdxUrl = `https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(
      url
    )}&limit=1&sort=reverse`;
    const cdxResp = await fetch(cdxUrl, {
      signal: ctrl.signal,
      headers: { Accept: "text/plain" },
    });
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

    const availUrl = `https://archive.org/wayback/available?url=${encodeURIComponent(
      url
    )}`;
    const availResp = await fetch(availUrl, {
      signal: ctrl.signal,
      headers: { Accept: "application/json" },
    });
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

/* ---------- The single action used by popup & shortcuts ---------- */
export async function performArchive() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = tab?.url || "";
  const title = tab?.title || "";
  const currentTabId = tab?.id;

  if (!isValidUrl(url)) {
    return { ok: false, error: "INVALID_URL" };
  }
  if (isUnsupportedUrl(url)) {
    return { ok: false, error: "UNSUPPORTED_URL" };
  }

  const {
    selectedArchiveServicePref = "archiveToday",
    openInNewTab = true,
  } = await getStorage(["selectedArchiveServicePref", "openInNewTab"]);

  let archiveUrl = null;

  if (selectedArchiveServicePref === "archiveToday") {
    // HERMETIC:
    // - Only open if snapshot is CONFIRMED (redirected away from /newest/)
    // - If precheck fails/timeout/blocked => do NOT open
    const pre = await precheckArchiveToday(url);

    if (!pre.ok) {
      return {
        ok: false,
        error: pre.error || "ARCHIVE_TODAY_UNCERTAIN",
      };
    }

    if (pre.hasSnapshot !== true) {
      return { ok: false, error: "NO_SNAPSHOT_ARCHIVE_TODAY" };
    }

    // Best UX: open the resolved snapshot URL we already got
    archiveUrl = pre.finalUrl;
  } else {
    // Wayback: quick precheck (700ms). If "no", exit early.
    try {
      const has = await waybackHasSnapshotQuick(url);
      if (has === false) {
        return { ok: false, error: "NO_SNAPSHOT_WAYBACK" };
      }
    } catch {
      // precheck failed/timeout—continue to full lookup just in case
    }
    try {
      archiveUrl = await getLatestWaybackSnapshot(url);
      if (!archiveUrl) return { ok: false, error: "NO_SNAPSHOT_WAYBACK" };
    } catch (e) {
      return {
        ok: false,
        error: e?.name === "AbortError" ? "WAYBACK_TIMEOUT" : "WAYBACK_ERROR",
      };
    }
  }

  await saveToHistory(
    title,
    url,
    selectedArchiveServicePref === "archiveToday"
      ? "Archive.Today"
      : "Wayback Machine",
    archiveUrl
  );

  // Handle tab opening based on user preference
  if (openInNewTab) {
    await chrome.tabs.create({
      url: archiveUrl,
      index: tab.index + 1,
    });
  } else {
    await chrome.tabs.update(currentTabId, { url: archiveUrl });
  }

  return { ok: true, archiveUrl, openedInNewTab: openInNewTab };
}
