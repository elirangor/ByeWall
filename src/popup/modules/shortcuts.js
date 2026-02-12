// shortcuts.js - Keyboard shortcut formatting and display

import { updateShortcutHints } from "../../ui/popup-ui.js";

/**
 * Initialize keyboard shortcut hints with proper formatting
 */
export function initializeShortcutHints() {
  updateShortcutHints((shortcut) => {
    if (!shortcut) return "";

    // Handle both formats: "Ctrl+Shift+E" (with +) and "ShiftCmdE" (Mac concatenated)
    let keys;

    if (shortcut.includes("+")) {
      // Already has separators (Windows format)
      keys = shortcut.split("+").map((k) => k.trim());
    } else {
      // Mac concatenated format - need to split intelligently
      // Possible keys: Shift, Cmd, Command, Ctrl, Alt, Option, and single letters
      keys = [];
      let remaining = shortcut;

      // Define patterns to match (order matters - longer matches first)
      const patterns = [
        { regex: /^Command/, replacement: "Cmd" },
        { regex: /^Shift/, replacement: "Shift" },
        { regex: /^Ctrl/, replacement: "Ctrl" },
        { regex: /^Cmd/, replacement: "Cmd" },
        { regex: /^Alt/, replacement: "Alt" },
        { regex: /^Option/, replacement: "Option" },
        { regex: /^⌘/, replacement: "Cmd" },
        { regex: /^⇧/, replacement: "Shift" },
        { regex: /^⌃/, replacement: "Ctrl" },
        { regex: /^⌥/, replacement: "Option" },
      ];

      while (remaining.length > 0) {
        let matched = false;

        // Try to match modifier keys
        for (const pattern of patterns) {
          if (pattern.regex.test(remaining)) {
            keys.push(pattern.replacement);
            remaining = remaining.replace(pattern.regex, "");
            matched = true;
            break;
          }
        }

        // If no modifier matched, take the first character (the actual key)
        if (!matched && remaining.length > 0) {
          keys.push(remaining[0]);
          remaining = remaining.slice(1);
        }
      }

      // Reorder Mac shortcuts to match convention: Cmd > Ctrl > Alt/Option > Shift > Letter
      // This matches the standard Mac modifier key order
      const keyOrder = { Cmd: 1, Ctrl: 2, Alt: 3, Option: 3, Shift: 4 };
      keys.sort((a, b) => {
        const orderA = keyOrder[a] || 999; // Letters get high number
        const orderB = keyOrder[b] || 999;
        return orderA - orderB;
      });
    }

    // Convert to symbols for better visual appearance
    // Shift = ⇧ (both platforms)
    // Mac: Cmd = ⌘, Option = ⌥
    // Windows/both: Ctrl and Alt stay as text
    const symbolMap = {
      Shift: "⇧",
      Cmd: "⌘",
      Option: "⌥",
      // Ctrl and Alt remain as text
    };

    // Apply symbol mapping
    const displayKeys = keys.map((key) => symbolMap[key] || key);

    // Wrap each key in <kbd> tag
    const kbdKeys = displayKeys.map((key) => `<kbd>${key}</kbd>`);

    // Join with styled plus sign
    return kbdKeys.join('<span class="shortcut-plus">+</span>');
  });
}
