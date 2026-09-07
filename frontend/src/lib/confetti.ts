import confetti from "canvas-confetti";

// A small celebratory burst fired once a booking is fully wrapped up (every
// item returned/sold) — see ReturnForm.tsx, which fires this only when the
// item just returned completes the whole booking, never on every single
// item return. Brand colors (wine/gold/ivory), one modest burst rather than
// a longer show — this is a small delight, not the main event.
export function fireCompletionConfetti() {
  confetti({
    particleCount: 90,
    spread: 70,
    origin: { y: 0.6 },
    colors: ["#7a1e32", "#a9822e", "#fbf8f3", "#3f6b4c"],
  });
}
