-- 045_product_customer.sql
-- Link each product to its customer (one product = one customer).
--
--   "products master".customer_id text NULL -> "customers master"(customer_id),
--   plus an index. NO backfill (the seniors fill it in Product Master).
--   Nothing else changes: no trigger, no RLS / grant change (the table's
--   existing grants cover the new column).
--
-- The frontend works before this is run (Product Master's Customer field,
-- the part-by-customer filter and Customer Master's "Products for this
-- customer" card stay hidden / off until the column exists).
--
-- Re-runnable: every statement is idempotent, so it can also be run
-- statement by statement.
-- Run PREVIEW alone first, then CHANGE, then VERIFICATION.

-- ---------------------------------------------------------------- PREVIEW
-- a) Column must not exist yet on the first run: expect 0 rows.
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'products master'
  and column_name = 'customer_id';

-- b) Products (all will start with no customer).
select count(*) as products_total from public."products master";

-- c) Customers that can be picked.
select customer_id, customer_name
from public."customers master"
order by customer_id;

-- ----------------------------------------------------------------- CHANGE
begin;

alter table public."products master"
  add column if not exists customer_id text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'products_master_customer_id_fkey'
      and conrelid = 'public."products master"'::regclass
  ) then
    alter table public."products master"
      add constraint products_master_customer_id_fkey
      foreign key (customer_id) references public."customers master"(customer_id);
  end if;
end;
$$;

create index if not exists products_master_customer_idx
  on public."products master" (customer_id);

comment on column public."products master".customer_id is
  'The customer this part belongs to (045; one product = one customer). Optional for now.';

commit;

notify pgrst, 'reload schema';

-- ----------------------------------------------------------- VERIFICATION
-- 1. Column: expect customer_id | text | YES
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'products master'
  and column_name = 'customer_id';

-- 2. FK: expect products_master_customer_id_fkey -> customers master(customer_id)
select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public."products master"'::regclass and contype = 'f'
  and conname = 'products_master_customer_id_fkey';

-- 3. Index: expect products_master_customer_idx
select indexname from pg_indexes
where schemaname = 'public' and tablename = 'products master'
  and indexname = 'products_master_customer_idx';

-- 4. No backfill: expect with_customer = 0 on the first run, total = PREVIEW b.
select count(*) as total, count(customer_id) as with_customer
from public."products master";

-- ------------------------------------------------------------ ROLLBACK
-- (only if needed)
--   drop index if exists public.products_master_customer_idx;
--   alter table public."products master" drop constraint if exists products_master_customer_id_fkey;
--   alter table public."products master" drop column if exists customer_id;
--   notify pgrst, 'reload schema';
