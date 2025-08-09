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

// Security: URL validation
function isValidUrl(url) {
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

// Check for unsupported URL types
function isUnsupportedUrl(url) {
  const unsupportedProtocols = ['chrome-extension://', 'file://', 'about:', 'moz-extension://', 'edge-extension://'];
  return unsupportedProtocols.some(protocol => url.startsWith(protocol));
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
    link.rel = 'noopener noreferrer'; // Security fix
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

    // XSS-HARDENED RENDERING (no innerHTML) - SECURITY FIX
    const wrap = document.createElement('div');
    wrap.className = 'history-item-content';

    const titleEl = document.createElement('span');
    titleEl.className = 'title';
    titleEl.textContent = item.title;

    const details = document.createElement('div');
    details.className = 'details';

    const svc = document.createElement('span');
    svc.textContent = item.service;

    const ts = document.createElement('span');
    ts.textContent = formattedDate;

    details.appendChild(svc);
    details.appendChild(ts);
    wrap.appendChild(titleEl);
    wrap.appendChild(details);
    link.appendChild(wrap);

    li.appendChild(link);
    list.appendChild(li);
  });
}

////////////////////////////////////////////////////////////////////////////////
// 3. ARCHIVE HELPER FUNCTIONS                                                //
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
  /* ARCHIVE BUTTON (+debounce + rate limiting)                          */
  /* -------------------------------------------------------------------- */
  const archiveBtn = document.getElementById('archive');
  
  // Rate limiting
  let lastRequest = 0;
  const MIN_REQUEST_INTERVAL = 2000; // 2 seconds between requests

  const doArchive = debounce(async () => {
    const selRadio = document.querySelector('input[name="archiveService"]:checked');
    if (!selRadio) return showMessageBox('Please select an archive service.');

    // Rate limiting check
    const now = Date.now();
    if (now - lastRequest < MIN_REQUEST_INTERVAL) {
      showMessageBox('Please wait before trying again.');
      return;
    }
    lastRequest = now;

    const originalLabel = archiveBtn.textContent;
    archiveBtn.disabled = true;
    archiveBtn.textContent = 'Searching…';
    document.body.classList.add('busy');                // modal overlay

    try {
      const { url, title } = await getCurrentTabInfo();
      
      // Security: URL validation
      if (!isValidUrl(url)) {
        showMessageBox('Invalid URL detected.');
        return;
      }
      
      if (isUnsupportedUrl(url)) {
        showMessageBox('Cannot archive this type of page.');
        return;
      }

      let archiveUrl = null;

      if (selRadio.value === 'archiveToday') {
        // Go directly to newest snapshot instead of search results
        archiveUrl = `https://archive.today/newest/${url}`;
      } else {                                         // Wayback Machine
        try {
          archiveUrl = await getLatestWaybackSnapshot(url);
          if (!archiveUrl) {
            showMessageBox('No archived version found in Wayback Machine for this URL.');
            return;
          }
        } catch (error) {
          console.error('Wayback Machine error:', error);
          if (error.name === 'AbortError') {
            showMessageBox('Request timed out. The archive service might be slow.');
          } else if (error.message.includes('HTTP 429')) {
            showMessageBox('Rate limited. Please try again in a minute.');
          } else {
            showMessageBox('Wayback Machine service unavailable. Try Archive.Today instead.');
          }
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
      showMessageBox('Service unavailable. Please try again or use the other archive option.');
    } finally {
      document.body.classList.remove('busy');
      archiveBtn.disabled = false;
      archiveBtn.textContent = originalLabel;
    }
  }, 500); // Increased debounce time

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