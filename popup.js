// Function to show custom message box
function showMessageBox(message) {
  const messageBox = document.getElementById('messageBox');
  const messageText = document.getElementById('messageText');
  messageText.textContent = message;
  messageBox.style.display = 'flex'; // Show the modal
}

// Event listener for closing the message box
document.addEventListener('DOMContentLoaded', function() {
  const messageBoxCloseButton = document.getElementById('messageBoxClose');
  if (messageBoxCloseButton) {
    messageBoxCloseButton.addEventListener('click', function() {
      document.getElementById('messageBox').style.display = 'none'; // Hide the modal
    });
  }
});

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
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(['archivedUrls'], function (result) {
      if (chrome.runtime.lastError) {
        console.error("[saveArchivedEntry] Storage error:", chrome.runtime.lastError);
        reject(chrome.runtime.lastError);
        return;
      }

      let entries = Array.isArray(result.archivedUrls) ? result.archivedUrls : [];
      console.log("[saveArchivedEntry] Current stored entries:", entries);

      // Check if this URL already exists to avoid duplicates
      const existingIndex = entries.findIndex(e => e.url === entry.url);
      if (existingIndex !== -1) {
        entries.splice(existingIndex, 1);
      }

      entries.unshift(entry);
      entries = entries.slice(0, 5); // Keep only the 5 most recent entries

      console.log("[saveArchivedEntry] New entries to save:", entries);
      
      chrome.storage.local.set({ archivedUrls: entries }, () => {
        if (chrome.runtime.lastError) {
          console.error("[saveArchivedEntry] Save error:", chrome.runtime.lastError);
          reject(chrome.runtime.lastError);
        } else {
          console.log("[saveArchivedEntry] Entries successfully saved.");
          resolve(entries);
        }
      });
    });
  });
}

function decodeHTMLEntities(text) {
  const txt = document.createElement('textarea');
  txt.innerHTML = text;
  return txt.value;
}

function isRTLText(text) {
  // RTL character ranges for common RTL languages
  const rtlRegex = /[\u0590-\u05FF\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/;
  return rtlRegex.test(text);
}

function loadArchivedUrls() {
  console.log("[loadArchivedUrls] Attempting to load stored archive history...");
  
  return new Promise((resolve, reject) => {
    // Add a small delay for macOS compatibility
    setTimeout(() => {
      chrome.storage.local.get(['archivedUrls'], function (result) {
        if (chrome.runtime.lastError) {
          console.error("[loadArchivedUrls] Storage error:", chrome.runtime.lastError);
          reject(chrome.runtime.lastError);
          return;
        }

        const entries = Array.isArray(result.archivedUrls) ? result.archivedUrls : [];
        console.log("[loadArchivedUrls] Loaded entries:", entries);

        const list = document.getElementById('historyList');
        if (!list) {
          console.warn("[loadArchivedUrls] Could not find #historyList element.");
          reject(new Error("historyList element not found"));
          return;
        }

        list.innerHTML = '';

        if (entries.length === 0) {
          const noHistory = document.createElement('div');
          noHistory.className = 'history-item';
          noHistory.style.color = '#999';
          noHistory.style.fontStyle = 'italic';
          noHistory.textContent = 'No recent archives';
          list.appendChild(noHistory);
          resolve(entries);
          return;
        }

        entries.forEach((entry, index) => {
          if (!entry || !entry.url) {
            console.warn(`[loadArchivedUrls] Invalid entry at index ${index}:`, entry);
            return;
          }

          const container = document.createElement('div');
          container.className = 'history-item';

          const link = document.createElement('a');
          link.href = entry.url;
          const titleText = decodeHTMLEntities(entry.title || entry.url);
          link.textContent = titleText;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          link.className = "history-link";

          // Detect RTL languages and set direction
          if (isRTLText(titleText)) {
            link.style.direction = 'rtl';
            link.style.textAlign = 'right';
            container.style.direction = 'rtl';
          } else {
            link.style.direction = 'ltr';
            link.style.textAlign = 'left';
            container.style.direction = 'ltr';
          }

          // Show full title on hover
          link.title = titleText;

          const meta = document.createElement('div');
          meta.className = 'history-meta';

          // Create clickable service links with better error handling
          let servicesText = '';
          if (Array.isArray(entry.used) && entry.used.length > 0) {
            const serviceLinks = entry.used.map(serviceInfo => {
              if (serviceInfo && serviceInfo.service && serviceInfo.url) {
                return `<a href="${serviceInfo.url}" target="_blank" rel="noopener noreferrer" class="service-link">${serviceInfo.service}</a>`;
              } else {
                return serviceInfo?.service || 'Unknown Service';
              }
            });
            servicesText = serviceLinks.join(', ');
          } else {
            servicesText = 'Unknown archive';
          }

          meta.innerHTML = `${servicesText} | ${entry.time || 'Unknown time'}`;

          container.appendChild(link);
          container.appendChild(meta);
          list.appendChild(container);
        });

        resolve(entries);
      });
    }, 50); // 50ms delay for macOS compatibility
  });
}

function checkWaybackAvailability(url, callback) {
  const timeoutDuration = 10000; // 10 seconds timeout
  
  const timeoutId = setTimeout(() => {
    console.warn("Wayback Machine lookup timed out");
    showMessageBox("Wayback Machine lookup timed out. Please try again.");
    callback(null);
  }, timeoutDuration);

  fetch("https://archive.org/wayback/available?url=" + encodeURIComponent(url), {
    method: 'GET',
    headers: {
      'Accept': 'application/json'
    }
  })
    .then(response => {
      clearTimeout(timeoutId);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return response.json();
    })
    .then(data => {
      const snapshot = data?.archived_snapshots?.closest;
      if (snapshot && snapshot.available) {
        callback(snapshot.url);
      } else {
        showMessageBox("No archived version found in Wayback Machine.");
        callback(null);
      }
    })
    .catch(err => {
      clearTimeout(timeoutId);
      console.error("Wayback lookup failed:", err);
      showMessageBox("Failed to check Wayback Machine availability. Please try again.");
      callback(null);
    });
}

// Debounce function to prevent rapid consecutive calls
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

document.addEventListener("DOMContentLoaded", function () {
  console.log("[popup.js] DOM fully loaded. Initializing extension...");
  
  // Load archived URLs with error handling
  loadArchivedUrls().catch(error => {
    console.error("Failed to load archived URLs:", error);
    const list = document.getElementById('historyList');
    if (list) {
      list.innerHTML = '<div class="history-item" style="color: #999; font-style: italic;">Failed to load history</div>';
    }
  });

  // Debounced archive function to prevent multiple rapid clicks
  const debouncedArchive = debounce(function() {
    // Get the selected archive service from the radio buttons
    const selectedServiceRadio = document.querySelector('input[name="archiveService"]:checked');
    const selectedService = selectedServiceRadio ? selectedServiceRadio.value : null;

    if (!selectedService) {
      showMessageBox("Please select an archive service.");
      return;
    }

    // Disable button during processing
    const archiveButton = document.getElementById("archive");
    const originalText = archiveButton.textContent;
    archiveButton.disabled = true;
    archiveButton.textContent = "Processing...";

    getCurrentTabInfo(function (tabInfo) {
      const { url, title } = tabInfo;
      const time = getLocalTimestamp();
      const archiveLinks = [];

      let pending = 0;
      let hasSaved = false;

      const trySave = async () => {
        if (pending === 0 && !hasSaved && archiveLinks.length > 0) {
          hasSaved = true;
          console.log("[archive] Saving archive entry...");
          try {
            await saveArchivedEntry({ url, title, used: archiveLinks, time });
            // Reload the history to show the new entry
            await loadArchivedUrls();
          } catch (error) {
            console.error("Failed to save archive entry:", error);
          } finally {
            // Re-enable button
            archiveButton.disabled = false;
            archiveButton.textContent = originalText;
          }
        } else if (pending === 0) {
          // Re-enable button even if no archives were saved or if an error occurred
          archiveButton.disabled = false;
          archiveButton.textContent = originalText;
        }
      };

      if (selectedService === "archiveToday") {
        const archiveTodayUrl = "https://archive.today/?run=1&url=" + encodeURIComponent(url);
        chrome.tabs.create({ url: archiveTodayUrl });
        archiveLinks.push({ service: "Archive.today", url: archiveTodayUrl });
        trySave(); // Call trySave immediately as Archive.today opens a new tab without direct feedback
      } else if (selectedService === "wayback") {
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
    });
  }, 300); // 300ms debounce

  document.getElementById("archive").addEventListener("click", debouncedArchive);

  // Load saved preference for the selected archive service
  chrome.storage.local.get(['selectedArchiveServicePref'], function(result) {
    // Default to 'archiveToday' if no preference is saved
    const selectedPref = result.selectedArchiveServicePref || 'archiveToday';
    const radioToSelect = document.getElementById(selectedPref + 'Radio');
    if (radioToSelect) {
      radioToSelect.checked = true;
    }
  });

  // Save preference when a radio button is changed
  document.querySelectorAll('input[name="archiveService"]').forEach(radio => {
    radio.addEventListener('change', function() {
      chrome.storage.local.set({ selectedArchiveServicePref: this.value });
    });
  });
});