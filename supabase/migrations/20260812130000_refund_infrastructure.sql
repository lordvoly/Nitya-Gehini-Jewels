-- Refund infrastructure: lost-and-found item charges + cancel-with-refund
-- (both remove-single-item and whole-booking). See PROJECT_PLAN_V2.md.
--
-- SIGN CONVENTION — read this before touching either flow below, since the
-- two use opposite-signed payments rows for reasons that only make sense
-- together:
--
-- booking_financials computes balance_due = active price_charged -
-- sum(payments.amount), completely unchanged by this migration ("no new
-- math needed anywhere balance_due is already computed" was the explicit
-- design goal) — so every new money-movement here is expressed purely
-- through the SIGN of a payments.amount value, never a schema/view change:
--
--   • A lost-item CHARGE (type='payment', amount NEGATIVE) — no cash
--     actually changes hands at charge time; this is a bookkeeping entry
--     saying "the customer now owes more." Subtracting from total_paid is
--     what makes balance_due go UP by exactly the charge amount.
--   • RESOLVING that charge (type='refund', amount POSITIVE) — settles the
--     earlier charge back out, bringing balance_due back down. If the
--     resolve amount equals the original charge, the two rows net to zero
--     — a permanent audit trail with no lasting balance impact.
--   • An actual refund — removing an item that would leave the customer
--     overpaid, or cancelling a whole booking (type='refund', amount
--     NEGATIVE) — this is real money leaving the shop, so it reduces
--     total_paid the same way a lost-item charge does, for the opposite
--     real-world reason.
--
-- payments.amount already has no positivity constraint (checked directly
-- against the live schema before writing this), so no constraint needs
-- relaxing for any of the above.

create type payment_type as enum ('payment', 'refund');
alter table payments add column type payment_type not null default 'payment';

-- One row per lost/damaged component charged at return time. resolved =
-- false is exactly the "still outstanding" set the universal outstanding-
-- charges view lists, across every booking — resolving it is the only way
-- a row leaves that set, and it always does so by writing a linked refund
-- payment (refund_payment_id), never by deleting the row.
create table item_charges (
  id uuid primary key default gen_random_uuid(),
  booking_item_id uuid not null references booking_items(id) on delete cascade,
  description text not null,
  charge_amount numeric not null check (charge_amount > 0),
  charged_at date not null default ist_today(),
  resolved boolean not null default false,
  resolved_at date,
  refund_amount numeric,
  refund_payment_id uuid references payments(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint resolved_fields_together
    check (
      (resolved = false and resolved_at is null and refund_amount is null and refund_payment_id is null)
      or
      (resolved = true and resolved_at is not null and refund_amount is not null and refund_payment_id is not null)
    )
);

create index item_charges_booking_item_id_idx on item_charges(booking_item_id);
-- Partial index on the one query the outstanding-charges view actually
-- runs (where resolved = false) — the resolved=true rows pile up over time
-- but are never listed that way.
create index item_charges_unresolved_idx on item_charges(booking_item_id) where resolved = false;

create trigger item_charges_set_updated_at
  before update on item_charges
  for each row execute function set_updated_at();
