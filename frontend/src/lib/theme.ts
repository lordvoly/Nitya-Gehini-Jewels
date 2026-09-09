export type ThemePreference = "light" | "dark" | "system";

const STORAGE_KEY = "ngj-theme";

export function getStoredTheme(): ThemePreference {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === "light" || stored === "dark" ? stored : "system";
}

function resolvedIsDark(pref: ThemePreference): boolean {
  return pref === "dark" || (pref === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
}

const THEME_BAR_LIGHT = "#7a1e32";
const THEME_BAR_DARK = "#000000";

// Sets/clears data-theme on <html> — shared.css's dark-mode blocks are
// guarded on this attribute (an explicit choice) vs. its absence (follow
// system via prefers-color-scheme), per the standard three-state pattern.
// Also keeps the browser status/URL bar (<meta name="theme-color">) in
// step — index.html ships two media-scoped copies for the pre-JS moment;
// here, an explicit light/dark choice forces every copy to the chosen
// scheme's colour so it wins whatever the OS reports, while "system"
// restores each copy to its own scheme's value. (An installed PWA's bar
// comes from manifest.webmanifest's theme_color instead — static, set to
// the dark value since that's the primary use.)
export function applyTheme(pref: ThemePreference) {
  const root = document.documentElement;
  if (pref === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", pref);

  const metas = document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]');
  if (pref === "system") {
    metas.forEach((m) => {
      m.content = (m.getAttribute("media") ?? "").includes("dark") ? THEME_BAR_DARK : THEME_BAR_LIGHT;
    });
  } else {
    const color = resolvedIsDark(pref) ? THEME_BAR_DARK : THEME_BAR_LIGHT;
    metas.forEach((m) => {
      m.content = color;
    });
  }
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
