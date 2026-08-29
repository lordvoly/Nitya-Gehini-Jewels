// lucide-react (this app's icon set) doesn't ship a branded Instagram
// glyph — brand logos were dropped from the library over trademark
// concerns — so this is a small hand-drawn stand-in in the same line-icon
// style as the rest of this app's lucide icons (stroke=currentColor,
// viewBox 0 0 24 24, strokeWidth 2): a plain rounded-square camera
// outline, not a reproduction of Meta's own logo artwork.
export function InstagramIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  );
}
