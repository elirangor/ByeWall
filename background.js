// background.js — MV3 service worker
const NEWEST_PATH = "newest/";
const NO_RESULTS_RE = /No results/i;

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "archiveTodayPrecheck") {
    precheckArchiveToday(msg.url, msg.timeoutMs || 1000) // tighter timeout
      .then(sendResponse)
      .catch(err => sendResponse({ ok: false, error: err?.message || String(err) }));
    return true; // async
  }
});

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
      headers: { Accept: "text/html" }
    });

    const finalUrl = resp.url || checkedUrl;
    // Redirected away from /newest/ => snapshot exists
    if (!finalUrl.includes("/" + NEWEST_PATH)) {
      return { ok: true, hasSnapshot: true, checkedUrl, finalUrl };
    }

    // Still on /newest/ — peek at a small slice for "No results"
    const head = await readFirstText(resp, 4096); // smaller sniff
    if (NO_RESULTS_RE.test(head)) {
      return { ok: true, hasSnapshot: false, reason: "no-results", checkedUrl, finalUrl };
    }
    return { ok: true, hasSnapshot: true, checkedUrl, finalUrl };
  } catch (err) {
    if (err?.name === "AbortError") return { ok: false, error: "ARCHIVE_TODAY_TIMEOUT" };
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
  let out = "", read = 0;
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
  try { reader.cancel(); } catch {}
  return out;
}
