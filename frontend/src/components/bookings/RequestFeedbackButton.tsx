import { MessageCircleHeart } from "lucide-react";
import { buildWhatsAppLink, buildFeedbackRequestMessage } from "../../lib/whatsapp";
import type { Booking } from "../../lib/bookings";

// Shared by BookingDetail's More Actions menu and ReturnForm's completion
// success screen — same WhatsApp feedback-request link either place, just
// styled per context via `className`/`iconSize`. A customer with no valid
// phone on file gets a genuinely disabled button with a reason in its
// title, never a broken link — same pattern as every other WhatsApp button
// in this app.
export function RequestFeedbackButton({
  booking,
  shopName,
  className,
  iconSize = 16,
  onClick,
}: {
  booking: Booking;
  shopName: string;
  className: string;
  iconSize?: number;
  onClick?: () => void;
}) {
  const feedback = buildWhatsAppLink(
    booking.customers?.phone,
    buildFeedbackRequestMessage(booking.customers?.name ?? "there", shopName),
  );
  return "url" in feedback ? (
    <a href={feedback.url} target="_blank" rel="noopener noreferrer" className={className} onClick={onClick}>
      <MessageCircleHeart size={iconSize} strokeWidth={2} aria-hidden="true" />
      Request Feedback
    </a>
  ) : (
    <button className={className} disabled title={feedback.error}>
      <MessageCircleHeart size={iconSize} strokeWidth={2} aria-hidden="true" />
      Request Feedback
    </button>
  );
}
