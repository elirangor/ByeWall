# ByeWall - Chrome Extension

📦 A browser extension that bypasses paywalls by instantly retrieving archived versions from [Archive.today](https://archive.today) and [Wayback Machine](https://web.archive.org).

## 💡 What This Solves

Reading news and research articles often means hitting paywalls, leading to a frustrating manual process of accessing archived versions:

1. **Copy** the article URL
2. **Open** Archive.today or Wayback Machine in a new tab  
3. **Paste** the URL and wait for results
4. **Navigate** to the archived version

**This repetitive workflow takes 12-22 seconds per article. With ByeWall, it's now just 2-4 seconds - a 75-85% time savings!**

ByeWall primarily leverages Archive.today for its speed and reliability in archiving current content, while also offering Wayback Machine as an alternative option for accessing historical snapshots and older archives.

For heavy readers who encounter 5-10 paywalled articles daily, that's 1-3 minutes saved every day, or 6-18 hours reclaimed per year. Time that's better spent actually reading quality journalism and research.


## ✅ Features

- One-click access to archived pages
- Choose between Archive.today or Wayback Machine
- Track your last 5 archived pages
- Dark mode support
- Keyboard shortcuts: `Ctrl+Shift+E` (open popup), `Ctrl+Shift+U` (instant open of latest snapshot)
- Option of choosing whether open the archived snapshot on a new tab or in the same one

| Light Mode | Dark Mode |
|------------|-----------|
| <img src="assets/screenshot-light.png" height="500"> | <img src="assets/screenshot-dark.png" height="500"> |


## 🔧 Installation

1. Download this repo
2. Go to `chrome://extensions/`
3. Enable **Developer mode**
4. Click **Load unpacked** and select this folder

## 🔐 Permissions

- Archive services: `archive.today`, `web.archive.org`
- Browser: `tabs`, `activeTab`, `storage`

## 📚 Documentation
- [Changelog](docs/CHANGELOG.md)
- [Technical Notes](docs/TECHNICAL.md)


---

**License:** MIT | **Thanks:** [@8288tom](https://github.com/8288tom) for history improvements