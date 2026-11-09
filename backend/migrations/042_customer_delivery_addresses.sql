-- 042_customer_delivery_addresses.sql
-- Phase C: delivery addresses per PO line + Order Type everywhere.
--
--   1. New table "customer delivery addresses" (many per customer, one
--      default, deactivate instead of delete).
--   2. Backfill: each customer's existing delivery_* fields -> one row
--      labelled 'Default' (is_default) when the address is not blank.
--      The old "customers master".delivery_* columns are KEPT (no drop).
--   3. "customer orders".delivery_address_id (nullable FK).
--   4. "customer orders".order_type: null / blank -> 'Manufacturing'.
--   5. Guard trigger on "customer orders": the address must belong to the
--      line's customer; an inactive address is refused on insert (and when
--      an update switches to it). SQL editor / service role bypass via the
--      026 is_app_caller().
--   6. RLS + grants like the other masters after 039: authenticated
--      select / insert / update, no delete, nothing for anon.
--
-- The frontend works before this is run (Deliver To, the address section
-- and address columns are hidden until the table exists).
-- Run PREVIEW alone first, then everything from CHANGE down, then
-- VERIFICATION.

-- ---------------------------------------------------------------- PREVIEW
-- a) Table must not exist yet: expect null.
select to_regclass('public."customer delivery addresses"') as existing_table;

-- b) Column must not exist yet: expect 0 rows.
select column_name
from information_schema.columns
where table_schema = 'public' and table_name = 'customer orders'
  and column_name = 'delivery_address_id';

-- c) Customers that will get a 'Default' address row (= rows inserted).
select count(*) as customers_total,
       count(*) filter (where nullif(trim(delivery_address), '') is not null) as default_rows_to_create
from public."customers master";

-- d) Those rows (check pincodes: anything not 6 digits is stored as null,
--    see CHANGE 2 -- listed here so you can fix it in the master later).
select customer_id, customer_name,
       trim(delivery_address) as address, trim(delivery_city) as city,
       trim(delivery_state) as state, trim(delivery_pincode) as pincode,
       trim(delivery_country) as country,
       (nullif(regexp_replace(coalesce(delivery_pincode, ''), '\s', '', 'g'), '') is not null
        and regexp_replace(delivery_pincode, '\s', '', 'g') !~ '^[0-9]{6}$') as pincode_dropped
from public."customers master"
where nullif(trim(delivery_address), '') is not null
order by customer_id;

-- e) Order lines whose order_type will be set to 'Manufacturing'.
select count(*) as order_lines_total,
       count(*) filter (where nullif(trim(order_type), '') is null) as order_type_to_set
from public."customer orders";

-- f) Current order_type values (expect only Labour / Manufacturing / blank).
select coalesce(order_type, '<null>') as order_type, count(*)
from public."customer orders" group by 1 order by 1;

-- ----------------------------------------------------------------- CHANGE
begin;

-- 1. Table ---------------------------------------------------------------
create table if not exists public."customer delivery addresses" (
  id          bigint generated always as identity primary key,
  customer_id text not null references public."customers master"(customer_id),
  label       text not null,
  address     text,
  city        text,
  state       text,
  pincode     text,
  country     text,
  gstin       text,
  is_default  boolean not null default false,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint customer_delivery_addresses_label_not_blank check (btrim(label) <> ''),
  constraint customer_delivery_addresses_pincode_check
    check (pincode is null or pincode ~ '^[0-9]{6}$'),
  constraint customer_delivery_addresses_gstin_check
    check (gstin is null or gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$'),
  constraint customer_delivery_addresses_default_active
    check (not is_default or is_active),
  constraint customer_delivery_addresses_customer_label_key unique (customer_id, label)
);

comment on table public."customer delivery addresses" is
  'Delivery addresses per customer (042). One default per customer; deactivate instead of delete.';

-- at most one default per customer
create unique index if not exists customer_delivery_addresses_one_default
  on public."customer delivery addresses" (customer_id) where is_default;

-- updated_at
create or replace function public.touch_customer_delivery_address() returns trigger
language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_customer_delivery_address_touch on public."customer delivery addresses";
create trigger trg_customer_delivery_address_touch
  before update on public."customer delivery addresses"
  for each row execute function public.touch_customer_delivery_address();

-- 2. Backfill 'Default' rows (pincode kept only when it is 6 digits) -------
insert into public."customer delivery addresses"
  (customer_id, label, address, city, state, pincode, country, is_default, is_active)
select c.customer_id,
       'Default',
       trim(c.delivery_address),
       nullif(trim(c.delivery_city), ''),
       nullif(trim(c.delivery_state), ''),
       case when regexp_replace(coalesce(c.delivery_pincode, ''), '\s', '', 'g') ~ '^[0-9]{6}$'
            then regexp_replace(c.delivery_pincode, '\s', '', 'g') end,
       nullif(trim(c.delivery_country), ''),
       true,
       true
from public."customers master" c
where nullif(trim(c.delivery_address), '') is not null
on conflict (customer_id, label) do nothing;

-- 3. Order line -> address -------------------------------------------------
alter table public."customer orders"
  add column if not exists delivery_address_id bigint
    references public."customer delivery addresses"(id);

create index if not exists customer_orders_delivery_address_idx
  on public."customer orders" (delivery_address_id);

comment on column public."customer orders".delivery_address_id is
  'Deliver To for this PO line (042). Must belong to the line''s customer.';

-- 4. Order Type backfill (SQL editor = not an app caller, so the 030 line
--    guard lets it through) ------------------------------------------------
update public."customer orders"
set order_type = 'Manufacturing'
where nullif(trim(order_type), '') is null;

-- 5. Guard -----------------------------------------------------------------
create or replace function public.guard_order_line_delivery_address() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_customer text;
  v_active   boolean;
begin
  if not is_app_caller() or new.delivery_address_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE'
     and new.delivery_address_id is not distinct from old.delivery_address_id
     and new.customer_id is not distinct from old.customer_id then
    return new;
  end if;
  select customer_id, is_active into v_customer, v_active
  from "customer delivery addresses" where id = new.delivery_address_id;
  if v_customer is distinct from new.customer_id then
    raise exception 'Delivery address belongs to another customer'
      using errcode = '23514';
  end if;
  if not v_active and (tg_op = 'INSERT'
       or new.delivery_address_id is distinct from old.delivery_address_id) then
    raise exception 'Delivery address is inactive -- pick an active address'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_order_line_delivery_address_guard on public."customer orders";
create trigger trg_order_line_delivery_address_guard
  before insert or update on public."customer orders"
  for each row execute function public.guard_order_line_delivery_address();

-- 6. RLS + grants ------------------------------------------------------------
alter table public."customer delivery addresses" enable row level security;

drop policy if exists "authenticated read customer delivery addresses" on public."customer delivery addresses";
create policy "authenticated read customer delivery addresses"
  on public."customer delivery addresses" for select to authenticated using (true);
drop policy if exists "authenticated insert customer delivery addresses" on public."customer delivery addresses";
create policy "authenticated insert customer delivery addresses"
  on public."customer delivery addresses" for insert to authenticated with check (true);
drop policy if exists "authenticated update customer delivery addresses" on public."customer delivery addresses";
create policy "authenticated update customer delivery addresses"
  on public."customer delivery addresses" for update to authenticated using (true) with check (true);

revoke all on public."customer delivery addresses" from anon, authenticated;
grant select, insert, update on public."customer delivery addresses" to authenticated;
grant all on public."customer delivery addresses" to service_role;
revoke all on sequence public."customer delivery addresses_id_seq" from anon;
grant usage, select on sequence public."customer delivery addresses_id_seq" to authenticated;

revoke all on function public.guard_order_line_delivery_address() from public, anon;
revoke all on function public.touch_customer_delivery_address() from public, anon;

commit;

notify pgrst, 'reload schema';

-- ----------------------------------------------------------- VERIFICATION
-- 1. Default rows: expect = PREVIEW c) default_rows_to_create, defaults = rows.
select count(*) as rows, count(*) filter (where is_default) as defaults,
       count(distinct customer_id) as customers
from public."customer delivery addresses";

-- 2. Order type: expect blank_or_null = 0, total = PREVIEW e) total.
select count(*) as total,
       count(*) filter (where nullif(trim(order_type), '') is null) as blank_or_null,
       count(*) filter (where order_type = 'Manufacturing') as manufacturing
from public."customer orders";

-- 3. New column: expect delivery_address_id | bigint | YES
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'customer orders'
  and column_name = 'delivery_address_id';

-- 4. Triggers: expect trg_order_line_delivery_address_guard (INSERT + UPDATE)
--    on customer orders, trg_customer_delivery_address_touch on the new table.
select event_object_table, trigger_name, string_agg(event_manipulation, ', ') as events
from information_schema.triggers
where trigger_name in ('trg_order_line_delivery_address_guard', 'trg_customer_delivery_address_touch')
group by 1, 2;

-- 5. Grants: expect authenticated INSERT / SELECT / UPDATE only; no anon row,
--    no DELETE / TRUNCATE.
select grantee, string_agg(privilege_type, ', ' order by privilege_type) as privileges
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'customer delivery addresses'
  and grantee in ('anon', 'authenticated')
group by grantee;

-- 6. Policies: expect 3 (select / insert / update).
select policyname, cmd from pg_policies
where tablename = 'customer delivery addresses' order by cmd;

-- 7. Old columns still there: expect 5 rows.
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'customers master'
  and column_name like 'delivery\_%';

-- ------------------------------------------------------------ ROLLBACK
-- (only if needed, before any app data uses it; order_type backfill is not
--  undone)
--   drop trigger if exists trg_order_line_delivery_address_guard on public."customer orders";
--   drop function if exists public.guard_order_line_delivery_address();
--   alter table public."customer orders" drop column if exists delivery_address_id;
--   drop table if exists public."customer delivery addresses";
--   drop function if exists public.touch_customer_delivery_address();
--   notify pgrst, 'reload schema';
