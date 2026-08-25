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

// Dashboard "Upcoming Occasions" greeting text — wording differs by type,
// same as the invoice-share message uses the shop's own name rather than
// hardcoding it. Primary phone only (the same field buildWhatsAppLink
// above already defaults to) — phone_secondary is a plain alternate
// contact number, not treated as a second identifier anywhere else in
// this app, and a greeting is exactly the kind of message that should go
// to the number the customer actually gave as their own.
export function buildOccasionMessage(type: "birthday" | "anniversary", customerName: string, shopName: string): string {
  return type === "birthday"
    ? `Happy Birthday, ${customerName}! 🎉 Wishing you a wonderful year ahead — with warm wishes from all of us at ${shopName}.`
    : `Happy Anniversary, ${customerName}! 💍 Wishing you many more years of happiness together — with warm wishes from all of us at ${shopName}.`;
}
