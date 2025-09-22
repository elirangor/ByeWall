# Technical Documentation

## 🛠 Development Notes

- `popup.js` handles UI logic  
- `popup.html` - Clean, responsive interface with dark mode support
- `archive-core.js` - Core archive checking and URL processing logic
- `background.js` - Service worker for keyboard shortcuts and messaging
- No external dependencies  
- Simplified design - focused on reliability and ease of use  

### Special thanks to [@8288tom](https://github.com/8288tom) for improving the history functionality.

## 🔒 Security Features
- URL validation and XSS protection
- Rate limiting to prevent service abuse  
- Secure external link handling

## 🔐 Permissions

- `https://archive.today/*`, `https://archive.ph/*` – Archive.today pre-checks  
- `https://web.archive.org/*`, `https://archive.org/*` – Wayback lookups  
- `tabs`, `activeTab`, `storage` – open result tab, read current URL, store prefs/history

## 🔍 How It Decides to Open a Tab

### Archive.today Flow (with Smart Fallback):
1. Background checks `archive.today/newest/<url>` with 1-second timeout
2. **If pre-check succeeds and snapshot exists** → opens the archive in a new tab  
3. **If pre-check fails (timeout/network error)** → tries opening the archive anyway (fallback mechanism)
4. **If pre-check succeeds but "No results" found** → shows message in popup (no tab opened)

This means Archive.today will almost always attempt to work, even when the pre-check service is temporarily slow or unavailable.

### Wayback Machine Flow:
- Unchanged - queries the API to confirm snapshot exists before opening

## 🚀 Why the Fallback Mechanism?

Archive.today's pre-check service can sometimes be slower than the actual archive service itself. Instead of frustrating users with "timeout" errors that require multiple clicks, the extension now intelligently falls back to trying the archive anyway. This provides a much smoother user experience while maintaining the speed benefits of the pre-check when it works.

## URL Normalization

The extension normalizes URLs before checking for archived versions to improve match accuracy. This process removes:

- Tracking parameters: `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content`, `utm_id`
- Social media tracking: `gclid`, `fbclid`, `mc_cid`, `mc_eid`
- News site access parameters: `gift` (used by Haaretz and similar sites)
- URL fragments (hash)
- Trailing slashes
- Default ports (80 for HTTP, 443 for HTTPS)

This ensures that URLs like:
- `https://example.com/article?utm_source=twitter&gift=abc123#comment`
- `https://example.com/article/`

Are both normalized to:
- `https://example.com/article`

And can find the same archived version.

## Architecture Overview

### Core Components

**archive-core.js** - Main business logic
- `performArchive()` - Main function that handles the archive process
- `precheckArchiveToday()` - Quick check for Archive.today snapshots
- `waybackHasSnapshotQuick()` - Quick check for Wayback snapshots
- `normalizeHistoryUrl()` - URL cleaning and normalization

**background.js** - Service worker
- Handles keyboard shortcuts
- Message passing between popup and core logic
- Opens popup when shortcuts fail (shows error messages)

**popup.js** - UI logic
- Dark mode toggle
- Service preference management
- History display
- Warm pre-checking on popup open

### Data Flow

1. User clicks "Read Behind the Wall" or uses keyboard shortcut
2. Extension gets current tab URL and title
3. URL is normalized (tracking parameters removed)
4. Based on selected service:
   - **Archive.today**: Quick pre-check → open archive URL
   - **Wayback**: API check → get latest snapshot → open
5. Save to history and open in new tab

### Error Handling

The extension handles various error conditions gracefully:
- Invalid URLs
- Unsupported page types (chrome://, file://, etc.)
- Network timeouts
- Service unavailability
- No archived versions available

Instead of silent failures, users receive clear messages about what went wrong.