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
