# Changelog

## v2.2

- **Smooth history clearing with undo**: Added elegant staggered fade-out animation with toast notifications and a 5-second undo window to recover accidentally cleared history
- **Redesigned keyboard shortcuts UI**: Minimal, flat styling that integrates seamlessly with the popup's visual hierarchy as reference information rather than a competing focal point
- **Restructured project architecture**: Reorganized codebase into professional directory structure (`src/background`, `src/popup`, `src/core`, `src/utils`, `src/storage`, `src/ui`) for improved maintainability and scalability



## v2.1

- **Dynamic relative timestamps**: History items now show human-friendly time indicators ("Just now", "15 mins ago", "3 hours ago", "2 days ago") alongside absolute timestamps for items under 7 days old, providing both context and precision at a glance
- **Improved keyboard shortcut display**: Keyboard shortcuts now render as styled `<kbd>` badges with proper visual hierarchy, making them easier to scan and more visually consistent with modern UI patterns
- **Enhanced footer styling**: Improved color contrast and visual hierarchy in the footer section, with better border visibility in light mode and refined text colors for improved readability in both light and dark modes
- **RTL text support improvements**: Fixed timestamp positioning for right-to-left languages (Hebrew, Arabic) to ensure consistent right-aligned placement regardless of content direction
- **Simplified error message design**: Redesigned modal dialogs with cleaner, more focused styling - removed excessive blur effects, animations, and visual noise for a more professional and accessible error presentation
- **Message box width optimization**: Reduced error dialog width from 85% to 70% for better visual balance and less intrusive presentation within the popup interface


## v2.0

- **Added Clear History management with improved UX**: Clear History action added to Recently Viewed section with in-popup confirmation and success feedback, redesigned as a subtle tertiary action with consistent styling and better visual hierarchy
- **Major codebase refactor**: Removed duplicate code, split logic into smaller modules, and improved overall structure and maintainability
- **Theme and layout polish**: Fixed dark mode visibility issues, removed unwanted background artifacts, and tightened spacing between history elements

## v1.9

- **Improved keyboard shortcut reliability**: Increased Archive.Today timeout and added automatic retry logic to prevent "blocked or timed out" errors on first attempt
- **Enhanced history visibility**: Redesigned service badges and timestamps with better visual hierarchy - service names now appear in outlined badges with bold text, timestamps are extra bold for easier scanning
- **Better visual feedback**: Metadata in history items is now more prominent and easier to distinguish at a glance

## v1.8.6

- Downgraded non-critical precheck DOMException logging to avoid misleading console errors.

## v1.8.5

- **Improved UI**: Refined light mode for a softer, more eye-friendly look + consistent fonts across buttons and controls
- **No empty archive tabs**: When using the keyboard shortcut, the extension now blocks opening Archive.Today if no snapshot exists and shows “No snapshot available…” instead
- **Minor wording updates**: Small adjustments to names and button labels for clarity and consistency

## v1.8.4

- **Improved tab behavior control UI**

## v1.8.3

- **Added tab behavior control**: New toggle to choose between opening snapshots in a new tab -(default) or replacing the current tab
- **Smart tab positioning**: When opening in new tab, the archived page opens adjacent to the current tab instead of at the end

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
