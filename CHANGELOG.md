# Changelog

## v1.8.2
- **Added keyboard shortcuts section in the popup** for easier discovery and quick reference

## v1.8.1
- **Fixed URL normalization for news sites**: Added support for removing `gift` parameter (commonly used by Haaretz and other news sites for temporary access links). Extension now properly detects archived versions of articles even when accessed via gift URLs like `?gift=abc123`.

## v1.8
- **Streamlined keyboard shortcuts**  
  - `Ctrl+Shift+E` (`Cmd+Shift+E` on Mac): Open the extension  
  - `Ctrl+Shift+U` (`Cmd+Shift+U` on Mac): Instantly open the current page with your preferred service  

## v1.7.x
- **Intelligent fallback**: If Archive.today pre-check fails/times out, the extension now tries to open the archive anyway instead of showing an error
- **No empty tabs**: background pre-check for Archive.today (1s timeout) shows an inline "No snapshot available" instead.  
- **Faster popup**: warm pre-check on open, smaller HTML sniff, 100ms click debounce.  
- **CSP-safe + instant dark mode**: early script moved to `popup-early.js`; no white flash; fonts load non-blocking.  
- **Cleaner history**: dedupes by normalized URL (drops UTM/hash, trims slashes); keeps only the latest visit per page (max 5).  
- **Clearer radios**: unchecked = gray ring, checked = blue dot (clearer in light mode).
