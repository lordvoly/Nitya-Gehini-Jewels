-- payment_amount_edits: full audit history of every correction made to a
-- payment entry's amount. Deliberately scoped to amount only — editing a
-- payment's method/date/notes, or any booking-level field already locked
-- post-completion (price_charged, dates, is_foc), is explicitly out of
-- scope for this feature.
--
-- Every edit is a NEW row here, never an update to a previous one — this
-- is a full history ("Bhaskar should be able to see the history of what
-- was changed and why"), not a single "last edited by" marker that a
-- second correction would silently overwrite.
create table payment_amount_edits (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references payments(id) on delete cascade,
  old_amount numeric not null,
  new_amount numeric not null,
  reason text not null,
  edited_by uuid references users(id),
  edited_at timestamptz not null default now()
);

create index payment_amount_edits_payment_id_idx on payment_amount_edits(payment_id);

-- Same posture as every other data table in this app (see
-- 20260813180000_revoke_anon_authenticated_table_grants.sql): RLS enabled
-- with NO permissive policy. The backend's service-role key is the only
-- reader/writer and bypasses RLS entirely; anon/authenticated have no
-- table-level grant at all (revoked by default for every future table),
-- so there's nothing for a permissive policy to expose even by mistake.
alter table payment_amount_edits enable row level security;

-- edit_payment_amount: the one place a payment's amount can change after
-- creation. Runs the amount UPDATE and the audit-log INSERT inside a
-- single transaction — unlike the non-blocking-warning pattern used
-- elsewhere in this app for optional secondary writes (e.g. the advance
-- payment at booking creation), the audit entry here is not optional, so
-- a log-write failure must roll back the amount change too rather than
-- leave the two out of sync.
create or replace function edit_payment_amount(
  p_payment_id uuid,
  p_new_amount numeric,
  p_reason text,
  p_edited_by uuid
) returns payments
language plpgsql
as $$
declare
  v_old_amount numeric;
  v_payment payments;
begin
  select amount into v_old_amount from payments where id = p_payment_id for update;
  if not found then
    raise exception 'Payment not found';
  end if;

  update payments set amount = p_new_amount where id = p_payment_id
  returning * into v_payment;

  insert into payment_amount_edits (payment_id, old_amount, new_amount, reason, edited_by)
  values (p_payment_id, v_old_amount, p_new_amount, p_reason, p_edited_by);

  return v_payment;
end;
$$;
