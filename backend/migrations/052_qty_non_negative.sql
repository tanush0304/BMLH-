-- =====================================================================
-- 052_qty_non_negative.sql   (written 2026-11-15, NOT run)
--
-- CHECK (col >= 0) on the quantity columns that have no CHECK yet:
--   "production log hours"         qty_produced, qty_rejected, qty_rework
--   "raw material transactions"    qty
--   "wip transactions"             qty
--   "finished goods transactions"  qty
--   "job order dispatch"           qty
--   "job order receipt"            qty_received
--   "raw material requisitions"    qty_required
--
-- Only >= 0 -- no integer rule (the screens enforce whole pieces; RM keeps
-- decimals). A column that already has ANY check constraint on it is
-- skipped. Each constraint is added NOT VALID first (no table scan, new rows
-- checked at once), then VALIDATEd in a separate statement (existing rows).
-- Every statement stands alone (the Supabase SQL editor commits each one);
-- no temp tables. Run PREVIEW first: if it lists any row below 0, fix those
-- rows before CHANGE step 2 (VALIDATE would fail on them).
-- =====================================================================


-- =====================================================================
-- PREVIEW (read-only)
-- =====================================================================

-- P1. Rows below 0 (must be empty before the VALIDATE statements).
select 'production log hours' as tbl, id, 'qty_produced' as col, qty_produced::text as value from public."production log hours" where qty_produced < 0
union all select 'production log hours', id, 'qty_rejected', qty_rejected::text from public."production log hours" where qty_rejected < 0
union all select 'production log hours', id, 'qty_rework',   qty_rework::text   from public."production log hours" where qty_rework < 0
union all select 'raw material transactions',   id, 'qty', qty::text from public."raw material transactions"   where qty < 0
union all select 'wip transactions',            id, 'qty', qty::text from public."wip transactions"            where qty < 0
union all select 'finished goods transactions', id, 'qty', qty::text from public."finished goods transactions" where qty < 0
union all select 'job order dispatch',          id, 'qty', qty::text from public."job order dispatch"          where qty < 0
union all select 'job order receipt',           id, 'qty_received', qty_received::text from public."job order receipt" where qty_received < 0
union all select 'raw material requisitions',   id, 'qty_required', qty_required::text from public."raw material requisitions" where qty_required < 0
order by 1, 2;

-- P2. Check constraints that already cover these columns (those columns are skipped).
select c.conrelid::regclass as tbl, a.attname as col, c.conname, pg_get_constraintdef(c.oid) as def
from pg_constraint c
join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
where c.contype = 'c'
  and (c.conrelid, a.attname) in (
    ('public."production log hours"'::regclass, 'qty_produced'),
    ('public."production log hours"'::regclass, 'qty_rejected'),
    ('public."production log hours"'::regclass, 'qty_rework'),
    ('public."raw material transactions"'::regclass, 'qty'),
    ('public."wip transactions"'::regclass, 'qty'),
    ('public."finished goods transactions"'::regclass, 'qty'),
    ('public."job order dispatch"'::regclass, 'qty'),
    ('public."job order receipt"'::regclass, 'qty_received'),
    ('public."raw material requisitions"'::regclass, 'qty_required'))
order by 1, 2;


-- =====================================================================
-- CHANGE step 1 -- add NOT VALID (one statement per column; skipped when
-- the column already has a check constraint or ours exists)
-- =====================================================================

do $$ begin if not exists (select 1 from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey) where c.contype = 'c' and c.conrelid = 'public."production log hours"'::regclass and a.attname = 'qty_produced') then
  alter table public."production log hours" add constraint production_log_hours_qty_produced_nonneg check (qty_produced >= 0) not valid; end if; end $$;

do $$ begin if not exists (select 1 from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey) where c.contype = 'c' and c.conrelid = 'public."production log hours"'::regclass and a.attname = 'qty_rejected') then
  alter table public."production log hours" add constraint production_log_hours_qty_rejected_nonneg check (qty_rejected >= 0) not valid; end if; end $$;

do $$ begin if not exists (select 1 from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey) where c.contype = 'c' and c.conrelid = 'public."production log hours"'::regclass and a.attname = 'qty_rework') then
  alter table public."production log hours" add constraint production_log_hours_qty_rework_nonneg check (qty_rework >= 0) not valid; end if; end $$;

do $$ begin if not exists (select 1 from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey) where c.contype = 'c' and c.conrelid = 'public."raw material transactions"'::regclass and a.attname = 'qty') then
  alter table public."raw material transactions" add constraint raw_material_transactions_qty_nonneg check (qty >= 0) not valid; end if; end $$;

do $$ begin if not exists (select 1 from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey) where c.contype = 'c' and c.conrelid = 'public."wip transactions"'::regclass and a.attname = 'qty') then
  alter table public."wip transactions" add constraint wip_transactions_qty_nonneg check (qty >= 0) not valid; end if; end $$;

do $$ begin if not exists (select 1 from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey) where c.contype = 'c' and c.conrelid = 'public."finished goods transactions"'::regclass and a.attname = 'qty') then
  alter table public."finished goods transactions" add constraint finished_goods_transactions_qty_nonneg check (qty >= 0) not valid; end if; end $$;

do $$ begin if not exists (select 1 from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey) where c.contype = 'c' and c.conrelid = 'public."job order dispatch"'::regclass and a.attname = 'qty') then
  alter table public."job order dispatch" add constraint job_order_dispatch_qty_nonneg check (qty >= 0) not valid; end if; end $$;

do $$ begin if not exists (select 1 from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey) where c.contype = 'c' and c.conrelid = 'public."job order receipt"'::regclass and a.attname = 'qty_received') then
  alter table public."job order receipt" add constraint job_order_receipt_qty_received_nonneg check (qty_received >= 0) not valid; end if; end $$;

do $$ begin if not exists (select 1 from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey) where c.contype = 'c' and c.conrelid = 'public."raw material requisitions"'::regclass and a.attname = 'qty_required') then
  alter table public."raw material requisitions" add constraint raw_material_requisitions_qty_required_nonneg check (qty_required >= 0) not valid; end if; end $$;


-- =====================================================================
-- CHANGE step 2 -- VALIDATE (separate statements; only constraints that
-- step 1 added and that are not yet validated)
-- =====================================================================

do $$ begin if exists (select 1 from pg_constraint where conname = 'production_log_hours_qty_produced_nonneg' and not convalidated) then
  alter table public."production log hours" validate constraint production_log_hours_qty_produced_nonneg; end if; end $$;

do $$ begin if exists (select 1 from pg_constraint where conname = 'production_log_hours_qty_rejected_nonneg' and not convalidated) then
  alter table public."production log hours" validate constraint production_log_hours_qty_rejected_nonneg; end if; end $$;

do $$ begin if exists (select 1 from pg_constraint where conname = 'production_log_hours_qty_rework_nonneg' and not convalidated) then
  alter table public."production log hours" validate constraint production_log_hours_qty_rework_nonneg; end if; end $$;

do $$ begin if exists (select 1 from pg_constraint where conname = 'raw_material_transactions_qty_nonneg' and not convalidated) then
  alter table public."raw material transactions" validate constraint raw_material_transactions_qty_nonneg; end if; end $$;

do $$ begin if exists (select 1 from pg_constraint where conname = 'wip_transactions_qty_nonneg' and not convalidated) then
  alter table public."wip transactions" validate constraint wip_transactions_qty_nonneg; end if; end $$;

do $$ begin if exists (select 1 from pg_constraint where conname = 'finished_goods_transactions_qty_nonneg' and not convalidated) then
  alter table public."finished goods transactions" validate constraint finished_goods_transactions_qty_nonneg; end if; end $$;

do $$ begin if exists (select 1 from pg_constraint where conname = 'job_order_dispatch_qty_nonneg' and not convalidated) then
  alter table public."job order dispatch" validate constraint job_order_dispatch_qty_nonneg; end if; end $$;

do $$ begin if exists (select 1 from pg_constraint where conname = 'job_order_receipt_qty_received_nonneg' and not convalidated) then
  alter table public."job order receipt" validate constraint job_order_receipt_qty_received_nonneg; end if; end $$;

do $$ begin if exists (select 1 from pg_constraint where conname = 'raw_material_requisitions_qty_required_nonneg' and not convalidated) then
  alter table public."raw material requisitions" validate constraint raw_material_requisitions_qty_required_nonneg; end if; end $$;

notify pgrst, 'reload schema';


-- =====================================================================
-- VERIFICATION (read-only) -- expect every row convalidated = true; a
-- column missing here had its own check already (see PREVIEW P2).
-- =====================================================================
select conrelid::regclass as tbl, conname, convalidated, pg_get_constraintdef(oid) as def
from pg_constraint
where conname in (
  'production_log_hours_qty_produced_nonneg', 'production_log_hours_qty_rejected_nonneg', 'production_log_hours_qty_rework_nonneg',
  'raw_material_transactions_qty_nonneg', 'wip_transactions_qty_nonneg', 'finished_goods_transactions_qty_nonneg',
  'job_order_dispatch_qty_nonneg', 'job_order_receipt_qty_received_nonneg', 'raw_material_requisitions_qty_required_nonneg')
order by 1, 2;


-- =====================================================================
-- ROLLBACK (drops only the constraints this file adds)
-- =====================================================================
-- alter table public."production log hours"        drop constraint if exists production_log_hours_qty_produced_nonneg;
-- alter table public."production log hours"        drop constraint if exists production_log_hours_qty_rejected_nonneg;
-- alter table public."production log hours"        drop constraint if exists production_log_hours_qty_rework_nonneg;
-- alter table public."raw material transactions"   drop constraint if exists raw_material_transactions_qty_nonneg;
-- alter table public."wip transactions"            drop constraint if exists wip_transactions_qty_nonneg;
-- alter table public."finished goods transactions" drop constraint if exists finished_goods_transactions_qty_nonneg;
-- alter table public."job order dispatch"          drop constraint if exists job_order_dispatch_qty_nonneg;
-- alter table public."job order receipt"           drop constraint if exists job_order_receipt_qty_received_nonneg;
-- alter table public."raw material requisitions"   drop constraint if exists raw_material_requisitions_qty_required_nonneg;
-- notify pgrst, 'reload schema';
