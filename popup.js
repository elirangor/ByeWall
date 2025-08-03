/* popup.js – ByeWall v1.5 */

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

const getStorage = key => new Promise(r => chrome.storage.local.get(key, r));
const setStorage = (key, val) => new Promise(r => chrome.storage.local.set({ [key]: val }, r));

////////////////////////////////////////////////////////////////////////////////
// 2. HISTORY (last 5 archives)                                               //
////////////////////////////////////////////////////////////////////////////////

async function saveToHistory(title, url, service, archiveUrl) {
  const { archiveHistory = [] } = await getStorage('archiveHistory');
  archiveHistory.unshift({ title, url, service, archiveUrl, timestamp: Date.now() });
  await setStorage('archiveHistory', archiveHistory.slice(0, 5));
  loadHistory();
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
// 3. MAIN – runs once popup DOM is ready                                     //
////////////////////////////////////////////////////////////////////////////////

document.addEventListener('DOMContentLoaded', () => {
  console.log('[popup] loaded');

  loadHistory();

  // Restore previously chosen archive service
  getStorage('selectedArchiveServicePref').then(({ selectedArchiveServicePref = 'archiveToday' }) => {
    const radio = document.getElementById(selectedArchiveServicePref + 'Radio');
    if (radio) radio.checked = true;
  });

  // Remember service preference
  document.querySelectorAll('input[name="archiveService"]').forEach(radio =>
    radio.addEventListener('change', () =>
      setStorage('selectedArchiveServicePref', radio.value)));

  // Dark mode toggle
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

  // Archive button
  const archiveBtn = document.getElementById('archive');

  const doArchive = debounce(async () => {
    const selRadio = document.querySelector('input[name="archiveService"]:checked');
    if (!selRadio) return showMessageBox('Please select an archive service.');

    const originalLabel = archiveBtn.textContent;
    archiveBtn.disabled = true;
    archiveBtn.textContent = 'Processing…';
    document.body.classList.add('busy');

    try {
      const { url, title } = await getCurrentTabInfo();
      let archiveUrl = null;

      if (selRadio.value === 'archiveToday') {
        archiveUrl = `https://archive.today/?run=1&url=${encodeURIComponent(url)}`;
      } else {
        const ctrl = new AbortController();
        const toId = setTimeout(() => ctrl.abort(), 10000);

        const r = await fetch(
          `https://archive.org/wayback/available?url=${encodeURIComponent(url)}`,
          { signal: ctrl.signal, headers: { Accept: 'application/json' } });

        clearTimeout(toId);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const snap = (await r.json()).archived_snapshots?.closest;
        if (snap?.available) archiveUrl = snap.url;
        else showMessageBox('No archived version found in Wayback Machine.');
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
      console.error(err);
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
// 4. OVERLAY STYLES (for processing lock)                                    //
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
