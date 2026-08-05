# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Nitya Gehini Jewels — Management System

Rebuild of the v1 Airtable + static HTML system as a real backend + database.
Full context and rationale: `PROJECT_PLAN_V2.md` (keep it in sync if the plan changes).

## Current status (2026-08-05)

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

**Next step:** Phase 1 core operations (item intake, bookings, returns, dashboard) are
now functionally complete. Per `PROJECT_PLAN_V2.md` §5, Phase 2 (bookkeeping —
payments, expenses, P&L, GST invoices) is the natural next area; `payments.ts` and
`expenses.ts` are scaffolded but not yet wired into any frontend page.

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
later without altering past bookings.

**Item components/checklists belong to the parent item, not a separate table.**
`items.components` is the template list (e.g. `["Necklace","Earrings","Tika"]`);
`bookings.return_checklist` is that same list instantiated per-booking at return time.
Matches v1's model — don't split this into a normalized child table.

## Data model summary

See `supabase/migrations/20260804000000_init_schema.sql` for the authoritative schema
(enums, constraints, indexes, views, RLS). Six tables:

- **items** — inventory. `item_type` (`set`/`single`) determines whether `components`
  is used; `tracking_type` (`unique`/`quantity`) determines whether the item is a single
  trackable physical piece or a stock count.
- **customers** — dedupe on `phone` (unique) before creating.
- **bookings** — covers both rentals and sales (`type`). `price_charged` is a snapshot.
  `return_date` is required for rentals, not for sales.
- **payments** — supports multiple partial payments per booking (advance + balance, or
  installments); `booking_financials` view sums these into `total_paid`/`balance_due`.
- **expenses** — for the P&L/bookkeeping views (Phase 2).
- **users** — mirrors `auth.users`, adds `role` (`admin`/`operator`).

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

**Phase 1 is scaffolded but not complete.** `backend/src/routes/bookings.ts` has
`TODO(Phase 1)` comments marking two known gaps: booking creation doesn't yet do
conflict detection (overlapping dates for `unique` items, or oversold quantity for
`quantity` items), and the return endpoint doesn't yet populate/validate
`return_checklist` against the item's `components`. Check these TODOs before assuming
booking/return logic is enforced.

## Build phases

See `PROJECT_PLAN_V2.md` §5 for full detail. Order: Phase 1 core operations (item
intake, bookings, returns, dashboard) → Phase 2 bookkeeping (payments, expenses, P&L,
GST invoices) → Phase 3 AI chatbot → Phase 4 backlog (QR labels, WhatsApp reminders,
etc). Don't build ahead of the current phase without checking in.

## Open questions (not something to guess at)

Current HSN code(s) and GST rate(s) for `bookings.hsn_code`/`tax_rate` need
confirmation from the family's CA — see `PROJECT_PLAN_V2.md` §6. Don't hardcode a
guessed value; leave these configurable/nullable until confirmed.
