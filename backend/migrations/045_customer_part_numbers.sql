-- 045_customer_part_numbers.sql
-- Customer part numbers: many per customer, one per (customer, OUR part).
--
--   1. New table "customer part numbers": customer_id -> customers master,
--      part_serial_number -> products master (our part), customer part
--      number (REQUIRED, trimmed, non-blank), customer part name, customer
--      drawing ref, revision, is_active, created_at / updated_at.
--      One ACTIVE row per (customer, part) -- partial unique index.
--      Deactivate instead of delete.
--   2. Guard trigger: trims text (blank -> null; part number stays required),
--      customer / part can't change after insert, a friendly message when a
--      second active row for the same customer + part is saved/re-activated.
--   3. Backfill: one row per customer from the old section-7 fields
--      (customer_product_part_number / _part_name / customer_drawing_ref_no /
--      revision_drawing_no) -- ONLY when our part can be found unambiguously:
--        step 1  orders       the customer has exactly one distinct part on
--                             "customer orders"
--        step 2  drawing ref  customer_drawing_ref_no = exactly one product's
--                             part_drawing_reference_number
--        step 3  part number  customer_product_part_number = exactly one
--                             product's part_serial_number
--        step 4  part name    customer_product_part_name = exactly one
--                             product's part_name
--      (all compares trimmed + case-insensitive; a step that finds 0 or 2+
--       parts gives nothing). Every step that finds a part must find the SAME
--      part, else the customer is a CONFLICT. SKIPPED (not inserted, listed
--      in PREVIEW b): no customer part number, unmatched, conflict.
--      The old "customers master" columns are KEPT (no drop, no change).
--   4. RLS + grants like 042: authenticated select / insert / update, no
--      delete, nothing for anon.
--
-- The frontend works before this is run (the section and every customer
-- part number field / column are hidden until the table exists).
--
-- Re-runnable: every statement is idempotent (if not exists / or replace /
-- drop ... if exists / insert ... where not exists), so it can also be run
-- statement by statement.
-- Run PREVIEW alone first, then everything from CHANGE down, then
-- VERIFICATION.

-- ---------------------------------------------------------------- PREVIEW
-- a) Table must not exist yet on the first run: expect null.
select to_regclass('public."customer part numbers"') as existing_table;

-- b) EVERY customer with any section-7 value filled, and what happens to it.
--    status = 'insert' -> a row will be created (our_part, match_steps);
--    'skip: ...'       -> nothing inserted; candidates shows what each step
--                         found (conflicts list both / all parts).
--    (On a re-run, customers that already have an active row for that part
--     are skipped by CHANGE 3 -- see VERIFICATION 2.)
with src as (
  select c.customer_id, c.customer_name,
         nullif(btrim(c.customer_product_part_number), '') as cpn,
         nullif(btrim(c.customer_product_part_name), '')   as cpname,
         nullif(btrim(c.customer_drawing_ref_no), '')      as cdrw,
         nullif(btrim(c.revision_drawing_no), '')          as rev
  from public."customers master" c
  where coalesce(btrim(c.customer_product_part_number), '') <> ''
     or coalesce(btrim(c.customer_product_part_name), '')   <> ''
     or coalesce(btrim(c.customer_drawing_ref_no), '')      <> ''
     or coalesce(btrim(c.revision_drawing_no), '')          <> ''
),
cand as (
  select s.customer_id, 1 as step, 'orders' as how, min(o.part_serial_number) as part
  from src s join public."customer orders" o on o.customer_id = s.customer_id
  where o.part_serial_number is not null
  group by s.customer_id having count(distinct o.part_serial_number) = 1
  union all
  select s.customer_id, 2, 'drawing ref', min(p.part_serial_number)
  from src s join public."products master" p
    on lower(btrim(p.part_drawing_reference_number)) = lower(s.cdrw)
  group by s.customer_id having count(*) = 1
  union all
  select s.customer_id, 3, 'part number', min(p.part_serial_number)
  from src s join public."products master" p
    on lower(btrim(p.part_serial_number)) = lower(s.cpn)
  group by s.customer_id having count(*) = 1
  union all
  select s.customer_id, 4, 'part name', min(p.part_serial_number)
  from src s join public."products master" p
    on lower(btrim(p.part_name)) = lower(s.cpname)
  group by s.customer_id having count(*) = 1
),
agg as (
  select customer_id,
         count(distinct part) as n_parts,
         min(part) as part,
         string_agg(how, ' + ' order by step) as steps,
         string_agg(how || ' -> ' || part, '; ' order by step) as candidates
  from cand group by customer_id
)
select s.customer_id, s.customer_name,
       case
         when s.cpn is null       then 'skip: no customer part number'
         when a.customer_id is null then 'skip: unmatched (no step found one of our parts)'
         when a.n_parts > 1       then 'skip: conflict (steps found different parts)'
         else 'insert'
       end as status,
       case when s.cpn is not null and a.n_parts = 1 then a.part end as our_part,
       case when s.cpn is not null and a.n_parts = 1 then a.steps end as match_steps,
       a.candidates,
       s.cpn as customer_part_number, s.cpname as customer_part_name,
       s.cdrw as customer_drawing_ref, s.rev as revision
from src s left join agg a on a.customer_id = s.customer_id
order by (case when s.cpn is not null and a.n_parts = 1 then 0 else 1 end), s.customer_id;

-- c) Totals of b): expect insert + skipped = customers_with_values.
--    (Same logic as b, counted.)
with src as (
  select c.customer_id,
         nullif(btrim(c.customer_product_part_number), '') as cpn,
         nullif(btrim(c.customer_product_part_name), '')   as cpname,
         nullif(btrim(c.customer_drawing_ref_no), '')      as cdrw
  from public."customers master" c
  where coalesce(btrim(c.customer_product_part_number), '') <> ''
     or coalesce(btrim(c.customer_product_part_name), '')   <> ''
     or coalesce(btrim(c.customer_drawing_ref_no), '')      <> ''
     or coalesce(btrim(c.revision_drawing_no), '')          <> ''
),
cand as (
  select s.customer_id, min(o.part_serial_number) as part
  from src s join public."customer orders" o on o.customer_id = s.customer_id
  where o.part_serial_number is not null
  group by s.customer_id having count(distinct o.part_serial_number) = 1
  union all
  select s.customer_id, min(p.part_serial_number) from src s join public."products master" p
    on lower(btrim(p.part_drawing_reference_number)) = lower(s.cdrw)
  group by s.customer_id having count(*) = 1
  union all
  select s.customer_id, min(p.part_serial_number) from src s join public."products master" p
    on lower(btrim(p.part_serial_number)) = lower(s.cpn)
  group by s.customer_id having count(*) = 1
  union all
  select s.customer_id, min(p.part_serial_number) from src s join public."products master" p
    on lower(btrim(p.part_name)) = lower(s.cpname)
  group by s.customer_id having count(*) = 1
),
agg as (select customer_id, count(distinct part) as n_parts from cand group by customer_id)
select count(*) as customers_with_values,
       count(*) filter (where s.cpn is not null and a.n_parts = 1) as to_insert,
       count(*) filter (where s.cpn is null) as skip_no_part_number,
       count(*) filter (where s.cpn is not null and a.customer_id is null) as skip_unmatched,
       count(*) filter (where s.cpn is not null and a.n_parts > 1) as skip_conflict
from src s left join agg a on a.customer_id = s.customer_id;

-- ----------------------------------------------------------------- CHANGE
begin;

-- 1. Table ---------------------------------------------------------------
create table if not exists public."customer part numbers" (
  id                   bigint generated always as identity primary key,
  customer_id          text not null references public."customers master"(customer_id),
  part_serial_number   text not null references public."products master"(part_serial_number),
  customer_part_number text not null,
  customer_part_name   text,
  customer_drawing_ref text,
  revision             text,
  is_active            boolean not null default true,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint customer_part_numbers_cpn_not_blank check (btrim(customer_part_number) <> ''),
  constraint customer_part_numbers_cpn_trimmed check (customer_part_number = btrim(customer_part_number))
);

comment on table public."customer part numbers" is
  'Customer part number per (customer, our part) (045). One active row per customer + part; deactivate instead of delete.';

-- one ACTIVE row per customer + our part
create unique index if not exists customer_part_numbers_one_active
  on public."customer part numbers" (customer_id, part_serial_number) where is_active;

create index if not exists customer_part_numbers_part_idx
  on public."customer part numbers" (part_serial_number);

-- 2. Guard + touch trigger ---------------------------------------------------
create or replace function public.guard_customer_part_number() returns trigger
language plpgsql set search_path = public as $$
begin
  new.customer_part_number := btrim(coalesce(new.customer_part_number, ''));
  if new.customer_part_number = '' then
    raise exception 'Customer Part No is required.' using errcode = '23514';
  end if;
  new.customer_part_name   := nullif(btrim(new.customer_part_name), '');
  new.customer_drawing_ref := nullif(btrim(new.customer_drawing_ref), '');
  new.revision             := nullif(btrim(new.revision), '');

  if tg_op = 'UPDATE' then
    if new.customer_id is distinct from old.customer_id
       or new.part_serial_number is distinct from old.part_serial_number then
      raise exception 'Customer and part of a customer part number can''t be changed -- deactivate it and add a new one.'
        using errcode = '23514';
    end if;
    if new.created_at is distinct from old.created_at then
      new.created_at := old.created_at;
    end if;
    new.updated_at := now();
  end if;

  if new.is_active and (tg_op = 'INSERT' or not old.is_active) and exists (
    select 1 from "customer part numbers" x
    where x.customer_id = new.customer_id
      and x.part_serial_number = new.part_serial_number
      and x.is_active
      and x.id <> new.id
  ) then
    raise exception '% already has an active customer part number for this customer -- edit it instead.',
      new.part_serial_number using errcode = '23505';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_customer_part_number_guard on public."customer part numbers";
create trigger trg_customer_part_number_guard
  before insert or update on public."customer part numbers"
  for each row execute function public.guard_customer_part_number();

-- 3. Backfill (same logic as PREVIEW b, status = 'insert' only; skips a
--    customer + part that already has an active row, so a re-run adds
--    nothing) ----------------------------------------------------------------
insert into public."customer part numbers"
  (customer_id, part_serial_number, customer_part_number, customer_part_name,
   customer_drawing_ref, revision, is_active)
with src as (
  select c.customer_id,
         nullif(btrim(c.customer_product_part_number), '') as cpn,
         nullif(btrim(c.customer_product_part_name), '')   as cpname,
         nullif(btrim(c.customer_drawing_ref_no), '')      as cdrw,
         nullif(btrim(c.revision_drawing_no), '')          as rev
  from public."customers master" c
  where coalesce(btrim(c.customer_product_part_number), '') <> ''
),
cand as (
  select s.customer_id, min(o.part_serial_number) as part
  from src s join public."customer orders" o on o.customer_id = s.customer_id
  where o.part_serial_number is not null
  group by s.customer_id having count(distinct o.part_serial_number) = 1
  union all
  select s.customer_id, min(p.part_serial_number) from src s join public."products master" p
    on lower(btrim(p.part_drawing_reference_number)) = lower(s.cdrw)
  group by s.customer_id having count(*) = 1
  union all
  select s.customer_id, min(p.part_serial_number) from src s join public."products master" p
    on lower(btrim(p.part_serial_number)) = lower(s.cpn)
  group by s.customer_id having count(*) = 1
  union all
  select s.customer_id, min(p.part_serial_number) from src s join public."products master" p
    on lower(btrim(p.part_name)) = lower(s.cpname)
  group by s.customer_id having count(*) = 1
),
agg as (
  select customer_id, min(part) as part
  from cand group by customer_id having count(distinct part) = 1
)
select s.customer_id, a.part, s.cpn, s.cpname, s.cdrw, s.rev, true
from src s join agg a on a.customer_id = s.customer_id
where not exists (
  select 1 from public."customer part numbers" x
  where x.customer_id = s.customer_id and x.part_serial_number = a.part and x.is_active
);

-- 4. RLS + grants ------------------------------------------------------------
alter table public."customer part numbers" enable row level security;

drop policy if exists "authenticated read customer part numbers" on public."customer part numbers";
create policy "authenticated read customer part numbers"
  on public."customer part numbers" for select to authenticated using (true);
drop policy if exists "authenticated insert customer part numbers" on public."customer part numbers";
create policy "authenticated insert customer part numbers"
  on public."customer part numbers" for insert to authenticated with check (true);
drop policy if exists "authenticated update customer part numbers" on public."customer part numbers";
create policy "authenticated update customer part numbers"
  on public."customer part numbers" for update to authenticated using (true) with check (true);

revoke all on public."customer part numbers" from anon, authenticated;
grant select, insert, update on public."customer part numbers" to authenticated;
grant all on public."customer part numbers" to service_role;
revoke all on sequence public."customer part numbers_id_seq" from anon;
grant usage, select on sequence public."customer part numbers_id_seq" to authenticated;

revoke all on function public.guard_customer_part_number() from public, anon;

commit;

notify pgrst, 'reload schema';

-- ----------------------------------------------------------- VERIFICATION
-- 1. Rows: expect rows = active = PREVIEW c) to_insert on the first run;
--    one row per customer.
select count(*) as rows, count(*) filter (where is_active) as active,
       count(distinct customer_id) as customers
from public."customer part numbers";

-- 2. The rows created, next to the old section-7 values (expect the same
--    values, trimmed).
select n.customer_id, n.part_serial_number, n.customer_part_number,
       n.customer_part_name, n.customer_drawing_ref, n.revision,
       c.customer_product_part_number as old_cpn, c.customer_drawing_ref_no as old_drawing
from public."customer part numbers" n
join public."customers master" c on c.customer_id = n.customer_id
order by n.customer_id, n.part_serial_number;

-- 3. No duplicates among active rows: expect 0 rows.
select customer_id, part_serial_number, count(*)
from public."customer part numbers" where is_active
group by 1, 2 having count(*) > 1;

-- 4. Trigger: expect trg_customer_part_number_guard (INSERT, UPDATE).
select trigger_name, string_agg(event_manipulation, ', ') as events
from information_schema.triggers
where trigger_name = 'trg_customer_part_number_guard'
group by 1;

-- 5. Grants: expect authenticated INSERT / SELECT / UPDATE only; no anon row,
--    no DELETE / TRUNCATE.
select grantee, string_agg(privilege_type, ', ' order by privilege_type) as privileges
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'customer part numbers'
  and grantee in ('anon', 'authenticated')
group by grantee;

-- 6. Policies: expect 3 (select / insert / update).
select policyname, cmd from pg_policies
where tablename = 'customer part numbers' order by cmd;

-- 7. Old columns still there: expect 4 rows.
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'customers master'
  and column_name in ('customer_product_part_number', 'customer_product_part_name',
                      'customer_drawing_ref_no', 'revision_drawing_no');

-- 8. customer_part_number required: expect is_nullable = NO and the two
--    checks customer_part_numbers_cpn_not_blank / _cpn_trimmed.
select column_name, is_nullable from information_schema.columns
where table_schema = 'public' and table_name = 'customer part numbers'
  and column_name = 'customer_part_number';
select conname from pg_constraint
where conrelid = 'public."customer part numbers"'::regclass and contype = 'c' order by conname;

-- ------------------------------------------------------------ ROLLBACK
-- (only if needed, before any app data uses it; the old columns were never
--  touched)
--   drop table if exists public."customer part numbers";
--   drop function if exists public.guard_customer_part_number();
--   notify pgrst, 'reload schema';
