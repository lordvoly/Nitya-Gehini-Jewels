-- Nitya Gehini Jewels — initial schema
-- All business dates are computed against Asia/Kolkata (IST), never the DB server's
-- or client's local timezone. See the ist_today()/ist_now() helpers below and CLAUDE.md.

create extension if not exists "pgcrypto";

-- ── Enums ────────────────────────────────────────────────────────────────

create type item_category as enum (
  'Bridal Set', 'Party Wear', 'Individual', 'American Diamond', 'Temple', 'Other'
);
create type item_type as enum ('set', 'single');
create type tracking_type as enum ('unique', 'quantity');
create type item_status as enum ('available', 'rented_out', 'sold', 'in_maintenance');
create type booking_type as enum ('rental', 'sale');
create type booking_status as enum ('booked', 'out', 'returned', 'completed', 'cancelled');
create type payment_method as enum ('cash', 'UPI', 'card', 'bank_transfer', 'other');
create type expense_category as enum (
  'rent', 'utilities', 'salaries', 'stock_purchase', 'marketing', 'misc', 'other'
);
create type user_role as enum ('admin', 'operator');

-- ── IST date/time helpers ───────────────────────────────────────────────
-- Every "is this overdue / due today / days remaining" calculation must go
-- through these, not now()/current_date, which follow the DB session's timezone.

create function ist_now() returns timestamp
  language sql stable as $$ select now() at time zone 'Asia/Kolkata' $$;

create function ist_today() returns date
  language sql stable as $$ select (now() at time zone 'Asia/Kolkata')::date $$;

-- ── users ────────────────────────────────────────────────────────────────
-- Mirrors Supabase Auth users (id matches auth.users.id) with an app role.

create table users (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  role user_role not null,
  email text not null
);

-- ── items ────────────────────────────────────────────────────────────────

create table items (
  id uuid primary key default gen_random_uuid(),
  item_code text not null unique,
  name text not null,
  category item_category not null,
  item_type item_type not null,
  components jsonb, -- only used when item_type = 'set'; e.g. ["Necklace","Earrings","Tika"]
  tracking_type tracking_type not null,
  quantity_on_hand integer, -- only used when tracking_type = 'quantity'
  status item_status not null default 'available',
  rental_price numeric,
  sale_price numeric,
  security_deposit_default numeric,
  current_location text,
  photos text[] not null default '{}',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint components_only_for_sets
    check (item_type = 'set' or components is null),
  constraint quantity_only_for_quantity_tracking
    check (tracking_type = 'quantity' or quantity_on_hand is null)
);

create index items_category_idx on items(category);
create index items_status_idx on items(status);

-- ── customers ────────────────────────────────────────────────────────────

create table customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null unique,
  email text,
  address text,
  notes text,
  created_at timestamptz not null default now()
);

create index customers_name_idx on customers(name);

-- ── bookings ─────────────────────────────────────────────────────────────

create table bookings (
  id uuid primary key default gen_random_uuid(),
  booking_code text not null unique,
  type booking_type not null,
  item_id uuid not null references items(id),
  quantity_booked integer not null default 1,
  customer_id uuid not null references customers(id),
  pickup_date date not null,
  return_date date, -- required for rentals, enforced below
  actual_return_date date,
  status booking_status not null default 'booked',
  price_charged numeric not null, -- snapshot at booking time; never derive from items.*_price after creation
  deposit_amount numeric not null default 0,
  deposit_collected boolean not null default false,
  deposit_refunded boolean not null default false,
  deposit_refund_date date,
  gst_applicable boolean not null default false,
  gst_invoice_number text,
  hsn_code text,
  tax_rate numeric,
  return_checklist jsonb, -- populated from items.components at return time, e.g. {"Necklace": true}
  return_notes text,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint return_date_required_for_rentals
    check (type = 'sale' or return_date is not null),
  constraint gst_invoice_only_when_applicable
    check (gst_applicable or gst_invoice_number is null)
);

create index bookings_item_idx on bookings(item_id);
create index bookings_customer_idx on bookings(customer_id);
create index bookings_status_idx on bookings(status);
create index bookings_return_date_idx on bookings(return_date);

-- ── payments ─────────────────────────────────────────────────────────────

create table payments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings(id) on delete cascade,
  amount numeric not null,
  payment_date date not null,
  method payment_method not null,
  notes text,
  recorded_by uuid references users(id),
  created_at timestamptz not null default now()
);

create index payments_booking_idx on payments(booking_id);

-- ── expenses ─────────────────────────────────────────────────────────────

create table expenses (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  category expense_category not null,
  amount numeric not null,
  description text,
  recorded_by uuid references users(id),
  created_at timestamptz not null default now()
);

create index expenses_date_idx on expenses(date);

-- ── updated_at triggers ──────────────────────────────────────────────────

create function set_updated_at() returns trigger
  language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger items_set_updated_at before update on items
  for each row execute function set_updated_at();
create trigger bookings_set_updated_at before update on bookings
  for each row execute function set_updated_at();

-- ── Computed views ───────────────────────────────────────────────────────
-- Nothing here is ever written back to `bookings`. Balances, overdue status,
-- and days-until-return are always derived at query time, against IST.

create view booking_financials as
select
  b.id as booking_id,
  b.price_charged,
  coalesce(p.total_paid, 0) as total_paid,
  b.price_charged - coalesce(p.total_paid, 0) as balance_due,
  (b.status = 'out' and b.return_date < ist_today()) as is_overdue,
  (b.return_date - ist_today()) as days_until_return
from bookings b
left join (
  select booking_id, sum(amount) as total_paid
  from payments
  group by booking_id
) p on p.booking_id = b.id;

create view overdue_rentals as
select b.*, bf.balance_due, bf.days_until_return
from bookings b
join booking_financials bf on bf.booking_id = b.id
where b.type = 'rental'
  and b.status = 'out'
  and b.return_date < ist_today();

create view upcoming_returns as
select b.*, bf.balance_due, bf.days_until_return
from bookings b
join booking_financials bf on bf.booking_id = b.id
where b.type = 'rental'
  and b.status = 'out'
  and b.return_date >= ist_today();

-- ── Row Level Security ───────────────────────────────────────────────────
-- The backend is the only writer and reads with the Supabase service role
-- key, which bypasses RLS. These policies exist purely as a backstop in case
-- a client ever talks to Supabase directly (e.g. Storage) — the frontend
-- should otherwise only ever call our own API, never the DB directly.

alter table items enable row level security;
alter table customers enable row level security;
alter table bookings enable row level security;
alter table payments enable row level security;
alter table expenses enable row level security;
alter table users enable row level security;

create policy "authenticated users can read users" on users
  for select using (auth.role() = 'authenticated');
