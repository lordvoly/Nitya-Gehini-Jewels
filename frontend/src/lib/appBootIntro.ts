// Tracks whether the Dashboard's logo intro (LogoIntroLoader) has already
// played once this app session. A plain in-memory module-level flag —
// deliberately not sessionStorage/localStorage — so it resets on a real
// reload or a fresh tab (a genuine new app bootup) but stays set for the
// rest of the session once the user starts navigating between tabs
// client-side. Per explicit request: the intro is a first-boot moment
// right after logging in, not something that replays every time the
// Dashboard tab remounts.
let shown = false;

export function hasShownBootIntro(): boolean {
  return shown;
}

export function markBootIntroShown(): void {
  shown = true;
}
