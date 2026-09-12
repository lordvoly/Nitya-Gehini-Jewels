// A shared pool of short, genuinely-true tips about features already
// shipped in this app — shown by LoadingTip (components/common/LoadingTip)
// while a skeleton page is up, so a cold-start wait (Render's free tier
// can take up to ~50s to wake, see useSlowLoadHint) teaches something
// instead of just sitting there. Kept as plain content, no page-specific
// tailoring — every skeleton page pulls from this same pool and rotates
// through it, so "which tip" is just whichever one comes up, not a fixed
// per-page assignment. Update this list as real features ship; nothing
// here should describe something not actually built.
export const LOADING_TIPS: string[] = [
  "Ask the Assistant things like \"What's overdue this week?\" for an instant, grounded answer.",
  "You can search Items by name OR item code — try typing either one.",
  "Share a receipt straight to WhatsApp from Booking Detail — no printing needed.",
  "Retire an item instead of deleting it to keep its booking history intact.",
  "Reports has jump-to-section pills at the top — no more endless scrolling.",
  "\"Request Feedback\" on a completed booking sends a ready-made WhatsApp message asking for a review.",
  "Confirm Pickup records who actually collected the item — self, family, or a porter.",
  "A customer's profile shows their Total Business — their all-time spend at a glance.",
  "Reports can include or exclude influencer/MUA bookings with one toggle.",
  "Made a mistake confirming the wrong line? Undo Pickup is there to fix it.",
  "A shared receipt link works even for a customer who isn't signed in.",
  "Idle Inventory (in Reports) flags items that haven't been booked in 90+ days.",
  "Outstanding Dues (in Reports) links straight to every booking that still owes money.",
  "You can add Notes to a booking right when you create it, not just afterward.",
  "Ask the Assistant who your most repeat customers are — it ranks them for you.",
  "A quantity-tracked item's stock is always computed live, so it never needs manual adjusting.",
  "Ask the Assistant \"What's our total inventory sale value?\" for an instant estimate.",
  "Pending Items tracks anything still missing at return that was never formally charged for.",
  "Tag a customer as Influencer/MUA to keep collabs out of your popularity and repeat-customer stats.",
  "The Dashboard's Overdue and Pickup sections each have a one-tap WhatsApp reminder button.",
];
