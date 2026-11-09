-- =====================================================================
-- GO-LIVE CLEANUP. NOT a migration. Run by hand in the Supabase SQL
-- editor, AFTER:
--   1. the backup (schema backup_20261106 holds a copy of every public table),
--   2. cleanup_golive_preview.sql (save its P1 / P2 / P7 results;
--      P3, P4 must return no rows; P6 must say postgres | false).
--
-- HOW TO RUN
--   Run PART 1 (BEGIN ... COMMIT) as ONE run: select from "BEGIN;" down
--   to "COMMIT;" and press Run. Any error -- including the safety checks
--   below, which RAISE on purpose -- aborts the whole transaction: nothing
--   is deleted. Then run each PART 2 query on its own, then do PART 3
--   (Storage) by hand. PART 4 (restore) is commented out, for emergencies only.
--
-- WHAT IS EMPTIED (24 tables, all transactional / counter data)
--   complaints:  customer complaint attachments, customer complaints,
--                customer complaint counters
--   quality:     quality log readings, quality logs
--   maintenance: maintenance log items, maintenance logs,
--                maintenance plan  (*) weekly PLANNED visits from the
--                Preventive Maintenance grid = transaction data; the
--                per-machine frequency lives in "maintenance schedule"
--                (kept). To keep the plan, delete its line in step 4 and
--                its line in the c_emptied list.
--   production:  production shift verifications, production log hours,
--                production logs
--   jobwork:     job order receipt, job order dispatch
--   stores:      wip transactions, finished goods transactions,
--                raw material transactions,
--                raw material requisitions (*) REQ- requests, not in your list
--   planning:    production route card stages, production route cards
--                (= the JC tables), production order cancellations,
--                production orders
--   orders:      customer orders, customer po headers, customer enquiries
--   (*) = extra tables found beyond your list.
--
-- WHAT IS KEPT (untouched; rows compared before/after)
--   Masters: customers master, employees master (ALL, incl. DEMO-*),
--     shifts master, suppliers master, vendors master, job work master,
--     vendor job work types, machines master, machine operations,
--     operations master, raw materials master
--     (rows kept, opening_stock -> 0, see step 5), rm suppliers,
--     products master, product raw materials (BOM), cycle time master,
--     production batch master, quality master, maintenance master
--     (checklist items), maintenance schedule.
--   Logins: auth.users, "app users", "user module access".
--   Storage bucket complaint-attachments itself (only its files go, PART 3).
--   All views, functions, triggers, policies, grants -- no schema change.
--
-- GUARD TRIGGERS (checked in the repo, 026 / 028 / 035 / 040):
--   Only three triggers fire on DELETE, all three return at once when
--   is_app_caller() is false, i.e. when current_user is not
--   authenticated/anon -- true for the SQL editor (postgres):
--     production logs      trg_production_logs_verified_lock      (026/028)
--     production log hours trg_production_log_hours_verified_lock (026/028)
--     production log hours trg_production_log_hours_closed_guard  (035)
--   The 027 complaint guard, 025/032/033 edit audits, 034 void, 036 qty
--   guards, 040 machine lock fire on INSERT/UPDATE only (not DELETE).
--   The DELETE revokes (026, 030, 039) apply to anon/authenticated only.
--   The UPDATE of "raw materials master" (step 5) has no guard trigger.
--   => NO trigger is disabled. Step 1 aborts if the caller is an app role.
--
-- DOC NUMBERING after the cleanup (how each is generated):
--   GRN/RMI, WIR/WII, FGR/FGD  022 BEFORE INSERT trigger, max()+1 per
--                              table + prefix          -> empty -> 001
--   JR   create_job_order_receipt (019/021), max()+1   -> JR-001
--   DC   frontend nextSequenceNo over job order dispatch -> DC-001
--   PRD  next_prd_number() (030): max over production orders +
--        cancellations + customer orders.prd_no        -> PRD-001
--   JC   plan_production_orders (030): max over route cards +
--        cancellations                                 -> JC-001
--   QTN  frontend, max over customer enquiries          -> QTN-001
--   REQ  frontend, per year over raw material requisitions -> REQ-2026-001
--   CMP  027 counter table "customer complaint counters" -- the ONLY one
--        that does not reset by itself (never decreases); emptied in step 4
--        -> next = CMP-<year>-0001.
--   None of these use a Postgres sequence. Step 6 also restarts the
--   id (serial/identity) sequences of the emptied tables at 1 --
--   cosmetic (ids are never shown and no doc number comes from them).
-- =====================================================================


-- =====================================================================
-- PART 1 -- the cleanup (one transaction)
-- =====================================================================
BEGIN;

-- ---- Step 1: safety checks. Each RAISE aborts the whole transaction.
do $check$
declare
  c_emptied constant text[] := array[
    'customer complaint attachments','customer complaints','customer complaint counters',
    'quality log readings','quality logs','maintenance log items','maintenance logs','maintenance plan',
    'production shift verifications','production log hours','production logs',
    'job order receipt','job order dispatch','wip transactions','finished goods transactions',
    'raw material transactions','raw material requisitions',
    'production route card stages','production route cards','production order cancellations',
    'production orders','customer orders','customer po headers','customer enquiries'];
  c_kept constant text[] := array[
    'customers master','employees master','shifts master','suppliers master','vendors master',
    'job work master','vendor job work types','machines master','machine operations',
    'operations master','raw materials master','rm suppliers',
    'products master','product raw materials','cycle time master','production batch master',
    'quality master','maintenance master','maintenance schedule',
    'app users','user module access'];
  v_list text;
begin
  -- a) must run as the SQL editor role, so every guard trigger bypasses.
  if is_app_caller() then
    raise exception 'Run this as postgres (SQL editor), not %', current_user;
  end if;

  -- b) the backup must exist (one copy per public table).
  select string_agg(t.table_name, ', ') into v_list
  from information_schema.tables t
  where t.table_schema = 'public' and t.table_type = 'BASE TABLE'
    and not exists (select 1 from information_schema.tables b
                    where b.table_schema = 'backup_20261106' and b.table_name = t.table_name);
  if v_list is not null then
    raise exception 'No copy in backup_20261106 for: %', v_list;
  end if;

  -- c) every public table is classified (a new table would be silently skipped).
  select string_agg(table_name, ', ') into v_list
  from information_schema.tables
  where table_schema = 'public' and table_type = 'BASE TABLE'
    and table_name <> all (c_emptied) and table_name <> all (c_kept);
  if v_list is not null then
    raise exception 'Unclassified public tables (decide empty/keep first): %', v_list;
  end if;

  -- d) no FK from a kept table (any schema) into an emptied one.
  select string_agg(sn.nspname || '.' || src.relname || ' -> ' || tgt.relname, ', ') into v_list
  from pg_constraint con
  join pg_class src on src.oid = con.conrelid join pg_namespace sn on sn.oid = src.relnamespace
  join pg_class tgt on tgt.oid = con.confrelid join pg_namespace tn on tn.oid = tgt.relnamespace
  where con.contype = 'f' and tn.nspname = 'public' and tgt.relname = any (c_emptied)
    and not (sn.nspname = 'public' and src.relname = any (c_emptied));
  if v_list is not null then
    raise exception 'Kept tables reference emptied ones: %', v_list;
  end if;
end
$check$;

-- ---- Step 2: snapshot the kept tables' row counts (temp table, dropped
-- at COMMIT) so step 7 can prove nothing kept was touched.
create temporary table golive_kept on commit drop as
select * from (
            select 'customers master' as t, count(*) as n from "customers master"
  union all select 'employees master',          count(*) from "employees master"
  union all select 'shifts master',             count(*) from "shifts master"
  union all select 'suppliers master',          count(*) from "suppliers master"
  union all select 'vendors master',            count(*) from "vendors master"
  union all select 'job work master',           count(*) from "job work master"
  union all select 'vendor job work types',     count(*) from "vendor job work types"
  union all select 'machines master',           count(*) from "machines master"
  union all select 'machine operations',        count(*) from "machine operations"
  union all select 'operations master',         count(*) from "operations master"
  union all select 'raw materials master',      count(*) from "raw materials master"
  union all select 'rm suppliers',              count(*) from "rm suppliers"
  union all select 'products master',           count(*) from "products master"
  union all select 'product raw materials',     count(*) from "product raw materials"
  union all select 'cycle time master',         count(*) from "cycle time master"
  union all select 'production batch master',   count(*) from "production batch master"
  union all select 'quality master',            count(*) from "quality master"
  union all select 'maintenance master',        count(*) from "maintenance master"
  union all select 'maintenance schedule',      count(*) from "maintenance schedule"
  union all select 'app users',                 count(*) from "app users"
  union all select 'user module access',        count(*) from "user module access"
  union all select 'auth.users',                count(*) from auth.users
) x;

-- ---- Step 3: (nothing to disable -- see GUARD TRIGGERS in the header.)

-- ---- Step 4: delete, children before parents (FK-safe). Plain DELETE
-- (not TRUNCATE) so FKs are checked row by row and any surprise
-- dependency fails loudly instead of cascading.

-- Complaints (027). Attachment rows first; the files are PART 3.
delete from "customer complaint attachments";
delete from "customer complaints";
delete from "customer complaint counters";        -- CMP restarts at 0001

-- Quality
delete from "quality log readings";
delete from "quality logs";

-- Maintenance visits + weekly plan (see (*) in the header)
delete from "maintenance log items";
delete from "maintenance logs";
delete from "maintenance plan";

-- Production: verifications + hours before their logs
delete from "production shift verifications";
delete from "production log hours";
delete from "production logs";

-- Jobwork: receipts before their DCs (incl. Closed Short / voided / edited)
delete from "job order receipt";
delete from "job order dispatch";

-- Stores ledgers (incl. voided rows) + requisitions
delete from "wip transactions";
delete from "finished goods transactions";
delete from "raw material transactions";
delete from "raw material requisitions";

-- Route cards (JC): stages before cards
delete from "production route card stages";
delete from "production route cards";

-- PRDs (030): cancellations + production orders, then PO lines, headers, enquiries
delete from "production order cancellations";
delete from "production orders";
delete from "customer orders";
delete from "customer po headers";
delete from "customer enquiries";

-- ---- Step 5: opening stock -> 0 (DECIDED: active). Row count of
-- "raw materials master" stays the same; only this column changes.
update "raw materials master" set opening_stock = 0 where opening_stock <> 0;

-- ---- Step 6: restart the id sequences of the emptied tables at 1
-- (serial AND identity columns; cosmetic, see NUMBERING in the header).
do $seq$
declare r record;
begin
  for r in
    select pg_get_serial_sequence(format('%I.%I', c.table_schema, c.table_name), c.column_name) as seq
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name in (
        'customer complaint attachments','customer complaints','customer complaint counters',
        'quality log readings','quality logs','maintenance log items','maintenance logs','maintenance plan',
        'production shift verifications','production log hours','production logs',
        'job order receipt','job order dispatch','wip transactions','finished goods transactions',
        'raw material transactions','raw material requisitions',
        'production route card stages','production route cards','production order cancellations',
        'production orders','customer orders','customer po headers','customer enquiries')
  loop
    if r.seq is not null then
      execute format('alter sequence %s restart with 1', r.seq);
    end if;
  end loop;
end
$seq$;

-- ---- Step 7: prove the result inside the transaction. Any problem ->
-- RAISE -> everything above is rolled back.
do $verify$
declare v_bad text;
begin
  -- a) every emptied table is empty
  select string_agg(t, ', ') into v_bad from (
              select 'customer complaint attachments' as t where exists (select 1 from "customer complaint attachments")
    union all select 'customer complaints'            where exists (select 1 from "customer complaints")
    union all select 'customer complaint counters'    where exists (select 1 from "customer complaint counters")
    union all select 'quality log readings'           where exists (select 1 from "quality log readings")
    union all select 'quality logs'                   where exists (select 1 from "quality logs")
    union all select 'maintenance log items'          where exists (select 1 from "maintenance log items")
    union all select 'maintenance logs'               where exists (select 1 from "maintenance logs")
    union all select 'maintenance plan'               where exists (select 1 from "maintenance plan")
    union all select 'production shift verifications' where exists (select 1 from "production shift verifications")
    union all select 'production log hours'           where exists (select 1 from "production log hours")
    union all select 'production logs'                where exists (select 1 from "production logs")
    union all select 'job order receipt'              where exists (select 1 from "job order receipt")
    union all select 'job order dispatch'             where exists (select 1 from "job order dispatch")
    union all select 'wip transactions'               where exists (select 1 from "wip transactions")
    union all select 'finished goods transactions'    where exists (select 1 from "finished goods transactions")
    union all select 'raw material transactions'      where exists (select 1 from "raw material transactions")
    union all select 'raw material requisitions'      where exists (select 1 from "raw material requisitions")
    union all select 'production route card stages'   where exists (select 1 from "production route card stages")
    union all select 'production route cards'         where exists (select 1 from "production route cards")
    union all select 'production order cancellations' where exists (select 1 from "production order cancellations")
    union all select 'production orders'              where exists (select 1 from "production orders")
    union all select 'customer orders'                where exists (select 1 from "customer orders")
    union all select 'customer po headers'            where exists (select 1 from "customer po headers")
    union all select 'customer enquiries'             where exists (select 1 from "customer enquiries")
  ) x;
  if v_bad is not null then
    raise exception 'ABORTED: still has rows: %', v_bad;
  end if;

  -- b) kept tables have the same row counts as in step 2
  select string_agg(format('%s %s -> %s', k.t, k.n, a.n), ', ') into v_bad
  from golive_kept k
  join (
              select 'customers master' as t, count(*) as n from "customers master"
    union all select 'employees master',          count(*) from "employees master"
    union all select 'shifts master',             count(*) from "shifts master"
    union all select 'suppliers master',          count(*) from "suppliers master"
    union all select 'vendors master',            count(*) from "vendors master"
    union all select 'job work master',           count(*) from "job work master"
    union all select 'vendor job work types',     count(*) from "vendor job work types"
    union all select 'machines master',           count(*) from "machines master"
    union all select 'machine operations',        count(*) from "machine operations"
    union all select 'operations master',         count(*) from "operations master"
    union all select 'raw materials master',      count(*) from "raw materials master"
    union all select 'rm suppliers',              count(*) from "rm suppliers"
    union all select 'products master',           count(*) from "products master"
    union all select 'product raw materials',     count(*) from "product raw materials"
    union all select 'cycle time master',         count(*) from "cycle time master"
    union all select 'production batch master',   count(*) from "production batch master"
    union all select 'quality master',            count(*) from "quality master"
    union all select 'maintenance master',        count(*) from "maintenance master"
    union all select 'maintenance schedule',      count(*) from "maintenance schedule"
    union all select 'app users',                 count(*) from "app users"
    union all select 'user module access',        count(*) from "user module access"
    union all select 'auth.users',                count(*) from auth.users
  ) a using (t)
  where a.n <> k.n;
  if v_bad is not null then
    raise exception 'ABORTED: kept table changed: %', v_bad;
  end if;

  -- c) opening stock is 0 everywhere
  if exists (select 1 from "raw materials master" where opening_stock <> 0) then
    raise exception 'ABORTED: opening_stock not 0 on every raw material';
  end if;

  raise notice 'GO-LIVE CLEANUP OK -- committing';
end
$verify$;

COMMIT;


-- =====================================================================
-- PART 2 -- after COMMIT: verification (read-only; run each on its own)
-- =====================================================================

-- ---- V1: emptied tables -- every row must show 0.
select * from (
            select 'customer complaint attachments' as t, count(*) as rows from "customer complaint attachments"
  union all select 'customer complaints',            count(*) from "customer complaints"
  union all select 'customer complaint counters',    count(*) from "customer complaint counters"
  union all select 'quality log readings',           count(*) from "quality log readings"
  union all select 'quality logs',                   count(*) from "quality logs"
  union all select 'maintenance log items',          count(*) from "maintenance log items"
  union all select 'maintenance logs',               count(*) from "maintenance logs"
  union all select 'maintenance plan',               count(*) from "maintenance plan"
  union all select 'production shift verifications', count(*) from "production shift verifications"
  union all select 'production log hours',           count(*) from "production log hours"
  union all select 'production logs',                count(*) from "production logs"
  union all select 'job order receipt',              count(*) from "job order receipt"
  union all select 'job order dispatch',             count(*) from "job order dispatch"
  union all select 'wip transactions',               count(*) from "wip transactions"
  union all select 'finished goods transactions',    count(*) from "finished goods transactions"
  union all select 'raw material transactions',      count(*) from "raw material transactions"
  union all select 'raw material requisitions',      count(*) from "raw material requisitions"
  union all select 'production route card stages',   count(*) from "production route card stages"
  union all select 'production route cards',         count(*) from "production route cards"
  union all select 'production order cancellations', count(*) from "production order cancellations"
  union all select 'production orders',              count(*) from "production orders"
  union all select 'customer orders',                count(*) from "customer orders"
  union all select 'customer po headers',            count(*) from "customer po headers"
  union all select 'customer enquiries',             count(*) from "customer enquiries"
) x order by rows desc, t;

-- ---- V2: kept tables -- live count vs the backup copy (same = ok).
-- Independent of the preview; compare also with preview P2.
select t, live, backup, live = backup as ok from (
            select 'customers master' as t, (select count(*) from public."customers master") as live, (select count(*) from backup_20261106."customers master") as backup
  union all select 'employees master',          (select count(*) from public."employees master"),          (select count(*) from backup_20261106."employees master")
  union all select 'shifts master',             (select count(*) from public."shifts master"),             (select count(*) from backup_20261106."shifts master")
  union all select 'suppliers master',          (select count(*) from public."suppliers master"),          (select count(*) from backup_20261106."suppliers master")
  union all select 'vendors master',            (select count(*) from public."vendors master"),            (select count(*) from backup_20261106."vendors master")
  union all select 'job work master',           (select count(*) from public."job work master"),           (select count(*) from backup_20261106."job work master")
  union all select 'vendor job work types',     (select count(*) from public."vendor job work types"),     (select count(*) from backup_20261106."vendor job work types")
  union all select 'machines master',           (select count(*) from public."machines master"),           (select count(*) from backup_20261106."machines master")
  union all select 'machine operations',        (select count(*) from public."machine operations"),        (select count(*) from backup_20261106."machine operations")
  union all select 'operations master',         (select count(*) from public."operations master"),         (select count(*) from backup_20261106."operations master")
  union all select 'raw materials master',      (select count(*) from public."raw materials master"),      (select count(*) from backup_20261106."raw materials master")
  union all select 'rm suppliers',              (select count(*) from public."rm suppliers"),              (select count(*) from backup_20261106."rm suppliers")
  union all select 'products master',           (select count(*) from public."products master"),           (select count(*) from backup_20261106."products master")
  union all select 'product raw materials',     (select count(*) from public."product raw materials"),     (select count(*) from backup_20261106."product raw materials")
  union all select 'cycle time master',         (select count(*) from public."cycle time master"),         (select count(*) from backup_20261106."cycle time master")
  union all select 'production batch master',   (select count(*) from public."production batch master"),   (select count(*) from backup_20261106."production batch master")
  union all select 'quality master',            (select count(*) from public."quality master"),            (select count(*) from backup_20261106."quality master")
  union all select 'maintenance master',        (select count(*) from public."maintenance master"),        (select count(*) from backup_20261106."maintenance master")
  union all select 'maintenance schedule',      (select count(*) from public."maintenance schedule"),      (select count(*) from backup_20261106."maintenance schedule")
  union all select 'app users',                 (select count(*) from public."app users"),                 (select count(*) from backup_20261106."app users")
  union all select 'user module access',        (select count(*) from public."user module access"),        (select count(*) from backup_20261106."user module access")
) x order by ok, t;

-- ---- V3: opening stock. Expect: rows = preview P2 #112, nonzero = 0.
select count(*) as rows, count(*) filter (where opening_stock <> 0) as nonzero
from "raw materials master";

-- ---- V4: derived views now show nothing / zero movement (spot check).
select (select count(*) from "job order status")            as job_order_status,
       (select count(*) from "wip master")                  as wip_master,
       (select coalesce(sum(current_stock), 0) from "raw material stock balance") as rm_stock_total;

-- ---- V5: tell PostgREST to reload (harmless; no schema change was made).
notify pgrst, 'reload schema';


-- =====================================================================
-- PART 3 -- Storage: complaint attachment FILES (manual)
-- =====================================================================
-- The attachment ROWS are gone (step 4); the files stay in Storage until
-- removed. List them (same as preview P8):
--   select name, created_at from storage.objects
--   where bucket_id = 'complaint-attachments' order by name;
--
-- Remove them in the DASHBOARD: Storage > complaint-attachments > select
-- all files/folders > Delete. Keep the bucket itself (027's policies and
-- size/type limits are on it).
-- Do NOT "delete from storage.objects" in SQL: recent Supabase versions
-- refuse direct deletes there (storage.protect_delete), and on older ones
-- it removes only the metadata row and leaves the file orphaned in the
-- object store.


-- =====================================================================
-- PART 4 -- RESTORE from backup_20261106 (commented; emergencies only)
-- =====================================================================
-- Restores one table's rows exactly as backed up. Run parents before
-- children (reverse of step 4), e.g. customer enquiries, customer po
-- headers, customer orders, production orders, ... , complaint attachments.
-- session_replication_role = replica skips ALL triggers (doc-number,
-- audit, guards, 040 planned-machine) and FK checks for this transaction,
-- so the backed-up values go back unchanged -- restore whole groups of
-- related tables together, since FKs are not checked.
-- "overriding system value" is needed only for GENERATED ALWAYS identity
-- columns; it is harmless otherwise.
--
-- BEGIN;
-- set local session_replication_role = replica;
--
-- insert into public."production orders" overriding system value
-- select * from backup_20261106."production orders";
-- -- (column order must match; if the live table gained a column since
-- --  the backup, list the columns explicitly on both sides.)
--
-- -- put the id sequence after the restored ids:
-- select setval(pg_get_serial_sequence('public."production orders"', 'id'),
--               coalesce((select max(id) from public."production orders"), 0) + 1, false);
-- -- (only for tables with an "id" serial/identity column; "production
-- --  orders" may be keyed by prd_no -- check \d first, skip if null)
--
-- -- opening stock only (rows were never deleted):
-- update public."raw materials master" r
--    set opening_stock = b.opening_stock
--   from backup_20261106."raw materials master" b
--  where b.raw_material_code = r.raw_material_code;
--
-- -- complaint numbers: restore "customer complaint counters" too, or the
-- -- next complaint re-uses a number.
-- COMMIT;
-- notify pgrst, 'reload schema';
