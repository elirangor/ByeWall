// popup-early.js — run before first paint
(function () {
  try {
    if (localStorage.getItem("darkModeEnabled") === "true") {
      document.documentElement.classList.add("dark-mode");
      var s = document.createElement("style");
      s.textContent =
        "html.dark-mode, html.dark-mode body{background:#121212;color:#eaeaea;color-scheme:dark;}";
      document.head.appendChild(s);
    }
  } catch {}
})();