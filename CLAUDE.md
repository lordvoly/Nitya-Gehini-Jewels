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

**In progress / unverified:** `ItemsPage.tsx`'s camera capture
(`capture="environment"` on the photo input) has only been exercised via a desktop
file picker through browser automation — not on an actual phone. Confirm that works
before the real opening-stock entry session.

**Known gap, parked on purpose:** items have no way to be retired (hidden from new
bookings while keeping history) — see the note in `PROJECT_PLAN_V2.md` §3 under
`items`. Revisit once bookings exist and items accumulate real history.

**Next step:** Per `PROJECT_PLAN_V2.md` §5's Phase 1 order, build out
`BookingsPage.tsx` next (rental/sale creation with conflict detection, returns
processing) — `customers` and `items` now both exist so the FK requirements are
satisfied. `backend/src/routes/bookings.ts` still has its `TODO(Phase 1)` gaps
(conflict detection, return-checklist population) unresolved; `DashboardPage.tsx` is
still a placeholder stub.

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
