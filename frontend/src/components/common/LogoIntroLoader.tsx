import ngjLogo from "../../assets/images/ngj-logo.png";

// Shown for the first few seconds of the Dashboard's very first load
// (DashboardPage.tsx swaps this out for the regular DashboardSkeleton once
// a short timer elapses, or for real content the moment data actually
// arrives, whichever comes first) — a branded "something is happening"
// moment for the part of the wait a plain shimmer skeleton doesn't cover
// well on its own. The spin is on a ring around the logo, not the logo
// itself, so the "NGJ" wordmark stays upright and legible throughout.
export function LogoIntroLoader() {
  return (
    <div className="page logo-intro">
      <div className="logo-intro-ring">
        <img src={ngjLogo} alt="Nitya Gehini Jewels" className="logo-intro-img" />
      </div>
    </div>
  );
}
