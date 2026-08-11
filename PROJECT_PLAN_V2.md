# Nitya Gehni Jewels — Management System v2
## Planning Document — August 2026

This replaces the Airtable + static HTML v1 build. It is not a patch — it's a rebuild that reuses the *business logic* already validated in v1 (conflict detection, component checklists, alert rules) on top of a real backend and database.

---

## 1. Context & Decisions Made

| Decision | Answer |
|---|---|
| Hosting | Cloud-hosted — accessible from anywhere (Aryan in UK, father in India) |
| Locations | Single location (new shop, going forward) |
| Data migration | None — fresh start |
| Users | 2 logins: Aryan (admin/developer), Father (daily operator) |
| Language | English |
| Launch deadline | None — build it properly |
| Bookkeeping scope | Operational core + basic bookkeeping (expenses, P&L, dues). NOT full GST filing. |
| GST | Optional per-sale toggle — some sales are GST, some aren't |
| Item tracking | Mixed: some items are one-of-a-kind (rental sets), some are stock-quantity (identical multiples) |
| Component tracking | Checklist tied to the parent set (not independently trackable) — matches v1 |
| Security deposits | Optional per-booking (depends on customer/item) |
| AI chatbot | Claude Haiku 4.5 via API, with tool access to live data — not just a static FAQ bot |

### v1 lessons carried forward
- **Never write to computed fields.** v1's Airtable formula-field conflicts happened because the app tried to write to auto-calculated fields. v2 computes everything (balances, overdue status, days-until-return) via SQL views/queries — nothing gets manually written to a "total" field.
- **Never put credentials in frontend code.** v1's Airtable token was exposed in `shared.js`. v2's backend holds all secrets; the frontend only ever talks to our own API.
- **All business dates run on India time (IST)**, regardless of who's viewing from where. "Overdue," "due today," "days until return" are computed server-side against `Asia/Kolkata`, not the viewer's browser timezone. This matters specifically because of the UK/India split.

---

## 2. Architecture

```
┌─────────────────┐      ┌──────────────────┐      ┌─────────────────┐
│  React Frontend  │ ───▶ │  Node/Express API │ ───▶ │  PostgreSQL (DB) │
│  (Vercel)        │      │  (Railway/Render) │      │  via Supabase    │
└─────────────────┘      └──────────────────┘      └─────────────────┘
                                   │
                                   ▼
                          ┌──────────────────┐
                          │  Anthropic API    │
                          │  (Claude Haiku 4.5)│
                          └──────────────────┘
```

- **Frontend**: React + Vite, deployed on Vercel. Mobile-responsive; father's views are simplified/operational, Aryan's admin view has full access + reports.
- **Backend**: Node.js/Express, deployed on Railway or Render. Owns all business logic, all secrets, all writes to the DB.
- **Database**: PostgreSQL, hosted on Supabase — bundles the database, authentication, and file storage (for item photos) in one place with a free tier that comfortably covers a small shop's scale.
- **Auth**: Supabase Auth, email/password. Two accounts: `admin` (Aryan) and `operator` (father). Role gates which screens/actions are available.
- **AI**: Called only from the backend, never the browser. Claude Haiku 4.5 gets a small set of tools to query the database directly, so answers are grounded in real, current data rather than a static description.

---

## 3. Data Model

### `items`
The core inventory table. Handles both unique physical pieces and stock-quantity items.

| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| item_code | text, unique | Human-readable, e.g. `NGJ-0001`. Doubles as a future QR/barcode payload. |
| name | text | |
| category | enum | Bridal Set, Party Wear, Individual, American Diamond, Temple, Other |
| item_type | enum | `set` (has components) or `single` |
| components | jsonb | List of component names for checklist purposes, only used if `item_type = set` (e.g. `["Necklace","Earrings","Tika","Bangles"]`) |
| tracking_type | enum | `unique` (one physical piece) or `quantity` (stock count) |
| quantity_on_hand | integer, nullable | Only used if `tracking_type = quantity` |
| status | enum | `available`, `rented_out`, `sold`, `in_maintenance` — meaningful mainly for `unique` items |
| rental_price | numeric, nullable | |
| sale_price | numeric, nullable | |
| security_deposit_default | numeric, nullable | Pre-filled suggestion, editable per booking |
| current_location | text | e.g. "Display Case 3", "With customer" — mainly for `unique` items |
| photos | text[] | URLs in Supabase Storage |
| notes | text | |
| created_at, updated_at | timestamptz | |
| is_active | boolean, default `true` | Retirement flag — hides the item from new bookings (booking item-picker filters on it) while keeping its history intact. Items with booking history can't be hard-deleted (the `bookings.item_id` FK blocks it), but retiring is a valid state for any item, not just ones blocked from deletion. |

### `customers`
| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| name | text | |
| phone | text, unique | Duplicate-check on create, carried over from v1 |
| email | text, nullable | |
| address | text, nullable | |
| notes | text | |
| created_at | timestamptz | |

### `bookings`
Covers both rentals and sales.

| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| booking_code | text, unique | `RNT-0001` / `SALE-0001` style, matches v1's convention |
| type | enum | `rental` or `sale` |
| item_id | uuid, FK → items | |
| quantity_booked | integer, default 1 | Relevant when item is `tracking_type = quantity` |
| customer_id | uuid, FK → customers | |
| pickup_date | date | Rental start / sale date |
| return_date | date, nullable | Required for rentals |
| actual_return_date | date, nullable | Filled in on actual return |
| status | enum | `booked`, `out`, `returned`, `completed`, `cancelled` |
| price_charged | numeric | **Snapshot at booking time** — doesn't change if the item's price changes later |
| deposit_amount | numeric, default 0 | |
| deposit_collected | boolean | |
| deposit_refunded | boolean | |
| deposit_refund_date | date, nullable | |
| gst_applicable | boolean | |
| gst_invoice_number | text, nullable | Sequential, only when `gst_applicable = true` |
| hsn_code | text, nullable | Configurable — confirm current code with your CA |
| tax_rate | numeric, nullable | Configurable — confirm current rate with your CA |
| return_checklist | jsonb, nullable | `{"Necklace": true, "Earrings": true, ...}`, populated from `items.components` at return time |
| return_notes | text, nullable | |
| created_by | uuid, FK → users | |
| created_at, updated_at | timestamptz | |

**Computed, not stored**: total paid (sum of linked `payments`), balance due (`price_charged` − total paid), overdue status (`return_date < today(IST) AND status = 'out'`), days until return. All done via SQL views or query-time calculation — never written back to the table.

### `payments`
Supports multiple partial payments per booking (advance + balance, or installments).

| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| booking_id | uuid, FK → bookings | |
| amount | numeric | |
| payment_date | date | |
| method | enum | cash, UPI, card, bank_transfer, other |
| notes | text, nullable | |
| recorded_by | uuid, FK → users | |
| created_at | timestamptz | |

### `expenses`
| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| date | date | |
| category | enum | rent, utilities, salaries, stock_purchase, marketing, misc, other |
| amount | numeric | |
| description | text | |
| recorded_by | uuid, FK → users | |
| created_at | timestamptz | |

### `users`
Mirrors Supabase Auth users with a role.

| Field | Type | Notes |
|---|---|---|
| id | uuid | Matches Supabase auth user id |
| name | text | |
| role | enum | `admin` (Aryan) or `operator` (father) |
| email | text | |

---

## 4. AI Chatbot Design

**Goal**: your dad can ask things like *"where is the peacock bridal set"*, *"is the temple choker available next weekend"*, *"who has the red party set right now"* — and get a real, current answer, not a canned one.

**How it works**: the backend exposes a chat endpoint. It calls Claude Haiku 4.5 with a small set of tools:

- `search_items(query, category?)` — find items by name/category
- `get_item_status(item_code)` — current status, location, next booking
- `check_availability(item_id, date_range)` — for a hypothetical new booking
- `get_customer_history(phone_or_name)` — past bookings for a customer
- `get_upcoming_returns(days_ahead)` — what's due back soon
- `get_overdue_rentals()` — what's currently overdue

Claude calls these tools, gets real data back from Postgres, and answers in plain language. It never invents a location or price — everything is grounded in a tool call.

**Cost**: at realistic usage for a 3-person shop, expect well under $5/month, likely closer to $1. Not worth optimizing around at this scale — simplicity (one vendor, already using Claude Code) beats chasing a marginally cheaper free-tier API.

---

## 5. Build Phases

### Phase 1 — Core Operations (replaces v1, but solid this time)
- Item intake: photo → category → components checklist → prices → save (optimized for fast entry, since this is where your dad will do the entire opening stock)
- Customer management with phone dedupe
- Create rental booking, create sale — with real conflict detection (no double-booking)
- Returns processing with component checklist verification
- Dashboard: today's returns, overdue items, quick stats

### Phase 2 — Bookkeeping
- Payments (multiple partial payments per booking)
- Expenses
- Profit & loss by period
- Outstanding dues report
- Optional GST invoice generation (PDF), per-sale toggle

### Phase 3 — AI Chatbot
- Chat interface (simple, mobile-friendly)
- Tool-calling into live data as described above

### Phase 4 — Nice to Haves (backlog, revisit after Phase 1–3 are solid)
- Printed QR/barcode labels using the `item_code` already in the schema
- WhatsApp return reminders
- Printable receipts/invoices
- Analytics dashboard
- Bulk customer import

---

## 6. Open Items to Confirm With Your CA (not something I can advise on)
- Current applicable HSN code(s) for your jewelry categories
- Current GST rate(s) to use when `gst_applicable = true`

---

## 7. Next Steps
This document is meant to be handed to Claude Code as the spec to scaffold from. Suggested order: set up Supabase project + schema → backend API + auth → Phase 1 frontend screens → test end-to-end with real data entry → Phase 2 → Phase 3.

---

## 8. Multi-Item Bookings Restructuring (Checkpoint (c) DONE 2026-08-11 — Stage 2 not yet executed)

**Checkpoint (c) — Booking-specific component cluster — DONE 2026-08-11,
tested against the real Vercel preview + `ngj-backend-checkpoint-a`. Three
real bugs found and fixed live, not in review — this was the last checkpoint
before Stage 2's cutover, per the standing plan.**

`BookingForm.tsx`, `BookingsList.tsx`, `BookingDetail.tsx`, `ReturnForm.tsx`,
`BookingsPage.tsx` rewritten and `EditBookingForm.tsx` created new, per the
plan below. `shared.css` gained `.booking-card*`/`.line-item-card*` rules
from existing design tokens, no new visual language. `BookingForm` moved to
a repeatable `LineItemDraft[]` array (one row per line item, "+ Add Another
Item", per-row remove, per-row auto-price-fill and per-row conflict-error
display keyed by index). `BookingsList` moved off the shared `.data-table`
to one `.booking-card` per family booking with nested per-item rows, each
with its own status pill and a "Process Return" button when eligible.
`BookingDetail` gained one sub-section per line item (own status, dates,
price, deposit, custom add-ons, its own "When Returns →" panel gated on
`tracking_type === 'unique'`) plus an Edit Booking entry point.
`ReturnForm` rescoped to `{ booking, item }` instead of a whole flat
booking, calling `processReturn(booking.id, item.item_id, payload)`
directly. `EditBookingForm` (new): parent fields (customer, GST) via
`updateBooking`; per-active-item field edits via `updateBookingItem`; an
Add Item mini-form via `addBookingItem` (same fields/conflict-handling as
`BookingForm`'s rows); a Remove action per active item via
`cancelBookingItem`, with the same inline-confirm pattern as
`CustomersList`'s delete ("Remove this item? / Yes, Remove / Cancel"),
surfacing the backend's negative-balance-block message verbatim. Per
decision 6, confirmed live (not just by not writing the code) that **no
"cancel whole booking" control exists anywhere in this component** — only
Back/Done and the per-item add/edit/remove affordances.

**The legacy bridge (Checkpoint (b)'s temporary adapter) is now fully
deleted, confirmed by grep, not just "no longer imported."** The entire
`LEGACY BRIDGE` section of `lib/bookings.ts`
(`LegacyFlatBookingWithDetails`/`createLegacyBooking`/`fetchLegacyBookings`/
`fetchLegacyBooking`/`processLegacyReturn`) and `lib/statusPill.ts`'s old
`bookingStatusPill(status: LegacyBookingItemStatus)` were removed outright.
`grep -rn "Legacy" frontend/src` returns **zero matches** — not "unused,"
genuinely gone.

**`booking_code` re-confirmed editable in the actual rewritten form, live,
not just present in the source** (the user's explicit second ask): created
a real booking through the rewritten `BookingForm` with the suggested code
(`BK-0001`) overridden to `ZZTEST-BK-C1` — the success panel and a direct
Supabase query both showed the literal override stored, not an
auto-generated fallback.

**Bug 1 — found live: `POST /api/bookings`'s success response never merged
`booking_financials_v2`/`booking_status_v2`.** `GET /` and `GET /:id` both
already did this two-queries-plus-merge for `total_paid`/`balance_due`/
`price_charged`/`computed_status`/`*_item_count`, but the create route's
`return res.status(201).json({ ...full, warning })` never did — so
`BookingForm`'s new success panel (which reads `saved.price_charged`)
rendered a blank price on every single successful booking creation. Caught
by actually looking at the rendered success panel, not by reading the
response shape. Fixed by running the same merge (`Promise.all` across the
full-row fetch plus both views) before responding. Re-verified live: the
same test booking above now shows `price_charged: 1500`/`2500` correctly
in both the raw API response and the rendered panel.

**Bug 2 — found in code review, before ever exercising the vulnerable path
live: `EditBookingForm`'s save handlers trusted the PATCH response's
declared TypeScript type over its real (narrower) payload.**
`PATCH /:id` returns only the updated `bookings` row's own columns (no
`customers`/`booking_items` embed); `PATCH .../items/:itemId` returns only
the raw `booking_items` row (no nested `items(item_code, name, ...)`
embed) — but both were typed as the full `Booking`/`BookingItem` shape in
`lib/bookings.ts`, and the original handlers did `setBooking(updated)` /
spliced the response directly into `booking.booking_items`. Saving the
parent GST fields would have wiped `booking.booking_items` to `undefined`
and crashed the item list on the next render; saving a line item's fields
would have permanently blanked that row's item name/code in its header.
Caught by tracing the actual write path — comparing what each PATCH route
really returns against what the frontend assumed it returns — and fixed
before either handler was ever run against real data, not caught by
clicking Save and observing the crash. Fixed by re-fetching the full
booking via the existing `load()` after both mutations instead of trusting
either response's shape. Verified live only after the fix was already in
place: toggled GST on and saved, then edited a line item's price and
saved — the item names/codes stayed correct after both, confirmed by
screenshot, not just "no console error."

**Bug 3 — found live: nothing prevented the same physical item from
appearing twice in one family booking, and when it did, every per-item
route broke.** Added a quantity item (`NGJ-0007`) to a booking twice —
once as a sale via `BookingForm`, once as a rental via `EditBookingForm`'s
Add Item — neither the create-time RPC nor `POST /:bookingId/items`
rejected it, since `checkItemConflict` only checks for date/quantity
oversell against *other* bookings, not "is this item_id already a
non-cancelled row in *this* booking." Every route keyed by
`(booking_id, item_id)` — `PATCH .../items/:itemId`,
`.../items/:itemId/cancel`, `.../items/:itemId/return` — uses `.single()`
or `.eq(...).single()` expecting exactly one match; with two rows sharing
that `item_id`, the lookup became ambiguous and **every edit/remove/return
attempt on either row failed** ("Booking item not found" from `.single()`
throwing on 2 rows). Caught live clicking "Remove Item" and getting a
generic failure instead of the expected confirm-then-succeed flow — not
found by reading the routes, found by actually exercising them end to end.
Fixed with an explicit invariant enforced at both entry points:
`POST /` now checks the submitted `items[]` array itself for a repeated
`item_id` before ever calling the RPC (reported through the same
per-index `item_conflicts` shape as other row conflicts, so it renders
inline on the right row); `POST /:bookingId/items` now checks for an
existing non-cancelled row for that `item_id` in the same booking before
inserting, returning a 409 (`"This item is already included in this
booking"`). A second live pass then caught that the existence check
itself used `.maybeSingle()`, which throws the identical "multiple rows"
error when 2+ rows already match — exactly the corrupted state the check
exists to prevent, hit immediately against the already-broken test booking
from Bug 3's own repro. Switched to `.limit(1)` + a length check so the
guard degrades gracefully instead of 500ing. Re-verified live after both
fixes redeployed: attempting to add `NGJ-0007` a second time to a booking
that already had it returned the friendly 409, no 500; a fresh
create-request with the same `item_id` twice returned the per-row
`item_conflicts` 409 instead of silently succeeding.

**Bug 3, follow-up — the app-layer duplicate check above left the RPC
itself exploitable, caught on review.** The `POST /` fix (above) only
guards the Express route: it de-dupes the submitted `items[]` array
*before* calling `create_booking_with_items`, so the RPC never sees a
duplicate through that one path. But the RPC is independently callable
(direct `rpc/create_booking_with_items`, any future internal caller,
`tools/index.ts` if it's ever wired up) and, read on its own, has no
uniqueness check — only the per-item date-overlap (`unique` items) and
oversell (`quantity` items) checks, which a *non-overlapping* duplicate or
two same-item sale lines pass cleanly. Proven live, not just read: called
the RPC directly via `POST /rest/v1/rpc/create_booking_with_items` (service
role key, bypassing Express entirely) with two rental lines on one throwaway
`unique` item, deliberately non-overlapping dates (5–8 Aug, 20–25 Aug) — the
exact case the overlap check can't catch. It returned **HTTP 200** and a
real booking; a direct `booking_items` query confirmed **two rows, same
`item_id`, both `status: 'booked'`** — the identical class of bug Bug 3
above was meant to close, just reachable one layer deeper.

Fixed in `01c_create_booking_with_items_rpc.sql`: an explicit check at the
very top of the function, before the parent `bookings` insert or any line
item is touched — `select ... from jsonb_array_elements(p_items) group by
item_id having count(*) > 1`, `raise exception` if any group has more than
one member. Same "second, transaction-safe layer, not a replacement for the
app check" reasoning the RPC's own header comment already uses for every
other check in this function. Applied to the live linked project via
`npx supabase db query --linked -f
supabase/proposed/20260811_booking_items_restructure/01c_create_booking_with_items_rpc.sql`
(the CLI was already linked/authenticated from Stage 1 — no interactive
login needed).

Re-proved the identical repro against the now-fixed RPC, called directly
the same way: **HTTP 400, `code: "P0001"`,
`"Item <uuid> appears more than once in this booking"`** — and confirmed
via a follow-up query that **no `bookings` row exists at all** for that
attempt (the whole transaction rolled back, not just the second insert
skipped). A sanity check alongside it — a normal single-item booking
through the same direct-RPC path — still succeeded, confirming the new
check isn't over-broad. All three throwaway fixtures (item, customer,
proof bookings) deleted after; `bookings_count`/`booking_items_count`
reconfirmed at `1`/`1` (just `RNT-0001`) directly against Supabase.

**What else was verified live, with real results, not just "should work,"**
using a fresh throwaway auth user and `ZZTEST`-prefixed fixtures, all
cleaned up after:
- Multi-item creation: one booking with a rental (`NGJ-0006`, unique) and a
  sale (`NGJ-0007`, quantity, with a `custom_addons` chip) submitted
  together in one `Create Booking` — both items correctly persisted under
  one parent, ₹500 Cash advance recorded and reflected in
  `booking_financials_v2` immediately.
- Card list: `.booking-card` correctly showed the computed-status pill +
  "X of Y items returned" fraction, per-item rows each with their own
  status pill, and "Process Return" only on the rental item (never on the
  sale — a sale has no return concept, matching the existing backend
  rule).
- Return processing: marked the rental item returned from the card list —
  item flipped to `Returned`, the booking's rollup correctly flipped to
  `Completed` (a sale item counts as immediately "resolved" per
  `booking_status_v2`'s own definition, independent of any physical
  return), and the real `RNT-0001` booking/customers were confirmed
  untouched throughout via direct Supabase queries at multiple checkpoints.
- `BookingDetail`: per-item sub-sections, the "When Returns →" panel
  (correctly shown only for the `unique` item, correctly absent for the
  quantity item), and Payments all rendered correctly; deep-linking via
  `/bookings?booking=<id>` (unchanged from Checkpoint (a)) still works
  against the rewritten component.
- `EditBookingForm` — Add Item: added a new rental line item through the
  mini-form, confirmed it appeared as a genuine third, independently
  editable `booking_items` row with correct dates/price.
- `EditBookingForm` — Remove Item, all 3 rules: (1) a returned item shows
  no Remove control at all (read-only "Returned — no further edits."); (2)
  removing an item that would push `balance_due` negative was blocked with
  the exact backend message (`"Removing this item would mean refunding
  ₹500.00, which isn't supported yet"`), rendered inline via the same
  confirm-row pattern; (3) removing an item where the remaining total still
  covers what's been paid succeeded cleanly, dropping the item count and
  leaving the rest of the booking intact.
- Confirmed, live, that the "test set 1"/"test set 2" non-`ZZTEST`-prefixed
  items noted during Stage 1's backfill (§8 above) are pre-existing and
  untouched by any of this checkpoint's fixtures or cleanup.

All fixtures (2 items, 1 customer, 3 bookings, their payments, the
throwaway auth user) deleted after; confirmed directly against Supabase:
`bookings_count = 1`/`booking_items_count = 1` (just the real `RNT-0001`),
3 real customers, 4 real items — all back to exactly the pre-checkpoint
baseline.

**⚠ Action for the user, now that Checkpoint (c) is done**: per the standing
reminder below, the temporary `ngj-backend-checkpoint-a` Render service and
its cross-wired Vercel Preview env vars are no longer needed once this
branch merges to `master` and Stage 2 cuts over — delete the Render service
at that point.

**Editable `booking_code`, added 2026-08-11 before starting Checkpoint (c)
proper — a real gap, not previously built.** Confirmed against the actual
code (not assumed) that `BookingForm.tsx` had no `booking_code` field at
all, and `POST /api/bookings` always server-generated it with zero client
override — unlike `items.ts`'s `item_code`, which already has exactly this
editable-suggestion pattern. Brought bookings up to parity:
- **New `GET /api/bookings/next-code`** (registered before `GET /:id`, same
  reasoning as `/overdue`/`/upcoming-returns`) — read-only preview of the
  next `BK-000N`, reserves nothing.
- **`POST /api/bookings`** now accepts an optional `booking_code`; non-empty
  gets exactly one insert attempt with a friendly `"This booking code is
  already in use — choose a different one."` 409 on collision (same wording
  pattern as `item_code`'s), rather than being silently retried with a
  different value out from under an explicit choice. Empty/omitted still
  falls through to the existing auto-generate + retry-on-`23505` loop,
  unchanged. No RPC/SQL change needed — `create_booking_with_items` already
  took `p_booking_code` as a parameter.
- **`BookingForm.tsx`** pre-fills the suggestion into an editable field on
  mount and after "Create Another", identical UX to `AddItemWizard`'s
  `item_code` field including the hint copy.

Proven live against the real preview + `ngj-backend-checkpoint-a`, not just
asserted: created a booking through the actual UI with the code overridden
to `ZZTEST-CUSTOM-CODE`, confirmed via Supabase directly that the literal
override (not an auto-generated fallback) was stored. Then attempted a
second, non-overlapping booking reusing that same code — the UI rendered
the exact friendly message, and a direct query confirmed exactly one row
exists with that code (no duplicate, no partial insert). All fixtures and
the throwaway auth user cleaned up after; database confirmed back to just
the one real `RNT-0001` booking.

**Date-input investigation, resolved 2026-08-11 before starting Checkpoint (c)
— not an application bug.** Checkpoint (b)'s testing notes flagged an
apparent "date parsing ambiguity"; investigated properly rather than left as
a footnote, since Checkpoint (c) adds several more date fields.

1. **What the fields actually are**: grepped every `type="date"` in
   `frontend/src` (7 matches across `BookingForm.tsx`, `BookingDetail.tsx`,
   `ReturnForm.tsx`, `ReportsPage.tsx`) — all seven are plain native
   `<input type="date">`, and every one of their `onChange` handlers reads
   `e.target.value` directly with zero transformation. Separately grepped
   for `date-fns`/`dayjs`/`moment`/`parseDate`/`formatDate` anywhere in the
   frontend — zero matches. There is no custom date parsing anywhere in this
   codebase.
2. **What was actually wrong**: nothing in the code. A native date input's
   `.value` is always canonical ISO `YYYY-MM-DD` internally, completely
   independent of how it's displayed or typed into — that part of the user's
   own framing was exactly right. The Checkpoint (b) mix-up was 100% a
   testing-methodology artifact: browser automation typed `"08/09/2026"`
   assuming MM/DD/YYYY entry order, but this Chrome instance's native
   date-control locale (governed by the browser's own ICU/form-control
   locale, confirmed to be a genuinely different setting from the
   page-visible `navigator.language`, which reports `en-US`) fills segments
   in DD/MM/YYYY order — visibly confirmed by the field's own `dd/mm/yyyy`
   placeholder text once actually looked at. "The fix" was never a code
   change; it was typing dates in the order the field itself already
   states.
3. **Proven, not just explained**, live against the real preview +
   `ngj-backend-checkpoint-a`: typed a fresh unambiguous case (day and month
   both ≤12) into `BookingForm`'s Pickup Date field using the confirmed
   `dd/mm/yyyy` order, intending August 5th, 2026. Read
   `document.querySelectorAll('input[type=date]')[0].value` directly via the
   browser console **before** any submission: `2026-08-05`. Submitted the
   booking (Return Date `2026-08-07`, same method) and queried Supabase
   directly afterward: `pickup_date: "2026-08-05"`, `return_date:
   "2026-08-07"` — exact match, zero transformation anywhere between the
   widget and the stored row.
4. **Confirmed to apply everywhere, empirically, not just by code
   inspection**: repeated the same live test on `ReportsPage`'s "From" date
   field — a separate component, separate page, no shared code with
   `BookingForm` beyond both being native `<input type="date">`. Typed
   `03/08/2026` (DD/MM order), read `.value` directly: `2026-08-03` — same
   correct behavior. Combined with finding #1 (all seven date fields in the
   app are the identical native element with the identical
   zero-transformation `onChange`), there's no mechanism by which any of the
   other five could behave differently — they're the same HTML element type,
   not five different implementations that happened to agree twice.

All test fixtures and the throwaway auth user used for this cleaned up
after; confirmed database back to just the one real `RNT-0001` booking.

**Checkpoint (b) — Frontend types + simpler pages — DONE 2026-08-11, tested
against the real Vercel preview + `ngj-backend-checkpoint-a`, real bug found
and fixed live.**

`lib/bookings.ts`, `lib/dashboard.ts`, `lib/statusPill.ts`, `DashboardPage.tsx`,
`ReportsPage.tsx` rewritten/updated per the plan; `lib/reports.ts` confirmed
needing no changes (shape already matched). One design addition beyond the
original plan: since `BookingForm.tsx`/`BookingsList.tsx`/`BookingDetail.tsx`/
`ReturnForm.tsx`/`BookingsPage.tsx` are explicitly Checkpoint (c)'s job (not
this one) but the app has to actually build and deploy at every checkpoint,
`lib/bookings.ts` and `lib/statusPill.ts` each grew a clearly-labeled **legacy
bridge** section (`LegacyFlatBooking`/`createLegacyBooking`/
`fetchLegacyBookings`/`fetchLegacyBooking`/`processLegacyReturn`, and the
unchanged old `bookingStatusPill`) — flattens the new nested API back onto the
old one-item-per-booking shape those five files still assume, single-item
bookings only. The five files themselves got **only mechanical import/call-
site renames**, zero UI or logic changes — the bridge is explicitly marked
for deletion once Checkpoint (c) does the real rewrite (repeatable line
items, card-per-booking list, per-item actions).

**Bug found live, not in review**: `processLegacyReturn` passed
`booking.booking_item_id` (the `booking_items` row's own id) as the route's
`:itemId` — but `POST /api/bookings/:bookingId/items/:itemId/return` matches
on `items.id` (the physical item, per §8 decision D), not `booking_items.id`.
Every return attempt 404'd with "Booking item not found" until this was
caught by actually clicking "Mark Returned" through the real preview (not
just reading the code) and fixed to use the already-present, previously-
unused `booking.item_id` field instead. Confirmed via a second real attempt
through the UI, then verified directly against the database: `booking_item
status = 'returned'`, the underlying item's own `status` correctly flipped
back to `'available'`.

**What was tested, with real results**, all through the actual deployed
Vercel preview + `ngj-backend-checkpoint-a` (never local reasoning), using a
fresh throwaway auth user and `ZZTEST`-prefixed fixtures, fully cleaned up
after:
- Dashboard: real stats rendered correctly on load (unchanged from
  Checkpoint (a)'s verification, confirming the rewritten `lib/dashboard.ts`
  types still matched).
- Reports: the new required note ("Total bookings counts family
  transactions... Rentals/Sales counts individual items...") renders
  correctly under "Bookings This Period".
- **A real booking created through the actual `BookingForm` UI** (not just
  via API) — confirms `createLegacyBooking` correctly calls through to the
  Checkpoint (a) RPC-backed endpoint end-to-end. (One self-inflicted
  detour here, not a code bug: typed `08/09/2026` into the native date
  input intending August 9th, but this environment's date input parses
  typed digits as DD/MM, landing on September 8th — caught by checking the
  stored row directly rather than trusting the form, fixed by re-entering
  with the date-then-month order.)
- **"Today's Returns Due" row rendering** — deliberately re-dated the test
  booking to land on today specifically to exercise this row (it was empty,
  and therefore untested, in Checkpoint (a)'s verification): the nested
  `b.bookings?.booking_code` field renders correctly, and the deep link
  correctly uses the new `b.booking_id` (parent) rather than `b.id` (item).
- Clicking through that deep link into `BookingDetail` (via
  `fetchLegacyBooking`) rendered every field correctly, including a correctly-
  empty "When Returns →" panel.
- `BookingsList` (via `fetchLegacyBookings`) correctly showed both the new
  test booking and the real legacy `RNT-0001`, flattened identically.
- The return flow (bug above, then the fix) — confirmed via the database
  directly, not just the success screen.

All fixtures and the throwaway auth user deleted after; confirmed
`bookings_count`/`booking_items_count` back to `1`/`1` (just the real
`RNT-0001`), zero leftover `ZZTEST` rows anywhere.

**⚠ TEMPORARY INFRASTRUCTURE — REMINDER TO DELETE**: a second Render web
service (free tier, name like `ngj-backend-checkpoint-a`) was created
2026-08-11, deployed from `feat/booking-items-checkpoint-a`, pointed at the
same real Supabase project as production, so the Vercel Preview deployment
for this branch has a real backend to call during Checkpoints (b)/(c)
(Vercel hosts only the frontend; Render has no built-in preview-environment
support here). Vercel's Preview `VITE_API_URL` and this Render service's
`CORS_ORIGIN` were cross-wired to each other for this purpose. **Once
Checkpoint (c) is done and `feat/booking-items-checkpoint-a` merges to
`master`, delete this Render service** — it's throwaway scaffolding for this
migration's testing, not a permanent second backend.

**Preview-deployment wiring — gotchas hit getting this working (2026-08-11),
worth knowing before Checkpoints (b)/(c) touch this again:**
- Two `VITE_API_URL` Vercel env vars must coexist without overlapping scope:
  the original one (Production + Preview, all branches, real prod backend)
  had to be narrowed to **Production only**, leaving a second one scoped to
  **Preview + this specific branch** pointing at `ngj-backend-checkpoint-a`.
  Vercel let both exist with overlapping scope without error, but the
  broader one silently won — the override only actually took effect once the
  overlap was removed.
- **Vite bakes env vars in at build time.** An env var change never applies
  to an already-built deployment — a genuinely new build is required.
- **This project has a Vercel "Ignored Build Step"** that skips building when
  a push has no meaningful diff — a `git commit --allow-empty` push to force
  a rebuild does **not** work here (confirmed: produced no deployment at
  all). A real, if trivial and inert, file change is needed instead (used a
  one-line HTML comment in `frontend/index.html`).
- Vercel's dashboard "Redeploy" dialog (the button, not a git push) only
  offers past deployments to pick from and its branch list can be
  misleading/incomplete — the reliable way to get a fresh build of a specific
  branch is a real `git push` to that branch, not the dashboard button.
- **Preview deployments sit behind Vercel's own SSO/deployment-protection
  wall** — `curl` gets redirected to `vercel.com/sso-api` and can't be used
  to poll/verify preview URLs. A real logged-in browser session is required;
  this is part of why Checkpoints (b)/(c) verification goes through
  `claude-in-chrome`, not `curl`, for anything preview-URL-facing (`curl` was
  still used freely for the direct Render backend URL, which has no such
  protection).
- To confirm which backend a loaded preview page is actually calling (rather
  than trusting the env var config alone), run
  `performance.getEntriesByType('resource').filter(r =>
  r.name.includes('onrender')).map(r => r.name)` in the browser console —
  this is what caught the wiring pointing at the wrong backend twice before
  it was actually fixed.

**Verified working 2026-08-11**: logged into the `feat/booking-items-checkpoint-a`
Vercel preview through a real browser (throwaway auth user, cleaned up after)
and confirmed the Dashboard renders real data end-to-end through the full new
chain (browser → Vercel preview → `ngj-backend-checkpoint-a` on Render →
real database) — `₹3500` outstanding balance and `Items out: 1` both matched
the real `RNT-0001` booking exactly.

**Acceptance-test scenarios (`verification_scenarios.sql`) run 2026-08-11 —
both green-lit. Real output pasted, not just pass/fail. Run against
`booking_sequence_v2`/`booking_status_v2` (Stage 2 hasn't renamed them yet);
`bookings`' still-present old NOT NULL columns were filled with placeholder
values matching each scenario's own data purely to satisfy the pre-cutover
schema — not meaningful test data, and specifically for Scenario B (one
family booking, 3 items) impossible for the old single-item columns to
represent faithfully, which is exactly the limitation this migration fixes.**

- **Scenario A — out-of-order "When Returns" chain.** Created B (15–18 Aug),
  then C (19–21 Aug), then A (13–14 Aug) last. CHECK A1 —
  `booking_sequence_v2` read: **A → B → C by pickup_date**, not creation
  order (A: prev=null, next=B; B: prev=A, next=C; C: prev=B, next=null) —
  exact match to the predicted chain. Cancelled B. CHECK A2 — chain
  re-linked to **A → C directly** (A: next='BK-ZZTEST-C'; C:
  prev='BK-ZZTEST-A'); B showed `status: cancelled` with `prev`/`next` both
  null — entirely excluded from the view, not just skipped over. No gap, no
  dangling reference.
- **Scenario B — real multi-item booking, independent returns, rollup.** One
  family booking, 3 rental items on staggered return dates (17/19/21 Aug).
  `booking_status_v2` read at each stage: **CHECK B1** (none returned) →
  `active`, `resolved_item_count: 0`, `active_item_count: 3`. Returned item A
  → **CHECK B2** → `active`, `1`, `3` — independence check confirmed items B/C
  still `status: booked`, `actual_return_date: null`, completely untouched by
  A's return. Returned item B → **CHECK B3** → `active`, `2`, `3` — the exact
  "2 of 3 items returned" scenario named in the task. Returned item C (the
  last one) → **CHECK B4** → `completed`, `3`, `3` — flips only once every
  item is resolved, not before.

Both scenarios' throwaway `ZZTEST`-prefixed fixtures were fully deleted
after. Post-cleanup: `booking_items_count = 1`, `bookings_count = 1` (back to
just the one real `RNT-0001` booking), zero leftover `ZZTEST`-prefixed rows.

**Green light given by the user to start building application code against
the `_v2` views on a preview branch**, per this result. Stage 2
(`03_schema_cutover.sql`) still not run — production untouched throughout
all of the above.

**Stage 1 backfill results (`02_data_backfill.sql`, run 2026-08-11):** the
transaction committed (its own in-script row-count assertion passed). Full
`verification_plan.sql` gate checks run and pasted below, not just asserted:

- `bookings_count = 1`, `booking_items_count = 1` — exact parity.
- Legacy `status = 'completed'` count: **0**. The backfill's `RAISE NOTICE` did
  **not** fire — confirmed directly (not inferred from the notice) by querying
  `bookings` status distribution post-backfill: the only status present is
  `booked` (count 1). Consistent with the earlier code-grep finding that no
  code path ever writes `'completed'` or `'out'`. Nothing to review.
- Duplicate-row check (`booking_items` grouped by `booking_id` having count ≠
  1): 0 rows. Orphaned-parent check (`bookings` with no matching
  `booking_items` row): 0 rows.
- Status-distribution diff between `bookings` and `booking_items`
  (`EXCEPT`): 0 rows.
- Financial totals: `sum(price_charged)` 3500 = 3500, `sum(deposit_amount)` 0
  = 0, both tables.
- `payments_count`: 0 before and after (no payments exist on the real
  booking yet — unaffected either way, this migration never touches
  `payments`).

**Byte-for-byte spot-check — correction to this doc's standing assumption:**
`Peacock Bridal Set` / `NGJ-0001` currently has **zero bookings** — querying
for it (both the old `bookings.item_id` path and the new `booking_items`
path) correctly returned zero rows on both sides, which is consistent, not a
failure, just not the useful spot-check target this doc assumed. The one
real booking, `RNT-0001`, is actually on `NGJ-0003` (`Polki Bridal #1930
(Green Beads)`). Spot-checked that one instead, old path vs. new path,
every field: `booking_code`, `type`, `pickup_date`, `return_date`,
`actual_return_date`, `status`, `price_charged`, `deposit_amount`,
`deposit_collected`, `deposit_refunded`, `return_checklist`, `return_notes`,
`custom_addons`, `customer_id`, `item_code`, `item_name` — identical on both
sides, field for field. (Also noted in passing, not touched: two items,
`NGJ-0004`/`NGJ-0005` ("test set 1"/"test set  2"), exist without the
`ZZTEST` prefix this project's own convention uses for throwaway data — not
created by this migration, left alone.)

`booking_items` and the five `_v2` views are now live with real backfilled
data. `bookings` still has every old column intact — Stage 2
(`03_schema_cutover.sql`) has not run. Production app is unaffected; it
never reads `booking_items` or the `_v2` views.

**Status**: design agreed, all four open questions resolved, migration SQL proposed
(`supabase/proposed/20260811_booking_items_restructure/`) as a blue-green rollout —
five views (the original four plus the new `booking_status` rollup for decision B)
land under temporary `_v2` names in the additive step, get exercised against real
backfilled data from a Vercel preview branch, and step 3 is reduced to a fast
drop-old / rename-`_v2`-into-place swap. Two acceptance-test scenario scripts
(`verification_scenarios.sql`) are also proposed, covering the out-of-order "When
Returns" chain and a real 3-item booking's independent-return/status-rollup
behavior.

**`01_schema_additive.sql` (the `booking_items` table + the five `_v2` views) has
now been applied to the live database** — run via `supabase db query --linked -f`
(the Supabase CLI, available locally through `npx`, has a `db query` subcommand
that executes arbitrary SQL/files against the linked project's Management API; no
`psql`/direct Postgres credentials were needed or used). Purely additive — nothing
in `bookings` was touched, and the production app's own code paths are completely
unaffected, since it never reads `booking_items` or the `_v2` views.
`02_data_backfill.sql` (the real data backfill) has **not** been run yet — separate
explicit go-ahead needed for that, since unlike the schema step it operates on every
real `bookings` row. No application code has been changed or deployed.

**A real, currently-live bug was found and fixed before this went in**, per an
explicit request to verify against the actual code rather than assume: grepping
every `.update(`/`.insert(` touching `bookings.status` in `backend/src` shows
exactly one write to that column anywhere in the app — the return handler setting
`status: "returned"`. Booking creation's insert never sets `status` at all (it falls
through to the column default, `'booked'`), and there is no check-in/"mark as out"
step anywhere. **`'out'` is therefore unreachable by any real booking** — meaning
the currently-live `overdue_rentals`/`upcoming_returns` views (`status = 'out'`
only) have never matched a single real booking, ever. Fixed in the `_v2` versions of
both views: filter changed to `status in ('booked', 'out')`, since a rental between
its `pickup_date` and `return_date` is "out" in the real-world sense regardless of
which literal status string happens to be stored. Not applied to the OLD
(currently-live) views — those stay untouched per Stage 1's non-destructive design;
the fix only lands for real once Stage 2 renames `_v2` into the permanent names. The
OLD views' brokenness is a **pre-existing bug that predates this migration**, not
something this migration introduced — flagged here for the record, not something
being silently carried forward.

Re-verified against real data on the live database, then cleaned up: inserted a
throwaway `booking_items` row with `return_date` in the past, deliberately not
specifying `status` (so it took the same default real booking creation actually
uses) — confirmed it landed as `status = 'booked'`, confirmed it did NOT match
`status = 'out'` (proving the fix was genuinely necessary, not just theoretically
sound), and confirmed it DID appear in `overdue_rentals_v2` with the correct
`days_until_return: -6` and `balance_due: 5000`. All throwaway rows deleted
afterward; post-cleanup counts confirmed `booking_items` back to empty (correct,
pre-backfill) and the one real `bookings` row untouched.

This section documents the design regardless of when it's actually executed, per
project practice of keeping this doc in sync with decisions as they're made.

### Motivation
The v1/v2-so-far model is one booking row = one item. In practice a single customer
transaction (one pickup visit) can include several items — e.g. a bridal set plus a
separate temple choker — picked up together but not necessarily returned together
(different rental durations, one might be a sale mixed with a rental, etc.). The
schema needs a real parent/child split: one **transaction** (`bookings`) containing
multiple **line items** (`booking_items`), each independently trackable.

### New schema

**`bookings`** (restructured — becomes the parent/transaction record)

| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| booking_code | text, unique | One per family transaction, not per item — see assumption 1 below |
| customer_id | uuid, FK → customers | |
| gst_applicable | boolean | Whole-transaction level — see assumption 2 below |
| gst_invoice_number | text, nullable | |
| hsn_code | text, nullable | |
| tax_rate | numeric, nullable | |
| created_by | uuid, FK → users | |
| created_at, updated_at | timestamptz | |

Removed from `bookings` (all move to `booking_items`): `item_id`, `quantity_booked`,
`type`, `pickup_date`, `return_date`, `actual_return_date`, `status`, `price_charged`,
`deposit_amount`, `deposit_collected`, `deposit_refunded`, `deposit_refund_date`,
`return_checklist`, `custom_addons`.

A booking-level "status" (e.g. for list-view display) becomes a **computed** value
derived from its `booking_items`' statuses — never stored, same rule as
balance_due/overdue elsewhere in this app (§ Key Rules in CLAUDE.md). Exact rollup
logic (what a mixed rental+sale, or partially-returned, family booking's status
should read as) is an open question — see below.

**`booking_items`** (new table — one row per item within a booking)

| Field | Type | Notes |
|---|---|---|
| id | uuid | |
| booking_id | uuid, FK → bookings | |
| item_id | uuid, FK → items | |
| quantity_booked | integer, default 1 | |
| type | enum | `rental` or `sale` — now per-item, not per-transaction |
| pickup_date | date | |
| return_date | date, nullable | Required for rentals |
| actual_return_date | date, nullable | |
| status | enum | `booked`, `out`, `returned`, `cancelled` |
| price_charged | numeric | Snapshot at booking time, same rule as before |
| deposit_amount | numeric, default 0 | |
| deposit_collected | boolean | |
| deposit_refunded | boolean | |
| deposit_refund_date | date, nullable | |
| return_checklist | jsonb, nullable | |
| custom_addons | jsonb, nullable | |
| created_at, updated_at | timestamptz | |

**`payments`** — unchanged structurally. `booking_id` still points at the **parent**
`bookings` row, representing one running balance for the whole family transaction,
not per item. This is deliberate: some clients pay the full amount upfront regardless
of individual item pickup dates, others pay per item as it's picked up — a single
running balance (total `price_charged` across all `booking_items` for that booking,
minus total payments) correctly supports both without needing to track which payment
applies to which item. `booking_financials` becomes an aggregate over `booking_items`
grouped by `booking_id`, rather than a 1:1 read off `bookings`.

### Two assumptions (confirmed, not flagged as wrong)
1. **One `booking_code` per family transaction, not per item.** Consistent with the
   schema above. Downstream effect: anywhere that used to treat "one booking row" as
   "one item" (list views, most-booked-items, repeat-customer counts) now has a
   grain decision to make — see open questions below.
2. **GST stays at the booking (whole-transaction) level, not per item.** Consistent
   with the schema above — one invoice per transaction. Implicit simplification worth
   flagging: this means one `tax_rate`/`hsn_code` covers every item in a mixed family
   booking. Since HSN/tax rate are already unconfirmed placeholders pending the CA
   (§6), this isn't a new problem introduced here — but if the CA's eventual answer
   requires per-item HSN codes (e.g. different rates for gold vs. imitation jewelry),
   this assumption would need revisiting then.

### Open questions — resolved 2026-08-11

- **A. Booking code prefix.** New neutral prefix `BK-0001` for the family
  transaction, generated the same way existing codes are (editable override at
  create time, retry-on-`23505` collision) — `nextBookingCode()` in
  `backend/src/routes/bookings.ts` drops its per-type `RNT`/`SALE` branching
  entirely and always generates `BK-`. **Already-issued `RNT-`/`SALE-` codes are
  not renamed** — the data migration leaves `bookings.booking_code` completely
  untouched; this only governs codes generated for bookings created after the
  cutover ships. No schema/data-migration SQL is needed for this decision on its
  own — `booking_code` stays exactly as-is through both the backfill and the
  cutover; it's purely a future change to the app's code-generation function.

- **B. Computed booking-level status rollup.** Computed at query/app time, never
  stored (same rule as balance_due/overdue elsewhere in this app). Based on
  **non-cancelled `booking_items` only**:
  - A `sale`-type item is treated as immediately resolved — it never has a
    "return" step, so it doesn't count against the rollup the way an
    unreturned rental would.
  - All rental items returned (or there are no rental items at all, e.g. an
    all-sale family booking) → **Completed**.
  - Any rental item still `booked`/`out` → **Active**, shown with a computed
    fraction, e.g. *"2 of 3 items returned"* (denominator = non-cancelled
    items; numerator = those `returned` or resolved-sale).
  - Every item cancelled → **Cancelled**.

  Now actually built, not just illustrative — a fifth view, `booking_status`,
  added to the blue-green rollout (see the schema migration section below)
  alongside the original four, matching this app's existing convention of
  computing status via SQL views (`booking_financials`, `overdue_rentals`)
  rather than in application code. It exposes raw `active_item_count`/
  `resolved_item_count` integers plus `computed_status`; the app layer
  formats the "2 of 3 items returned" string from those two numbers, the
  same "compute the numbers, format at the edge" pattern every other view
  here follows.

  **Naming collision caught while building this**: the view can't be
  created as `booking_status` right away — that name is already taken by
  the *enum type* `booking_status` from the original schema
  (`bookings.status booking_status`), and Postgres doesn't allow a view and
  a type to share a name in the same schema. It's created as
  `booking_status_v2` in the additive step like the other four, and the
  cutover step drops the now-orphaned `booking_status` enum (its only user,
  `bookings.status`, is dropped in that same step) immediately before
  renaming the view into the freed-up name.

- **C. "Booking count" grain.** `total_bookings`, `bookings_this_week` (Reports/
  Dashboard), and `repeat_customers`' `booking_count` all count **family
  transactions** — i.e. `count(distinct booking_id)` / rows in the parent
  `bookings` table — matching "how many times has this customer actually
  visited." `most_booked_items` stays at **item grain**, i.e.
  `count(*)`/`count(booking_item.id)` grouped by `item_id` over `booking_items`
  — that's inherently what it measures (how often a specific piece goes out),
  independent of how many other items rode along in the same family
  transaction, so this question doesn't apply to it. Affects
  `backend/src/routes/reports.ts` and `dashboard.ts` — not part of this
  migration's SQL, tracked in the blast radius below.

- **D. Return processing API surface.** Confirmed:
  `POST /api/bookings/:bookingId/items/:itemId/return`, scoped to one
  `booking_items` row. Replaces `POST /api/bookings/:id/return`.

### Schema and data migration (proposed 2026-08-11, revised 2026-08-11 to a
blue-green view rollout — not yet applied)

Three ordered SQL files under `supabase/proposed/20260811_booking_items_restructure/`
(kept out of `supabase/migrations/` deliberately, so a routine `supabase db push`
can't apply them — this needs the manual verification gate between steps, and app
code deployed in lockstep with step 3):

1. **`01_schema_additive.sql`** — creates `booking_item_status` enum and the
   `booking_items` table (indexes, `updated_at` trigger, RLS enabled to match
   every other table) — AND, in the same file, the five new computed views
   under temporary **`_v2`** names: `booking_financials_v2`,
   `booking_sequence_v2`, `overdue_rentals_v2`, `upcoming_returns_v2`,
   `booking_status_v2` (decision B's rollup — see above), with exactly the
   bodies the permanent views will have after cutover (see step 3). Views are
   just queries, not materialized, so creating them here doesn't require
   `booking_items` to have data yet — they simply return 0 rows (or, for
   `booking_status_v2`, one all-zero/`cancelled`-fallback row per existing
   booking) until step 2 backfills it, with no further action needed. Purely
   additive — `bookings` and the OLD `booking_financials`/`booking_sequence`/
   `overdue_rentals`/`upcoming_returns` are completely untouched, so the
   production app keeps working unmodified throughout. Safe to apply to the
   live DB on its own.
2. **`02_data_backfill.sql`** — converts every existing `bookings` row into
   exactly one `booking_items` row (`booking_items.booking_id` = the original
   `bookings.id`, so `payments.booking_id` and every `booking_code` need zero
   remapping). Wrapped in one transaction with a row-count assertion (`RAISE
   EXCEPTION` on mismatch, rolling back the whole thing) — either fully
   succeeds and verified-equal, or nothing is committed. `bookings` is still
   untouched after this step. The moment this commits, the `_v2` views from
   step 1 start reflecting real backfilled data with zero extra action —
   this is the point at which new backend/frontend code can be built and
   fully tested against real data (built against `booking_items` and the
   `_v2` views, never the old columns/views) on a **Vercel preview branch**,
   while production keeps serving the live app unmodified against the old
   schema, for as long as that testing takes.
3. **`03_schema_cutover.sql`** — the destructive step, run only once the
   preview-branch testing above is signed off. Drops the now-redundant
   columns from `bookings` (`item_id`, `quantity_booked`, `type`, `pickup_date`,
   `return_date`, `actual_return_date`, `status`, `price_charged`,
   `deposit_amount`, `deposit_collected`, `deposit_refunded`,
   `deposit_refund_date`, `return_checklist`, `custom_addons`, and
   **`return_notes`** — not in this section's original removed-fields list
   above; added as a correction, since return notes explaining an incomplete
   checklist only make sense per-item once a family booking can mix resolved
   and unresolved items, so it moves to `booking_items` alongside
   `return_checklist`), drops the four OLD views (which must go first —
   Postgres won't allow the column drops while a view still references them),
   drops the now-orphaned `booking_status` enum type (frees that name for
   the view rename below — see decision B above), and then — this is the
   change from the original proposal — **does not recreate the views from
   scratch**. It just renames the already-created, already-tested `_v2`
   views into the now-vacated permanent names
   (`alter view booking_financials_v2 rename to booking_financials;`, etc.,
   including `booking_status_v2` → `booking_status`). A rename doesn't
   disturb a view's internal dependencies (Postgres tracks those by OID, not
   name), so `overdue_rentals_v2`'s join to `booking_financials_v2` keeps
   resolving correctly through the rename regardless of order. Net effect:
   step 3 becomes a fast, well-rehearsed final swap — drop old columns, drop
   old views/enum, rename new views into place, deploy the already-tested
   app code — done together in one deliberate moment, rather than something
   debugged live for the first time. **Must be deployed together with the
   application code changes in the blast radius below.**

Notable view-shape changes carried into the `_v2`/permanent views (unchanged
from the original proposal): `booking_financials.price_charged`/`total_paid`/
`balance_due` become a sum across every line item in the family booking (one
running balance per transaction, supporting both "client pays the whole
family total upfront" and "client pays per item"); `is_overdue`/
`days_until_return` are dropped from `booking_financials` (overdue-ness is now
inherently per-item, not per-transaction — that signal lives in
`overdue_rentals` at the `booking_items` grain instead); `booking_sequence`'s
key column is renamed `booking_item_id` (was `booking_id`) since it now
identifies a line item, not a family transaction.

`verification_plan.sql` in the same folder has the exact before/after checks —
row counts, per-status distribution, financial-total parity, a byte-for-byte
spot-check of the real `Peacock Bridal Set` / `NGJ-0001` booking(s) by name,
a direct old-view-vs-`_v2`-view agreement check for every existing booking, and
(new) `booking_status`/`booking_status_v2` checks (including the "zero
booking_items" fallback reading as `cancelled`, and confirming no real booking
reads that way once backfilled) — at each gate (before anything runs; after
step 1; after step 2/during preview-branch testing/before step 3; after step
3). Nothing in this migration should be applied to the live database until
each gate has been checked, and step 3 specifically should not run until
preview-branch testing of the new app code against the `_v2` views has been
signed off.

`verification_scenarios.sql` (new, in the same folder) has two acceptance-test
runbooks to execute once both stages are live, using throwaway
`ZZTEST`-prefixed fixtures cleaned up at the end of each script:
- **Scenario A — out-of-order "When Returns" chain.** Creates three bookings
  on one throwaway item in the order B (15–18 Aug) → C (19–21 Aug) → A
  (13–14 Aug, created last but dated earliest), and confirms
  `booking_sequence` orders the chain A → B → C by `pickup_date`, not
  creation order. Then cancels B and confirms the chain closes to A → C with
  no dangling reference — cancelled rows are excluded from `booking_sequence`
  entirely (not just skipped over), per that view's existing `where status <>
  'cancelled'` filter.
- **Scenario B — real multi-item booking.** One family booking with 3
  throwaway rental items on staggered return dates. Confirms each item
  returns independently (returning one never touches the other two's
  `status`/`actual_return_date`), `booking_status` reads exactly "2 of 3
  items returned" (`resolved_item_count=2, active_item_count=3`) at the
  halfway point named in the task, and flips to `completed` only once the
  third and last item is returned.

### Application-code migration plan (scoped 2026-08-11, revised 2026-08-11 after
review — not yet built)

Scoped against the actual current code (every file below was read in full, not
assumed), to be built on a preview branch against the `_v2` views/`booking_items`
with real backfilled data, production untouched throughout. **Explicitly out of
scope for this pass**: the lost-and-found/refund feature, AND — per review —
**plain Cancel Booking (whole booking, no refund) as well**, held entirely until
the refund/lost-and-found infrastructure exists (see decision 6 below; this is a
change from the first draft of this plan, which only excluded the refund case).

**Design decisions (updated after review — changes from the first draft are
marked):**

1. **REVISED — multi-item creation IS wrapped in a real Postgres transaction,
   via a new RPC function**, not the insert-then-compensating-delete approach
   this plan originally proposed. Removes the "what if the cleanup itself fails"
   edge case entirely. A new `create_booking_with_items(...)` Postgres function
   (added via a small additive migration, called through `supabase.rpc(...)`)
   takes the parent fields plus a `jsonb` array of line items and inserts the
   parent `bookings` row and every `booking_items` row in one function body —
   which Postgres runs as a single atomic transaction by default, no explicit
   `BEGIN`/`COMMIT` needed inside a function. This is a deliberate, explicit
   exception to this codebase's prior no-RPC convention (see `reports.ts`'s own
   reasoning for why it normally fetch-and-aggregates in JS instead) — justified
   here because real cross-table atomicity is what's actually being asked for,
   and a stored function is the only way to get it through `supabase-js`/
   PostgREST, which has no multi-statement transaction API of its own. The
   **pre-write conflict-check stays exactly as originally planned and
   unchanged**: validate and check conflicts for every requested line item up
   front, before calling the RPC at all; if any item conflicts, call nothing,
   write nothing, and return a per-item-indexed conflict list. This pre-check
   race window (another request could theoretically slip a conflicting booking
   in between the check and the RPC call) is **explicitly accepted as-is**,
   consistent with the existing single-item code's identical race window today
   — not being tightened here, not a new risk.

   **Prerequisite this revision surfaces**: pre-cutover, `bookings` still has its
   old single-item `NOT NULL` columns (`item_id`, `type`, `pickup_date`,
   `price_charged`) — the new RPC's parent-only insert (`customer_id`, GST
   fields, nothing else) would fail those constraints until `03_schema_cutover.sql`
   finally drops them, which can't happen until *after* this application code is
   built and tested. Resolved with a new small additive migration —
   `supabase/proposed/20260811_booking_items_restructure/01b_relax_legacy_not_null_for_transition.sql`
   — that relaxes (doesn't remove) just those four `NOT NULL` constraints.
   Purely additive/reversible: the still-live production code path always
   supplies all four values anyway, so relaxing a constraint it was already
   satisfying has zero effect on it; `03_schema_cutover.sql` drops these columns
   outright regardless, so nothing here ever needs to be undone.

   **Both `01b_relax_legacy_not_null_for_transition.sql` and
   `01c_create_booking_with_items_rpc.sql` (the RPC itself) applied to the live
   database 2026-08-11.** The RPC's rollback behavior was proven, not just
   asserted: created a throwaway free item and a throwaway item with a real
   existing conflicting booking already on it, then called
   `create_booking_with_items(...)` with item 1 (free, valid) processed first
   and item 2 (conflicting) second. The call failed with `ERROR: P0001: Item
   ZZTEST-RPC-02 (ZZTEST RPC Item Conflicting) is already booked for an
   overlapping date range`. Directly queried afterward — not inferred from the
   error — and confirmed `bookings_count`/`booking_items_count` were **exactly
   unchanged** from baseline, no row existed for the attempted new
   `booking_code`, and critically, item 1's `booking_items` row (already
   inserted successfully earlier in the same function call, before the loop
   ever reached the conflicting item 2) also did not exist. Full transactional
   rollback confirmed, not a partial insert silently left behind. All
   throwaway fixtures cleaned up after; real data (`RNT-0001`) confirmed
   untouched throughout.

   **Follow-up test, same day**: the same unique item appearing TWICE in one
   call, as two overlapping rental line items (no pre-existing booking on the
   item at all — the only possible conflict is between the two lines in the
   same request). Line 1 (valid on its own) inserts first inside the loop;
   line 2's conflict check then correctly found line 1's just-inserted
   sibling row and rejected: `ERROR: P0001: Item ZZTEST-RPC-03 (ZZTEST RPC
   Same Item Twice) is already booked for an overlapping date range` — proof
   the per-item check sees writes made earlier in the same transaction, not
   just pre-existing committed rows (guaranteed by Postgres MVCC
   read-your-own-writes-within-a-transaction semantics, but confirmed live
   rather than assumed). Verified afterward the same way as the cross-item
   test: row counts exactly unchanged, no new parent row, and line 1's row
   also absent — full rollback, not a partial insert. Fixtures cleaned up;
   real data confirmed untouched. (This also means the app doesn't strictly
   need its own separate "same item twice" validation at the route level —
   the RPC already rejects it correctly on its own — though the route may
   still choose to reject it earlier/faster at the pre-check stage for a
   quicker user-facing error, same "two layers" relationship as any other
   conflict.)

   **RPC error handling, added per review**: `bookings.ts` catches this via
   `supabase.rpc(...)`'s returned `{ data, error }` (a `RAISE EXCEPTION`
   doesn't throw in JS) — checks `error.code === "P0001"` and returns
   `res.status(409).json({ error: error.message })`, surfacing exactly the
   friendly text passed to `RAISE EXCEPTION` (already written in
   human-readable prose for this reason) and nothing else — never the raw
   error object, never the `P0001` code or `PL/pgSQL function ... line 55 at
   RAISE` context visible to the client. Same "DB error message becomes a
   clean 409" pattern `items.ts`/`customers.ts` already use for `23505`. See
   the full description under `POST /api/bookings` in Checkpoint (a) below.

   One deliberate change from the original description of this decision,
   made while writing the actual SQL: the RPC does not just blindly insert —
   it re-runs the same per-item conflict checks `bookings.ts`'s `POST /`
   handler already does today (unique item availability + overlap; quantity
   item oversell), `RAISE EXCEPTION`ing on any failure. This was necessary to
   have anything real to demonstrate rollback against, and as a welcome side
   effect it closes the check-then-write race window this decision originally
   said would remain — the check and the write can no longer be split by a
   concurrent request, since they now happen inside one transaction. The
   application layer's own pre-write conflict check still runs first as a
   fast-fail; the RPC's internal check is a second, transaction-safe layer,
   not a replacement.
2. **Reports' `rental_count`/`sale_count` stay item-grain** (count of
   `booking_items` rows by `type` in the date range), NOT family-grain — decision
   C only specified `total_bookings`/`bookings_this_week`/`repeat_customers` as
   family-grain. Consequence: `rental_count + sale_count` can no longer be
   assumed to equal `total_bookings` once a family booking mixes a rental and a
   sale item — that identity held before this migration and won't after.
   **REVISED per review**: `ReportsPage.tsx` gets a small visible note wherever
   `rental_count`/`sale_count` sit near `total_bookings` (the "Bookings This
   Period" stat row), clarifying they're counted per item, not per transaction —
   so the mismatch reads as intentional design, not a bug, to whoever's looking
   at the page. (First draft of this plan left this as an unlabeled shape change
   with no UI fix forced; review upgraded it to a required copy addition.)
3. **Dashboard's `items_out` stat gets bundled-in-fixed.** Currently `count(items
   where status = 'rented_out')` — but per this doc's own standing note, a
   `unique` item's `status` is deliberately never flipped to `rented_out` on
   rental creation, so this stat has always silently read 0. Same class of bug as
   the overdue-detection fix already shipped in the `_v2` views. Since
   `dashboard.ts` is already being rewritten for this migration, recomputing
   `items_out` as `count(distinct item_id)` over `booking_items` where
   `type='rental' and status in ('booked','out')` is bundled in rather than left
   broken a second time. Flagged explicitly rather than silently changed.
4. **Edit Booking scope — REVISED, EXPANDED per review.** Editing an existing
   line item's `pickup_date`/`return_date`/`price_charged`/`quantity_booked`/
   `deposit_amount`/`deposit_collected`/`custom_addons` (re-running the same
   conflict check as creation whenever dates/item/quantity change), plus
   parent-level `customer_id`/GST fields — unchanged from the first draft.
   **Now also in scope, where the first draft explicitly excluded it:**
   - **Adding a new item to an existing booking** — same per-item
     conflict-detection as normal booking creation, just for that one item
     against the existing `booking_id`. A single-row insert, not multi-row, so
     it does NOT need decision 1's transactional RPC — a plain
     conflict-checked insert is already atomic on its own.
   - **Removing an existing item** — governed by three explicit rules, none
     optional:
     1. **Never a hard delete.** Always a status change to `'cancelled'` on
        that specific `booking_items` row — same "never destroy booking
        history" principle used everywhere else in this schema (matches how
        a whole booking's cancellation, when that exists, would also never
        delete rows).
     2. **Blocked if it would push `balance_due` negative.** Before allowing
        removal, compute what the booking's total `price_charged` would be
        *after* removing this item (sum of remaining non-cancelled items) and
        compare against `total_paid` (from `booking_financials_v2`, unaffected
        by this specific removal since payments aren't touched). If
        `total_paid` would exceed the new reduced total, block with a clear
        message — e.g. *"Removing this item would mean refunding ₹X, which
        isn't supported yet"* — rather than allowing an unrepresentable
        negative balance. This is a real reason cancel-with-refund (decision 6)
        is out of scope for this pass: removal only works when the money
        already collected still fits under the reduced total.
     3. **Only allowed while `status` is `booked`/`out`.** An already-`returned`
        item can't be retroactively un-booked — matches the existing
        editing-a-returned-item restriction directly above.
   - New endpoints (both under the existing `/api/bookings/:bookingId/items/...`
     family, matching decision D's shape): `POST
     /api/bookings/:bookingId/items` (add) and `POST
     /api/bookings/:bookingId/items/:itemId/cancel` (remove/cancel, rules above)
     — kept as their own `POST .../cancel` action rather than folded into the
     `PATCH` item-edit endpoint, mirroring how `.../return` is already its own
     action distinct from a plain field edit.
5. **Per-item "When Returns."** `GET /api/bookings/:id` gives each `unique`-
   tracking-type line item its own chain panel (previous/future), keyed off
   `booking_sequence_v2`'s `booking_item_id` — not one chain for the whole family
   booking, since a 3-item family booking has three independent physical items,
   each with its own neighbors.
6. **NEW — plain Cancel Booking (whole booking, no refund) is explicitly OUT of
   scope for this pass**, held entirely until the refund/lost-and-found
   infrastructure exists (same dependency the already-excluded
   cancel-booking-with-refund has). `EditBookingForm` (item 14 below) must not
   include any "cancel whole booking" action — only the per-item add/edit/remove
   affordances from decision 4.

**Pacing — three checkpoints, not one uninterrupted pass.** Per review, this
doesn't get built end-to-end in one go — stop and report back with real test
results (against real backfilled data on the preview branch, same discipline as
Stage 1) at each of the three checkpoints below before continuing to the next.

---

#### Checkpoint (a) — Backend — DONE 2026-08-11, all four files tested live

`bookings.ts`, `dashboard.ts`, `reports.ts`, `tools/index.ts` all rewritten per
the plan below, typechecked clean, and tested via real HTTP calls against the
live database on a new branch (`feat/booking-items-checkpoint-a`), not just
typechecked. `items.ts` needed no change (confirmed, not just assumed — see
below).

**How testing was actually done**: no Vercel preview deployment was set up (no
GitHub push/Render/Vercel credentials available in this environment) — instead,
the backend was run locally (`npm run dev` in `backend/`) pointed at the same
real, single linked Supabase project used throughout this migration, and
exercised with real `curl` HTTP requests carrying a genuine Supabase Auth
bearer token. That token came from a throwaway test user created via the
service-role admin API (`supabase.auth.admin.createUser`) with a matching
`users` table profile row (`role: admin`), signed in via the anon key exactly
as the real frontend does — real auth, not a bypass. Both the auth user and its
profile row were deleted at the end.

**Bug found and fixed live, not in review**: `booking_financials_v2` summed
`price_charged` across **every** `booking_items` row regardless of status,
including `'cancelled'` ones — inconsistent with `booking_status_v2` (which
already correctly excludes cancelled items) and with this app's "cancelled =
never happened" principle applied everywhere else (`reports.ts`'s revenue/
counts). Found while testing the new remove-item endpoint: cancelling an item
should shrink the booking's total price, and it wasn't. Fixed with `where
status <> 'cancelled'` on the view's price subquery — applied live and
corrected in `01_schema_additive.sql`'s source too. Re-verified after the fix:
cancelling a ₹3200 item correctly dropped `price_charged` from 9200 to 6000.

**What was tested, with real results** (all using fresh `ZZTEST`-prefixed
fixtures, fully cleaned up after, real data confirmed untouched throughout):

- `GET /api/bookings` and `GET /api/bookings/:id` against the real `RNT-0001`
  booking — correct nested `booking_items`, correct merged `total_paid`/
  `balance_due`/`computed_status`, correct (empty) per-item "When Returns"
  chain.
- `POST /api/bookings` — a real 2-item booking created end-to-end through the
  actual HTTP route calling the actual RPC: `booking_code` correctly generated
  as `BK-0001` (first of the new prefix), both items landed, advance payment
  recorded (`total_paid: 1000`, `balance_due: 6000` on the 7000 total).
- Conflict rejection, two ways: (1) a genuinely conflicting create was caught
  by the **app-level pre-check** with a structured `item_conflicts` array,
  409, no writes; (2) the same unique item appearing **twice in one request**
  with overlapping dates — which the pre-check structurally can't catch, since
  it only checks each item against already-committed data — was correctly
  caught by the **RPC's own internal check**, surfaced as a clean `409 {
  "error": "Item ZZTEST-CPA-02 (...) is already booked for an overlapping date
  range" }` with no `P0001`/raw Postgres error visible, exactly as designed.
  Confirmed directly afterward that item 2 still had exactly one
  `booking_items` row (the earlier real one) — no partial insert leaked.
- `POST /api/bookings/:bookingId/items` (add item) — succeeded, conflict-
  checked the same way as creation.
- `PATCH /api/bookings/:bookingId/items/:itemId` (edit item) — price edit
  applied correctly.
- `POST /api/bookings/:bookingId/items/:itemId/return` — status flipped to
  `returned`, item's own `items.status` correctly flipped back to
  `available`.
- `POST /api/bookings/:bookingId/items/:itemId/cancel` (remove item, decision
  4's three rules) — all three proven with real requests: blocked
  removing an already-`returned` item (`"This item is already 'returned' and
  can't be removed"`); blocked a removal that would push balance negative,
  with the exact computed amount (`"Removing this item would mean refunding
  ₹800.00, which isn't supported yet"`); allowed removal at the exact boundary
  (remaining total precisely equal to amount paid) — confirming `>` not `>=`
  is the right comparison.
- `PATCH /api/bookings/:id` (parent GST fields) — applied correctly.
- `GET /api/dashboard/summary` — every figure cross-checked by hand against
  the real+test data present at the time: `outstanding_balance`, `items_out`
  (the bundled fix — confirmed counting real distinct out items, not always
  0), and `bookings_this_week` (confirmed the real older booking, created
  outside this week's Monday boundary, is correctly excluded).
- `GET /api/reports` — every figure cross-checked by hand: `total_bookings`
  (distinct family count), `rental_count`/`sale_count` (item-grain, cancelled
  excluded), `repeat_customers` (correctly empty — the test customer's items
  all belong to one family transaction, not counted as a repeat visit),
  `idle_inventory` (correctly included the item whose only booking had just
  been cancelled — a cancelled-only item reads as idle, matching this app's
  "cancelled never counts as activity" rule).
- All 6 chat tools (`search_items`, `get_item_status`, `check_availability` ×2
  — overlapping and non-overlapping dates, `get_customer_history`,
  `get_upcoming_returns`, `get_overdue_rentals`) called directly against real
  data — `get_item_status`'s new `items → booking_items → bookings` embed
  path confirmed working, `check_availability` correctly returned both
  `available: false` (with the conflicting row) and `available: true` for
  different date ranges on the same item.

Uncommitted on `feat/booking-items-checkpoint-a` — not committed or pushed,
per this project's "only commit when explicitly asked" rule.

1. **`backend/src/routes/bookings.ts`** — the core rewrite.
   - `nextBookingCode()`: drop the `RNT`/`SALE` per-`type` branching entirely;
     always generate `BK-000N` (filtered on the `BK-%` pattern, same
     highest-existing-code logic `items.ts`'s `nextItemCode()` already uses for
     custom-code safety). `booking_code` stays freely overridable at create time,
     same 409-on-`23505` pattern as items.
   - `POST /api/bookings`: request body becomes `{ customer_id, gst_applicable,
     gst_invoice_number, hsn_code, tax_rate, advance_amount, advance_method,
     items: [{ type, item_id, quantity_booked, pickup_date, return_date,
     price_charged, deposit_amount, deposit_collected, custom_addons }, ...] }`.
     Runs decision 1's validate-every-item-first flow, then calls the new
     `create_booking_with_items(...)` RPC to write the parent + all line items
     as one real transaction (replaces the earlier insert-then-compensating-
     delete draft). The existing same-day-turnover `warning` check runs per
     item, collected into an array (or joined into one string) rather than a
     single flag. Advance-payment insert stays parent-level, unchanged in
     spirit, and stays a separate non-transactional call after the RPC returns
     (same non-blocking-`warning`-on-failure pattern as today — the booking
     itself is already safely committed by then).

     **RPC error handling (added per review)**: `supabase.rpc("create_booking_with_items",
     {...})` returns `{ data, error }` the same shape as every other `supabase-js`
     call in this codebase — a `RAISE EXCEPTION` inside the function does NOT
     throw in JS, it comes back as `error` with `error.code` set to the
     exception's SQLSTATE (`P0001`, the default for a plain `RAISE EXCEPTION`
     with no explicit code) and `error.message` set to exactly the text passed
     to `RAISE EXCEPTION` — already written in friendly, human-readable prose
     for this exact reason (e.g. `"Item NGJ-0003 (Polki Bridal #1930) is
     already booked for an overlapping date range"`). The route checks
     `error.code === "P0001"` and returns `res.status(409).json({ error:
     error.message })` — `error.message` alone, never the raw error object or
     anything that would leak `P0001`/`PL/pgSQL function ... line 55 at
     RAISE`-style context to the client — the same "surface the DB error's
     message as a clean 409, nothing else" pattern `items.ts`/`customers.ts`
     already use for `23505`. One asymmetry worth knowing: the app-level
     pre-check (which runs first and catches the overwhelming majority of
     conflicts) already returns a structured `conflicts` array alongside the
     message, same as today's single-item behavior; the RPC's own P0001 safety
     net — only reached in the rare case a conflict appears in the gap between
     the pre-check and the transaction — has just the message text, no
     structured array, since that's all `RAISE EXCEPTION` gives us. A graceful
     degradation for an already-rare race case, not a regression from today
     (today has no safety net at all for that gap).
   - **New (decision 4)**: `POST /api/bookings/:bookingId/items` — add a single
     item to an existing booking, same per-item conflict-detection as creation,
     plain conflict-checked insert (no RPC needed, single row is already
     atomic). `POST /api/bookings/:bookingId/items/:itemId/cancel` — remove an
     item via the three rules in decision 4 (status→`'cancelled'` only, never
     hard-deleted; blocked if it would push `balance_due` negative; only while
     `booked`/`out`).
   - `GET /api/bookings`: real relational embed now possible and preferred over
     the old two-query-merge pattern — `booking_items.booking_id` and
     `booking_items.item_id` are genuine FKs (unlike the computed views), so
     `.select("*, customers(name,phone), booking_items(*, items(item_code,name,
     item_type,tracking_type,components))")` works directly through PostgREST.
     `total_paid`/`balance_due` (from `booking_financials_v2`) and
     `computed_status`/`active_item_count`/`resolved_item_count` (from
     `booking_status_v2`) still need the existing two-query-plus-merge treatment,
     since those remain views with no real FK. `item_id`/`customer_id` query-param
     filters now filter on a joined `booking_items.item_id` / `bookings.customer_id`
     respectively; the old `status` param is replaced with a `computed_status`
     param filtering on the merged `booking_status_v2` value.
   - `GET /api/bookings/:id`: same relational embed for items; per decision 5,
     each returned line item additionally carries its own `previous_booking_item`/
     `future_booking_items` chain (from `booking_sequence_v2`, keyed by
     `booking_item_id`), computed the same "full list, slice after current
     position" way the existing single chain is built today.
   - **New**: `POST /api/bookings/:bookingId/items/:itemId/return` replaces
     `POST /api/bookings/:id/return` — same rejection rules (not `booked`/`out` →
     409; not a rental → 400) and same combined components+custom_addons
     checklist/warning logic, just scoped to the one `booking_items` row
     identified by `(bookingId, itemId)`. Assumes an item appears at most once per
     booking — worth a quick sanity check once multi-item creation exists, since
     nothing currently prevents adding the same `item_id` twice to one booking
     (arguably should be blocked at create time as a validation rule — flagging,
     not deciding, since it wasn't asked for explicitly).
   - **New**: `PATCH /api/bookings/:id` (parent fields) and
     `PATCH /api/bookings/:bookingId/items/:itemId` (line-item fields, decision 4's
     scope) — the Edit Booking capability.
2. **`backend/src/routes/dashboard.ts`**
   - `due_today`: query moves from `bookings` to `booking_items` (`type='rental'`,
     `status in ('booked','out')`, `return_date = ist_today()`), joined to
     `bookings` for `booking_code`/`customer_id` and to `items`/`customers` the
     same merge pattern as today.
   - `overdue`: source view becomes `overdue_rentals_v2` (already item-grain,
     already carries `booking_code`/`customer_id` per its own definition) — same
     merge-in-items/customers pattern, unchanged in shape.
   - `outstanding_balance`: sum `booking_financials_v2.balance_due` over bookings
     whose `booking_status_v2.computed_status = 'active'` — preserves today's
     exact semantics (booked/out-equivalent only, not completed/cancelled), just
     re-derived through the new computed-status view instead of a stored column.
   - `items_out`: bundled fix per decision 3 above.
   - `bookings_this_week`: **no change needed** — it already queries the parent
     `bookings` table directly by `created_at`, which is already family-grain by
     construction once the old per-item columns are gone; confirmed, not assumed.
3. **`backend/src/routes/reports.ts`**
   - `periodBookings`/`recentBookings` (idle inventory) queries move from
     `bookings` to `booking_items`, joined to `bookings`→`customers` and `items`,
     filtered the same way (`status <> 'cancelled'`, `pickup_date` range/cutoff).
   - `summary.total_bookings`: becomes `new Set(periodBookings.map(b =>
     b.booking_id)).size` (distinct family transactions) per decision C — computed
     in JS from the same fetched rows, same fetch-then-aggregate architecture as
     today, not a new query.
   - `rental_count`/`sale_count`: stay row counts over the fetched `booking_items`
     rows, per decision 2 above.
   - `most_booked_items`: unchanged logic, item-grain, just reading from
     `booking_items` rows instead of `bookings` rows.
   - `repeat_customers.booking_count`: the aggregation map changes from an
     incrementing counter to a `Set<booking_id>` per customer, `.size` at the end —
     the only real logic change in this file, since "how many times has this
     customer visited" now means distinct family transactions, and one visit can
     produce several `booking_items` rows for the same customer.
   - `idle_inventory`: unchanged logic, just sourced from `booking_items.item_id`/
     `pickup_date` instead of `bookings`.
4. **`backend/src/tools/index.ts`** (AI chat tools)
   - `get_item_status`: embed changes from `items(*, bookings(*))` to `items(*,
     booking_items(*, bookings(booking_code, customer_id)))` — `items` no longer
     has a direct FK relationship to `bookings`.
   - `check_availability`: query moves from `bookings` to `booking_items`, same
     `item_id`/`status in ('booked','out')`/date-overlap filter, unchanged logic.
   - `get_customer_history`: restructure to fetch `booking_items` joined to their
     parent `bookings` (for `booking_code`/GST) rather than flat `bookings` rows,
     so the tool's answer reflects real per-item detail (which item, which dates)
     inside each family transaction.
   - `get_upcoming_returns`/`get_overdue_rentals`: swap source view names to
     `upcoming_returns_v2`/`overdue_rentals_v2` (permanent names post-cutover) —
     field shape is compatible (`days_until_return`, `next_*` fields already
     present), no other logic change.
   - `search_items`: **no change** — never touched bookings.
5. **`backend/src/routes/items.ts`**: **verify only, no code change expected.**
   The delete-block's `23503`-on-FK-violation handling stays correct as-is — the
   protecting FK just moves from `items.id ← bookings.item_id` to `items.id ←
   booking_items.item_id`, same error code, same friendly message. Confirm live
   once the schema's cut over, not before.

---

#### Checkpoint (b) — Frontend types + simpler pages

`lib/bookings.ts`, `lib/dashboard.ts`, `lib/reports.ts`, `lib/statusPill.ts`,
`DashboardPage.tsx`, `ReportsPage.tsx` (pulled forward from their original
later slots — item numbers below are stable file IDs, not build-order
sequence numbers, so cross-references like "item 7's type updates" still
resolve correctly regardless of physical position in this list). Stop and
report real test results once this group is done, before touching the
booking-specific component cluster.

6. **`frontend/src/lib/bookings.ts`** — full type rewrite, the foundation
   everything else below depends on. `Booking` (parent) gains `items:
   BookingItem[]`, drops every field that moved to the child; new `BookingItem`
   interface carries what `Booking` used to plus its own item summary embed and
   (on the detail response) its own chain fields. `BookingItemStatus` becomes
   `"booked" | "out" | "returned" | "cancelled"` (drops `"completed"` — that word
   now only exists as the family-level `computed_status`). New
   `BookingComputedStatus = "active" | "completed" | "cancelled"`. `NewBooking`
   restructures to the parent-fields-plus-`items[]` shape from backend item 1.
   `createBooking()`'s conflict handling updates for the per-item-indexed 409
   shape. `processReturn(bookingId, itemId, payload)` signature change. New
   `updateBooking()`/`updateBookingItem()` for the Edit capability.
7. **`frontend/src/lib/dashboard.ts`** — `DueTodayBooking`/`OverdueBooking` change
   from extending `Booking` to representing a single `BookingItem` plus its parent
   `booking_id`/`booking_code` — otherwise structurally similar to today.
8. **`frontend/src/lib/reports.ts`** — no interface shape changes forced (same
   field names, `booking_count`/`total_bookings` just mean something more correct
   now); double-check `MostBookedItem`/`RepeatCustomer` types still line up.
9. **`frontend/src/lib/statusPill.ts`** — `bookingStatusPill` splits in two:
   `bookingItemStatusPill(status: BookingItemStatus)` (booked/out/returned/
   cancelled, same colors as today minus the `completed` case) for a line item's
   own pill, and a new `bookingComputedStatusPill(status: BookingComputedStatus,
   resolved: number, active: number)` returning both a pill (`pill-active` for
   Active, `pill-good` for Completed, `pill-neutral` for Cancelled) and the
   formatted "2 of 3 items returned" fraction text — this is where decision B's
   raw counts become the actual display string, kept out of the SQL view on
   purpose (compute the numbers, format at the edge — same rule as every other
   view in this migration).
16. **`frontend/src/pages/DashboardPage.tsx`** — minimal changes; it already
    treats each due-today/overdue row as one item-level entry, so mostly just
    needs to follow item 7's type updates (e.g. reading `booking_id` instead of
    `id` for the `/bookings?booking=` deep link, if the field name changes).
17. **`frontend/src/pages/ReportsPage.tsx`** — no structural changes forced by
    item 8's stable interface, but per decision 2 (revised) DOES need the new
    visible note near `rental_count`/`sale_count`/`total_bookings` in the
    "Bookings This Period" stat row, clarifying the per-item-vs-per-transaction
    counting difference — this is now a required change, not an optional
    copy tweak.

---

#### Checkpoint (c) — Booking-specific component cluster

`BookingForm.tsx`, `BookingsList.tsx`, `BookingDetail.tsx`, `ReturnForm.tsx`,
`EditBookingForm.tsx`, `BookingsPage.tsx`, `shared.css`. The largest and most
novel piece given the expanded edit scope (decision 4) — gets its own
dedicated checkpoint rather than being bundled with (b). Stop and report real
test results once this group is done; this is the final checkpoint before
Stage 2 cutover can be scheduled.

10. **`frontend/src/components/bookings/BookingForm.tsx`** — the biggest UI
    rewrite. One shared section (customer picker, GST fields, advance payment,
    single `booking_code` generated once) plus a **repeatable line-item block**:
    each row gets its own type/item/quantity/dates/price/deposit/custom-addons
    fields (today's single-item field set, just repeated), with "+ Add Another
    Item" / per-row remove controls. The existing auto-price-on-item-change
    effect, quantity-reset-on-item-change effect, and error/conflict-clearing
    effect all move from whole-form state to per-row state (an array of row
    objects with their own local derived state, or one `useState` array plus a
    row-indexed update helper). Submission conflict errors, per decision 1's
    per-item-indexed shape, highlight the specific row(s) that failed rather than
    a single form-wide error.
11. **`frontend/src/components/bookings/BookingsList.tsx`** — replaces the flat
    `.data-table` entirely with a **card-per-booking layout**: one card per family
    transaction showing `booking_code`, customer, the computed-status pill +
    fraction (from item 9's new helper), `total_paid`/`balance_due`, and — nested
    inside the same card — each line item as its own row (item name/code, type,
    dates, its own status pill, a "Process Return" button when eligible, an "Edit"
    affordance). This is the one list in the app that moves off the shared
    `.data-table`/`data-label` responsive pattern, since it's now inherently
    hierarchical (a table row can't naturally hold a nested list) — Items and
    Customers keep their existing table pattern unchanged. New CSS needed:
    `.booking-card`/`.booking-card-item` (or similar) in `shared.css`, built from
    the same design tokens (wine/gold palette, existing `.pill` vocabulary, same
    `:focus-visible` rule) rather than a new visual language.
12. **`frontend/src/components/bookings/BookingDetail.tsx`** — parent info
    (code, customer, GST, `total_paid`/`balance_due`, computed-status pill +
    fraction) plus each line item rendered as its own sub-section: its own
    status/dates/price/deposit, its own "When Returns →" panel (per decision 5,
    only for `unique`-tracking items, using that item's own
    `previous_booking_item`/`future_booking_items`), and its own "Process
    Return"/"Edit Item" actions — the single "When Returns" panel this component
    has today becomes N independent panels, one per eligible item.
13. **`frontend/src/components/bookings/ReturnForm.tsx`** — rescoped from a
    whole `BookingWithDetails` to a single `BookingItem` (plus enough context —
    `booking_code`, customer name, item name — passed down or included in the
    item's own embed). `onSubmit` calls `processReturn(bookingId, itemId,
    payload)`. Checklist logic (components + `custom_addons` combined) is
    otherwise unchanged, just reading off the one line item's own fields.
14. **New: `frontend/src/components/bookings/EditBookingForm.tsx`** (or an edit
    mode on `BookingForm`, mirroring how `ItemEditForm` mirrors `AddItemWizard`
    rather than reusing one component in two modes) — the Edit Booking
    capability, scoped per decision 4 (revised, expanded): parent fields,
    per-line-item field edits, **plus** an "Add Item" row (reusing the same
    single-item fields/conflict-handling `BookingForm`'s repeatable rows use)
    and a "Remove" action per still-active (`booked`/`out`) line item — which
    surfaces the backend's negative-balance block as a plain error message
    when it fires, not a silent failure. Per decision 6: **no "cancel whole
    booking" action anywhere in this component** — only the per-item
    add/edit/remove affordances above.
15. **`frontend/src/pages/BookingsPage.tsx`** — gains `editingBookingId` state
    the same way `ItemsPage`/`CustomersPage` already hold `editingItem`/
    `editingCustomer` (existing, proven pattern — short-circuits the tab view,
    tab active-highlight logic matches). `ReturnForm` invocation updates to pass
    `(bookingId, itemId)` instead of a whole booking row — `onProcessReturn`'s
    signature changes accordingly, now taking the specific line item being
    returned (plus its parent booking) rather than a flat `BookingWithDetails`.
    The existing `?booking=<id>` deep-link handling is unaffected (still points
    at a parent booking id).
18. **`frontend/src/styles/shared.css`** — new booking-card rules (item 11),
    reusing existing design tokens.

**Testing approach at every checkpoint**: preview branch, built and tested
against `booking_items` and the `_v2` views end-to-end (never the old columns/
views), using the real backfilled data (`RNT-0001` / `NGJ-0003`) plus fresh
throwaway `ZZTEST`-prefixed scenarios for the new multi-item/edit/chain/add/
remove paths — same verification discipline as Stage 1, real results pasted
back at each of the three checkpoints above, not just "passed." Stage 2
(`03_schema_cutover.sql`) and this application code deploy together, only once
checkpoint (c) is fully built and verified on the preview branch, per the
standing two-stage design.

### Full blast radius
See the design conversation for the complete list of affected views, routes, and
frontend components (SQL views `booking_financials`/`overdue_rentals`/
`upcoming_returns`/`booking_sequence`/`booking_status`; backend routes
`bookings.ts`, `dashboard.ts`, `reports.ts`, `items.ts`'s delete-block,
`tools/index.ts`'s chat tools; frontend `lib/bookings.ts`, `BookingForm.tsx`,
`BookingsList.tsx`, `BookingDetail.tsx`, `ReturnForm.tsx`, `lib/dashboard.ts`,
`DashboardPage.tsx`, `lib/reports.ts`, `ReportsPage.tsx`) — not reproduced here
since it's a snapshot of the pre-migration codebase, not a durable design
decision. Now superseded by the file-by-file application-code migration plan
immediately above, which was scoped against the real current code.
