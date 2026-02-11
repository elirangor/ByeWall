// popup-ui.js — UI rendering and interaction logic

import { isRTL } from './utils.js';

/**
 * Format date for history display with dynamic relative time + absolute timestamp
 */
function formatHistoryDate(timestamp) {
  const now = Date.now();
  const diff = now - timestamp;
  
  // Time constants
  const MINUTE = 60 * 1000;
  const HOUR = 60 * MINUTE;
  const DAY = 24 * HOUR;
  const WEEK = 7 * DAY;
  
  // Always show absolute date/time
  const dt = new Date(timestamp);
  const pad = (n) => String(n).padStart(2, '0');
  const hours = pad(dt.getHours());
  const minutes = pad(dt.getMinutes());
  const day = dt.getDate();
  const month = dt.getMonth() + 1;
  const year = String(dt.getFullYear()).slice(2);
  const absoluteTime = `${hours}:${minutes}, ${day}/${month}/${year}`;
  
  // Just now (under 1 minute)
  if (diff < MINUTE) {
    return `Just now, ${absoluteTime}`;
  }
  
  // Minutes ago (1-59 minutes)
  if (diff < HOUR) {
    const mins = Math.floor(diff / MINUTE);
    return `${mins} ${mins === 1 ? 'min' : 'mins'} ago, ${absoluteTime}`;
  }
  
  // Hours ago (1-23 hours)
  if (diff < DAY) {
    const hrs = Math.floor(diff / HOUR);
    return `${hrs} ${hrs === 1 ? 'hour' : 'hours'} ago, ${absoluteTime}`;
  }
  
  // Days ago (1-6 days)
  if (diff < WEEK) {
    const days = Math.floor(diff / DAY);
    return `${days} ${days === 1 ? 'day' : 'days'} ago, ${absoluteTime}`;
  }
  
  // Older: show only absolute date/time
  return absoluteTime;
}

/**
 * Render history items to the DOM with smooth transitions
 */
export function renderHistory(historyItems) {
  const list = document.getElementById('historyList');
  const section = document.getElementById('history-section');
  if (!list || !section) return;

  list.innerHTML = '';
  
  if (!historyItems.length) {
    // Smooth hide animation
    section.classList.add('hiding');
    section.classList.remove('showing');
    setTimeout(() => {
      section.style.display = 'none';
    }, 300); // Match transition duration
    return;
  }

  // Show section with smooth animation
  section.style.display = 'block';
  // Force reflow
  section.offsetHeight;
  section.classList.remove('hiding');
  section.classList.add('showing');
  
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
    ts.textContent = formatHistoryDate(item.timestamp);

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
 * Show toast notification with optional undo button
 */
export function showToast(message, options = {}) {
  const { type = 'default', duration = 3000, onUndo = null } = options;
  
  // Remove existing toast if any
  const existingToast = document.querySelector('.toast');
  if (existingToast) {
    existingToast.remove();
  }
  
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  const messageSpan = document.createElement('span');
  messageSpan.textContent = message;
  toast.appendChild(messageSpan);
  
  if (onUndo) {
    const undoBtn = document.createElement('button');
    undoBtn.textContent = 'Undo';
    undoBtn.onclick = () => {
      onUndo();
      toast.remove();
    };
    toast.appendChild(undoBtn);
  }
  
  document.body.appendChild(toast);
  
  // Trigger animation
  requestAnimationFrame(() => {
    toast.classList.add('show');
  });
  
  // Auto remove after duration
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, duration);
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
 * Update keyboard shortcut hints dynamically with modern styling
 */
export function updateShortcutHints(formatShortcut) {
  const container = document.getElementById('shortcut-hint');
  if (!container) return;

  chrome.commands.getAll((commands) => {
    const openCmd = commands.find((c) => c.name === 'open_extension');
    const archiveCmd = commands.find((c) => c.name === 'archive_current');

    // Create modern shortcut display
    container.innerHTML = `
      <div class="shortcut-hint-title">
        <span>⌨️</span>
        <span>Keyboard Shortcuts</span>
      </div>
      <div class="shortcut-item">
        <span class="shortcut-description">Launch Page Rewind</span>
        <div class="shortcut-keys" id="shortcut1">${
          openCmd?.shortcut ? formatShortcut(openCmd.shortcut) : '<kbd>Not set</kbd>'
        }</div>
      </div>
      <div class="shortcut-item">
        <span class="shortcut-description">Open latest snapshot</span>
        <div class="shortcut-keys" id="shortcut2">${
          archiveCmd?.shortcut ? formatShortcut(archiveCmd.shortcut) : '<kbd>Not set</kbd>'
        }</div>
      </div>
    `;
  });
}