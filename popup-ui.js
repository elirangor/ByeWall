// popup-ui.js — UI rendering and interaction logic

import { isRTL } from './utils.js';

/**
 * Format date for history display
 */
function formatHistoryDate(timestamp, rtl) {
  const dt = new Date(timestamp);
  const pad = (n) => String(n).padStart(2, '0');
  const hours = pad(dt.getHours());
  const minutes = pad(dt.getMinutes());
  const day = dt.getDate();
  const month = dt.getMonth() + 1;
  const year = String(dt.getFullYear()).slice(2);

  return rtl
    ? `${day}/${month}/${year}, ${hours}:${minutes}`
    : `${hours}:${minutes}, ${day}/${month}/${year}`;
}

/**
 * Render history items to the DOM
 */
export function renderHistory(historyItems) {
  const list = document.getElementById('historyList');
  const section = document.getElementById('history-section');
  if (!list || !section) return;

  list.innerHTML = '';
  
  if (!historyItems.length) {
    section.style.display = 'none';
    return;
  }

  section.style.display = 'block';
  
  historyItems.forEach((item) => {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = item.archiveUrl;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.className = 'history-item';

    const rtl = isRTL(item.title);
    if (rtl) {
      a.classList.add('rtl');
      a.dir = 'rtl';
    }

    const detailsDiv = document.createElement('div');
    detailsDiv.className = 'history-item-content';

    const titleEl = document.createElement('span');
    titleEl.className = 'title';
    titleEl.textContent = item.title;

    const meta = document.createElement('div');
    meta.className = 'details';

    const svc = document.createElement('span');
    svc.className = 'service';
    svc.textContent = item.service;

    const ts = document.createElement('span');
    ts.className = 'timestamp';
    ts.textContent = formatHistoryDate(item.timestamp, rtl);

    meta.appendChild(svc);
    meta.appendChild(ts);
    detailsDiv.appendChild(titleEl);
    detailsDiv.appendChild(meta);
    a.appendChild(detailsDiv);
    li.appendChild(a);
    list.appendChild(li);
  });
}

/**
 * Show modal message box
 */
export function showMessageBox(message) {
  const msgBox = document.getElementById('messageBox');
  const msgText = document.getElementById('messageText');
  if (!msgBox || !msgText) return;
  msgText.textContent = message;
  msgBox.style.display = 'flex';
}

/**
 * Show confirmation message box with Yes/No buttons
 */
export function showConfirmBox(message, onConfirm) {
  const msgBox = document.getElementById('messageBox');
  const msgText = document.getElementById('messageText');
  const msgContent = msgBox?.querySelector('.message-box-content');
  
  if (!msgBox || !msgText || !msgContent) return;
  
  msgText.textContent = message;
  
  // Find or create button container
  let btnContainer = msgContent.querySelector('.message-box-buttons');
  if (!btnContainer) {
    // Remove existing OK button if present
    const existingBtn = msgContent.querySelector('button');
    if (existingBtn) existingBtn.remove();
    
    btnContainer = document.createElement('div');
    btnContainer.className = 'message-box-buttons';
    msgContent.appendChild(btnContainer);
  }
  
  // Create Yes button
  const yesBtn = document.createElement('button');
  yesBtn.textContent = 'Yes';
  yesBtn.onclick = () => {
    onConfirm();
    msgBox.style.display = 'none';
    // Restore original OK button
    btnContainer.innerHTML = '<button id="messageBoxClose">OK</button>';
    const newOkBtn = btnContainer.querySelector('#messageBoxClose');
    if (newOkBtn) newOkBtn.onclick = hideMessageBox;
  };
  
  // Create No button
  const noBtn = document.createElement('button');
  noBtn.textContent = 'No';
  noBtn.onclick = () => {
    msgBox.style.display = 'none';
    // Restore original OK button
    btnContainer.innerHTML = '<button id="messageBoxClose">OK</button>';
    const newOkBtn = btnContainer.querySelector('#messageBoxClose');
    if (newOkBtn) newOkBtn.onclick = hideMessageBox;
  };
  
  // Replace buttons
  btnContainer.innerHTML = '';
  btnContainer.appendChild(yesBtn);
  btnContainer.appendChild(noBtn);
  
  msgBox.style.display = 'flex';
}

/**
 * Hide modal message box
 */
export function hideMessageBox() {
  const msgBox = document.getElementById('messageBox');
  if (msgBox) msgBox.style.display = 'none';
}

/**
 * Get current tab info
 */
export function getCurrentTabInfo() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const t = tabs && tabs[0] ? tabs[0] : { url: '', title: '' };
      resolve({ url: t.url || '', title: t.title || '' });
    });
  });
}

/**
 * Update keyboard shortcut hints dynamically
 */
export function updateShortcutHints(formatShortcut) {
  const s1 = document.getElementById('shortcut1');
  const s2 = document.getElementById('shortcut2');
  if (!s1 || !s2) return;

  chrome.commands.getAll((commands) => {
    const openCmd = commands.find((c) => c.name === 'open_extension');
    const archiveCmd = commands.find((c) => c.name === 'archive_current');

    s1.textContent = openCmd?.shortcut
      ? formatShortcut(openCmd.shortcut)
      : 'Not set';

    s2.textContent = archiveCmd?.shortcut
      ? formatShortcut(archiveCmd.shortcut)
      : 'Not set';
  });
}