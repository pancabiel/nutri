// Light/dark theme. Default is light ("let the default as it is"): we only add
// the `dark` class to <html> when the user opts in, which the .dark CSS layer in
// index.css keys off to remap the hardcoded Tailwind light utilities to dark.
const KEY = "nutri:theme";

export function getTheme() {
  try {
    return localStorage.getItem(KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

export function applyTheme(theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
}

export function setTheme(theme) {
  try { localStorage.setItem(KEY, theme); } catch {}
  applyTheme(theme);
}

// Call once before render so the saved theme is applied without a flash.
export function initTheme() {
  applyTheme(getTheme());
}
