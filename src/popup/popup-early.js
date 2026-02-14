// popup-early.js — run before first paint
// Apply dark mode to <html> element immediately to prevent flash
(function () {
  try {
    if (localStorage.getItem("darkModeEnabled") === "true") {
      document.documentElement.classList.add("dark-mode");
    }
  } catch (e) {
    // Silently fail if localStorage is not available
  }
})();