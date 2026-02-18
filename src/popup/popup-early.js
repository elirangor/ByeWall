// popup-early.js — run before first paint
// Apply dark mode to <html> element immediately to prevent flash
(function () {
  try {
    const saved = localStorage.getItem("darkModeEnabled");

    if (saved === "true") {
      // User explicitly enabled dark mode
      document.documentElement.classList.add("dark-mode");
    } else if (saved === null && window.matchMedia("(prefers-color-scheme: dark)").matches) {
      // No saved preference yet — follow the OS/browser setting
      document.documentElement.classList.add("dark-mode");
    }
    // If saved === "false", user explicitly chose light mode — respect that
  } catch (e) {
    // Silently fail if localStorage is not available
  }
})();