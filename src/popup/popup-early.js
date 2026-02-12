// popup-early.js — run before first paint
(function () {
  try {
    if (localStorage.getItem("darkModeEnabled") === "true") {
      document.documentElement.classList.add("dark-mode");
    }
  } catch {}
})();