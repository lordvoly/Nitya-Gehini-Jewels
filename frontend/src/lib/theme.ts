export type ThemePreference = "light" | "dark" | "system";

const STORAGE_KEY = "ngj-theme";

export function getStoredTheme(): ThemePreference {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === "light" || stored === "dark" ? stored : "system";
}

function resolvedIsDark(pref: ThemePreference): boolean {
  return pref === "dark" || (pref === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
}

// Sets/clears data-theme on <html> — shared.css's dark-mode blocks are
// guarded on this attribute (an explicit choice) vs. its absence (follow
// system via prefers-color-scheme), per the standard three-state pattern.
// Also keeps <meta name="theme-color"> in step, same reasoning as the
// favicon/manifest work — a browser/OS chrome color that never updates
// reads as broken once the page itself has gone dark.
export function applyTheme(pref: ThemePreference) {
  const root = document.documentElement;
  if (pref === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", pref);

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", resolvedIsDark(pref) ? "#181113" : "#7a1e32");
}

export function setStoredTheme(pref: ThemePreference) {
  if (pref === "system") localStorage.removeItem(STORAGE_KEY);
  else localStorage.setItem(STORAGE_KEY, pref);
  applyTheme(pref);
}

// Called once at startup (main.tsx). index.html's own inline script already
// set data-theme before first paint to avoid a flash of the wrong theme —
// this just picks up from there and, only while the preference is
// "system", keeps re-applying (for the theme-color meta tag's sake; the
// data-theme-less state itself already tracks prefers-color-scheme live
// via CSS with no JS needed) if the OS-level setting changes mid-session.
export function initTheme() {
  const pref = getStoredTheme();
  applyTheme(pref);
  if (pref === "system") {
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
      if (getStoredTheme() === "system") applyTheme("system");
    });
  }
}
