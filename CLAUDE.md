# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Nitya Gehini Jewels — Management System

Rebuild of the v1 Airtable + static HTML system as a real backend + database.
Full context and rationale: `PROJECT_PLAN_V2.md` (keep it in sync if the plan changes).

## Current status (2026-08-13)

**Done:** Auth (login/logout, protected routes, `/api/me` role scaffold — not yet used
to gate anything). Items, end to end, including edit/delete: backend
(`backend/src/routes/items.ts` — server-generated `item_code`, photo upload to the
`item-photos` Storage bucket, delete blocked with a friendly message when booking
history exists) and frontend (`frontend/src/pages/ItemsPage.tsx` +
`frontend/src/components/items/`) — a fast multi-step add-item wizard, a list view,
and edit/delete per row. Customers, end to end: backend
(`backend/src/routes/customers.ts` — atomic phone-dedupe on create via
insert-then-catch-23505, digits-only phone normalization, name/phone search) and
frontend (`frontend/src/pages/CustomersPage.tsx` +
`frontend/src/components/customers/`) — `AddCustomerForm` is deliberately
self-contained (no page-level state) so it can be dropped into a modal from the future
booking screen. Shared UI styling (buttons, form fields, cards, tables) lives in
`frontend/src/styles/shared.css`, used by both Items and Customers.

All of the above verified in-browser and against the DB directly, not just
typechecked — including the phone-dedupe flow (same digits, different
formatting/punctuation correctly surfaces the existing customer instead of creating a
duplicate; a genuinely different number, e.g. with a country code prefix, correctly
does not match) and partial-phone/name search. One real bug was caught and fixed
during this verification: `CustomersList`'s debounced search had no guard against an
older in-flight request resolving after a newer one and clobbering its results —
fixed with a `cancelled` flag in the effect's cleanup.

Bookings creation, end to end: backend (`backend/src/routes/bookings.ts`) generates
`RNT-000N`/`SALE-000N` codes (retry-on-23505, same pattern as `item_code`) and does
real conflict detection — `unique` items require `status = 'available'` and, for
rentals, no overlapping active (`booked`/`out`) rental on that item; `quantity` items
can't be oversold past `quantity_on_hand` once active sales (permanent) and
date-overlapping active rentals (temporary) are both accounted for. A unique item's
`status` flips to `sold` on sale but is deliberately left untouched by rental
creation — see the long comment above the POST handler for why. `quantity_on_hand`
itself is never decremented; "how much is left" is always computed from existing
bookings at check time. Frontend (`frontend/src/pages/BookingsPage.tsx` +
`frontend/src/components/bookings/`) — `BookingForm` (type/item/customer/dates/price
auto-fill/deposit/GST) plus `CustomerPicker`, which reuses `AddCustomerForm` inside a
new shared `Modal` component exactly as it was built decoupled for.

All verified live: successful non-overlapping unique-item rental, a second overlapping
rental correctly blocked with the specific conflicting booking shown, a quantity-item
sale succeeding with no `return_date`, the oversell check confirmed exact down to the
unit boundary, GST fields toggling both directions, and a brand-new customer created
from inside the booking form without losing any other field's state. One real bug was
caught and fixed during that last check: `Modal`'s content was a DOM descendant of
`BookingForm`'s own `<form>`, so `AddCustomerForm`'s nested `<form>` triggered a native
browser submit (full page reload, all state lost) instead of React's `onSubmit` —
fixed by rendering `Modal` through a `createPortal` into `document.body`. Any future
modal that might contain a `<form>` should go through this same `Modal` component
rather than a one-off `<div>` overlay, to avoid reintroducing this.

Conflict-detection boundary refined afterward: the overlap checks (both the
unique-item conflict check and the quantity-item date-windowed oversell check) use
strict inequality (`<`/`>`), not `<=`/`>=` — a new booking's `pickup_date` landing
exactly on an existing booking's `return_date` for the same item is same-day
turnaround (returns in the morning, goes back out that evening), which this shop does
regularly in wedding season, and must succeed rather than hard-block. When that
touching-boundary case happens, the booking still succeeds but the response carries a
non-blocking `warning` field (API-response-only, not a DB column) prompting the
operator to confirm check-in before handing the item over — surfaced in
`BookingForm`'s success panel. Verified live: touching boundary succeeds with the
warning shown, a genuinely earlier pickup is still correctly blocked, and a pickup the
day after succeeds with no warning.

Returns processing, end to end — the second and last `TODO(Phase 1)` marker in
`backend/src/routes/bookings.ts` is now resolved. `POST /api/bookings/:id/return`
rejects anything not currently `booked`/`out` (no double-processing) and anything
that isn't a rental (a sale has no return concept — added as a safeguard beyond what
was explicitly asked, since letting one through would incorrectly flip a sold unique
item's status). For a `set` item it normalizes `return_checklist` from the item's
`components` (unmentioned components come back `false`) and, if anything's unchecked
with no `return_notes` explaining it, returns the same kind of non-blocking `warning`
as booking creation's same-day-turnover case — the shop needs to close out an
incomplete return, not get stuck. A `unique` item's status flips back to `available`;
a `quantity` item needs no stock adjustment since availability was already computed
live from active bookings, never stored. Frontend: `BookingsList` (new — this task
needed the first real list view for bookings) shows a "Process Return" action on
eligible bookings; `ReturnForm` handles the checklist/notes/date/deposit-refund flow.

While building this, found and fixed a **pre-existing** bug unrelated to this task:
`GET /api/bookings` had `booking_financials(*)` in its select since the original
scaffold, but that's a computed VIEW, not a table with a real foreign key to
`bookings` — PostgREST can't embed it via relationship syntax, so the endpoint 500'd
on every call. It had just never been exercised through the app before, since no list
view existed until this task's `BookingsList` needed one. Removed the embed; if
per-booking balance_due is ever needed there, query the view separately and merge, the
way the customers search already does two queries + merge rather than relying on a
single-request embed.

All verified live: unique-item set return with everything checked succeeds with no
warning, item status flips back to `available`, and the item reappears in the booking
item-picker; the same kind with one component deliberately left unchecked and no
notes succeeds but shows the warning; a quantity-item rental return succeeds with no
checklist (not a set); attempting to re-return an already-returned booking is
rejected with a clear message (409); attempting to return a sale booking is rejected
too; deposit-refund toggle persists `deposit_refunded`/`deposit_refund_date`
correctly, defaulting the date to the return date when not explicitly given.

"When Returns" chain, end to end: a new migration
(`supabase/migrations/20260805100000_booking_sequence_and_overdue_alert.sql`) adds a
`booking_sequence` view computing each booking's next/previous booking for the same
`item_id` via `LAG`/`LEAD` over a window partitioned by `item_id`, ordered by
`pickup_date`/`created_at`, excluding cancelled bookings — fully computed at query
time, no `next_booking_id` column stored anywhere, so cancelling or editing a booking
automatically re-links its former neighbors on the next read with no cleanup step.
`overdue_rentals` was extended (purely additive columns via `create or replace view`)
with `next_customer_waiting`: true when an overdue booking's next-in-line booking (per
`booking_sequence`) has `pickup_date <= ist_today()` — a distinct, higher-urgency
signal ("next customer is waiting on this exact item"), not folded into the plain
overdue list. Backend: `GET /api/bookings/:id` (new route, registered after the
literal `/overdue` and `/upcoming-returns` paths so it doesn't shadow them) joins the
booking to `booking_sequence` as a second separate query rather than a relationship
embed, since `booking_sequence` is a view with no real FK — the same
embed-doesn't-work-on-views constraint hit earlier with `booking_financials`. Frontend:
`BookingDetail.tsx` (new) shows a "**When Returns →**" panel only when the item's
`tracking_type` is `unique` and a `next_booking` exists (a `quantity` item can have
many bookings active at once, so "next in line" isn't a single well-defined thing
there); `BookingsList` gained a "View" action wired to it via `BookingsPage`'s existing
state-machine view-switching pattern.

All verified live against real DB rows (throwaway `ZZTEST`-prefixed data, cleaned up
after): three bookings A→B→C on the same unique item each showed their own correct
`next_booking` in both the API response and the rendered panel; cancelling B directly
in the DB caused A's `next_booking` to correctly re-point to C with no stale reference,
confirmed both via API and a live re-render in the browser; a separate overdue/next
-in-line scenario (booking `status='out'` with `return_date` in the past, and a
same-item next booking with `pickup_date` today-or-earlier) correctly set
`next_customer_waiting: true` on `overdue_rentals` with no false positives on other
rows. Real data (`Peacock Bridal Set` / `NGJ-0001`) confirmed untouched throughout.

Dashboard, end to end — `DashboardPage.tsx`'s placeholder heading is replaced with a
read-only status view, deliberately built as pure composition over existing
tables/views rather than new business logic: a new backend route
(`backend/src/routes/dashboard.ts`, mounted at `GET /api/dashboard/summary`) reads
today's-returns-due directly off `bookings` (`return_date = ist_today()`, status
`booked`/`out`, distinct from the `upcoming_returns` view which only covers `status =
'out'` and `return_date >= today`), the `overdue_rentals` view as-is (including last
task's `next_customer_waiting`), and `booking_financials` for the outstanding-balance
sum across active bookings — all merged with a second items/customers query where
needed, the same two-queries-plus-merge pattern used everywhere else in this codebase
for views with no real FK to embed through. `ACTIVE_STATUSES` was exported from
`bookings.ts` rather than redefined. A small new IST helper, `istWeekStart()`
(`backend/src/lib/dates.ts`), gives "bookings created this week" a real Monday
boundary rather than a rolling 7 days. Frontend: `DashboardPage.tsx` shows four quick-stat
tiles (active items, items out, customers, bookings this week), an outstanding-balance
tile, a "Today's Returns Due" list, and an "Overdue Rentals" list that visually splits
into an urgent group (red panel + "Next customer waiting" badge, `next_customer_waiting
=== true`) rendered before the plain-overdue group — not just a flat list. Every row
links out rather than duplicating any action: stat tiles link to `/items`/`/customers`/
`/bookings`, and each due-today/overdue row links to that exact booking's existing
`BookingDetail` view via a new `?booking=<id>` query-param deep link added to
`BookingsPage.tsx` (read on mount only, additive — the existing internal
view-switching state machine and its "View" button are untouched).

All verified live against real DB rows, cross-checked directly against Supabase (not
just that the page rendered): with only real data present, `/api/dashboard/summary`
correctly returned all-zero stats and empty due-today/overdue lists matching an empty
`bookings`/`customers` table. Throwaway `ZZTEST`-prefixed data was then added (one
due-today booking, one overdue booking with `next_customer_waiting` true, one item
flipped to `rented_out`) and the API's `due_today`/`overdue` counts and every stat
were checked byte-for-byte against direct Supabase queries before checking the
rendered page — all matched. One test-setup mistake caught and corrected during this,
not a code bug: a due-today booking was first seeded with `return_date` equal to the
date given in this session's narrative context, but the actual server clock had
already rolled past midnight IST into the next day, so `ist_today()` correctly
excluded it — re-seeded with the real current IST date and it appeared exactly as
expected. The rendered page was also confirmed live: the urgent/plain overdue split
renders with the red badge as designed, and clicking an overdue row correctly deep-links
into that booking's `BookingDetail` (which also, incidentally, showed its own correct
"When Returns" panel). All test data cleaned up afterward; real data (`Peacock Bridal
Set` / `NGJ-0001`) confirmed untouched throughout.

**In progress / unverified:** `ItemsPage.tsx`'s camera capture
(`capture="environment"` on the photo input) has only been exercised via a desktop
file picker through browser automation — not on an actual phone. Confirm that works
before the real opening-stock entry session.

Item retirement, end to end — resolves the "Known gap" previously noted here (items
had no way to be retired) and in `PROJECT_PLAN_V2.md` §3. A new migration
(`supabase/migrations/20260806000000_item_retirement.sql`) adds `items.is_active
boolean not null default true`. Backend: `POST /api/items/:id/retire` and
`POST /api/items/:id/reactivate` just flip that flag; `GET /api/items` grew an
`?active_only=true` param rather than becoming a second endpoint — the booking
item-picker (`BookingForm.tsx`) now calls `fetchItems({ activeOnly: true })`, while
the general items management list (`ItemsPage.tsx`) still calls `fetchItems()`
unfiltered, since retired items must stay visible there (just marked) so they can be
found and reactivated. Frontend: `ItemsList.tsx` shows a grey "Retired" badge next to
the name, an All/Active/Retired filter (client-side, over the already-fetched
unfiltered list — no extra round-trip), and a Retire/Reactivate button alongside
Delete (not replacing it) so a user never has to hit Delete's 409 first to discover
retirement is the answer for an item with booking history — though retiring is a
valid state for any item, not gated on booking history at all.

All verified live, not just typechecked, including in the browser (not just via the
API): retired an item with real booking history via the actual UI Retire button —
confirmed it vanished from `BookingForm`'s item dropdown but stayed visible (badged
"Retired") in the items list under All/Retired; its historical booking's detail view
still showed the item's name and `price_charged` correctly, untouched; reactivated it
via the UI Reactivate button and confirmed it reappeared in the booking dropdown;
separately retired a second item with zero booking history and confirmed it behaves
identically (retirement never checks for booking history). All `ZZTEST`-prefixed test
data cleaned up afterward; real data (`Peacock Bridal Set` / `NGJ-0001`, `is_active:
true`) confirmed untouched throughout.

Deployment prep for Render (backend) + Vercel (frontend): confirmed there was no
hardcoded `localhost:4000` in frontend source (only in `.env.example`, which is
correct) — `frontend/src/lib/api.ts` now has an explicit code-level fallback
(`import.meta.env.VITE_API_URL || "http://localhost:4000"`) so it still works locally
with no `.env` file present, while `VITE_API_URL` overrides it in production.
Backend CORS was already reading from `CORS_ORIGIN` (comma-separated) rather than a
hardcoded origin — added `.filter(Boolean)` so an unset/empty value can't produce a
stray `""` origin, and updated both `.env.example` files with production-value
examples (Vercel domain for `CORS_ORIGIN`, Render URL for `VITE_API_URL`). Confirmed
both `npm run build:backend` and `npm run build:frontend` succeed for real (not just
typechecked) and produce exactly what each platform's start command expects —
`backend/dist/index.js` (matches `backend/package.json`'s `start` script) and
`frontend/dist/` (Vite's default output directory).

The app is now live: backend on Render at
`https://nitya-gehini-jewels-backend.onrender.com`, frontend on Vercel at
`https://nitya-gehini-jewels-inventory.vercel.app` (renamed from its initial
auto-generated `nitya-gehini-jewels-frontend.vercel.app`). Checking the first
deployment live (not just trusting the build succeeding) turned up one real bug the
build/typecheck steps couldn't have caught: `BrowserRouter` needs a server-side
fallback to `index.html` for any path that isn't a real static file, and Vercel
doesn't do this by default — every route except the bare root 404'd on direct
navigation or refresh (confirmed live: `curl` returned `404` on `/login` before the
fix). Fixed with `frontend/vercel.json`'s catch-all rewrite. Re-verified live after
the domain rename: `/`, `/login`, and `/items` all now return `200` on both direct
`curl` requests and in-browser navigation, and a real authenticated session
successfully round-trips through the deployed backend (Dashboard correctly showed `1
Active items`, matching the real `Peacock Bridal Set` row) — confirming Render's
`CORS_ORIGIN` is correctly scoped to allow the current Vercel domain.

Design pass, end to end — the app had been entirely unstyled default HTML until now.
Direction was proposed and approved before any code changed (a published design-plan
artifact with palette swatches, a type specimen, and a layout mockup — see git history
for the conversation, not persisted in-repo). Palette: wine (`#7a1e32`, bridal red) as
primary, antique gold decorative-only (`#a9822e` for borders/accents, a separate darker
bronze `#7a5d1f` for anywhere gold carries text or a focus ring — the lighter shade
fails AA contrast as text, checked with the actual WCAG formula, not eyeballed), warm
ivory background (`#fbf8f3`, chosen to match the same backdrop the shop's own item
photos are shot on), plus semantic green/clay for success/attention. Type: Fraunces
(self-hosted woff2 under `frontend/src/assets/fonts/`) for headings only, system-native
font stack for everything else — deliberately not a webfont for UI/data text, for
zero load time and native platform familiarity. Light-only by deliberate choice, no
dark mode — this is a tool used in normal shop lighting, not a themeable product.
Everything lives in `frontend/src/styles/shared.css`, extended rather than styled
per-page: design tokens as CSS custom properties, a `.pill` status vocabulary (good /
active / attention / neutral) shared by both item and booking status via a new
`frontend/src/lib/statusPill.ts` helper, a pure-CSS responsive pattern that turns
`.data-table` rows into stacked cards below 640px using `data-label` attributes on each
`<td>` (added to `ItemsList`/`CustomersList`/`BookingsList`) rather than hiding data
behind horizontal scroll, a fixed bottom tab bar for the four main sections (replacing
the old plain-text nav — see `App.tsx`), and a single global `:focus-visible` rule so
keyboard focus is never accidentally left unstyled on a future component. Copy audited
across every page while restyling (e.g. "Log out" → "Log Out" for casing consistency,
empty states rewritten with specific next-step text instead of "No items to show").

Verified live, not just typechecked: `npm run build:frontend` succeeds and correctly
emits the font as its own cacheable asset rather than inlining it. Browser-verified
every page — Login, Dashboard, Items (list/wizard/edit), Customers, Bookings
(list/create/return/detail) — at a genuine 390px mobile viewport (the browser
automation's own `resize_window` doesn't actually shrink the real viewport in this
environment, confirmed by checking `window.innerWidth` after calling it — so
verification instead used a same-origin iframe sized to real phone dimensions, which
does get its own true viewport) as well as at desktop width, confirming the
table-to-card breakpoint, status pills, empty states, and the bottom tab bar all render
correctly at both sizes. Confirmed keyboard focus is genuinely visible via real Tab
navigation (not just autofocus) — screenshotted the gold-bronze focus ring landing on
the bottom tab bar after three Tab presses. All verification used throwaway
`ZZTEST`-prefixed data, cleaned up after; real data (`Peacock Bridal Set`) confirmed
untouched throughout.

**Not yet done:** this was all verified via browser automation at an emulated 390px
viewport, not an actual phone — real touch-target sizing, iOS/Android font rendering,
and the camera capture flow specifically still need a check on a real device before
this is fully signed off, per the task's own explicit requirement.

Editable item codes, end to end — feedback from the shop's actual daily operator: he
wanted to choose his own `item_code` rather than being locked into `NGJ-000N`. New `GET
/api/items/next-code` returns the suggested next auto-generated code as a read-only
preview (reserves nothing); `AddItemWizard` pre-fills its now-editable Item Code field
with that suggestion on mount and again after "Add Another". `POST /api/items` treats
any non-empty `item_code` in the request (whether left as the suggestion or typed over)
as an explicit choice — validated for uniqueness via the existing UNIQUE constraint, a
409 with a friendly message ("This item code is already in use — choose a different
one.") on collision, no schema change. An empty/omitted `item_code` still falls through
to the original server-generate-and-retry-on-23505 path, unchanged.

While verifying this live, found and fixed a real bug it exposed in that
auto-generate path: `nextItemCode()` used to derive "next" from whichever item was
*most recently created*, which was a safe proxy only as long as every item_code was
guaranteed to be `NGJ-000N`. The moment a custom code can exist, that proxy breaks —
if the most recent item has a non-numeric suffix (e.g. `ZZTEST-DADCODE`), parsing it
as a number silently fell back to 0, re-suggesting an already-taken low code on every
one of its 3 retries, and the whole auto-generate path failed outright ("Could not
generate a unique item code, please retry") for the *next* operator who left the field
untouched. Fixed by deriving "next" from the highest existing `NGJ-%`-pattern code
specifically (filtered query, then take the lexically-highest — safe because every
generated code is zero-padded to the same width), which custom codes now can't perturb
at all. Confirmed live: suggested-value pre-fill, editing to a custom code and saving,
a duplicate-code save attempt showing the friendly error, and the auto-generate
fallback all verified working via the real UI, plus direct API checks before and after
the fix. Test data was `ZZTEST`-prefixed and cleaned up after — real data (`Peacock
Bridal Set`, `NGJ-0001`) confirmed untouched. One thing surfaced during this that's
*not* mine: a real item `Test Set` / `NGJ-0002` appeared in the database, created
around the same time as this verification session but not by me — left untouched and
flagged to the user rather than assumed to be leftover test data.

Item search, in the same session — `ItemsList.tsx` gained a search box (name or code,
case-insensitive substring, client-side over the already-fully-loaded items array —
no new backend query needed, unlike Customers' search which does hit the backend since
that list isn't preloaded in full). Deliberately returns every match rather than
stopping at the first: two items sharing a name (or a near-miss) both surface
together, each still showing its own `item_code` in the row, so the operator can tell
them apart by code rather than guessing. Confirmed live with two throwaway items named
`ZZTEST Kundan Necklace` / `ZZTEST Kundan Necklace (Gold)` — searching "Kundan
Necklace" showed both with `NGJ-0050`/`NGJ-0051` visible; searching a bare code number
narrowed to the one match; a no-match search showed a specific empty state instead of
a blank list. Cleaned up after; real data untouched.

Photo lightbox, also this session — more operator feedback: the items list only ever
showed a small thumbnail, no way to see a photo full-size. `ItemsList`'s thumbnail is
now a button opening a new `PhotoLightbox.tsx`, built on the existing shared `Modal`
(same one `AddCustomerForm`/`CustomerPicker` already use) rather than a new overlay
pattern. Prev/Next (plus arrow-key and Escape support) only render when an item has
more than one photo; a small counter badge sits over the image. Confirmed live on both
desktop and a genuine 390px mobile viewport (same same-origin-iframe technique as the
design-pass verification): tapping a thumbnail opens the photo full-size, Next/Prev
correctly cycles and wraps around, and Close returns cleanly to the list with nothing
left behind. Verified using the real `NGJ` logo photo and a second real photo already
present on `Test Set` (see below) — no new photo upload needed, both already-public
Storage URLs referenced read-only in a throwaway test item's `photos` array, cleaned up
after; the two real item rows themselves were never touched.

**Note for the user:** while working this session, a real item `Test Set` / `NGJ-0002`
appeared in the database mid-session — not created by me, and now has a real photo and
real pricing (₹4000 rental / ₹45555 sale) attached, growing across the session. This
looks like your dad actively using the live app while I was working, quite possibly
testing the exact camera-capture flow flagged as unverified in the design-pass note
above. Worth confirming with him — if so, that flagged gap may already be resolved in
practice.

Photo picker choice, same session — operator feedback: `capture="environment"` on the
photo input forced straight to the camera on a phone with no way to pick an existing
photo instead. `PhotoPicker.tsx` now renders two explicit buttons side by side —
"📷 Take Photo" (keeps `capture="environment"`) and "🖼️ Choose Files" (a second,
separate `<input type="file">` with no `capture` attribute, so the OS's normal
gallery/file picker opens instead) — rather than relying on the sometimes-inconsistent
native chooser dialog browsers show when `capture` is simply omitted. Both share the
same upload handler, so behavior beyond that split is unchanged. Confirmed live: the
`capture` attribute is present only on the Take Photo input (checked directly via the
DOM, not assumed from the JSX); uploading through the Choose Files input still runs
through the existing upload-and-thumbnail flow correctly; the two buttons stay
side-by-side and fully tappable down to a 360px-wide viewport, wrapping their label
text gracefully rather than breaking the layout.

Reports page, end to end — first Phase-2-adjacent feature. A new migration
(`supabase/migrations/20260807000000_customer_type.sql`) adds `customers.customer_type`
(enum `regular`/`influencer`/`mua`, default `regular`) — single value, same modeling
choice as `items.category`, exposed via a three-way toggle in `AddCustomerForm` (no
customer-edit flow exists yet, so that's the only place it needed adding). New `GET
/api/reports?from=&to=&include_collabs=` (`backend/src/routes/reports.ts`) computes all
four sections by fetching filtered bookings and aggregating in JS — not SQL
views/functions, since the date range and collab toggle are both runtime parameters a
fixed view can't take, and this app has no precedent for parameterized Postgres
functions; at this data volume, fetch-then-aggregate in the route (the same pattern
`booking_financials`-adjacent merges already use elsewhere) is simpler and more
debuggable than a first RPC. `from`/`to` default to the current IST calendar month
(new `istMonthRange()` in `dates.ts`, same `new Date(`${istToday()}...`)` local-Date
arithmetic pattern as `istWeekStart()`) when omitted, and the resolved values are
echoed back in the response so the frontend's date inputs display "this month"
without ever computing a date itself. A cancelled booking counts toward nothing
anywhere in Reports (revenue, counts, most-booked, repeat-customers, or "recent
activity" for idle detection) — it never actually happened; this is an interpretation
the task didn't spell out explicitly, applied consistently everywhere for that reason.
`most_booked_items`/`repeat_customers` are the only two sections affected by
`include_collabs` (default off); `summary` and `idle_inventory` always include every
booking regardless. `repeat_customers` is deliberately a second, separate,
unfiltered-by-date query — all-time by design, not scoped to the report's own date
range. `idle_inventory` uses a fixed 90-day-from-today cutoff (new `istDaysAgo()`),
also independent of the date-range picker, and filters to `is_active=true` items only
— a retired item's history still counts fully everywhere else in Reports, it just
can't itself be "idle inventory" worth reactivating.

All verified live against real Supabase queries, not just the API's own response: with
a throwaway dataset (2 regular-customer bookings on one item, 2 influencer-customer
bookings on a second item, one 60-day-old booking on a third item, plus a permanently
unbooked fourth item), the summary's `total_bookings`/`total_revenue` matched a direct
hand-count exactly both with the toggle on and off (proving collabs always count
there); `most_booked_items` correctly excluded the influencer's item by default and
included it once toggled; `repeat_customers` did the same for the influencer customer;
`idle_inventory` correctly listed only the truly-untouched item (plus the two real
zero-booking items) and correctly excluded the 60-day-old item even though its booking
fell outside the report's own date range — confirming idle detection's independence
from the date picker specifically, not just asserted. Also specifically re-confirmed
`repeat_customers`' "not scoped to the date filter" behavior by narrowing the range to
exclude one of a repeat customer's two bookings and checking her count stayed at 2, not
1. All test data cleaned up after; real data (`Peacock Bridal Set`, `Test Set`)
confirmed untouched throughout.

Customer edit, same session — `CustomersPage` had always been add + search/list only,
so there was no way to go back and fix a customer's `customer_type` (e.g. an
influencer/MUA added before that field existed, or just mistagged) once it existed.
New `PATCH /api/customers/:id` mirrors the create route's validation and
phone-dedupe-on-conflict handling exactly; a duplicate-phone 409 here just surfaces as
a plain error message rather than create's "use this customer instead" flow, since
that affordance is specific to booking-time quick-add and doesn't fit editing an
already-known record. New `CustomerEditForm.tsx` (modeled directly on
`ItemEditForm.tsx`), an Edit button and a Type column added to `CustomersList`, and
`CustomersPage` now holds `editingCustomer` state the same way `ItemsPage` holds
`editingItem` — short-circuits the tab view, and the tab's active-highlight logic
matches item editing's pattern too. Confirmed live: editing a throwaway customer's
type from Regular to Influencer persisted correctly (checked directly against
Supabase, not just the re-rendered list), and editing a second customer's phone to
collide with the first's showed the friendly "already exists" error rather than a raw
constraint failure. Test data cleaned up after; real data untouched.

Customer delete, end to end, same session — the customer screen had edit but no
delete. `DELETE /api/customers/:id` mirrors `items.ts`'s exact pattern: a `23503`
foreign-key violation (customer has booking history) surfaces as "This customer has
booking history and can't be deleted" instead of a raw constraint error, same
confirm-inline-in-the-row UX (`btn-danger`, "Delete this customer? / Yes, Delete /
Cancel") as `ItemsList`. Confirmed live: created a throwaway customer, deleted it
through the actual UI, confirmed directly against Supabase that it's gone and that
the two real customers already in the database (`Aryan Batheja` ×2, added by the
user testing the app directly — not by me) were untouched throughout.

`item_code` editable on existing items, new session — `ItemEditForm` previously showed
every field except the code itself. Extended the same philosophy already used for the
create-time override (`POST /api/items`'s optional explicit `item_code`) to edit:
`PATCH /api/items/:id` now catches `23505` on the update and returns the same friendly
"This item code is already in use — choose a different one." 409 instead of a raw
constraint error. Unlike create, edit has no auto-generate fallback — an existing item
must always have some code — so `ItemEditForm.handleSave` adds a client-side "Item code
is required" guard before ever calling the API, rather than silently falling back to
anything. Confirmed live against real Supabase rows with two throwaway items: editing
one's code to a new unused value saved correctly; editing it to the other throwaway
item's existing code showed the friendly error with no crash and left the original
(already-saved) code unchanged; both real items (`NGJ-0001` Peacock Bridal Set,
`NGJ-0003` Polki Bridal #1930) confirmed untouched throughout. Test items cleaned up
after.

Payment recording, first Phase-2 feature — no new "advance" concept: an advance is
just a real row in `payments`, recorded through the same table and the same
`booking_financials` view Phase 1 already scaffolded. `POST /api/bookings` gained
optional `advance_amount`/`advance_method`; after the booking itself saves, if the
amount is > 0 a payment row is inserted directly (not by calling the payments route
internally — same direct-`supabase` pattern already used for the sale-flips-status
side effect just above it in the same handler), dated `istToday()`, with
`advance_method` required whenever the amount is > 0 (validated up front, before the
booking is even created). If that payment insert itself fails, the booking is not
rolled back — it already exists — so a non-blocking `warning` is appended instead,
telling the operator to add it manually from the booking's detail page, same
non-blocking-warning shape as the same-day-turnover and incomplete-return-checklist
cases elsewhere in this file. `POST /api/payments` (previously an unvalidated
pass-through) now checks `booking_id`/`amount`/`method` are present and `amount > 0`,
and defaults `payment_date` to `istToday()` when omitted — the same
left-blank-on-purpose pattern as `ReturnForm`'s `actual_return_date`, applied here to
`BookingDetail`'s new "Record Payment" form. `GET /api/bookings/:id` was extended to
merge in `total_paid`/`balance_due` from `booking_financials` (it previously only
returned the booking + item/customer + booking_sequence chain) — same
two-queries-plus-merge pattern used everywhere else for this view, since it has no
real FK to embed through. Frontend: `BookingForm` gained an Advance Received amount
field that reveals a Payment Method select (reusing the same `PAYMENT_METHODS` enum
now centralized in a new `frontend/src/lib/payments.ts`) only once an amount is
entered, and the success panel confirms the amount/method recorded. `BookingDetail`
(previously a minimal read-only summary, flagged as the future fuller version back
when it was first built) now shows Total Paid/Balance Due alongside Price Charged, a
Payments history list, and a "Record Payment" action (amount, method, date, notes)
that reloads both the booking and the payments list on save.

All verified live against real Supabase rows, not just the API response: created a
throwaway rental booking through the actual UI with a ₹1500 UPI advance — confirmed a
real `payments` row existed (`amount: 1500, method: "UPI"`) and `booking_financials`
showed `total_paid: 1500, balance_due: 3500` both via direct query and on the
Booking Detail page. Recorded a second, final ₹3500 Card payment through the
"Record Payment" action on that same booking — `balance_due` correctly dropped to
`0`, `total_paid` rose to `5000`, and both payments (UPI and Card, correct amounts
and dates) appeared in the Payments history, confirmed both in the rendered page and
via a direct Supabase query. Test booking (and its cascaded payment rows), item, and
customer all cleaned up after; real data (`Peacock Bridal Set` / `NGJ-0001`,
`Polki Bridal #1930` / `NGJ-0003`, both real customers, and real booking `RNT-0001`)
confirmed untouched throughout.

**Note for the user — the `NGJ-0003` item-status question:** not a bug. `items.status`
for a `unique` item only ever means "available" or "sold" — it is deliberately never
flipped to `rented_out` when a rental is created (see the long comment above
`POST /api/bookings` in `backend/src/routes/bookings.ts`). The reason: a unique item
can legitimately have several future, non-overlapping rentals booked against it, and
the *only* thing `POST /api/bookings` checks before allowing a new rental is
`item.status === 'available'` — if creating a booking flipped that to `rented_out`,
every subsequent booking attempt on that item would be wrongly blocked even when the
new dates don't overlap at all. Whether the item is *currently* out is tracked
per-booking (`bookings.status`), not per-item, and is always computed at query time
from the real, live bookings — never denormalized onto `items.status`, per this
project's "never write to computed fields" rule elsewhere in this file. **Do not
manually flip `NGJ-0003`'s status to `rented_out`/`in_maintenance`/etc. to "correct"
this** — it isn't stored anywhere derived from bookings, nothing will ever flip it
back automatically, and while it's stuck on a non-`available` value it will silently
block every future rental attempt on that item with a confusing 409. If the
available/booked mismatch on the Items list is confusing day to day, the real fix
would be a computed "currently out" indicator on that page (sourced from active
bookings, the same way `overdue_rentals` is computed) — not implemented, not asked
for yet, flagged here as a possible future small addition if wanted.

`customers.phone_secondary`, new session — a plain optional alternate contact number
(new migration `supabase/migrations/20260810000000_customer_phone_secondary.sql`,
nullable, no unique constraint). Deliberately scoped down per explicit instruction:
it's a contact field only, not a second identifier — `phone` alone still drives
duplicate detection (the unique constraint and the `23505` handling in
`customers.ts`), and `phone_secondary` is never checked or touched by that path.
Backend: `POST`/`PATCH /api/customers` normalize it the same way as the primary phone
(digits-only, last-10, via the same `normalizePhone()`) when present, but unlike the
primary phone an empty or unparseable value is never a 400 — it just becomes `null`,
since this field can't block a save the way a missing primary phone can. `GET
/api/customers?search=` gained a third parallel query (`ilike` against
`phone_secondary`, same digits-substring approach as the existing phone search),
merged into the same result set alongside the name/phone matches. Frontend:
`AddCustomerForm` and `CustomerEditForm` both gained an "Alternate Phone" field,
placed directly under the primary Phone field.

Verified live against real Supabase rows, not just typechecked: added a throwaway
customer through the actual UI with a deliberately messy alternate phone
(`+91-90022 44556`) — confirmed it normalized to `9002244556` in the database, same
as the primary phone's own normalization. Searched by a fragment that only appears in
the alternate number (`44556`, absent from the primary phone entirely) and confirmed
the customer surfaced. Edited the same customer's alternate phone via
`CustomerEditForm` (pre-filled correctly with the normalized value) to `9007778899`
and confirmed the change persisted. Then, to specifically confirm the "not a second
identifier" requirement: created a second throwaway customer whose **primary** phone
was set to that exact same `9007778899` — it saved cleanly with no duplicate-detection
409 and no "already exists" panel, confirmed both in the UI and directly against
Supabase (both rows coexisting with the same digits, one as `phone`, one as
`phone_secondary`). Both throwaway customers cleaned up after; the three real
customers confirmed untouched throughout.

`bookings.custom_addons`, same session — free-text extra items an operator adds at
booking time (new migration `supabase/migrations/20260810120000_booking_custom_addons.sql`,
`jsonb not null default '[]'`), kept deliberately separate from and never writing to
`items.components` — that stays the item's own reusable template regardless of what
gets added to any individual booking. Backend: `POST /api/bookings` accepts an
optional `custom_addons` array, trims/dedupes it, and stores it on the booking.
`POST /api/bookings/:id/return` now builds `return_checklist` from **two** combined
sources — `items.components` (only when `item_type = 'set'`) and the booking's own
`custom_addons` (regardless of item type) — concatenated into one flat list before
the existing checked/unchecked-with-no-notes warning logic runs unchanged over it.
This is a real behavior change from before: a `single`-type item, which previously
never got a return checklist at all, now gets one whenever its booking has
`custom_addons`, exactly like `ReturnForm`'s heading was accordingly renamed from
"Components Checklist" to "Return Checklist" to reflect the combined source. Frontend:
`BookingForm` gained an "Additional Items" chip-list input (same
add/remove-chip pattern already used for `ItemEditForm`'s components list) sitting
right under the item picker, empty by default; `ReturnForm` computes
`componentNames`/`addonNames`/`checklistNames` and renders/toggles/submits over the
combined list instead of components alone.

Verified live against real Supabase rows: created a throwaway Set-type item (2 real
components) and a throwaway Single-type item (no components at all), booked each
through the actual UI — the Set-item booking with 2 custom add-ons added via the
Additional Items input, the Single-item booking with 1. Confirmed both bookings'
`custom_addons` persisted correctly via direct query. Processed the Set-item
booking's return: the checklist showed all 4 entries together (`Necklace`,
`Earrings`, plus the 2 add-ons) exactly as required; checked all 4 and confirmed
`return_checklist` saved with all 4 keys `true`, no warning shown, and — the key
check — `items.components` on that item queried immediately after and still showed
exactly its original 2 real entries, completely untouched. Processed the Single-item
booking's return: confirmed a checklist appeared at all (normally it wouldn't for a
`single` item) containing just the one add-on; left it unchecked with no notes to
also confirm the existing warning path still fires correctly on this newly-enabled
case, and confirmed via direct query that this item's `components` stayed exactly
`null` throughout, never touched. All throwaway bookings/items/customer cleaned up
after; real items (`NGJ-0001`, `NGJ-0003`, both with their real multi-entry
`components` lists) and the real booking `RNT-0001` (`custom_addons: []` via the
column default) confirmed untouched throughout.

Multi-item bookings restructuring ("Stage 2 cutover"), executed 2026-08-11 — full
detail in `PROJECT_PLAN_V2.md` §8/§8.1, summarized here since it's a major schema
change. `bookings` split into a parent/child model: `bookings` is now the
per-transaction record (customer, GST fields, codes) and a new `booking_items` table
holds one row per physical item within that transaction (`item_id`, `type`,
`pickup_date`/`return_date`, `status`, `price_charged` snapshot, deposit fields,
`return_checklist`, `custom_addons`) — everything that used to live directly on
`bookings` per the old one-row-per-item model. `payments.booking_id` still points at
the parent `bookings` row (one running balance per family transaction, not per item);
`booking_financials` is now an aggregate over `booking_items` grouped by
`booking_id`. A booking-level status is computed from its `booking_items`' statuses,
never stored. Run as one uninterrupted sequence against production; two real bugs
were caught and fixed during the cutover itself (stale `_v2` view references in 4
backend + 2 frontend files; Vercel Production was missing `VITE_API_URL` entirely,
serving a `localhost:4000`-baked build for ~5 hours before caught). Old single-item
columns/views and the `booking_status` enum were dropped from production as part of
this — there is no fallback to the pre-cutover shape.

Refund infrastructure, 2026-08-12 (`PROJECT_PLAN_V2.md` §8.2) — lost-and-found item
charges and cancel-with-refund, both explicitly reversing the earlier decision that
no plain Cancel Booking action would exist until this infrastructure existed. New
`payments.type` (`payment`/`refund`) and a new `item_charges` table; every money
movement (a lost-item charge, a refund on item removal or cancel, resolving a charge)
is expressed purely through the sign of a `payments` row — `booking_financials`'s
`balance_due` formula itself never changed. Return flow (`ReturnForm.tsx`) offers an
inline "Charge for this" on each unchecked checklist item; new `ChargesPage.tsx`
("Charges" tab) is the one cross-booking view of every unresolved charge, with an
inline Resolve action. Removing an item or cancelling a whole booking no longer
hard-blocks when it would leave the customer overpaid — it returns the exact refund
amount needed, then completes on a second call with that amount confirmed. All
verified live against real production with throwaway `ZZTEST` fixtures and a
throwaway admin account, cleaned up after; real data untouched throughout.

Dashboard alerts, 2026-08-12 — dismissible Payment Due / Item Due popups shown on
Dashboard load, summarizing data the page already computes (outstanding balance;
today's returns due + overdue rentals, including `next_customer_waiting`). Shown at
most once per IST day per user via localStorage keyed off the backend's own
echoed-back date, never a frontend-computed one; silent when nothing's due.

AI Assistant chat page, 2026-08-12 (Phase 3 frontend) — the backend chat-completion
endpoint and its grounded tools (`backend/src/routes/chat.ts`, `backend/src/tools/`)
already existed from earlier scaffolding; this wires up the frontend that was never
built: a new `/assistant` route (tab labeled "Ask" — "Assistant" clipped on a real
390px viewport once a 7th tab was added), session-only message history, and 4
tappable starter questions for a non-technical first-time user. Two small live-found
fixes same day: the model's replies use markdown `**bold**` for emphasis, which
rendered as literal asterisks until a minimal (not full-parser) fix; and the tab
label itself, per above.

Expenses frontend, new session (2026-08-13) — the backend (`GET`/`POST
/api/expenses`) existed but had no frontend at all. Backend gained real validation to
match `payments.ts`'s pattern (`category`/`amount` required, `amount > 0`, `category`
checked against the enum) and a resolved-range-echoed-back date filter identical to
Reports' (`istMonthRange()` default, `{ period, expenses }` response shape — a
breaking change from the old bare-array response, safe since nothing else in the
backend called this route). New `frontend/src/lib/expenses.ts` +
`ExpensesPage.tsx` (date-range picker, period total, inline add-expense form, list
table) and an "Expenses" tab added to `App.tsx`'s nav — the 8th bottom tab.

That 8th tab reproduced the exact mobile-clipping bug from the "Ask" tab session,
worse: `.app-tab`'s `flex: 1` had no `min-width: 0`, so flex items never shrink below
their content's intrinsic width — fine at 7 tabs if the widest labels' total still
fit, but the real fix needed here since one more tab always risks this again
regardless of which label is added. Fixed properly this time instead of just
shortening the new label: `.app-tab` now has `min-width: 0`, a smaller `font-size`
(12.5px → 11px), tighter padding, and `white-space: nowrap` +
`text-overflow: ellipsis` as a backstop for any future addition. Confirmed live at a
genuine 390px viewport (same-origin-iframe technique) — before the fix, measured via
`getBoundingClientRect` that the tab bar needed 444px against a 386px container
(`Charges`/`Ask` visibly clipped); after, `scrollWidth === clientWidth` (386px) with
all 8 labels rendering in full, no ellipsis triggered at this width.

Verified live against real Supabase rows, not just typechecked: added a throwaway
`ZZTEST`-prefixed expense (Utilities, ₹1500, date left blank) through the actual UI —
confirmed it defaulted to `istToday()` (`2026-08-13`) in the database, not just the
UI, and that `recorded_by` was populated with the real logged-in user's id. Narrowing
the "From" date past the expense's date correctly emptied the list (confirming the
date-range filter isn't just decorative). Submitting the add-expense form with no
amount showed the "Enter an amount greater than 0" client-side error and made no
request. Test row deleted directly via Supabase after; no real data existed in
`expenses` to disturb.

P&L and Outstanding Dues, new session (2026-08-13) — both landed on the existing
Reports page as two new sections rather than a separate page, reusing its
date-range-picker pattern instead of reinventing it. Backend: `GET /api/reports`
gained `pnl` (`revenue` reuses `summary.total_revenue` — same `periodItems`, same
cancelled-excluded rule, no second query needed; `expenses` sums the `expenses` table
over the same `[from, to]` range by `date`; `net`; `by_category` breakdown) and
`outstanding_dues` (every booking with `booking_financials.balance_due > 0`, sorted
descending, joined to `booking_code`/customer name via the usual
batch-fetch-and-merge pattern since `booking_financials` is a view with no real FK).
`outstanding_dues`, like `repeat_customers`, is deliberately a current-state snapshot
— **not** scoped to the report's own date range, since a booking made last month that
still owes money is exactly what this section exists to surface. Frontend: two new
`dashboard-section`s on `ReportsPage.tsx` — P&L (stat tiles + category table, hidden
when empty rather than rendering an empty table) and Outstanding Dues (table linking
each row to `BookingDetail` via the existing `?booking=<id>` pattern).

Verified live against real Supabase data, not just typechecked: hand-computed
revenue/expenses/outstanding-dues directly via Supabase queries for the current IST
month before ever loading the page, then confirmed the rendered Reports page matched
exactly — ₹14 revenue (3 real `booking_items` rows), ₹0 expenses, ₹14 net, and three
real outstanding bookings (`RNT-0001`/Kritika Bhatia/₹3500, `Page 123`/Test customer
1/₹12, `124`/Aryan Batheja/₹2) in the correct descending order. Clicked through
`RNT-0001`'s Outstanding Dues link and confirmed `BookingDetail` shows the same
₹3500 balance due. No test data was created or needed for this task — the real data
already present was enough to exercise every code path (a non-zero revenue booking, a
zero-expense month, and multiple outstanding balances).

**GST invoices — descoped for now, not a blocker.** Per explicit direction
(2026-08-13): invoice generation, when it's built, will be a **plain invoice with no
GST section** — the CA's HSN code/GST rate confirmation (`PROJECT_PLAN_V2.md` §6)
only matters if/when a GST section gets added later, and isn't something to wait on
or build toward right now. `bookings.hsn_code`/`tax_rate` stay nullable/unused in the
meantime; don't treat this as a blocked task on the roadmap — it simply isn't in
scope yet.

Invoice/receipt generation with QR code, new session (2026-08-13) — closes out Phase
2's last item. Plain document, deliberately no GST section anywhere (not a
placeholder — see the GST descoping note above).

**`shop_settings`** (`supabase/migrations/20260813120000_shop_settings.sql`) — a true
singleton table (`id boolean primary key default true`, `check (id = true)`, one row
pre-seeded by the migration) holding `name`/`address`/`phone` for the receipt header.
`GET /api/shop-settings` is open to any authenticated user (a receipt can be printed
by either role); `PATCH` is admin-only via `requireRole("admin")` — the **first real
use** of the role scaffolding that existed since Phase 1 but was never actually
wired to gate anything until now. New `SettingsPage.tsx` (admin-only; a non-admin
gets a plain "Admins only" message, both client-side and enforced again server-side)
shows a "fill this in before real use" prompt whenever address/phone are empty — not
triggered in practice here since real shop details were provided directly during
this session rather than left as the empty defaults.

**Receipt** (`ReceiptPage.tsx`, new route `/receipt/:bookingId`, opened via a new
"Print/Download Receipt" link on `BookingDetail` with `target="_blank"`) — shop
details, customer name/phone, `booking_code` + creation date, every `booking_item`
listed individually (not just the first), total/paid/balance from the same
`fetchBooking()` call `BookingDetail` already uses (no new backend endpoint needed
for the money figures). "Download" is just the browser's own print dialog's
Save-as-PDF destination — first icon-library-style dependency added for this:
`qrcode` (client-side `QRCode.toDataURL()`), generating a QR that encodes
`${window.location.origin}/bookings?booking=<id>` — the exact same deep-link URL
`BookingDetail` itself already lives at, not a new route. A new `@media print` block
in `shared.css` hides `.app-header`/`.app-tabbar`/`.mobile-tabbar`/`.no-print` so the
printed/saved output is just the receipt, no app chrome.

**Real bug found and fixed along the way, not assumed away:** the task's own request
to "verify rather than assume" the login-redirect-back behavior paid off —
`LoginPage.tsx`'s submit handler had always hardcoded `navigate("/")` on success,
completely ignoring `location.state.from` that `ProtectedRoute` sets. The "already
signed in" early-return branch *did* read `state.from` correctly, but only helps a
visitor who lands on `/login` while already authenticated; the real login-submission
path never went through it, since navigating away unmounts `LoginPage` before that
reactive branch ever gets a chance to run. Confirmed live before fixing: a genuinely
logged-out visit to a booking deep link correctly bounced to `/login` with the right
`state.from`, but logging in landed on Dashboard, not the booking. Fixed by having
the submit handler navigate to `from` directly. A second, related gap surfaced
*during* that same verification: the first fix used `from.pathname` only, dropping
`from.search` — which silently breaks exactly the QR-scan case this feature exists
for, since the booking id lives in `?booking=<id>`, not the path. Fixed by
recombining `pathname + search` (factored into a shared `resolveFrom()` helper used
by both the early-return branch and the submit handler, so this can't drift apart
between the two again).

**Verification note — a genuine capability gap, not something skipped:** applying
`20260813120000_shop_settings.sql` to production required the user to run it via the
Supabase SQL editor directly — no Supabase CLI project link and no direct Postgres
connection string exist in this environment (`backend/.env` only has the REST URL +
service-role key, which can't execute DDL). Once applied, everything else was
verified live end-to-end, including creating (and afterward fully deleting) a
throwaway `ZZTEST` admin account and a throwaway `ZZTEST` operator account — same
established pattern as the refund-infrastructure session — to test both roles
without touching the real accounts: a real multi-item booking already in production
("Page 123" / Test customer 1, 2 items) rendered its receipt with every field
byte-matched against direct Supabase queries beforehand (₹12 total / ₹0 paid / ₹12
balance, both items listed individually); the QR image was decoded (not just
assumed correct) via `jsQR` against the actual rendered PNG pixels and confirmed to
equal the exact expected deep-link URL; the print stylesheet's chrome-hiding rule
was confirmed present in the loaded stylesheet; the admin-only settings gate was
confirmed both ways — a real 403 from the backend on a direct API call as the
operator account (not just a hidden button), and a successful GET/PATCH as admin,
including a live save-and-revert round-trip cross-checked against Supabase directly
each time. The login-redirect fix was verified fully logged-out through a real
sign-in with the throwaway accounts, landing on the exact booking both times (once
per role). **Not verified by Claude, and not possible to verify this way:**
physically scanning the QR code with a real phone camera — that specific check
needs to happen against the *deployed* production URL (a localhost QR isn't
reachable from a phone) and needs an actual physical device, which isn't something
Claude has access to. Everything mechanically checkable about the QR (its exact
decoded payload, the URL it points to, that URL's own correctness both logged-in and
logged-out) was verified as above; the physical scan itself is on the user to do
once this is live.

**Next step — Phase 2 (bookkeeping):** now fully complete — Payments, Expenses, P&L,
Outstanding Dues, and invoice/receipt generation are all done.

BookingForm entry-point restructure, new session (2026-08-13) — the per-item
Rental/Sale toggle shown on every line was the actual source of clutter the earlier
mobile-nav overflow fixes were adjacent to but didn't touch. Replaced with an
entry-point choice: `BookingForm` now opens with nothing but two large "Rental"/
"Sale" buttons (`.type-gate`/`.type-gate-btn`, deliberately styled larger than the
`.toggle-group` pattern `AddCustomerForm`'s customer-type picker already uses, since
this is the form's first and most important decision, not an incidental option) —
`bookingCode`, the customer picker, and every line item stay hidden until one is
picked. The choice sets `bookingType` state, which (a) drives the heading ("New
Rental Booking" / "New Sale"), (b) is what every new line item defaults to via
`emptyLineItem(type)`/`addLineItem(type)`, and (c) stays clickable afterward as a
tab-like pair — switching it only changes the heading and the default for *future*
lines, deliberately never touching a line already on the form, so toggling back and
forth can't silently change data on existing rows.

Mixing is still fully supported, just de-emphasized per explicit instruction: a
small, low-key "+ Add a [Sale/Rental] item instead" text link (`.add-other-type-link`
— underlined text, not a bordered button, so it doesn't visually compete with
"+ Add Another Item") adds a line item of the *opposite* type. Any line whose own
`type` doesn't match the booking's current `bookingType` gets a small `.pill`
badge next to its "Item N" heading (`.line-item-type-badge`) — the only place type
is still shown per-line, and only when it's genuinely not implied by context. The
old per-line `.toggle-group` and its `handleTypeChange` handler are gone entirely,
not just conditionally hidden — there's no way to retype an existing line short of
removing it and re-adding through whichever button gives the type you want.
Deliberately unchanged: `booking_code` generation (still the neutral `BK-000N`
prefix regardless of `bookingType` — this is a UX default, not a new booking
category) and every existing per-type field/validation rule (`return_date` required
for rental, deposit fields rental-only, etc.) — those already lived on each line's
own `type`, which this task never touches, only what's *defaulted* and *shown*.

Verified live with throwaway `ZZTEST` items/customer (created and fully deleted
after, including a second throwaway admin account after the first one's session
token had gone stale mid-session — an unrelated pre-existing quirk, not something
this task introduced or fixed, worth knowing about if it recurs): choosing Rental
and adding 3 items showed zero `.toggle-group` elements and zero badges, all 3
showing Return Date; same inverted for Sale (zero toggles/badges, zero Return Date
fields, all showing Sale Date instead, no Security Deposit field). Used
"+ Add a Sale item instead" once inside a Rental booking — confirmed live in the DOM
that exactly one badge appeared, reading "Sale", on exactly that line; its price
field correctly auto-filled from the item's `sale_price` while the Rental line's
used `rental_price`. Submitted that real mixed booking — saved as one transaction,
`booking_code` came back `BK-0001` (not `RNT-`/`SALE-`), and a direct Supabase query
confirmed the two `booking_items` rows landed with `type: "rental"` and
`type: "sale"` respectively, correct `return_date` (set / `null`) on each. Then
attempted a second booking on the same rental item with genuinely overlapping dates
(21–23 Aug against the existing 20–22 Aug) — correctly blocked with the exact
existing conflict shown, unchanged conflict-detection behavior confirmed live rather
than just assumed from the fact that no backend code was touched by this task.

Mobile nav restructure, new session (2026-08-13, revised twice more the same
session after live feedback on each iteration) — repeated tab-bar overflow (clipped
at 7 tabs, then again at 8) came from cramming every destination into one flat row
regardless of viewport. Fixed structurally instead of shrinking labels again:
**desktop** keeps the exact original `.app-tabbar` (all 8 items, text labels, one
row) completely untouched, just gated to show only above 640px now. **Mobile**
(≤640px) gets a different shape entirely. Landed shape, after three rounds total:

- Primary bottom bar: a single row of exactly 5 items, evenly spaced
  (`justify-content: space-evenly`, ~16.5px gaps at 390px) — Dashboard, Bookings,
  **Ask**, Items, Customers. Each of the 4 plain destinations is icon + small
  visible label (not icon-only as first built — reversed after feedback that a less
  technical user is more likely to recognize a word than commit an icon's meaning to
  memory).
- **Ask sits inline as the row's middle item**, same baseline as the other 4 — not a
  raised/elevated FAB as first built (that version is gone: no more
  `position: fixed` circle floating above the bar). Stays visually distinct purely
  through a wine-colored circular badge behind the `Sparkles` icon plus its own "Ask"
  label, darkening to `--wine-strong` when active, matching the `.active` treatment
  the other 4 already had.
- "More" (Reports/Expenses/Charges): lives in the **header**, not the bottom bar at
  all (hamburger icon next to Log Out) — moved there in the previous revision
  specifically so the bottom bar could be a clean split rather than an odd count
  padded to compensate; with Ask now inline as a 5th item, the row is evenly spaced
  across all 5 rather than grouped 2-2. Still opens the same sheet, built on the
  existing `Modal` component, with visible labels since the sheet itself isn't
  space-constrained.

Both nav shapes exist as separate markup in `App.tsx` at all times — CSS `display`
swaps which one renders at the breakpoint, same "two full implementations, swapped
by media query" approach already used for `.data-table`'s card breakpoint, rather
than reshaping one structure into the other. First icon library added to this
project: `lucide-react` (tree-shakeable, confirmed by build output — only ~2KB
gzipped added despite the library having 1000+ icons). Icon choices: Home/Calendar/
Gem/Users for the 4 plain bar items, Sparkles for Ask's badge, Menu for the header's
"more" button, BarChart3/Wallet/AlertCircle for the sheet's Reports/Expenses/Charges
rows.

**Deviation from the original request, flagged rather than silently applied:** the
task specified the "more" sheet should list only Reports and Expenses — Charges
wasn't mentioned. Dropping it would have made a real, currently-used feature
(lost-and-found charge tracking) unreachable on mobile entirely, which seemed more
likely to be an oversight than an intentional cut, so it was added to the sheet as a
third item rather than left out. Easy to remove if that reasoning was wrong.

Verified live at a genuine 390px viewport (same-origin-iframe technique), re-run
after each of the three revisions: confirmed via `getBoundingClientRect` (not just
eyeballing) that all 5 bar items sit on the same baseline with even ~16.5px gaps
between every pair and the whole row fits inside the 386px container with no
clipping; every item's tap target is 48–61px tall and 54–58px wide, comfortably
above the project's own 46px `--tap` minimum; the Ask badge is a distinct 34px wine
circle that darkens on active; tapping each of the 5 items navigates and updates
`.active` correctly, including Ask reaching `/assistant`; the header hamburger opens
the same 3-item sheet and closes via item-click/backdrop-click/Escape (an Escape
handler was added alongside `Modal`'s existing backdrop-click-to-close, same pattern
`PhotoLightbox` used to extend `Modal` before). Scrolled the longest real page
(Reports) to its true scroll-max and confirmed the last content section ends 63.6px
clear of the bar — never obscured. Separately reconfirmed desktop (871px width)
renders `.app-tabbar` exactly as before (all 8 labeled tabs, one row, no header
hamburger) with every mobile-only element (`display: none`) absent.

**Not yet done:** verified only at the emulated 390px viewport, not an actual phone —
real touch-target sizing and iOS/Android rendering still need a check on a real
device, same caveat as the original design pass.

Assistant page: instant-send starters + per-reply follow-up chips, new session
(2026-08-13) — two changes. Starter questions (shown on an empty chat) now send on a
single tap instead of just filling the input for a manual Send. After every reply, a
new `POST /api/chat/suggestions` (`backend/src/routes/chat.ts`) fires a second, small
Haiku call — no tool access, `tool_choice` forced to a one-off `suggest_questions`
tool so the response is reliably structured (`{ questions: string[] }`) rather than
prose that needs parsing — asking for 2-3 short follow-ups grounded in the
conversation so far, sent as the same `{ messages }` array (including the reply just
shown) already sent to the main endpoint. Rendered as tappable chips
(`.chat-suggestion-chip`) below the latest reply; tapping one sends immediately, same
as a starter question. Starter taps, suggestion taps, and the input form all now
funnel through one `sendMessage()` — no separate populate-then-send path exists
anymore. A `suggestionsRequestRef` counter guards against a slow suggestions call
from an earlier turn resolving after a newer turn has already started and clobbering
its chips; a failed suggestions call is swallowed silently (no user-facing error) so
this non-critical addition can never disrupt the core chat flow. Free-form typing is
completely untouched — same input, same Send button, same submit handler.

Verified live against the deployed site, not locally: `backend/.env` has no real
`ANTHROPIC_API_KEY` (only Render's production env var does — a local-only gap, not a
bug), so this had to ship and be tested live rather than in dev, using a throwaway
admin account created and fully deleted after. Confirmed: tapping "Where is the
Peacock Bridal Set?" sent immediately with no extra click and returned a real,
grounded reply (location, rental/sale price); the chips that followed were
genuinely specific to that item ("What items are included…", "Is it available for
a specific date range…"), not the 4 fixed starters repeating. Tapped one of those
chips — sent immediately, got a real reply, and a *new*, differently-worded set of
item-specific chips appeared. Typed a free-form question ("How many customers do we
have?") and sent via the Send button — worked exactly as before (populates the
input, does not auto-send, requires the click), returned a real reply, and produced
its own topically-relevant chips (customer/rental-history follow-ups, not item
ones) — confirming the suggestions endpoint responds to *whatever* was just
discussed, not a hardcoded topic.

8 new AI assistant tools, new session (2026-08-13) — all read-only, all reusing
already-tested query logic rather than reimplementing it. Required a real refactor
first: the query logic already backing Reports (`GET /api/reports`), Dashboard
(`GET /api/dashboard/summary`), Item Charges, and Booking Detail was extracted into
shared functions — new `backend/src/lib/reportsData.ts`
(`getPeriodBookingItems`/`summarizeBookingItems`/`rankMostBookedItems`/
`getIdleInventory`/`getExpensesForPeriod`/`getFinancialSummary`/`getOutstandingDues`),
new `backend/src/lib/dashboardData.ts` (`getDailyBriefingData`), plus newly-exported
`getItemCharges()` (`routes/itemCharges.ts`), `getBookingDetail()`
(`routes/bookings.ts`), and `getPaymentsForBooking()` (`routes/payments.ts`). The
original routes were rewritten to call these same functions instead of inline logic
— identical behavior, not a rewrite of what they compute, verified by running every
extracted function directly and diffing against previously-verified real figures
(all matched byte-for-byte: ₹14 revenue, ₹3514 outstanding across the same 3
bookings, same idle items, same most-booked ranking). The new tools
(`backend/src/tools/index.ts`) then call these exact functions: `get_financial_summary`,
`get_outstanding_dues`, `get_outstanding_charges`, `get_popular_items`,
`get_idle_inventory`, `get_daily_briefing`, `get_booking_by_code` (resolves
`booking_code` → id, then calls `getBookingDetail` + `getPaymentsForBooking`
together — payment history was never part of `GET /api/bookings/:id`'s own
response, so this tool is the first caller to combine both). The chat system prompt
(`backend/src/routes/chat.ts`) gained a per-tool routing guide so the model reaches
for the right one.

**`get_customer_summary` — confirmed missing, built here.** The task asked to
confirm this was built in "the previous task"; it wasn't — that session's own
CLAUDE.md entry (just above) documents the model honestly saying "I don't have a
tool for that" when asked "How many customers do we have?", and grep confirmed no
such tool existed in `tools/index.ts`. Added now: total count, breakdown by
`customer_type`, full list.

Verified live through the real chat page (not by calling tool functions directly),
each cross-checked against a fresh direct Supabase query first: "How much did we
make this month?" → ₹14 revenue / ₹1.1 expenses / ₹12.9 net, exact match.
"Who owes us money?" → the same 3 bookings/amounts as `get_outstanding_dues`, same
order. "Any items customers still owe us money for?" — tested against a genuine
non-empty case (a throwaway `ZZTEST` lost-item charge created for this, ₹750 missing
earring), correctly surfaced with every field right, then cleaned up. "What's our
most popular set?" → test set 2 (2 bookings) then test set 1 (1 booking), exact
match. "What hasn't been booked in a while?" → Peacock Bridal Set + "L", exact
match. "Catch me up on today" → no returns due, no overdue, 3 customers owing
₹3,514 total, exact match to `get_daily_briefing`. "What's the status of RNT-0001?"
(no `BK-0001` currently exists — a real code was used instead, per the task's own
"real or throwaway" allowance) → every field matched a direct `getBookingDetail` +
`getPaymentsForBooking` call exactly, including the full 9-piece component list.

**A real finding, not glossed over:** testing `get_customer_summary` with "How many
customers do we have?" in a long-running conversation (8+ exchanges deep) returned a
hallucinated answer — "5 customers" including a fabricated "NGJ-0007" and a
same-session `ZZTEST` customer that had *already been deleted* before that question
was even asked. Direct verification proved the tool itself returned correct data
(`total_count: 4`, real names only) — the model's answer just didn't accurately
relay it. Re-asked the identical question in a **fresh** conversation and got a
fully correct, well-reasoned answer (4 customers, correct names/phones, even a
correct aside about the two same-named "Aryan Batheja" entries). Most likely cause:
the deleted `ZZTEST` customer's name had appeared earlier in that same long
conversation (from an earlier `get_outstanding_charges` answer), and the model
blended that stale conversation context into this tool's fresh result rather than
reporting the tool's actual output. This is a real characteristic of a long
conversation with a small/fast model, not a bug in the tool or its query — but
flagged here rather than left undiscovered, since it's exactly the "grounded, not
just plausible-sounding" failure mode this task's own verification step existed to
catch. No code changes made in response; worth knowing about, not necessarily worth
solving pre-emptively for a shop-floor tool used in short, focused sessions.

User profile (avatar + self-service panel) and favicon/manifest, new session
(2026-08-13). Two independent changes shipped together.

**Profile**: a small circular wine/ivory avatar next to Log Out (`Avatar.tsx`,
initials from `name` — first+last word for a multi-word name, first two letters
otherwise — or the uploaded photo once one exists, same circular treatment either
way). Clicking it opens `ProfilePanel.tsx` in the existing `Modal`. New
`users.photo_url` column (`supabase/migrations/20260813150000_user_profile_photo.sql`)
and a new public `profile-photos` Storage bucket — created directly via
`supabase.storage.createBucket()` in a throwaway script, since bucket creation is a
Storage API call the service-role key can do without needing DDL access (unlike the
column migration itself, which still needed the user to run it — no Postgres
connection string or CLI link exists in this environment, same recurring gap noted
in earlier sessions). New `routes/me.ts` replaces the old inline `GET /api/me`:
`GET /` unchanged in shape (now includes `photo_url`); `PATCH /` and `POST /photo`
are both **structurally** scoped to `req.user.id` from the verified token — neither
route accepts an `:id` or trusts any `id`/`role` field in the request body, so
there's no way to target or promote via this endpoint at all, not just a checked
rule. `PhotoPicker` (previously hardcoded to item-photo upload) gained an optional
`uploadFn` prop, defaulting to the original `uploadItemPhoto` so every existing
caller is unaffected, letting the profile panel point the exact same picker+preview
UI at `/api/me/photo` instead of duplicating it. Photo upload auto-saves immediately
(no separate "Save" step, unlike Display Name) since PhotoPicker's own upload action
already completes the one meaningful step; removing the photo (the picker's own ×
button) required extending `PATCH /api/me` to accept an explicit `photo_url: null`
to clear it, since that path has no upload to piggyback on. Password change goes
straight through Supabase Auth from the frontend (no backend route) —
`signInWithPassword` first to confirm the current password actually matches (Auth's
plain `updateUser({ password })` alone would accept the change on session validity
alone, no proof of the old password), then `updateUser({ password: new })` only if
that succeeds.

Verified live (locally — this feature needs no `ANTHROPIC_API_KEY`, so no
production deploy was needed just to test it) with two throwaway accounts, deleted
after along with the uploaded test photo: display name edit persisted and updated
the header avatar immediately via a new `refreshProfile()` on `useAuth()`; photo
upload updated the avatar everywhere it appears (header + panel) in the same render,
confirmed against a real Storage URL directly in Supabase; password change correctly
rejected a wrong current password first, then succeeded with the real one — logged
out and back in with the *new* password to confirm the actual credential changed,
not just a client-side success message. Cross-account isolation confirmed two ways:
visually (the second throwaway account's panel showed only its own name/email/role,
completely separate from the first), and directly at the API level — a raw
`PATCH /api/me` call with `role: "admin"` and a different user's `id` deliberately
injected into the body came back `200` with the name change applied but `role`
still `"operator"` and `id` still the caller's own, confirming the injection
attempt was fully ignored rather than merely unused by the UI.

**Favicon/manifest**: the tab icon and "Add to Home Screen" icon were the same
underlying gap (no icons existed at all) so both were fixed together. Generated an
"NGJ" wine-on-ivory monogram (bold sans-serif, not the site's serif Fraunces —
deliberately, since a delicate serif blurs at 16×16 in a way a bold sans doesn't)
via an in-browser `<canvas>` render at 512×512, downloaded as the one real file that
successfully came through (Chrome silently blocks a page firing several
auto-downloads back-to-back — only the first of four `a[download]` clicks actually
produced a file), then resized to 192/180/32/16px with `sharp` (installed in the
session scratch directory only, not added to the app's own dependencies) rather than
re-fighting the browser for the rest. `frontend/public/` gained
`favicon-16x16.png`/`favicon-32x32.png`/`apple-touch-icon.png` (180×180, what iOS
actually uses)/`icon-192.png`/`icon-512.png`, plus `manifest.webmanifest`
referencing the two larger ones for Android; `index.html` links all of it, plus a
`theme-color` meta tag matching the wine token.

Verified live: every icon `<link>` and the manifest's own two icon references were
fetched directly and confirmed `200` with the correct `image/png` /
`application/manifest+json` content types, and the manifest JSON itself parses with
the expected name/short_name/colors. **Not verified by Claude, and not possible to
verify this way:** the actual rendered favicon glyph in a real browser tab, and what
iOS/Android "Add to Home Screen" produces on a real device — screenshots taken
through this browser-automation tooling capture page content only, never the
browser's own chrome (tab strip, etc.), so there's no way to visually confirm a
favicon through it even though the underlying files and links are proven correct.
Same category of gap as the QR-code phone-scan verification earlier — needs the
user's own eyes/device once live.

Design-pass follow-up, "Phase 2" of the redesign (three stages, new session,
2026-08-13 onward) — the original design pass above shipped tokens/typography/nav;
this round layered in the remaining foundational polish and motion, each stage
proposed and confirmed before building, per explicit instruction.

**Stage 1 — foundational tokens** (`shared.css`): `--shadow-card` replacing flat
borders on `.wizard-card`/`.stat-card`/`.booking-card`/mobile `.data-table` rows;
`--radius-lg` bumped 14→16px; pill-shaped `border-radius: var(--radius-pill)` on all
three button classes; remaining raw emoji swapped for `lucide-react` icons
(`ImageOff`, `Camera`, `Image`); a new shared `Skeleton.tsx` (`Skeleton`,
`DashboardSkeleton`, `BookingDetailSkeleton`) replacing "Loading…" text, deliberately
static in this stage (shimmer explicitly deferred to the motion stage).

**Real overflow bug found and fixed between stages** (live phone screenshot from the
user): an item name rendered one character per line. Root cause was **not** the
original systemic min-width:0 fix's scope gap — `.line-item-card-header` was simply
missing `flex-wrap: wrap`, so a long nowrap status pill (`"Pickup Overdue — Not
Confirmed"`, 237px) squeezed the title to near-zero instead of wrapping to its own
line. Confirmed via `git diff` this predated Stage 1 (not a regression it introduced).
A second, bundled bug — `ItemsList`'s "Currently Out" filter button wrapping
mid-word — was confirmed via DOM inspection to be a **different, unrelated** cause:
the global `overflow-wrap: break-word` rule (meant for free-text) also applying to
short fixed-vocabulary button labels. Fixed independently: `flex-wrap: wrap` added to
`.line-item-card-header`; `overflow-wrap: normal; word-break: normal;` scoped onto
`.toggle-btn`.

**Stage 2 — Fraunces typography extension**, three confirmed locations only:
receipt/invoice totals (`.receipt-totals-value`), the item/customer name line under a
success checkmark (new `.success-detail` class, used by every `.success-check`
screen), and Item Detail's item name split from its code into its own larger line
(`.item-detail-code` + `h2.item-detail-name`, the latter over-specific on purpose —
`0,2,1` — to unambiguously beat `.wizard-step h2`'s `0,1,1`, same specificity-discipline
lesson as the overflow bug above). Stress-tested with a 111-character throwaway name —
zero overflow at any level.

**Stage 3 — motion (final stage)**, four moments from the original Phase 1 proposal,
each an entrance-only CSS `@keyframes` on an element that mounts *after* its
underlying state change already completed (motion decorates a finished action, never
gates one): `.success-check` (`check-in`, 260ms — shared class, so this covers Confirm
Pickup, Process Return, BookingForm, and AddItemWizard's success screens for free);
`.skeleton` (`skeleton-sweep`, 1.4s infinite gradient sweep, layered onto Stage 1's
static block); a new `.payment-edit-entry` class on `BookingDetail`'s audit-trail rows
(`edit-in`, 220ms, plays only on the newly-mounted row); `.modal-overlay`/
`.modal-content`/`.filter-dropdown-menu` (`overlay-in`/`modal-in`/`menu-open`,
140–180ms scale+opacity open, no exit animation so rapid open/close can't leave a
stuck element). `prefers-reduced-motion` sets `animation: none` on all of the above
(skeleton additionally reverts its gradient to the flat `--line` color — the original
pre-shimmer state, not a new fallback).

All three stages verified live against real Supabase data with throwaway `ZZTEST`
fixtures, cleaned up after; real data confirmed untouched throughout. Stage 3 in
particular: `prefers-reduced-motion` was toggled via a **real Windows OS-level
setting** (`SystemParametersInfo`/`SPI_SETCLIENTAREAANIMATION`), not DevTools
emulation, confirmed picked up live by `matchMedia`; rapid triple-click on Mark
Returned confirmed (via direct Supabase query) exactly one return was processed, no
double-submission; rapid open/close on the filter dropdown and lightbox left zero
stuck DOM nodes. All 8 previously-flagged interactive components (FOC toggle, filter
popovers, success screens, lightbox/Modal, photo picker's capture split, Edit
Payment's audit trail, mobile nav, Assistant page) re-tested live at every stage.

**The redesign (Phases 1 and 2, all stages) is now complete.** Not yet done: verified
only via browser automation at an emulated 390px viewport, not an actual phone — real
touch-target sizing and iOS/Android rendering still need a check on a real device
(same recurring caveat as every earlier mobile-viewport verification this project has
done). Three items explicitly deferred to pick up separately, not part of the
redesign: role-based access (still open, see below), "Add New Item" from within
`BookingForm`, and remaining tablet-breakpoint work.

Undo Pickup, new session (2026-08-23) — real operator mistake, reported live: the
same physical item can legitimately be booked twice within one transaction (one
already-completed cycle, one still-upcoming), and an operator tapping Confirm Pickup
on the wrong line flips the *upcoming* booking to `status: 'out'` with no way back
except a direct DB edit. New `POST /api/bookings/:bookingId/items/:bookingItemId/undo-pickup`
(`backend/src/routes/bookings.ts`, placed directly after `confirm-pickup`) is an exact
mirror in reverse: only valid from `status === 'out'` (`409` otherwise, with a message
naming the actual current status rather than a silent no-op), reverts to `'booked'`
and clears `actual_pickup_date`. Deliberately does **not** touch `payments` — reversing
a pickup status is a separate concern from reversing money collected at that moment
(none was, in the case this was built for), matching the scoping return processing
already keeps. Frontend: `BookingDetail.tsx` gets a matching "Undo Pickup" button
(shown whenever a line is `'out'`) using the same inline confirm-before-acting pattern
(`btn-danger` "Yes, Undo Pickup" / "Cancel") as Delete elsewhere in the app.

Used live to fix the real case that prompted it — booking `C/059` (Kanu Priya), item
`NGJ-0026`, booked twice in one transaction (one cycle already `returned`, the
`05/09→07/09` cycle accidentally flipped to `out` today). Verified via direct
Supabase query before and after: the accidentally-confirmed line reverted to
`status: 'booked'`, `actual_pickup_date: null`, its completed sibling booking on the
same item untouched, the single real `payments` row (₹1000 advance from booking
creation) untouched throughout, and a second undo attempt on the now-`'booked'` line
correctly rejected with `409`. Done through a throwaway admin account against the
real booking (not a raw DB script) so the fix and the feature verification were the
same action; throwaway account deleted after.

"Send via WhatsApp" on the invoice/receipt, new session (2026-08-23) — investigated
before building, since the two things that mattered ("is phone storage clean?", "does
the shareable link actually work signed-out?") weren't obvious from the feature
request alone.

**Finding that changed the plan:** the suspected risk was a guessable URL (booking
codes look sequential, e.g. `C/059`) — but `/receipt/:bookingId` already keys off
`bookings.id`, a real UUID, not the visible code, so that specific worry didn't apply.
The actual blocker was the opposite problem: `/receipt/:bookingId` is wrapped in
`ProtectedRoute`, *and* every backend route including `/api/bookings/*` sits behind
global `requireAuth` (`backend/src/index.ts`) — a signed-out customer tapping the
link would be bounced straight to `/login` with no account to log into. Not "too
open," too closed for the one audience this feature is for.

**Fix, reviewed before building:** new `bookings.share_token`
(`supabase/migrations/20260823010000_booking_share_token.sql`) — 24 bytes from
pgcrypto's `gen_random_bytes()` (already enabled), hex-encoded, `NOT NULL DEFAULT`
so every booking gets one automatically and — because a volatile default forces
Postgres off the fast metadata-only `ADD COLUMN` path — every *existing* booking was
backfilled with its own independently-random token in the same statement, confirmed
live (10 sampled rows, 10 distinct 48-hex-char tokens). New `GET
/api/public/receipt/:token` (`backend/src/routes/publicReceipt.ts`) is the one route
in this app with no `requireAuth` at all, keyed only by `share_token` — never
`booking.id`, never `booking_code` — and returns an explicitly whitelisted narrow
shape (shop info, booking code/date, customer *name* only, per-item type/dates/price/
deposit, aggregate totals), never `{...booking}` minus some fields. Deliberately
excluded: notes, payment/audit history, both phone fields, GST fields, the booking
chain (would leak scheduling info about other customers' bookings on the same item),
and — the one non-obvious exclusion — an FOC item's `price_charged`, which the
`BookingItem` type's own comment confirms is the untouched original "what it would
have cost" value; nulled out here since a comped item's market value showing up on a
forwardable public link is a real business-sensitivity concern, not something this
project had needed to think about before this was public-facing. Gets its own
`express-rate-limit` (30 req/min/IP) since it's the first endpoint reachable with no
session at all — no rate limiting exists anywhere else in this backend, this wasn't
a gap worth closing until a route existed that didn't at least require a valid
Supabase token first. New public frontend route `/r/:token`
(`PublicReceiptPage.tsx`), deliberately outside `ProtectedRoute`, sitting alongside
(not replacing) the existing staff `/receipt/:bookingId` view — that one is untouched,
still auth-gated, still what "Print/Download Receipt" on Booking Detail links to. The
public page's QR code points at itself (`window.location.href`) rather than the
internal `/bookings?booking=` deep link the staff receipt's QR uses, since that
internal link would just bounce a signed-out scanner to `/login`.

`ReceiptPage.tsx` gained the "Send via WhatsApp" button itself — a real `<a
href="https://wa.me/91...&text=..." target="_blank">`, not `window.location`, so
mobile browsers treat it as genuine user-initiated navigation. New
`lib/whatsapp.ts`'s `buildWhatsAppLink()` re-validates the phone defensively (strip
non-digits, require exactly 10) rather than trusting the stored value — `phone` has
no DB-level length constraint, only "non-empty after normalization," and a real
9-digit `phone_secondary` value already existed in production (Kanu Priya's, an
operator typo) proving this isn't a theoretical gap. No valid phone → the button
renders as a genuine disabled `<button>` with a `title` reason, never a broken link.

**Real, unrelated bug found and fixed along the way:** live-testing the new button
showed it underlined like a plain text link, not styled like every other button in
the app. Root cause: `.btn-primary/.btn-secondary/.btn-danger` in `shared.css` never
set `text-decoration: none` — harmless for every past use since they were always
applied to real `<button>` elements (which have no underline to begin with), but the
one pre-existing exception, `BookingDetail.tsx`'s "Print/Download Receipt" `<Link
className="btn-secondary">`, had silently carried this exact same underline the whole
time. Confirmed live before fixing (computed `text-decoration-line: underline` on
both), fixed once at the shared class level (plus `display: inline-block` so an `<a>`
sizes identically to a `<button>` under the same padding/min-height rules) rather
than patching just the new instance.

Verified live, not just typechecked: 10 real bookings' tokens sampled directly via
Supabase, confirmed unique and correctly formatted. `curl` with zero auth headers
against the real `C/059` (Kanu Priya) token returned exactly the whitelisted shape —
raw JSON diffed field-by-field against the intended list, nothing extra. A throwaway
FOC booking confirmed `price_charged` arrives `null` for `is_foc: true` items
specifically (not just asserted from reading the code). `/r/:token` loaded correctly
in a tab with `localStorage` explicitly cleared first (not just assumed signed-out) —
full real data rendered, no header actions, no bottom nav; the old `/receipt/:bookingId`
on the same real booking, hit the same way, correctly bounced to `/login`, confirming
the staff route's gate is untouched. The WhatsApp button was clicked for real (not
just its `href` inspected) — opened a genuine new tab to WhatsApp's own
`api.whatsapp.com/send` page, which independently confirmed `+91 78388 74270` (Kanu
Priya's real number) and the exact pre-filled message text, screenshotted. A
throwaway customer with a direct-DB-inserted 5-digit phone (bypassing the API's own
validation, the same way the real `phone_secondary` edge case arose) confirmed the
button renders genuinely `disabled` with the correct `title`, not just visually
greyed out. All throwaway items/customers/bookings/booking_items cleaned up after,
verified zero remaining by a fresh `ilike` sweep; the throwaway admin account
deleted; real data (`C/059`'s live `share_token`, `NGJ-0001`) confirmed untouched
throughout.

Invoice cosmetic pass, same day — three small requests against both receipt views
(`ReceiptPage.tsx` staff view and `PublicReceiptPage.tsx`). (1) `booking_items.custom_addons`
(the free-text extras added at booking time — nath, sheeshpatti, etc., distinct from
`items.components`) now renders as a small muted "Additional: ..." line under each
item, on both views — the public endpoint's select previously omitted this field
entirely (deliberate at the time, since nothing rendered it yet) and now includes it;
still nowhere near the excluded-fields list from the WhatsApp session (notes, payment
history, phone numbers) since these are booking-specific extras the customer already
knows they booked, not internal data. (2) `receipt-meta`'s booking code/customer name
gained small uppercase kicker labels ("Booking No." / "Customer") via a new
`.receipt-meta-label` class mirroring `.item-detail-code`'s existing treatment. (3)
The shop's real logo (`NON Tech/NGJ logo.png`, outside the repo) is now on both
receipt views' header. The source file has a solid black background — pasted as-is
it would've shown a black square on the ivory receipt, so it was processed once
(scratch-directory Node script using `sharp`'s raw pixel buffer, luminance-threshold
chroma key with a soft falloff band to avoid a jagged cutout edge) into a transparent
PNG, saved at `frontend/src/assets/images/ngj-logo.png` (54.5KB, mirrors the Fraunces
font asset's storage pattern) — a one-time asset-prep step, not a build-time
transform, so no image-processing dependency was added to the app itself.

Verified live: the public endpoint's raw JSON re-checked to confirm `custom_addons`
now present; both receipt views re-rendered against the real `C/059` (Kanu Priya)
booking showing the labeled headers, both items' real additional-items lists, and
the logo blending cleanly against the ivory background with no visible dark fringing
at zoom (checked directly, not assumed from the processing script alone); confirmed
the `@media print` rule doesn't hide or otherwise target the new logo. Throwaway
admin account used for the staff-view check deleted after.

Receipt toolbar alignment fix, same day — a live look at the invoice surfaced a real
layout bug: the Print/WhatsApp buttons sat inside `.wizard-actions` (column layout)
with `.btn-primary`'s own `margin-left: auto` (meant for Cancel/Submit form pairs
elsewhere in the app) pushing a lone button hard right, while everything below it —
logo, shop name, booking meta — is `text-align: center`. Two different alignment axes
on the same narrow (480px) receipt column, most visible on mobile. New
`.receipt-actions` class (flex row, wrap, `justify-content: center`, margin reset on
its buttons) replaces `.wizard-actions` on both receipt views — toolbar and content
now share one visual axis on any width. Purely cosmetic; both buttons still carry
`.no-print`.

Invoice fields pass 2, same session — "pull everything from the booking form" request
surfaced two more gaps. (1) `items.components` (the set's own reusable template —
Necklace/Earrings/Tika/…, shown read-only on `BookingForm` itself) was never on the
invoice at all, only `custom_addons` (this booking's own one-off extras) was — added
as a "Components: ..." line, same treatment, clearly distinct from "Additional: ...".
(2) `quantity_booked` (shown on `BookingForm` for `quantity`-tracked items) wasn't on
the invoice either — added as "× N" after the item name, only when > 1. (3) A real,
previously-unnoticed bug: the invoice's date was `booking.created_at` (an untouched
system timestamp) instead of `booking.booking_date` (the operator-editable "date the
booking was actually made" — the actual field BookingForm calls "Booking Date" and
the one an invoice date should reflect). Confirmed live on the real `C/059` booking
that these aren't the same value — `booking_date` is `2026-08-17`, `created_at` is
`2026-08-22`, a real 5-day gap that was showing the wrong date on every invoice sent
out. Switched on both receipt views; the public endpoint's response field was
renamed `booking_date` accordingly (was `created_at`). GST fields, deliberately
*not* added despite also being on `BookingForm` — the "plain invoice, no GST section"
decision above still stands; this wasn't an oversight, called out explicitly rather
than silently left out.

Verified live: public endpoint's raw JSON re-checked for `components`/`quantity_booked`/
`booking_date`; the real `C/059` booking (a `set` item with real `components:
["Earrings"]`) confirmed rendering correctly on both views; a throwaway
`quantity`-tracked booking (`quantity_booked: 4`) confirmed the "× 4" display and
confirmed a `single`-type item correctly shows no Components line. Throwaway data
cleaned up after.

Cold-start loading states, new session (2026-08-25) — real user pain, not cosmetic
polish: Render's free tier spins the backend down after a period of inactivity, so
the first request after that can take up to ~50s. Several pages (most visibly the
invoice link customers get via WhatsApp) still fell back to plain "Loading…" text for
that entire wait, which reads as broken rather than in-progress. `Skeleton.tsx` gained
four new page-shaped layouts alongside the existing `DashboardSkeleton`/
`BookingDetailSkeleton` (its stale "static on purpose, no shimmer" doc comment was
also fixed — the shimmer landed in the Phase 2 Stage 3 motion work and was never
updated here): `ReceiptSkeleton` (shared by both `ReceiptPage.tsx` and
`PublicReceiptPage.tsx` — deliberately one shape since they're already the same
layout, and this is the most externally-visible loading state in the app),
`ItemDetailSkeleton`, `FormSkeleton` (`SettingsPage.tsx`), and `ListPageSkeleton`
(shared by `ReportsPage.tsx`/`ExpensesPage.tsx`/`ChargesPage.tsx` — close enough in
shape across all three that one skeleton serves them rather than three near-identical
ones). Every remaining plain-text `Loading…` page now uses one of these.

New `lib/useSlowLoadHint.ts` — a small hook, true once `loading` has been true for
longer than 6s (default), false immediately whenever `loading` goes false. Every
skeleton page now conditionally shows "Still loading — the server may be waking up
after a period of inactivity. This can take up to a minute." beneath the skeleton
once this fires, via a new shared `.slow-load-hint` class — not shown on a normal
sub-second load, only once a wait is genuinely long enough that a silent skeleton
would itself start to look stuck. Also added to `DashboardPage.tsx` and
`BookingDetail.tsx`, which already had skeletons from earlier sessions but no
explanation for a long wait either. One real Rules-of-Hooks bug caught while wiring
this in, not shipped: `SettingsPage.tsx` has an early return for the non-admin
"Admins only" gate *before* its old loading check — placing `useSlowLoadHint` after
that gate (where the plain `if (loading)` line used to be) would only call the hook
conditionally, undefined behavior in React. Fixed by moving the hook call to the top
of the component, above every early return, same rule every other page here already
had to follow structurally.

Verified live, not just by reading the JSX: a temporary artificial delay was added to
the public receipt route (8s) and confirmed via real screenshots, then reverted —
first screenshot showed the shimmering `ReceiptSkeleton` mid-load with no hint text
yet (under 6s in), a later screenshot of the same load showed the "waking up" hint
correctly appended once past 6s, and a final screenshot after the delay cleared
showed the real content with neither skeleton nor hint present. Same technique
(temporary delay, screenshot, revert) independently confirmed `ItemDetailSkeleton`
against a real item and resolving correctly into real content afterward. Confirmed via
`git diff` that no temporary test delay was left in any of the three routes touched
for this. Throwaway admin account used for the auth-gated checks deleted after.

Total Earnings (Item Detail) / Total Business (Customer Detail), same session — an
ROI-style figure per the explicit ask, computed rather than stored, reusing logic
that already existed rather than inventing a new definition of "revenue". New `GET
/api/items/:id/revenue` calls the exact same `getItemBookingItems` +
`getRevenueBreakdown` (`backend/src/lib/reportsData.ts`) already backing the AI
assistant's `get_item_revenue` tool — same cancelled-exclusion and FOC-zeroing rules
(`effectivePrice()`), so the two can never quietly diverge. New `GET
/api/customers/:id/revenue` sums `price_charged` across `getCustomerHistory()`'s
per-booking `booking_financials` figures (already backing `get_customer_history`) —
no extra filtering needed there since that view already excludes cancelled items and
zeroes out FOC ones per-booking. Both are all-time, agreed-value totals — "earned",
not "collected" (`total_paid`/`received` are the separate, already-existing figures
for that). Displayed as a bolded `<li><strong>` line, same treatment
`BookingDetail`'s own "Balance due" line already uses for an equally load-bearing
number: "Total Earnings" between Sale price and Components on Item Detail, "Total
Business" between Type and Notes on Customer Detail. Customer label deliberately
avoids "Total Spent" — that could read as cash actually paid (`total_paid`), which
this isn't, especially for a customer with an open balance.

Verified live against real production data, not just typechecked: found the real
item from the request's own screenshot (`NGJ-0009` / Polki Semi Bridal #1800 (Alia),
sale price ₹14000, components Necklace/Earrings/Tika — an exact match) and hand-
computed its expected total directly via Supabase (₹1250 + ₹800 = ₹2050, both real
non-cancelled non-FOC bookings) before ever loading the page — the rendered "Total
Earnings: ₹2050" matched exactly. Same for the customer side: Ruchi Arora's one real
booking (`C/050`), hand-computed via `booking_financials` as ₹1250, matched the
rendered "Total Business: ₹1250" exactly. Both exclusion rules also verified against
a throwaway item/customer with three bookings — one real (₹500), one cancelled
(₹9999, would visibly break the test if wrongly included), one FOC (₹8888 real
price) — both new endpoints correctly returned exactly ₹500. All throwaway data and
the throwaway admin account used for the auth-gated checks cleaned up after; real
data (`NGJ-0009`, Ruchi Arora's real ₹1250 booking) confirmed untouched throughout.

Reports page UI pass, new session — two requests: item/customer names weren't
hyperlinked like they are elsewhere, and the page was "a big scroll" with no way to
find a section without hunting. For the layout, presented three concrete options
(sticky jump-nav pills / collapsible accordion sections / real tabs) with ASCII
previews rather than picking unilaterally, since this is a real IA decision, not a
small tweak — user picked sticky jump-nav pills.

**Hyperlinks**: `Most-Booked Items` and `Idle Inventory` item names now link to
`/items/:id` (both already carried `item_id`/`id` in their existing response shape,
no backend change needed); `Repeat Customers` names now link to
`/customers?customer=:id` (same, already had `customer_id`). `Outstanding Dues`
needed an actual backend change — `getOutstandingDues()`
(`backend/src/lib/reportsData.ts`) fetched `customer_id` internally to resolve the
name but never returned it; now included in the response (additive, so nothing
downstream — including the AI assistant's `get_outstanding_dues` tool — could break).

**Layout**: new `.report-nav` — `position: sticky; top: 0`, horizontally-scrolling
pills, one per section (Overview/P&L/Most-Booked/Repeat Customers/Idle Inventory/
Outstanding Dues), so it can be reached from wherever you already are on the page,
not just from the top. Each pill calls `scrollIntoView({behavior:"smooth",
block:"start"})` on that section's `id` — the exact same mechanism the pre-existing
Dashboard→Outstanding-Dues deep link already used, just generalized to every
section instead of just one; that deep link's own target id was left unchanged so
it keeps working unmodified. Deliberately no scroll-spy/active-pill highlighting —
each pill just jumps, kept simple rather than adding IntersectionObserver-based
state for a page this size.

**A real, extended verification detour, not a code bug**: confirming the pills
actually jump-scrolled turned into a genuine investigation. Simulated clicks via
this session's browser-automation tooling (both raw-coordinate and element-
reference-based) fired the click handler inconsistently, and even when confirmed
firing (via a temporary `console.log` in `jumpTo`, since removed), the resulting
`smooth`-behavior scroll frequently didn't visibly move the page. Isolated
carefully rather than assumed away: a direct, non-click-triggered
`element.scrollIntoView()` call — both `smooth` and `auto` — worked instantly and
reliably every time; a real bubbling `element.click()` (not a CDP-simulated mouse
event) combined with `auto` also worked reliably; only the combination of a
simulated-click trigger *and* `smooth`'s animated (multi-frame, compositor-driven)
behavior was unreliable in this specific automation session — most likely because
Chrome's smooth-scroll animation depends on a rendering cadence that an
automated/non-genuinely-focused tab doesn't reliably provide, not because of
anything wrong with the code. Confirmed the actual shipped mechanism is correct
(right handler wiring, right target resolution, right final position) and left
`smooth` in place, matching the pattern already proven live via `.click()` +
`auto`. Flagged here rather than silently written up as "verified" — this is the
one piece of this feature not fully confirmed via visible on-screen animation in
this session, the same category of gap as prior "not verified by Claude, not
possible to verify this way" notes (QR phone scan, favicon glyph, camera capture).

Verified live against real production data: both new item links (Most-Booked
Items → a real item, confirmed landing on its actual Item Detail page) and
customer links (Outstanding Dues → Yamini Madaan, confirmed landing on her actual
Customer Detail page showing the correct real `Total Business: ₹4500`) clicked
through for real via `.click()`, not just href-inspected. Confirmed no horizontal
page overflow from the new nav bar at a genuine 386px mobile viewport
(`scrollWidth === clientWidth`) despite the nav's own internal horizontal
scroll. Confirmed the sticky positioning holds correctly at real scroll depth
(nav still pinned to the viewport top 1200px down the page). Throwaway admin
account cleaned up after.

Skeleton loading for Items/Customers/Bookings/Ask, new session — the same cold-start
pain the Dashboard/Reports/Receipt skeleton work already addressed was still
unfixed on the app's other primary list pages, which fell back to a bare
"Searching…"/"Loading…" text line over an otherwise-empty area. `Skeleton.tsx`
gained two more shapes: `TableRowsSkeleton` (shared by `ItemsList`/`CustomersList`
— both `.data-table` rows, same shape) and `BookingCardsSkeleton`
(`BookingsList`'s taller `.booking-card` shape, since it packs title/customer/
status/financials/item lines into one card rather than a flat row). Each list
keeps its own search/filter controls visible immediately (they don't depend on the
fetch) and only skeletons the results area below — same "keep the chrome, skeleton
the content" split `BookingDetail` already established.

Deliberately scoped to a genuinely empty first load only —
`loading && rows.length === 0` — not every loading state. A refresh or a
search/filter change over data already on screen (e.g. typing to narrow an
already-loaded customer list) keeps the original lightweight "Searching…"/
"Refreshing…" text instead of flashing the heavier skeleton, since that's a fast,
already-warm-backend case the skeleton would just be noise for. All three also get
the same `useSlowLoadHint`-driven "still waking up" reassurance as every other
skeleton page, appearing only past 6s.

`AssistantPage` ("Ask") has no fetch on mount at all — the starter questions are
static, so there's nothing to skeleton there. But the chat endpoint hits the exact
same Render backend as every other page, so a cold *first message* of a session
can be just as slow, with only 3 bouncing dots and no explanation why. Same
`useSlowLoadHint` (tied to `sending` instead of a list-loading flag) now shows the
same reassurance text beneath the typing indicator once a reply has taken more
than 6s.

Verified live: confirmed via direct DOM inspection (not just screenshots, which
kept racing the artificial delay used to force the slow-load condition — a
recurring timing quirk with this session's screenshot tooling specifically, not
the feature) that `ItemsList` renders real content correctly after an artificially
delayed `GET /api/items`; delay reverted and confirmed via `grep` that no test
code was left behind. Typecheck and build clean on both workspaces after the
revert. Throwaway admin account used for the auth-gated check deleted after.

AI assistant: `get_repeat_customers` tool + a real crash fix, new session — the user
hit a genuine, reproducible failure asking the assistant "Who is the most repeated
customer?" then "Yes do that": a 400 from Anthropic itself,
`tool_use ids were found without tool_result blocks immediately after`, with a long
list of orphaned tool ids. Two real, distinct things going on, both addressed.

**Missing tool, the proximate trigger.** No tool covered "who's our repeat/most
frequent customer" at all — Reports' own `repeat_customers` section had no AI
equivalent, so the model's only path was `get_customer_summary` (all 24 customers)
then, on "yes do that", apparently trying to call `get_customer_history` once per
customer in a single turn — a large batch of parallel tool calls that's exactly the
shape that exposed the underlying bug below. New `get_repeat_customers` tool closes
this — same ranking Reports already computes (booking_count > 1, sorted
descending), all-time by design like the Reports section it mirrors (never scoped to
a date range someone might mention in the question). The underlying aggregation
(previously inline in `reports.ts`, per its own comment "nothing else needs this
yet") is now extracted to `reportsData.ts` as `getAllBookingItems` +
`rankRepeatCustomers`, same one-shared-function-not-two-that-could-drift pattern as
everything else in that file — `reports.ts` now calls the shared version instead of
its own copy. The tool's own description explicitly tells the model not to fall back
to the per-customer-history approach, closing the trigger at the prompt level too.
Also closed a second, smaller gap found while auditing every tool against every
Reports section: `get_financial_summary` computed `total_bookings`/`rental_count`/
`sale_count` internally (via `summarizeBookingItems`) but discarded them before
either its own response or `reports.ts` ever saw them — a plain "how many bookings
this month" question had no tool that could answer it. Added as three more fields
on the same response (additive, nothing existing breaks).

**The actual crash — a real robustness gap in `chat.ts`'s tool loop, not just the
missing tool.** The loop's tool-resolution step awaited a plain `Promise.all` over
`runTool()` calls with no per-call error handling: if even one tool call in a batch
threw, `Promise.all` rejected as a whole, and neither the assistant's tool_use
message nor any tool_result got pushed to `messages` for that round — but by then
`messages` (the very array reference from `req.body.messages`, mutated in place) had
already been mutated by any *earlier, successful* rounds in the same request, so a
half-completed exchange could reach the next request in a state Anthropic's own API
then rejects. Fixed by wrapping each individual `runTool()` call in its own
try/catch, returning a `tool_result` with `is_error: true` on failure instead of
letting the exception propagate — this guarantees `toolResults.length ===
toolUses.length` always holds, regardless of what any single tool call does, so a
`tool_use` block can never end up without a matching `tool_result`. Also added a
`MAX_TOOL_ITERATIONS` (8) cap on the while loop itself, as cheap insurance against a
genuinely runaway multi-round tool conversation, separate from the large-single-
batch failure mode above.

Not fully independently verified this session: local `backend/.env` has no real
`ANTHROPIC_API_KEY` (same gap noted in earlier AI-assistant sessions — only Render's
production env var has one), so this shipped and needs testing against the deployed
site rather than local dev, same as every previous chat-feature change in this
project.

## Tech stack

- **Frontend**: React + Vite + TypeScript, `frontend/`, deployed on Vercel.
- **Backend**: Node.js + Express + TypeScript, `backend/`, deployed on Railway or Render.
  Owns all business logic, all secrets, all writes to the DB.
- **Database**: PostgreSQL via Supabase (also provides Auth and Storage for item photos).
  Schema lives in `supabase/migrations/`.
- **Auth**: Supabase Auth, email/password. Two accounts: `admin` (Aryan) and `operator`
  (father). The `users` table mirrors `auth.users` with a `role` column that gates
  screens/actions.
- **AI**: Claude Haiku 4.5 via the Anthropic API, called only from the backend
  (`backend/src/routes/chat.ts`), with tool access to live data (`backend/src/tools/`).

## Repo layout

```
frontend/     React app — talks only to our own backend API, never Supabase directly
              (except supabase.auth for login/session)
backend/      Express API — the only thing holding secrets, the only DB writer
supabase/
  migrations/ SQL schema (source of truth for the DB — apply with `supabase db push`
              or the Supabase SQL editor)
  seed.sql    Local dev seed data only
PROJECT_PLAN_V2.md   Full planning doc — architecture, phased build order, open
                     questions for the CA (HSN codes, GST rate)
```

## Running locally

Requires Node 20+.

```
npm install
cp backend/.env.example backend/.env       # fill in Supabase + Anthropic keys
cp frontend/.env.example frontend/.env     # fill in Supabase URL/anon key
npm run dev:backend      # http://localhost:4000
npm run dev:frontend     # http://localhost:5173
```

Apply the schema to a Supabase project with the Supabase CLI (`supabase link`, then
`supabase db push`), or paste `supabase/migrations/*.sql` into the SQL editor.

Other commands (run from repo root, an npm workspaces monorepo):

```
npm run build:backend       # tsc -p backend/tsconfig.json
npm run build:frontend      # tsc -b && vite build
npm run typecheck --workspace backend    # tsc --noEmit
npm run typecheck --workspace frontend   # tsc --noEmit
```

There is no test suite or linter configured yet in either workspace — don't assume
`npm test`/`npm run lint` exist. Type-checking (above) is currently the only automated
correctness check; run it after backend/frontend changes.

## Key rules (carried forward from v1's failure modes)

**Never write to computed fields.** Balance due, overdue status, and days-until-return
are never stored on `bookings` — they're derived at query time via the
`booking_financials`, `overdue_rentals`, and `upcoming_returns` SQL views
(`supabase/migrations/`). v1 broke because the app tried to write to Airtable's
auto-calculated formula fields; nothing in this codebase should write to a value that
a view or query already computes. If you're about to `UPDATE` a "total"/"balance"/
"is_overdue"-shaped column, stop — compute it instead.

**Secrets stay backend-only.** The Supabase *service role* key and the Anthropic API
key live only in `backend/.env` and are read only in `backend/src/`. The frontend only
ever holds the Supabase *anon* key (safe, RLS-scoped, used solely for
`supabase.auth.*`) and talks to application data exclusively through `backend`'s
`/api/*` routes. v1 leaked its Airtable token by putting it in `shared.js`; never repeat
that — if you find yourself importing `SUPABASE_SERVICE_ROLE_KEY` or
`ANTHROPIC_API_KEY` into anything under `frontend/`, that's a bug.

**All business dates run on IST (`Asia/Kolkata`), never the viewer's local time.**
Aryan is in the UK, his father is in India, and "overdue"/"due today"/"days until
return" must mean the same thing regardless of who's looking. Backend: use
`istToday()` / `daysUntil()` from `backend/src/lib/dates.ts`. Database: use the
`ist_today()` / `ist_now()` SQL functions (defined in the init migration), not
`current_date`/`now()` directly. Never compute these in the frontend from
`new Date()`.

**`price_charged` on a booking is a snapshot**, taken at booking creation. Never
recompute it from `items.rental_price`/`sale_price` after the fact — those can change
later without altering past bookings. Lives on `booking_items` (per line item), not
`bookings`, since the Stage 2 cutover — see Data model summary below.

**Item components/checklists belong to the parent item, not a separate table.**
`items.components` is the template list (e.g. `["Necklace","Earrings","Tika"]`);
`booking_items.return_checklist` is that same list instantiated per-line-item at
return time. Matches v1's model — don't split this into a normalized child table.

## Data model summary

See `supabase/migrations/20260804000000_init_schema.sql` for the original schema and
later migrations for additive changes. The Stage 2 parent/child restructuring
(`PROJECT_PLAN_V2.md` §8) is the one exception to the usual `supabase/migrations/`
pattern — its SQL lives in `supabase/proposed/20260811_booking_items_restructure/`
(run by hand against production as a one-time sequence, `01_schema_additive.sql`
through the destructive `03_schema_cutover.sql`, not as a numbered migration) — plus
`20260812130000_refund_infrastructure.sql` for the payments/item_charges additions
and `20260813120000_shop_settings.sql` after that. Eight tables:

- **items** — inventory. `item_type` (`set`/`single`) determines whether `components`
  is used; `tracking_type` (`unique`/`quantity`) determines whether the item is a single
  trackable physical piece or a stock count.
- **customers** — dedupe on `phone` (unique) before creating. `customer_type`
  (`regular`/`influencer`/`mua`, default `regular`) drives the Reports collab toggle.
- **bookings** — the per-transaction parent record (one per family pickup visit, not
  per item): `customer_id`, `booking_code`, GST fields (`gst_applicable`,
  `gst_invoice_number`, `hsn_code`, `tax_rate`, whole-transaction level), and
  `share_token` (random, unique, DB-generated — the public `/r/:token` receipt link's
  identifier; never expose `id` or `booking_code` for that purpose instead). No
  price/date/status fields of its own since the Stage 2 cutover — those all moved to
  `booking_items`.
- **booking_items** — one row per physical item within a booking: `booking_id`,
  `item_id`, `type` (rental/sale, per item), `pickup_date`/`return_date`, `status`,
  `price_charged` (snapshot), deposit fields, `return_checklist`, `custom_addons`. A
  booking's overall status is computed from its `booking_items`' statuses, never
  stored.
- **payments** — `booking_id` points at the parent `bookings` row (one running balance
  per family transaction); `booking_financials` view aggregates over `booking_items`
  grouped by `booking_id` into `total_paid`/`balance_due`. `type` (`payment`/`refund`)
  distinguishes money in vs. money back out — every refund (item removal, cancel,
  resolving a lost-item charge) is a negative/positive `payments` row rather than a
  separate ledger.
- **item_charges** — lost/damaged-item charges raised at return time
  (`booking_item_id` FK), resolved via a linked `refund`-type `payments` row.
- **expenses** — for the P&L/bookkeeping views (Phase 2).
- **shop_settings** — true singleton (`id boolean primary key`, always `true`, one
  pre-seeded row). `name`/`address`/`phone` shown on printed receipts; editable via
  the admin-only Settings screen.
- **users** — mirrors `auth.users`, adds `role` (`admin`/`operator`) — as of this
  session, actually enforced somewhere (`shop_settings` PATCH), not just scaffolded.

## Request flow / architecture

Every backend route (`backend/src/routes/*.ts`) is mounted in `backend/src/index.ts`
behind `requireAuth` (`backend/src/middleware/auth.ts`), which verifies the Supabase
access token from the `Authorization: Bearer` header and attaches `req.user` (id, role,
name, email) by looking up the matching row in `users`. There's no separate ORM layer —
routes call the Supabase service-role client (`backend/src/lib/supabase.ts`) directly
with `.select()/.insert()/.update()`, reading from tables and from the computed views
(`booking_financials`, `overdue_rentals`, `upcoming_returns`) directly by name.

The frontend never calls Supabase for app data — `frontend/src/lib/api.ts`'s
`apiFetch()` is the only path to the backend, attaching the current Supabase session's
access token as the bearer token on every call. `frontend/src/lib/supabase.ts` is used
solely for `supabase.auth.*` (login/session), matching the "secrets stay backend-only"
rule above.

The Claude Haiku chat tool definitions and their Supabase-backed implementations
(`runTool()`) live together in `backend/src/tools/index.ts`, one file, rather than
split per-tool — each case in the `runTool` switch queries a table or view the same way
a REST route would.

## Build phases

See `PROJECT_PLAN_V2.md` §5 for full detail. Order: Phase 1 core operations (item
intake, bookings, returns, dashboard) → Phase 2 bookkeeping (payments, expenses, P&L,
GST invoices) → Phase 3 AI chatbot → Phase 4 backlog (QR labels, WhatsApp reminders,
etc). Phase 1 is complete (including the Stage 2 multi-item restructuring and refund
infrastructure). Phase 3's frontend (`AssistantPage.tsx`) is also done — the backend
chat route/tools (`backend/src/tools/index.ts`) already queried through
`booking_items` correctly post-cutover, so the page just needed wiring up, which
landed 2026-08-12. Phase 2 is otherwise still in progress — see "Next step" above.
Don't build ahead of the current phase without checking in.

## Open questions (not something to guess at)

Current HSN code(s) and GST rate(s) for `bookings.hsn_code`/`tax_rate` would need
confirmation from the family's CA before a GST section could be added to invoices —
see `PROJECT_PLAN_V2.md` §6. This is **not currently blocking anything**: per the
2026-08-13 decision recorded above, invoice generation is scoped as a plain invoice
with no GST section for now, so there's nothing to wait on here. Don't hardcode a
guessed HSN/rate value if GST support is ever added later.
