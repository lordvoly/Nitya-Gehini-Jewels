// Content for the in-app Help section (/help), written for the shop's own
// staff rather than a developer — plain language, no internal terminology.
//
// Structure is deliberately flat and additive: HELP_CONTENT is an ordered
// list of groups (organized by task, e.g. "Taking a Booking", not by
// screen), each holding an ordered list of topics. A later batch of
// content is added by appending more HelpGroup entries to this array —
// nothing here needs to be reshaped to make room. `walkthroughId` on a
// topic is reserved for a future interactive walkthrough layered on top of
// the same content; it's left undefined everywhere for now, since this
// batch is written content only.
export interface HelpTopic {
  id: string;
  title: string;
  // One or more short paragraphs. A paragraph may use **bold** for a word
  // or phrase — the only markdown this page understands, same minimal
  // approach the Assistant chat page already uses for its replies.
  body: string[];
  walkthroughId?: string;
}

export interface HelpGroup {
  id: string;
  title: string;
  topics: HelpTopic[];
}

export const HELP_CONTENT: HelpGroup[] = [
  {
    id: "getting-started",
    title: "Getting Started",
    topics: [
      {
        id: "dashboard-tour",
        title: "What you'll see when you open the app",
        body: [
          "The Dashboard is the home screen — it opens automatically when you log in. At the top are four quick numbers: how many items are in the catalog, how many are currently out with a customer, how many customers you have, and how many bookings were made this week. Tapping any of these takes you straight to the full list behind it.",
          "Just below that is **Outstanding balance** — the total money still owed across every booking that's still active. Tapping it jumps to the full breakdown in Reports.",
          "Underneath that are two lists that matter every single day: **Today's Returns Due** (rentals that should come back today) and **Overdue Rentals** (rentals that are already late). Further down are **Today's Pickups Due** and **This Week's Pickups Due** — items customers are expected to collect. Tapping any row takes you straight to that booking.",
        ],
      },
      {
        id: "dashboard-reminders",
        title: "The Payment Due and Item Due reminders",
        body: [
          "The first time you open the Dashboard on a given day, you may see one or two small pop-ups — **Payment Due** (money still owed across active bookings) and **Item Due** (returns due today or overdue). These are just a quick summary of things already shown further down the Dashboard — nothing new to check, just a heads-up so you don't have to scroll to notice them.",
          "If there's nothing due, no pop-up appears at all. Each one only needs a **Dismiss** or **View Details** tap once — after that it won't show again for the rest of that day, even if you close the app and come back later. It reappears the next day if there's still something due.",
        ],
      },
      {
        id: "getting-around",
        title: "Getting around the app",
        body: [
          "On a computer or a wide screen, every section — Dashboard, Items, Customers, Bookings, Reports, Expenses, Charges, Ask — is shown as its own tab across the top, all reachable in one tap.",
          "On a phone, there's only room for the sections you'll reach for most often: Dashboard, Bookings, **Ask** (the AI assistant, shown as the middle button with a small sparkle badge), Items, and Customers. The rest — Reports, Expenses, Charges, and Settings if you're an admin — live behind the menu icon (☰) in the top-right corner, next to your profile picture.",
          "Wherever you are in the app, tapping your initials or photo in the top-right corner opens your profile — you can change your display name, add a profile photo, or change your password from there.",
        ],
      },
    ],
  },
  {
    id: "taking-a-booking",
    title: "Taking a Booking",
    topics: [
      {
        id: "start-booking",
        title: "Starting a new booking: Rental or Sale",
        body: [
          "From the Bookings section, tap **+ New Booking**. The very first thing you're asked is whether this is a **Rental** or a **Sale** — nothing else on the form appears until you choose one, since almost everything below depends on it (a rental needs a return date and can take a security deposit; a sale doesn't).",
          "This choice just sets what new items on this booking default to — it doesn't lock you in. You can still add a Sale item to a Rental booking (or the other way around) using the small \"+ Add a Sale item instead\" link further down the form, and you can tap Rental/Sale again at any time to change what the next item you add defaults to. It never changes an item you've already added.",
        ],
      },
      {
        id: "choosing-customer",
        title: "Choosing or adding a customer",
        body: [
          "Search for the customer by name or phone number first. If they already exist, tap their name to select them.",
          "If they're new, tap **+ Add New Customer** right there in the booking — a small form opens without leaving the booking, and the moment you save it, that new customer is automatically selected for this booking. You never have to go find them afterwards.",
        ],
      },
      {
        id: "adding-items",
        title: "Adding items to the booking",
        body: [
          "For each item, choose it from the dropdown list, then set its pickup date (and return date, for a rental) and the price to charge. If the item already has a rental or sale price set up, the price fills in automatically — you can still change it for this one booking without affecting the item's usual price.",
          "Need to book something that isn't in the catalog yet? Tap **+ Create New Item** right on that line — it opens the same item-adding form in a small window, and the item you create is immediately selected for that line, with no need to leave the booking or search for it afterwards.",
          "Tap **+ Add Another Item** to add more items to the same booking (for example, a full outfit's worth of pieces picked up together in one visit) — each item keeps its own dates, price, and type independently.",
        ],
      },
      {
        id: "additional-items",
        title: "Extra items added just for this booking",
        body: [
          "Under **Additional Items** on any line, you can type in something extra that isn't part of the item's own listed contents — for example a borrowed pouch, or a nath the customer is taking along with a set. This only applies to this one booking; it doesn't change what that item normally comes with.",
          "Anything you add here will show up again automatically on the return checklist when this item comes back, right alongside the item's own regular contents, so nothing gets forgotten.",
        ],
      },
      {
        id: "foc-items",
        title: "Free items for influencers and collaborators",
        body: [
          "Some customers — influencers or makeup artists (MUAs) you work with — are sometimes lent an item for free as part of a collaboration. This option, labelled **Free of Cost (FOC)**, only appears on the booking form when the selected customer is tagged as an Influencer or MUA in their customer profile. It never appears for a regular customer.",
          "Checking this box doesn't clear the price field — the item's usual price still shows, purely as a record of what it would normally have cost. It just marks that nothing is actually being charged for that item on this booking.",
        ],
      },
      {
        id: "advance-payment",
        title: "Taking an advance payment",
        body: [
          "If the customer is paying something up front, enter the amount under **Advance Received** and pick a payment method — this gets recorded as a real payment against the booking straight away, the same as any other payment. Leave it blank (or at 0) if nothing's being collected yet.",
          "If you don't set a date, today's date is used automatically.",
        ],
      },
      {
        id: "gst-details",
        title: "GST details",
        body: [
          "There's a **GST applicable** checkbox with fields for a GST invoice number, HSN code, and tax rate. These are captured and saved on the booking, and are visible on the booking's own detail screen — but they currently do **not** appear anywhere on the printed or shared receipt. The receipt is a plain document with no GST section at all right now, so don't rely on it to show a customer their GST details just yet.",
        ],
      },
      {
        id: "booking-conflicts-warnings",
        title: "When the app won't let you book — and when it just warns you",
        body: [
          "For a one-of-a-kind item, the app checks that its dates don't genuinely overlap with another active booking on the same item before letting you save. If they do, you'll see exactly which existing booking is in the way, with its dates, so you can pick different ones or check with the customer.",
          "One case is deliberately **allowed**, not blocked: booking an item for pickup on the exact same day another booking has it down for return. This is a normal same-day turnaround (the item comes back in the morning and goes straight back out that evening), so the booking goes through — but you'll see a small warning reminding you to confirm the item's actually been checked in before handing it to the next customer. This has been checked directly and does work exactly this way.",
          "For a stock-count item (one you keep several of), the app checks you're not promising more units than you actually have available across that date range, the same way.",
        ],
      },
      {
        id: "review-and-save",
        title: "Reviewing and saving the booking",
        body: [
          "The booking code and booking date are both filled in for you automatically (the code as a suggestion you can type over, the date defaulting to today), but you're free to change either before saving.",
          "Once saved, you'll see a confirmation screen with the booking code, the customer, and a summary of what was booked — plus the same-day-turnaround warning mentioned above, if it applies. From there you can start another booking straight away.",
        ],
      },
    ],
  },
  {
    id: "pickup-and-return",
    title: "Pickup & Return",
    topics: [
      {
        id: "confirm-pickup",
        title: "Confirming an item has been picked up",
        body: [
          "A booking on its own just means an item has been reserved — it doesn't mean it's actually left the shop yet. When the customer actually comes to collect it, open that booking and tap **Confirm Pickup** on that item. This applies to both rentals and sales — a sale doesn't have a return step, but it's still useful to know whether the customer has actually taken it yet.",
          "You can optionally collect a payment at the same time — the amount box is pre-filled with whatever balance is still owed, but you can change it or clear it to 0 if nothing's being collected right now.",
        ],
      },
      {
        id: "needs-confirmation",
        title: "When a pickup was never confirmed",
        body: [
          "If a rental's pickup date has already passed but nobody tapped Confirm Pickup, it shows up in a bucket called **Needs Confirmation** — both in the Bookings list filters and as a badge on the item itself in the Items list. This is different from an item that's genuinely been confirmed as out — it's a nudge to go check whether the item actually left the shop or the pickup simply hasn't been recorded yet.",
        ],
      },
      {
        id: "undo-pickup",
        title: "Undoing a pickup by mistake",
        body: [
          "If Confirm Pickup gets tapped on the wrong line by accident — this can happen when the same item is booked twice in one transaction, one cycle already finished and one still upcoming — open the booking and tap **Undo Pickup** on that item. It puts the item back to booked and clears the pickup date that was recorded.",
          "This only undoes the pickup status itself. If a payment was collected at that same moment, undoing the pickup doesn't touch it — that would need to be corrected separately from the booking's Payments section.",
        ],
      },
      {
        id: "process-return",
        title: "Processing a return",
        body: [
          "When a rented item comes back, open the booking and tap **Process Return** on that item. If it's a set with multiple parts, or has extra items added at booking time, you'll see a checklist covering everything — tick off what's actually been returned.",
          "If you leave the actual return date blank, today's date is used automatically. There's also a notes field for anything worth recording about the return.",
          "If something on the checklist is left unticked with no note explaining why, the return still goes through, but you'll see a gentle warning afterwards suggesting you add a note — it's not a hard stop, since the shop needs to be able to close out a return even when something's missing.",
        ],
      },
      {
        id: "lost-and-found-charges",
        title: "Missing or damaged items at return",
        body: [
          "For anything left unticked on the return checklist, a **Charge for this** option appears right next to it. Ticking it lets you enter a description and an amount to charge the customer for that missing or damaged piece — this is added to what they owe, the same as any other charge.",
          "Every charge raised this way, across every booking, can be found later in the **Charges** section, where it can be resolved once it's settled.",
        ],
      },
      {
        id: "deposit-refund",
        title: "Security deposits at return",
        body: [
          "If a security deposit was collected on this item, the return screen shows a **Deposit refunded** checkbox. Ticking it (and, if you like, adjusting the refund date) records that the deposit has gone back to the customer. This is tracked separately from the booking's balance — a deposit was never added to what the customer owes in the first place, so refunding it doesn't change that figure either.",
        ],
      },
    ],
  },
  {
    id: "managing-a-booking",
    title: "Managing an Existing Booking",
    topics: [
      {
        id: "booking-detail",
        title: "Viewing a booking's details",
        body: [
          "Open any booking from the Bookings list (tap **View**) to see its full picture: status, price charged, total paid, and balance due, plus every item on the booking with its own dates and status. If GST details were entered when the booking was made, they're shown here too — this is the one place they're visible, since (as covered under Taking a Booking) they don't currently appear on the printed receipt.",
        ],
      },
      {
        id: "record-payment",
        title: "Recording a payment",
        body: [
          "From a booking's detail screen, tap **Record Payment** to log money received — amount, method, date, and an optional note. If you leave the date blank, today's date is used automatically. This is separate from the advance you might already have taken at booking time or at pickup — every payment, whenever it happens, adds up toward the same balance.",
        ],
      },
      {
        id: "edit-payment",
        title: "Correcting a payment mistake",
        body: [
          "If an amount was entered wrong — a typo, a wrong digit — don't record a second payment to fix it. Instead, tap **Edit Payment** next to that specific entry, enter the corrected amount, and give a short reason for the change (this is required — the app won't save the correction without one). This works even on a booking that's already fully completed, since a real mistake can be noticed after the fact.",
          "Every correction made this way is kept as a visible record right under that payment — the old amount, the new amount, the reason given, who made the change, and when — so nothing about a booking's money history is ever silently overwritten.",
          "This only applies to genuine payments. A refund (from removing an item or cancelling a booking, both covered below) isn't corrected this way — it's tied to its own specific reason and doesn't have an Edit option next to it.",
        ],
      },
      {
        id: "booking-notes",
        title: "Adding a private note to a booking",
        body: [
          "A booking has its own internal Notes field — useful for anything worth remembering that doesn't belong anywhere else, like an informal arrangement with the customer. This is strictly internal: it's never shown on the printed or shared receipt, and can be added or edited at any time regardless of the booking's status.",
        ],
      },
      {
        id: "when-returns",
        title: "Seeing what's next for an item",
        body: [
          "On a one-of-a-kind item's line within a booking, you'll see a small panel showing the next booking already lined up for that same physical item, if there is one — useful for knowing exactly who's waiting once this one comes back. This only applies to one-of-a-kind items; a stock-count item can have several bookings active side by side, so there's no single \"what's next\" for it.",
        ],
      },
      {
        id: "edit-booking",
        title: "Editing a booking's details",
        body: [
          "Tap **Edit Booking** from a booking's detail screen to change the customer, booking code, booking date, GST details, or any individual item's own dates, price, deposit, or extras — each item saves independently, so you can fix one line without touching the others.",
        ],
      },
      {
        id: "add-remove-item",
        title: "Adding or removing an item from an existing booking",
        body: [
          "From Edit Booking, **+ Add Item** adds another item to an already-existing booking, the same way as when it was first created. **Remove Item** takes one item back off — it's never actually deleted, just marked cancelled so the booking's history stays complete.",
          "If the customer had already paid more than what's left owing once that item is removed, the app won't silently keep the extra money or block the removal — it tells you the exact amount that would need refunding, pre-filled and editable, and only finishes removing the item once you confirm that refund. Confirmed live: on a real ₹2000 booking with ₹1500 already paid, removing a ₹1000 item correctly showed \"refunding ₹500 already paid toward it\" before completing.",
        ],
      },
      {
        id: "cancel-booking",
        title: "Cancelling a whole booking",
        body: [
          "Also from Edit Booking, **Cancel Booking** cancels every still-active item on that booking in one action — again, nothing is deleted, the booking's history remains. The refund amount is pre-filled with whatever the customer has already paid, and you can edit it down before confirming if you're keeping part of it (e.g. a cancellation fee).",
        ],
      },
      {
        id: "receipt-sharing",
        title: "Printing, downloading, or sending the receipt",
        body: [
          "From a booking's detail screen, **Print/Download Receipt** opens a plain receipt in a new tab — use your browser's own print dialog (or its Save-as-PDF option) from there.",
          "That receipt page also has a **Send via WhatsApp** button, which opens a message pre-filled with a link the customer can open without needing to log in — it shows them the same booking information (items, dates, price, what's paid, what's owed) on its own simple page. This button is only available when the customer has a usable phone number on file.",
        ],
      },
    ],
  },
  {
    id: "money-and-reports",
    title: "Money & Reports",
    topics: [
      {
        id: "reports-overview",
        title: "Understanding the Reports page",
        body: [
          "Reports pulls together everything about how the shop is doing — bookings, profit and loss, popular items, idle stock, and who still owes money. It defaults to the current month, with a From/To date picker to widen or narrow that window. Use the **Jump to** dropdown near the top to skip straight to any section instead of scrolling.",
        ],
      },
      {
        id: "pnl",
        title: "Profit & Loss",
        body: [
          "Shows revenue, expenses, and the net figure for whatever date range is selected, plus a breakdown of expenses by category.",
        ],
      },
      {
        id: "most-booked-repeat-customers",
        title: "Most-booked items and repeat customers",
        body: [
          "Most-Booked Items shows which items were booked most often within the selected date range. Repeat Customers shows every customer with more than one booking, along with their total spend — this one is always calculated across the customer's entire history, not just the range currently selected, since the point is to identify a loyal customer regardless of when their bookings happened. Confirmed live: narrowing the date range to a single day left the repeat-customer count unchanged.",
          "The \"Include influencer/MUA collabs\" checkbox only affects these two sections — items or bookings that were free of cost for an influencer or MUA are left out of both by default, so they don't skew what's genuinely popular or who's genuinely a paying repeat customer, unless you deliberately switch it on.",
        ],
      },
      {
        id: "idle-inventory",
        title: "Idle inventory",
        body: [
          "Lists active items that haven't been booked in the last 90 days — a fixed window, independent of the date range picker above, meant to surface stock that might be worth promoting or reactivating attention on. Retired items are left out, since they're not something you'd be trying to move anyway.",
        ],
      },
      {
        id: "outstanding-dues",
        title: "Outstanding dues",
        body: [
          "A list of every booking that still has money owed on it, most owed first — this is a snapshot of where things stand right now, not scoped to the selected date range at all, so a booking from last month that's still unpaid will always show up here regardless of what dates are picked above. Confirmed live: narrowing the date range to a single day left this list completely unchanged. Tap a row to jump straight into that booking.",
        ],
      },
      {
        id: "expenses",
        title: "Expenses",
        body: [
          "A simple log of shop expenses — category, amount, date, and an optional description — with a running total for whatever date range is selected. Use **+ Add Expense** to record a new one; if you leave the date blank, today's is used.",
        ],
      },
      {
        id: "outstanding-charges",
        title: "Outstanding charges",
        body: [
          "The Charges section is the one place to see every unresolved lost-or-damaged-item charge across all bookings at once (these get raised during Process Return — see Pickup & Return). Once a charge has actually been settled with the customer, tap **Resolve** to close it out.",
        ],
      },
    ],
  },
  {
    id: "managing-inventory",
    title: "Managing Inventory",
    topics: [
      {
        id: "adding-an-item",
        title: "Adding a new item",
        body: [
          "From Items, tap **+ Add Item** to step through a short wizard: photos, basic details, components (only for a set), then pricing. The item code is suggested automatically but you can type your own before saving.",
          "Two choices matter here and are hard to change casually later: whether it's a **Single Piece** or a **Set (multiple parts)** — a set gets its own list of components, like Necklace/Earrings/Tika, which shows up again later at return time — and whether it's tracked as **One of a kind** or a **Stock count**. One of a kind means there's exactly one physical piece, and the app tracks exactly where and with whom it is at any moment. Stock count means you keep several of the same thing, and instead of tracking one specific piece, the app just keeps count of how many are free for a given date range.",
        ],
      },
      {
        id: "editing-an-item",
        title: "Editing an item",
        body: [
          "Tap **Edit** on any item to change its name, code, category, type, pricing, photos, components, or notes. The item code can be changed here too — if you try to save a code that's already used by another item, you'll get a clear message rather than a confusing error, and your original code stays unchanged until you fix it.",
        ],
      },
      {
        id: "retire-vs-delete",
        title: "Retiring or reactivating an item, vs. deleting it",
        body: [
          "**Delete** permanently removes an item — but only works for an item that's never actually been booked. The moment an item has any booking history, Delete is blocked with a clear message rather than a confusing database error, since deleting it would break that history. Confirmed live: an item with a real booking attached showed \"This item has booking history and can't be deleted\" and stayed exactly as it was.",
          "**Retire** is almost always the better choice for an item you're no longer using — it works on any item, with or without booking history, and unlike Delete it's fully reversible. A retired item disappears from the item picker on new bookings, so it can't accidentally be booked again, but it stays fully visible (marked **Retired**) in the Items list, and its own booking history and Total Earnings stay exactly as they were. Tap **Reactivate** any time to bring it back into circulation.",
        ],
      },
      {
        id: "item-photos",
        title: "Item photos",
        body: [
          "On a phone, adding a photo shows two separate buttons — **Take Photo** (opens the camera directly) and **Choose Files** (opens your photo gallery) — so you're never stuck with only the camera when you actually meant to pick an existing picture.",
          "On the Items list, tapping an item's thumbnail opens it full-size, with arrows to move between photos if there's more than one.",
        ],
      },
      {
        id: "items-search-filter",
        title: "Searching and filtering the items list",
        body: [
          "The search box matches on name or item code. The All/Active/Retired/Currently Out buttons narrow the list further — Currently Out reflects items genuinely confirmed as picked up (see Pickup & Return), not just items with a booking somewhere in the future.",
        ],
      },
      {
        id: "item-detail-inventory",
        title: "An item's own detail page",
        body: [
          "Tap an item's name or code to open its own page: full details, every photo, and its complete booking history, including past bookings that were later cancelled (kept for a full record).",
          "**Total Earnings** is the total agreed price across every one of its non-cancelled bookings, all-time — not cash actually collected (that's a different figure, shown elsewhere). A Free-of-Cost booking (see Taking a Booking) counts as ₹0 toward this, since nothing was actually charged. Confirmed live: an item with one real ₹500 booking and one Free-of-Cost booking on the same item showed Total Earnings of exactly ₹500, not ₹1000.",
        ],
      },
    ],
  },
  {
    id: "managing-customers",
    title: "Managing Customers",
    topics: [
      {
        id: "adding-a-customer",
        title: "Adding a new customer",
        body: [
          "From Customers, tap **+ Add Customer** and fill in name, phone, and address (email and notes are optional). If a customer with the same phone number already exists, you'll see their existing details instead of a new record being created — tap **Use This Customer** to select them, or **Edit Details Instead** if you'd rather correct what you typed.",
          "Phone matching only looks at the last 10 digits — spaces, dashes, and a leading +91 are all ignored. Confirmed live: adding \"+91-91112 22333\" correctly matched an existing customer saved as \"9111222333\", while a number differing by even one digit in those last 10 correctly created a brand-new customer instead of a false match.",
        ],
      },
      {
        id: "alternate-phone",
        title: "Alternate phone numbers",
        body: [
          "A customer can have a second, **Alternate Phone** — a contact-only field, purely for reaching them a different way. It's never used to detect duplicates the way the main phone number is, so it's fine for two different customers to each have the same number, one as their main phone and the other as their alternate.",
        ],
      },
      {
        id: "customer-type",
        title: "Customer type — and why it matters",
        body: [
          "Every customer is tagged **Regular**, **Influencer**, or **MUA** (makeup artist). This isn't just a label — it's what unlocks the Free-of-Cost option when booking an item for that customer (see Taking a Booking). A Regular customer never sees that option at all, so this needs to be set correctly before it can be used on a booking.",
        ],
      },
      {
        id: "editing-a-customer",
        title: "Editing a customer",
        body: [
          "Tap **Edit** on any customer to update their details or correct their type — useful for someone added as Regular before you realized they're actually an Influencer or MUA, or the other way around.",
        ],
      },
      {
        id: "deleting-a-customer",
        title: "Deleting a customer",
        body: [
          "**Delete** only works for a customer who has never actually been booked — the same protection as deleting an item. Confirmed live: a customer with a real booking on file showed \"This customer has booking history and can't be deleted\" and was left untouched; a customer with no bookings deleted cleanly. There's no retire option for customers — if they simply haven't booked in a while, there's nothing that needs to change on their record.",
        ],
      },
      {
        id: "customers-search-filter",
        title: "Searching and filtering the customers list",
        body: [
          "Search matches name or phone number (including the alternate phone). The Category dropdown narrows the list to just Regular, Influencer, or MUA customers.",
        ],
      },
      {
        id: "customer-detail",
        title: "A customer's own detail page",
        body: [
          "Tap a customer's name to open their own page: full details and their complete booking history.",
          "**Total Business** works exactly like an item's Total Earnings — the total agreed value across all their non-cancelled bookings, all-time, with any Free-of-Cost booking counting as ₹0. It's deliberately not called \"Total Spent\", since this is agreed value, not cash actually collected — a customer with an open balance could show a Total Business higher than what they've actually paid so far.",
        ],
      },
    ],
  },
  {
    id: "ask-the-assistant",
    title: "Ask the Assistant",
    topics: [
      {
        id: "assistant-overview",
        title: "What the Assistant can help with",
        body: [
          "The **Ask** tab is a chat assistant that answers questions using the shop's real, live data — never a guess. It can look up an item's status or location, check whether something's free for a date range, see how much one item has earned, pull up a customer's booking history and what they owe, see who owes money shop-wide, see what's going out for pickup or due back for return (including anything overdue), check overall revenue and profit, find the most popular items or ones that haven't moved in a while, find repeat customers, and pull up one booking by its code.",
        ],
      },
      {
        id: "asking-a-question",
        title: "Asking a question",
        body: [
          "Tap one of the starter questions to send it immediately, or type your own and tap Send. After each reply, a few follow-up questions appear as tappable chips, grounded in whatever you were just discussing — tap one to continue, or keep typing your own questions.",
        ],
      },
      {
        id: "assistant-trust",
        title: "If an answer doesn't seem right",
        body: [
          "The Assistant is built to answer only from real data, not to make things up — if it doesn't have something, it should say so rather than guess. Still, like any assistant, it can occasionally get confused in a very long back-and-forth conversation. If an answer ever looks off, it's worth double-checking against the relevant page directly (Items, Customers, Reports), and starting a fresh conversation if you want to ask the same thing again.",
        ],
      },
    ],
  },
  {
    id: "account-and-settings",
    title: "Account & Shop Settings",
    topics: [
      {
        id: "your-profile",
        title: "Your profile",
        body: [
          "Tap your initials or photo in the top-right corner to open your profile. From here you can change your display name, add or replace your profile photo, and change your password.",
          "Changing your password requires typing your current one correctly first — confirmed live, a wrong current password is rejected with \"Current password is incorrect,\" and nothing changes until the correct one is entered. Your role (Admin or Operator) is shown here but can't be changed from this screen — only another admin can change that.",
        ],
      },
      {
        id: "shop-settings",
        title: "Shop Settings",
        body: [
          "Shop Settings holds the shop's name, address, and phone number — the details shown on every printed and shared receipt. This screen is restricted to admin accounts; confirmed live, an operator account sees a plain \"Admins only\" message here instead of the form, and the same restriction is enforced on the server itself, not just hidden in the app.",
          "If the address or phone hasn't been filled in yet, a reminder banner appears at the top — worth doing before printing any receipts for real customers.",
        ],
      },
    ],
  },
];
