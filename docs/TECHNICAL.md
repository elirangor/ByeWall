# Technical Documentation

## 🛠 Project Structure

```
src/
├── background/         # Service worker - keyboard shortcuts, message passing
├── popup/              # UI components
│   ├── popup.js        # Main coordinator (52 lines)
│   ├── popup.css
│   └── modules/        # Modular components (precheck, history, shortcuts, ui-handlers)
├── core/               # Business logic (archive-core, constants, error-messages)
├── utils/              # Shared utilities
├── storage/            # History management
└── ui/                 # UI rendering (popup-ui)
```

**Philosophy:** Modular ES6+ architecture, no external dependencies, focused on reliability.

### Special thanks to [@8288tom](https://github.com/8288tom) for improving the history functionality.

---

## 🔐 Permissions

- `https://archive.today/*`, `https://archive.ph/*` – Archive.today pre-checks  
- `https://web.archive.org/*`, `https://archive.org/*` – Wayback lookups  
- `tabs`, `activeTab`, `storage` – Tab management, URL reading, data persistence
- `scripting` – Enables "Same Tab" navigation

---

## 🔍 Archive Decision Flow

### Archive.today (with Smart Fallback)
1. Pre-check `archive.today/newest/<url>` (3.5s timeout)
2. **If exists** → open archive
3. **If timeout** → retry with extended timeout
4. **If no results** → show message (no tab opened)

**Why fallback?** Archive.today's pre-check can be slower than the archive itself. Fallback provides smoother UX while keeping speed benefits when it works.

### Wayback Machine
- Quick API availability check
- Falls back to full CDX lookup if needed
- Confirms snapshot before opening

---

## 🎯 URL Normalization

Removes tracking params (`utm_*`, `gclid`, `fbclid`, `gift`), hash fragments, trailing slashes, and default ports to match archived versions accurately.

**Example:**  
`https://example.com/article?utm_source=twitter#comment` → `https://example.com/article`

---

## 🏗️ Architecture Overview

### Key Components

**Core Logic (`src/core/archive-core.js`)**
- `performArchive()` - Main archive workflow
- Pre-check functions with retry logic
- Handles both Archive.today and Wayback

**Background (`src/background/service-worker.js`)**
- Keyboard shortcut handling
- Message passing between popup and core
- Opens popup on shortcut failures

**Popup Coordinator (`src/popup/popup.js`)**
- 52 lines - just initialization and orchestration
- Imports and wires up all modules

**History Management (`src/storage/history-manager.js`)**
- Max 5 items with URL deduplication
- `deleteHistoryItem()` / `restoreHistoryItem()` for undo support
- Normalized URL matching

**UI Rendering (`src/ui/popup-ui.js`)**
- History rendering with delete handlers
- Toast notifications
- Modal dialogs
- RTL support

---

## ⚡ State Management

**Persistent (chrome.storage.local):**
- User preferences (service, dark mode, tab behavior)
- Archive history (max 5 items)
- Pending error messages (30s timeout)

**Instant (localStorage):**
- Dark mode flag (prevents flash on load)

**In-Memory:**
- Warm precheck promises
- Undo buffers (5s windows for clear/delete)

---

## 🎨 UI/UX Features

- **Instant Dark Mode** - Loads before first paint via `popup-early.js`
- **Warm Pre-checking** - Starts when popup opens
- **Debounced Actions** - 100ms on archive button
- **Toast Notifications** - Undo actions with 5s windows
- **Relative Timestamps** - "X mins ago" with absolute fallback
- **RTL Support** - Automatic text direction
- **Keyboard Shortcuts** - Platform-specific symbols (⌘, ⇧, ⌥)

---

## 🗑️ Individual History Item Deletion

### Design
- **×** button centered in metadata line (between service badge and timestamp)
- Hidden by default, fades in on item hover
- Gray → Bright red on hover (#ea4335 light, #ff6b6b dark)
- No animations that cause jumping

### Why Margin-Based Centering?
```css
position: absolute;
left: 50%;
top: 50%;
margin-left: -8px;  /* Half of width */
margin-top: -8px;   /* Half of height */
```

**Transform causes jumping.** Margin-based centering is static and perfectly stable.

### User Flow
1. Hover item → × fades in
2. Hover × → turns red
3. Click → 500ms fade-out animation
4. Toast with 5s undo window
5. History re-renders (no entry animations)

### Technical Notes
- Delete button created inline in metadata row (not absolute positioned outside)
- `e.preventDefault()` + `e.stopPropagation()` prevents link navigation
- Reuses `fadeOutSlide` animation for consistency
- Removed entry animations to prevent unwanted movement during deletions
- Separate undo buffer from "Clear History" feature

---

## 🔒 Security

- URL validation and XSS protection
- Rate limiting to prevent abuse
- Secure external link handling

---

## 🚀 Development

### Quick Start
1. Clone repository
2. Load unpacked extension in Chrome
3. Changes require extension reload

### Testing Checklist
- Both archive services work
- Keyboard shortcuts functional
- History persistence and clearing
- Individual delete with undo
- Dark mode in both themes
- RTL language support

### Code Style
- ES6+ modules
- Async/await (no callbacks)
- Small, focused functions
- Clear separation of concerns