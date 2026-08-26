// Builds a wa.me deep link from a stored phone number. The DB already
// normalizes customers.phone to a clean 10-digit string at write time
// (backend/src/routes/customers.ts's normalizePhone()), but that's not
// schema-enforced — nothing rejects a shorter value if one ever slips in
// (see phone_secondary's real 9-digit case found during investigation) —
// so this re-validates defensively rather than trusting the stored value
// blindly. Returns an error reason instead of a broken link when the
// number can't be turned into a valid 91XXXXXXXXXX number.
export function buildWhatsAppLink(phone: string | null | undefined, message: string): { url: string } | { error: string } {
  const digits = (phone ?? "").replace(/\D/g, "").slice(-10);
  if (digits.length !== 10) {
    return { error: "No valid phone number on file for this customer" };
  }
  return { url: `https://wa.me/91${digits}?text=${encodeURIComponent(message)}` };
}

// Dashboard "Upcoming Occasions" greeting text — finalized copy (not the
// placeholder short version from initial build). Wording differs by type;
// shop name pulled from shop_settings same as the invoice-share message
// does, never hardcoded — same for the discount percentage, which lives
// on shop_settings.occasion_discount_percent rather than being baked into
// this template, so it can change without a code deploy. The *asterisks*
// around the shop name are WhatsApp's own bold-text syntax, not
// decorative punctuation — kept literally in the source string so
// WhatsApp renders the name in bold once the message is opened there.
// Primary phone only (the same field buildWhatsAppLink above already
// defaults to) — phone_secondary is a plain alternate contact number, not
// treated as a second identifier anywhere else in this app, and a
// greeting is exactly the kind of message that should go to the number
// the customer actually gave as their own.
export function buildOccasionMessage(
  type: "birthday" | "anniversary",
  customerName: string,
  shopName: string,
  discountPercent: number,
): string {
  return type === "birthday"
    ? `Dear ${customerName}, another year, another reason to sparkle! From all of us at *${shopName}*, we wanted to take a moment to wish you a very happy birthday. It's always a joy being part of your special moments, and we hope this year brings you as much warmth and beauty as you bring into every room you walk into. As a small gift from us to you, enjoy ${discountPercent}% off anything you rent or buy with us today — our way of saying thank you for being part of our family.`
    : `Dear ${customerName}, happy wedding anniversary! We still remember the joy of being part of your special day, and it means so much to us that our journey with you continues well beyond it. Wishing you a year ahead filled with love, laughter, and many more moments worth celebrating. As our gift to you, enjoy ${discountPercent}% off anything you rent or buy with us today, with warm wishes from all of us at *${shopName}*.`;
}
