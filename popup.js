function getCurrentTabInfo(callback) {
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    let tab = tabs[0];
    callback({ url: tab.url, title: tab.title });
  });
}

function getLocalTimestamp() {
  const now = new Date();
  const pad = (n) => n.toString().padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

function saveArchivedEntry(entry) {
  chrome.storage.local.get(['archivedUrls'], function (result) {
    let entries = Array.isArray(result.archivedUrls) ? result.archivedUrls : [];
    console.log("[saveArchivedEntry] Current stored entries:", entries);

    entries.unshift(entry);
    entries = entries.slice(0, 5);

    console.log("[saveArchivedEntry] New entries to save:", entries);
    chrome.storage.local.set({ archivedUrls: entries }, () => {
      console.log("[saveArchivedEntry] Entries successfully saved.");
    });
  });
}

function decodeHTMLEntities(text) {
  const txt = document.createElement('textarea');
  txt.innerHTML = text;
  return txt.value;
}

function loadArchivedUrls() {
  console.log("[loadArchivedUrls] Attempting to load stored archive history...");
  chrome.storage.local.get(['archivedUrls'], function (result) {
    const entries = Array.isArray(result.archivedUrls) ? result.archivedUrls : [];
    console.log("[loadArchivedUrls] Loaded entries:", entries);

    const list = document.getElementById('historyList');
    if (!list) {
      console.warn("[loadArchivedUrls] Could not find #historyList element.");
      return;
    }

    list.innerHTML = '';

    entries.forEach((entry) => {
      if (!entry || !entry.url) return;

      const container = document.createElement('div');
      container.className = 'history-item';

      const link = document.createElement('a');
      link.href = entry.url;
      link.textContent = decodeHTMLEntities(entry.title || entry.url);
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.className = "history-link";

      const meta = document.createElement('div');
      meta.className = 'history-meta';

      let archiveLinks = 'Unknown archive';
      if (Array.isArray(entry.used)) {
        archiveLinks = entry.used
          .map(a => `<a href="${a.url}" target="_blank" class="history-link">${a.service}</a>`)
          .join(" | ");
      }

      meta.innerHTML = `(${archiveLinks} | ${entry.time || 'Unknown time'})`;

      container.appendChild(link);
      container.appendChild(meta);
      list.appendChild(container);
    });
  });
}

function checkWaybackAvailability(url, callback) {
  fetch("https://archive.org/wayback/available?url=" + encodeURIComponent(url))
    .then(response => response.json())
    .then(data => {
      const snapshot = data?.archived_snapshots?.closest;
      if (snapshot && snapshot.available) {
        callback(snapshot.url);
      } else {
        alert("No archived version found in Wayback Machine.");
        callback(null);
      }
    })
    .catch(err => {
      console.error("Wayback lookup failed:", err);
      callback(null);
    });
}

document.addEventListener("DOMContentLoaded", function () {
  console.log("[popup.js] DOM fully loaded. Initializing extension...");
  loadArchivedUrls();

  document.getElementById("archive").addEventListener("click", function () {
    const useWayback = document.getElementById("wayback").checked;
    const useArchiveToday = document.getElementById("archiveToday").checked;

    if (!useWayback && !useArchiveToday) {
      alert("Please select at least one archive service.");
      return;
    }

    getCurrentTabInfo(function (tabInfo) {
      const { url, title } = tabInfo;
      const time = getLocalTimestamp();
      const archiveLinks = [];

      let pending = 0;
      let hasSaved = false;

      const trySave = () => {
        if (pending === 0 && !hasSaved) {
          hasSaved = true;
          console.log("[archive] Saving archive entry...");
          saveArchivedEntry({ url, title, used: archiveLinks, time });
        }
      };

      if (useArchiveToday) {
        const archiveTodayUrl = "https://archive.today/?run=1&url=" + encodeURIComponent(url);
        chrome.tabs.create({ url: archiveTodayUrl });
        archiveLinks.push({ service: "Archive.today", url: archiveTodayUrl });
      }

      if (useWayback) {
        pending++;
        checkWaybackAvailability(url, (waybackUrl) => {
          if (waybackUrl) {
            chrome.tabs.create({ url: waybackUrl });
            archiveLinks.push({ service: "Wayback Machine", url: waybackUrl });
          }
          pending--;
          trySave();
        });
      }

      trySave(); // In case only archive.today is selected
    });
  });
});
