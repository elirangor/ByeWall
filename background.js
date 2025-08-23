// background.js — MV3 service worker
const NEWEST_PATH = "newest/";
const NO_RESULTS_RE = /No results/i;

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "archiveTodayPrecheck") {
    precheckArchiveToday(msg.url, msg.timeoutMs || 1000) // tighter timeout
      .then(sendResponse)
      .catch((err) =>
        sendResponse({ ok: false, error: err?.message || String(err) })
      );
    return true; // async
  }
});

// Handle keyboard shortcuts
chrome.commands.onCommand.addListener(async (command) => {
  if (command === "archive_current_page") {
    try {
      // Get current active tab
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tabs || !tabs[0]) return;
      
      const currentTab = tabs[0];
      const url = currentTab.url;
      
      // Check if URL is valid and supported
      if (!isValidUrl(url) || isUnsupportedUrl(url)) {
        console.log("Cannot archive this type of page:", url);
        return;
      }
      
      // Get user's preferred archive service (default to Archive.today)
      const { selectedArchiveServicePref = "archiveToday" } = 
        await chrome.storage.local.get("selectedArchiveServicePref");
      
      let archiveUrl;
      if (selectedArchiveServicePref === "archiveToday") {
        archiveUrl = `https://archive.today/newest/${url}`;
      } else {
        // For Wayback, use a simpler direct approach for keyboard shortcut
        archiveUrl = `https://web.archive.org/web/*/${url}`;
      }
      
      // Open archived version in new tab
      await chrome.tabs.create({ url: archiveUrl });
      
      // Save to history
      const title = currentTab.title || url;
      const serviceName = selectedArchiveServicePref === "archiveToday" ? "Archive.Today" : "Wayback Machine";
      await saveToHistory(title, url, serviceName, archiveUrl);
      
    } catch (error) {
      console.error("Keyboard shortcut archive error:", error);
    }
  }
});

// Helper functions for keyboard shortcut
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
    "opera://",
  ];
  return unsupported.some((p) => url.startsWith(p));
}

function normalizeHistoryUrl(raw) {
  try {
    const u = new URL(raw);
    u.hash = "";
    u.hostname = u.hostname.toLowerCase();

    // drop common trackers
    const drop = [
      "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
      "utm_id", "gclid", "fbclid", "mc_cid", "mc_eid",
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

async function saveToHistory(title, url, service, archiveUrl) {
  try {
    const norm = normalizeHistoryUrl(url);
    const { archiveHistory = [] } = await chrome.storage.local.get("archiveHistory");

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
      timestamp: Date.now(),
    });

    await chrome.storage.local.set({ archiveHistory: filtered.slice(0, 5) });
  } catch (error) {
    console.error("Error saving to history:", error);
  }
}

async function precheckArchiveToday(targetUrl, timeoutMs) {
  if (!/^https?:\/\//i.test(targetUrl))
    return { ok: true, hasSnapshot: false, reason: "unsupported" };

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

    const finalUrl = resp.url || checkedUrl;
    // Redirected away from /newest/ => snapshot exists
    if (!finalUrl.includes("/" + NEWEST_PATH)) {
      return { ok: true, hasSnapshot: true, checkedUrl, finalUrl };
    }

    // Still on /newest/ — peek at a small slice for "No results"
    const head = await readFirstText(resp, 4096); // smaller sniff
    if (NO_RESULTS_RE.test(head)) {
      return {
        ok: true,
        hasSnapshot: false,
        reason: "no-results",
        checkedUrl,
        finalUrl,
      };
    }
    return { ok: true, hasSnapshot: true, checkedUrl, finalUrl };
  } catch (err) {
    if (err?.name === "AbortError")
      return { ok: false, error: "ARCHIVE_TODAY_TIMEOUT" };
    return { ok: false, error: "NETWORK_ERROR" };
  } finally {
    clearTimeout(timer);
  }
}

// Read at most `maxBytes` of the response as text (fast)
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