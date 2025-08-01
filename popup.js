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
      const { url } = tabInfo;
      let archiveLinks = [];

      let pending = 0;

      const tryComplete = () => {
        if (pending === 0) {
          // Re-enable button even if no archives were saved or if an error occurred
          archiveButton.disabled = false;
          archiveButton.textContent = originalText;
        }
      };

      if (selectedService === "archiveToday") {
        const archiveTodayUrl = "https://archive.today/?run=1&url=" + encodeURIComponent(url);
        chrome.tabs.create({ url: archiveTodayUrl });
        archiveLinks.push({ service: "Archive.today", url: archiveTodayUrl });
        tryComplete();
      } else if (selectedService === "wayback") {
        pending++;
        const timeoutDuration = 10000;
        const timeoutId = setTimeout(() => {
          console.warn("Wayback Machine lookup timed out");
          showMessageBox("Wayback Machine lookup timed out. Please try again.");
          pending--;
          tryComplete();
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
            chrome.tabs.create({ url: snapshot.url });
          } else {
            showMessageBox("No archived version found in Wayback Machine.");
          }
          pending--;
          tryComplete();
        })
        .catch(err => {
          clearTimeout(timeoutId);
          console.error("Wayback lookup failed:", err);
          showMessageBox("Failed to check Wayback Machine availability. Please try again.");
          pending--;
          tryComplete();
        });
      }
    });
  }, 300); // 300ms debounce

  document.getElementById("archive").addEventListener("click", debouncedArchive);

  // Load saved preference for the selected archive service
  chrome.storage.local.get(['selectedArchiveServicePref'], function(result) {
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

  // Dark Mode Toggle Logic
  const darkModeToggle = document.getElementById('darkModeToggle');
  const body = document.body;

  // Load saved mode preference
  chrome.storage.local.get(['darkModeEnabled'], function(result) {
    if (result.darkModeEnabled === true) {
      body.classList.add('dark-mode');
      darkModeToggle.checked = true;
    }
  });

  // Listen for changes on the toggle
  darkModeToggle.addEventListener('change', function() {
    if (this.checked) {
      body.classList.add('dark-mode');
      chrome.storage.local.set({ darkModeEnabled: true });
    } else {
      body.classList.remove('dark-mode');
      chrome.storage.local.set({ darkModeEnabled: false });
    }
  });
});