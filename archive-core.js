// archive-core.js — shared logic for ByeWall (MV3)

// -------- Tunable timeouts (ms) --------
const AT_PRECHECK_TIMEOUT_MS = 2000; // Archive.today precheck - increased for reliability
const WB_PRECHECK_TIMEOUT_MS = 700; // Wayback precheck (was 1000)
const WB_FULL_TIMEOUT_MS = 8000; // Wayback full lookup cap (was 15000)

const NEWEST_PATH = "newest/";
const NO_RESULTS_RE = /No results/i;

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

/* ---------- Archive.today precheck ---------- */
async function readFirstText(resp, maxBytes = 4096) {
  if (!resp.body) return "";
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let out = "",
    read = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      read += value.byteLength;
      out += decoder.decode(value, { stream: true });
      if (read >= maxBytes) break;
    }
    out += decoder.decode();
  } catch {}
  try {
    reader.cancel();
  } catch {}
  return out;
}

export async function precheckArchiveToday(
  targetUrl,
  timeoutMs = AT_PRECHECK_TIMEOUT_MS
) {
  console.log('[ByeWall Precheck] Starting precheck for:', targetUrl, 'timeout:', timeoutMs);
  
  if (!/^https?:\/\//i.test(targetUrl)) {
    console.log('[ByeWall Precheck] Unsupported protocol');
    return { ok: true, hasSnapshot: false, reason: "unsupported" };
  }

  const checkedUrl = `https://archive.today/${NEWEST_PATH}${targetUrl}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    console.log('[ByeWall Precheck] Fetching:', checkedUrl);
    const resp = await fetch(checkedUrl, {
      signal: ctrl.signal,
      redirect: "follow",
      cache: "no-store",
      credentials: "omit",
      headers: { Accept: "text/html" },
    });

    const finalUrl = resp.url || checkedUrl;
    console.log('[ByeWall Precheck] Final URL after redirects:', finalUrl);
    
    // Redirected away from /newest/ => snapshot exists
    if (!finalUrl.includes("/" + NEWEST_PATH)) {
      console.log('[ByeWall Precheck] Redirected away from /newest/ - snapshot exists!');
      return { ok: true, hasSnapshot: true, checkedUrl, finalUrl };
    }

    // Still on /newest/ — peek a small slice for "No results"
    const head = await readFirstText(resp, 4096);
    console.log('[ByeWall Precheck] Response head (first 200 chars):', head.substring(0, 200));
    const hasNoResults = NO_RESULTS_RE.test(head);
    console.log('[ByeWall Precheck] "No results" test result:', hasNoResults);
    
    if (hasNoResults) {
      console.log('[ByeWall Precheck] NO SNAPSHOT FOUND');
      return {
        ok: true,
        hasSnapshot: false,
        reason: "no-results",
        checkedUrl,
        finalUrl,
      };
    }
    console.log('[ByeWall Precheck] Snapshot appears to exist (no "No results" text found)');
    return { ok: true, hasSnapshot: true, checkedUrl, finalUrl };
  } catch (err) {
    console.error('[ByeWall Precheck] Error during precheck:', err);
    if (err?.name === "AbortError") {
      console.log('[ByeWall Precheck] Timeout after', timeoutMs, 'ms');
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
  console.log('[ByeWall] performArchive() called');
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = tab?.url || "";
  const title = tab?.title || "";
  const currentTabId = tab?.id;

  console.log('[ByeWall] Current URL:', url);

  if (!isValidUrl(url)) {
    console.log('[ByeWall] Invalid URL');
    return { ok: false, error: "INVALID_URL" };
  }
  if (isUnsupportedUrl(url)) {
    console.log('[ByeWall] Unsupported URL');
    return { ok: false, error: "UNSUPPORTED_URL" };
  }

  const {
    selectedArchiveServicePref = "archiveToday",
    openInNewTab = true,
  } = await getStorage(["selectedArchiveServicePref", "openInNewTab"]);

  console.log('[ByeWall] Selected service:', selectedArchiveServicePref);

  let archiveUrl = null;

  if (selectedArchiveServicePref === "archiveToday") {
    console.log('[ByeWall] Running Archive.Today precheck...');
    // Run precheck with 2s timeout for reliability
    const pre = await precheckArchiveToday(url);
    
    // Debug logging
    console.log('[ByeWall] Precheck result:', JSON.stringify(pre));
    
    // ONLY block if precheck EXPLICITLY confirms no snapshot exists
    if (pre.ok && pre.hasSnapshot === false) {
      console.log('[ByeWall] ❌ Blocking - no snapshot exists');
      return { ok: false, error: "NO_SNAPSHOT_ARCHIVE_TODAY" };
    }
    
    // If precheck timed out, proceed optimistically
    if (!pre.ok) {
      console.log('[ByeWall] ⚠️ Precheck uncertain (timeout/error), proceeding optimistically');
    } else if (pre.hasSnapshot) {
      console.log('[ByeWall] ✅ Snapshot confirmed, proceeding');
    }
    
    console.log('[ByeWall] Proceeding to open archive');
    archiveUrl = `https://archive.today/${NEWEST_PATH}${url}`;
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

  console.log('[ByeWall] Opening URL:', archiveUrl, 'in new tab:', openInNewTab);

  // Handle tab opening based on user preference
  if (openInNewTab) {
    await chrome.tabs.create({
      url: archiveUrl,
      index: tab.index + 1,
    });
  } else {
    await chrome.tabs.update(currentTabId, { url: archiveUrl });
  }

  console.log('[ByeWall] Successfully opened archive');
  return { ok: true, archiveUrl, openedInNewTab: openInNewTab };
}