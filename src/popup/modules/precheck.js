// precheck.js - Archive precheck functions (communicate with background)

/**
 * Check if Archive.Today has a snapshot for the given URL
 * @param {string} url - URL to check
 * @param {number} timeoutMs - Timeout in milliseconds
 * @returns {Promise<boolean>} - True if snapshot exists
 */
export function hasArchiveTodaySnapshotQuick(url, timeoutMs) {
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
      },
    );
  });
}

/**
 * Check if Wayback Machine has a snapshot for the given URL
 * @param {string} url - URL to check
 * @param {number} timeoutMs - Timeout in milliseconds
 * @returns {Promise<boolean|null>} - True if snapshot exists, null if uncertain
 */
export function hasWaybackSnapshotQuick(url, timeoutMs) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { type: "waybackPrecheck", url, timeoutMs },
      (res) => {
        if (chrome.runtime.lastError || !res || res.ok === false) {
          return resolve(null);
        }
        resolve(res.hasSnapshot);
      },
    );
  });
}

/**
 * Warm up the precheck for the current tab based on selected service
 * @param {string} url - URL to precheck
 * @param {string} selectedService - Selected archive service
 * @returns {Promise|null} - Promise for the precheck or null
 */
export function warmPrecheck(url, selectedService) {
  try {
    if (selectedService === "archiveToday") {
      return hasArchiveTodaySnapshotQuick(url).catch(() => null);
    } else {
      return hasWaybackSnapshotQuick(url).catch(() => null);
    }
  } catch {
    return null;
  }
}
