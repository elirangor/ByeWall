# Technical Documentation

## 🛠 Development Notes

### Project Structure
```
src/
├── background/         # Service worker and background scripts
│   └── service-worker.js
├── popup/              # Popup UI (HTML, CSS, JS)
│   ├── popup.html
│   ├── popup.js
│   ├── popup.css
│   └── popup-early.js
├── core/               # Core business logic
│   ├── archive-core.js
│   ├── constants.js
│   └── error-messages.js
├── utils/              # Utility functions
│   └── utils.js
├── storage/            # Storage and history management
│   └── history-manager.js
└── ui/                 # UI rendering and components
    └── popup-ui.js
```

- No external dependencies  
- Modular ES6+ architecture
- Simplified design focused on reliability and ease of use  

### Special thanks to [@8288tom](https://github.com/8288tom) for improving the history functionality.

## 🔒 Security Features
- URL validation and XSS protection
- Rate limiting to prevent service abuse  
- Secure external link handling

## 🔐 Permissions

- `https://archive.today/*`, `https://archive.ph/*` – Archive.today pre-checks  
- `https://web.archive.org/*`, `https://archive.org/*` – Wayback lookups  
- `tabs`, `activeTab`, `storage` – open result tab, read current URL, store prefs/history
- `scripting` – enables "Same Tab" navigation feature

## 🔍 How It Decides to Open a Tab

### Archive.today Flow (with Smart Fallback):
1. Background checks `archive.today/newest/<url>` with 3.5-second timeout
2. **If pre-check succeeds and snapshot exists** → opens the archive
3. **If pre-check fails (timeout/network error)** → retries once with extended timeout
4. **If pre-check succeeds but "No results" found** → shows message in popup (no tab opened)

This means Archive.today will almost always attempt to work, even when the pre-check service is temporarily slow or unavailable.

### Wayback Machine Flow:
- Quick availability check using Wayback's API
- Falls back to full CDX lookup if needed
- Confirms snapshot exists before opening

## 🚀 Why the Fallback Mechanism?

Archive.today's pre-check service can sometimes be slower than the actual archive service itself. Instead of frustrating users with "timeout" errors that require multiple clicks, the extension now intelligently falls back to trying the archive anyway with extended timeouts and retry logic. This provides a much smoother user experience while maintaining the speed benefits of the pre-check when it works.

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

**src/core/archive-core.js** - Main business logic
- `performArchive()` - Main function that handles the archive process
- `precheckArchiveToday()` - Quick check for Archive.today snapshots with retry logic
- `waybackHasSnapshotQuick()` - Quick check for Wayback snapshots
- `getLatestWaybackSnapshot()` - Full CDX lookup for Wayback

**src/background/service-worker.js** - Service worker (MV3)
- Handles keyboard shortcuts
- Message passing between popup and core logic
- Opens popup when shortcuts fail (shows error messages)
- Command listener for instant archive operations

**src/popup/popup.js** - UI logic
- Dark mode toggle with localStorage persistence
- Service preference management
- History display with dynamic timestamps
- Tab behavior control (new/same tab)
- Warm pre-checking on popup open

**src/storage/history-manager.js** - History management
- Save archive entries with deduplication
- URL normalization for matching
- Limited to 5 most recent items
- Smooth clear with undo functionality

**src/ui/popup-ui.js** - UI rendering
- History item rendering with RTL support
- Toast notifications
- Modal message boxes
- Keyboard shortcut hints
- Dynamic relative timestamps

**src/utils/utils.js** - Shared utilities
- Storage helpers (getStorage, setStorage)
- URL validation and normalization
- RTL text detection
- Debounce helper
- Keyboard shortcut formatting

**src/core/constants.js** - Configuration
- Timeout values
- Service identifiers
- Storage keys
- Error codes
- URL templates

**src/core/error-messages.js** - User-facing messages
- Maps error codes to friendly messages
- Consistent error communication

### Data Flow

1. User clicks "Rewind This Page" or uses keyboard shortcut (`Ctrl+Shift+U`)
2. Extension gets current tab URL and title
3. URL is normalized (tracking parameters removed)
4. Based on selected service:
   - **Archive.today**: Hermetic pre-check with retry → open archive URL
   - **Wayback**: Quick API check → full CDX lookup if needed → open
5. Save to history with normalized URL for deduplication
6. Open in new tab or navigate same tab based on user preference

### Error Handling

The extension handles various error conditions gracefully:
- Invalid URLs (not http/https)
- Unsupported page types (`chrome://`, `file://`, etc.)
- Network timeouts (with automatic retry for Archive.today)
- Service unavailability
- No archived versions available

Instead of silent failures, users receive clear, actionable messages about what went wrong.

### State Management

- **chrome.storage.local** for persistent data:
  - User preferences (service, dark mode, tab behavior)
  - Archive history (max 5 items)
  - Pending error messages (30-second timeout)
  
- **localStorage** for instant dark mode (CSP-safe, prevents flash)

- **In-memory state**:
  - Warm precheck promises
  - Undo buffer for cleared history (5-second window)

### UI/UX Features

- **Instant Dark Mode**: Loads before first paint via `popup-early.js`
- **Warm Pre-checking**: Starts precheck when popup opens
- **Debounced Actions**: 100ms debounce on archive button
- **Smooth Animations**: Staggered fade-in/out for history items
- **Toast Notifications**: Non-intrusive feedback with undo actions
- **Relative Timestamps**: Dynamic "X mins ago" updates in history
- **RTL Support**: Proper text direction for Hebrew, Arabic content
- **Keyboard Shortcuts**: Visual hints with platform-specific formatting

## Development

### Building & Testing

1. Clone the repository
2. Load unpacked extension from root directory in Chrome
3. Changes to files in `src/` require extension reload
4. Test both Archive.today and Wayback services
5. Verify keyboard shortcuts work correctly
6. Check history persistence and clearing

### Code Style

- ES6+ modules throughout
- Async/await over callbacks
- JSDoc comments for public functions
- Small, focused functions with single responsibility
- Consistent naming conventions