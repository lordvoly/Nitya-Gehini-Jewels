-- Single-row shop settings (name/address/phone) used on printable receipts.
-- Singleton enforced via a boolean primary key that can only ever be true —
-- there is exactly one row, always keyed id = true, never a second row.
create table shop_settings (
  id boolean primary key default true,
  constraint shop_settings_singleton check (id = true),
  name text not null default 'Nitya Gehini Jewels',
  address text not null default '1c-66, Behind Singh Gurudwara, Market No.1, NIT Faridabad 121001',
  phone text not null default '+91 9811457269, +91 9540544091',
  updated_at timestamptz not null default now()
);

insert into shop_settings (id) values (true);

create trigger shop_settings_set_updated_at before update on shop_settings
  for each row execute function set_updated_at();

-- Same backstop-only RLS reasoning as every other table in this app — the
-- backend is the only real writer, using the service role key.
alter table shop_settings enable row level security;

create policy "authenticated users can read shop_settings" on shop_settings
  for select using (auth.role() = 'authenticated');
