/* popup.js – ByeWall v1.5 ____________________________________________ */
/* eslint-env browser, webextensions */

////////////////////////////////////////////////////////////////////////////////
// 1. SMALL UTILS                                                             //
////////////////////////////////////////////////////////////////////////////////

function showMessageBox(message) {
  const msgBox = document.getElementById('messageBox');
  const msgText = document.getElementById('messageText');
  msgText.textContent = message;
  msgBox.style.display = 'flex';
}

document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('messageBoxClose');
  if (btn) btn.addEventListener('click', () =>
    (document.getElementById('messageBox').style.display = 'none'));
});

function getCurrentTabInfo() {
  return new Promise(resolve =>
    chrome.tabs.query({ active: true, currentWindow: true },
      tabs => resolve({ url: tabs[0].url, title: tabs[0].title })));
}

const debounce = (fn, wait) => {
  let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), wait); };
};

const isRTL = str => /[\u0590-\u05FF\u0600-\u06FF]/.test(str);

/* promisified storage helpers */
const getStorage = key => new Promise(r => chrome.storage.local.get(key, r));
const setStorage = (key, val) => new Promise(r => chrome.storage.local.set({ [key]: val }, r));

////////////////////////////////////////////////////////////////////////////////
// 2. HISTORY (last 5 archives)                                               //
////////////////////////////////////////////////////////////////////////////////

async function saveToHistory(title, url, service, archiveUrl) {
  const { archiveHistory = [] } = await getStorage('archiveHistory');
  archiveHistory.unshift({ title, url, service, archiveUrl, timestamp: Date.now() });
  await setStorage('archiveHistory', archiveHistory.slice(0, 5));
  loadHistory();                       // refresh list in popup
}

async function loadHistory() {
  const { archiveHistory = [] } = await getStorage('archiveHistory');
  const list = document.getElementById('historyList');
  const section = document.getElementById('history-section');
  list.innerHTML = '';
  if (!archiveHistory.length) return (section.style.display = 'none');

  section.style.display = 'block';
  archiveHistory.forEach(item => {
    const li = document.createElement('li');
    const link = document.createElement('a');
    link.href = item.archiveUrl;
    link.target = '_blank';
    link.className = 'history-item';

    const isRightToLeft = isRTL(item.title);
    if (isRightToLeft) {
      link.classList.add('rtl');
      link.dir = 'rtl';
    }

    const dt = new Date(item.timestamp);
    const pad = n => n.toString().padStart(2, '0');
    const hours = pad(dt.getHours());
    const minutes = pad(dt.getMinutes());

    let formattedDate;
    if (isRightToLeft) {
      // RTL: date first, then time
      formattedDate = `${dt.getDate()}/${dt.getMonth() + 1}/${dt.getFullYear().toString().slice(2)}, ${hours}:${minutes}`;
    } else {
      // LTR: time first, then date
      formattedDate = `${hours}:${minutes}, ${dt.getDate()}/${dt.getMonth() + 1}/${dt.getFullYear().toString().slice(2)}`;
    }

    link.innerHTML = `
      <div class="history-item-content">
        <span class="title">${item.title}</span>
        <div class="details">
          <span>${item.service}</span>
          <span>${formattedDate}</span>
        </div>
      </div>`;

    li.appendChild(link);
    list.appendChild(li);
  });
}

////////////////////////////////////////////////////////////////////////////////
// 3. WAYBACK MACHINE HELPER FUNCTIONS                                        //
////////////////////////////////////////////////////////////////////////////////

async function getLatestWaybackSnapshot(url) {
  const ctrl = new AbortController();
  const timeoutId = setTimeout(() => ctrl.abort(), 15000); // Increased timeout

  try {
    // First, try to get the latest snapshot using the CDX API
    const cdxUrl = `https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(url)}&limit=1&sort=reverse`;
    
    const cdxResponse = await fetch(cdxUrl, { 
      signal: ctrl.signal,
      headers: { 'Accept': 'text/plain' }
    });
    
    if (cdxResponse.ok) {
      const cdxText = await cdxResponse.text();
      const lines = cdxText.trim().split('\n');
      
      if (lines.length > 0 && lines[0]) {
        const parts = lines[0].split(' ');
        if (parts.length >= 2) {
          const timestamp = parts[1];
          const archiveUrl = `https://web.archive.org/web/${timestamp}/${url}`;
          clearTimeout(timeoutId);
          return archiveUrl;
        }
      }
    }
    
    // Fallback to the availability API if CDX doesn't work
    const availabilityUrl = `https://archive.org/wayback/available?url=${encodeURIComponent(url)}`;
    const availabilityResponse = await fetch(availabilityUrl, { 
      signal: ctrl.signal, 
      headers: { 'Accept': 'application/json' } 
    });

    clearTimeout(timeoutId);
    
    if (!availabilityResponse.ok) {
      throw new Error(`HTTP ${availabilityResponse.status}`);
    }
    
    const data = await availabilityResponse.json();
    const snapshot = data.archived_snapshots?.closest;
    
    if (snapshot?.available) {
      return snapshot.url;
    }
    
    return null;
    
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

////////////////////////////////////////////////////////////////////////////////
// 4. MAIN – runs once popup DOM is ready                                     //
////////////////////////////////////////////////////////////////////////////////

document.addEventListener('DOMContentLoaded', () => {
  console.log('[popup] loaded');

  loadHistory();                                   // build history list on open

  /* restore previously-chosen archive service */
  getStorage('selectedArchiveServicePref').then(({ selectedArchiveServicePref = 'archiveToday' }) => {
    const radio = document.getElementById(selectedArchiveServicePref + 'Radio');
    if (radio) radio.checked = true;
  });

  /* remember service preference */
  document.querySelectorAll('input[name="archiveService"]').forEach(radio =>
    radio.addEventListener('change', () =>
      setStorage('selectedArchiveServicePref', radio.value)));

  /* dark-mode toggle --------------------------------------------------- */
  (async () => {
    const { darkModeEnabled } = await getStorage('darkModeEnabled');
    const toggle = document.getElementById('darkModeToggle');
    if (darkModeEnabled) {
      document.body.classList.add('dark-mode');
      toggle.checked = true;
    }
    toggle.addEventListener('change', () => {
      document.body.classList.toggle('dark-mode', toggle.checked);
      setStorage('darkModeEnabled', toggle.checked);
    });
  })();

  /* -------------------------------------------------------------------- */
  /* ARCHIVE BUTTON (+debounce)                                           */
  /* -------------------------------------------------------------------- */
  const archiveBtn = document.getElementById('archive');

  const doArchive = debounce(async () => {
    const selRadio = document.querySelector('input[name="archiveService"]:checked');
    if (!selRadio) return showMessageBox('Please select an archive service.');

    const originalLabel = archiveBtn.textContent;
    archiveBtn.disabled = true;
    archiveBtn.textContent = 'Processing…';
    document.body.classList.add('busy');                // modal overlay

    try {
      const { url, title } = await getCurrentTabInfo();
      let archiveUrl = null;

      if (selRadio.value === 'archiveToday') {
        archiveUrl = `https://archive.today/?run=1&url=${encodeURIComponent(url)}`;
      } else {                                         // Wayback Machine
        // Use the improved Wayback Machine function
        try {
          archiveUrl = await getLatestWaybackSnapshot(url);
          if (!archiveUrl) {
            showMessageBox('No archived version found in Wayback Machine for this URL.');
            return;
          }
        } catch (error) {
          console.error('Wayback Machine error:', error);
          showMessageBox('Failed to retrieve from Wayback Machine. The service might be temporarily unavailable.');
          return;
        }
      }

      if (archiveUrl) {
        await saveToHistory(
          title,
          url,
          selRadio.value === 'archiveToday' ? 'Archive.today' : 'Wayback Machine',
          archiveUrl
        );

        chrome.tabs.create({ url: archiveUrl });
      }

    } catch (err) {
      console.error('Archive error:', err);
      showMessageBox('Archiving failed. Please try again.');
    } finally {
      document.body.classList.remove('busy');
      archiveBtn.disabled = false;
      archiveBtn.textContent = originalLabel;
    }
  }, 300);

  archiveBtn.addEventListener('click', doArchive);
});

////////////////////////////////////////////////////////////////////////////////
// 5. OVERLAY STYLES (keeps user from closing popup mid-process)             //
////////////////////////////////////////////////////////////////////////////////

const style = document.createElement('style');
style.textContent = `
  body.busy::before {
    content: '';
    position: fixed;
    inset: 0;
    background: rgba(255, 255, 255, .6);
    cursor: progress;
    z-index: 9999;
  }`;
document.head.appendChild(style);