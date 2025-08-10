# ByeWall - Chrome Extension

📦 A browser extension that helps you bypass paywalls and access blocked content by instantly retrieving the latest archived versions of web pages from:
- [Archive.today](https://archive.today)
- [Wayback Machine](https://web.archive.org)

## ✅ Features

- One-click archive to selected services  
- Remembers your preferred archive service  
- Modern, minimal design 
- Keeps track of the last 5 archived pages you've accessed
- Cross-platform compatibility
- RTL language support - proper display for right-to-left languages
- Dark mode support - toggle between light and dark themes 

## 📸 Popup Interface Preview

<img src="screenshot.png" alt="Screenshot of ByeWall popup" width="250">

## 🔧 How to Install

1. Download this repo  
2. Open Chrome and go to `chrome://extensions/`  
3. Enable **Developer mode**  
4. Click **Load unpacked**  
5. Select this folder  

## 🛠 Development Notes

- `popup.js` handles UI logic  
- `popup.html` - Clean, responsive interface with dark mode support
- No external dependencies  
- Simplified design - focused on reliability and ease of use  

### Special thanks to [@8288tom](https://github.com/8288tom) for improving the history functionality.

#### 🔒 Security Features
- URL validation and XSS protection
- Rate limiting to prevent service abuse  
- Secure external link handling

---

## ✨ Recent Improvements (v1.7.x)

- **No empty tabs**: background pre-check for Archive.today (1s timeout) shows an inline “No snapshot available” instead.  
- **Faster popup**: warm pre-check on open, smaller HTML sniff, 100ms click debounce.  
- **CSP-safe + instant dark mode**: early script moved to `popup-early.js`; no white flash; fonts load non-blocking.  
- **Cleaner history**: dedupes by normalized URL (drops UTM/hash, trims slashes); keeps only the latest visit per page (max 5).  
- **Clearer radios**: unchecked = gray ring, checked = blue dot (clearer in light mode).

## 🔍 How It Decides to Open a Tab

1. Background checks `archive.today/newest/<url>`.  
2. If a snapshot exists → opens the archive in a new tab.  
3. If “No results” or timeout → shows a message in the popup (no tab opened).  
4. Wayback Machine flow is unchanged.

## 🔐 Permissions

- `https://archive.today/*`, `https://archive.ph/*` – Archive.today pre-checks  
- `https://web.archive.org/*`, `https://archive.org/*` – Wayback lookups  
- `tabs`, `activeTab`, `storage` – open result tab, read current URL, store prefs/history

---

## 📄 License

MIT – free to use and modify.
