-- =====================================================================
-- RESET: empty every TRANSACTION table, delete every TEST- master,
-- keep all real masters + all logins. Schema after 037.
-- NOT a migration. Review, then run by hand in the Supabase SQL editor.
--
-- HOW TO RUN -- separate runs, in order:
--   Part A  read-only. A1 = counts + BLOCKERS (every blocker must be 0);
--           A2 = unclassified tables (must return no rows); A3 = FKs from
--           kept tables into emptied ones (must return no rows); A4 = DELETE
--           triggers; A5 = role check; A6 = Storage files. One query each --
--           the SQL editor shows only the last result.
--   Part B  dry run: one DO block that raises its report as an error (rolls back).
--   Part C  the same DO block with c_dry_run = false, then the SELECT below it.
--           (aborts + rolls back by itself if any row is not ok).
--   Part D  optional: restart id sequences (see the notes).
-- Run as the editor's default role (postgres). Every 026-037 guard returns
-- at once when is_app_caller() is false (current_user is not
-- authenticated/anon), and the DELETE revokes apply only to the app roles.
--
-- CLASSIFICATION (public base tables known from the repo; A2 lists any
-- live table missing here -- classify it before running B):
--   TRANSACTION (emptied)
--     customer enquiries, customer po headers, customer orders,
--     production orders, production order cancellations,
--     production route cards, production route card stages,
--     production logs, production log hours, production shift verifications,
--     quality logs, quality log readings,
--     job order dispatch, job order receipt,
--     raw material transactions, wip transactions, finished goods transactions,
--     raw material requisitions,
--     maintenance logs, maintenance log items,
--     maintenance plan            (weekly planned visits -- DEFAULT: emptied;
--                                  see the question in the notes)
--     customer complaints, customer complaint attachments,
--     customer complaint counters
--   MASTER (kept; only TEST- rows deleted)
--     customers master, products master, product raw materials (BOM),
--     cycle time master, production batch master, quality master,
--     raw materials master (opening_stock untouched), rm suppliers,
--     suppliers master, vendors master, job work master,
--     vendor job work types, machines master, machine operations,
--     operations master, maintenance master, maintenance schedule
--     (per-machine frequency + Active/Inactive = master), employees master,
--     shifts master, users master (005 seed, legacy)
--   OTHER (kept, never touched)
--     "app users", "user module access", auth.users, Storage metadata,
--     every view (customer po summary, finished goods master / order status
--     / stock balance, job order status, jobwork stage status, maintenance
--     plan status, order material requirement / shortfall, production log
--     totals, quality log results, raw material stock balance / master,
--     report production hours / setup, report quality inspections, wip
--     master) -- views hold no rows; all functions + triggers stay.
--
-- TEST MASTERS: key LIKE 'TEST-%' on the master's own id column only
-- (customer_id, part_serial_number, raw_material_code, machine_id,
-- vendor_id, job_work_code, supplier_id, employee_id, operation_name).
-- Link rows (BOM, cycle time, batch, quality, rm suppliers, vendor job
-- work, machine operations, maintenance master / schedule) go with their
-- TEST parent. A real master row pointing at a TEST master is a BLOCKER
-- (A1 101..) and is NOT deleted -- except vendor <-> TEST-JW* links, which
-- were agreed as test-only (counted in A1 as info, deleted).
-- A TEST employee linked from "app users".employee_id is KEPT (logins).
--
-- NUMBERING after the reset (all max()+1 over table contents unless noted):
--   PRD  next_prd_number(): production orders + cancellations + legacy
--        customer orders.prd_no -> all emptied -> PRD-001
--   JC   plan_production_orders: route cards + cancellations -> JC-001
--   DC   frontend nextSequenceNo over job order dispatch -> DC-001
--   JR   create_job_order_receipt: job order receipt -> JR-001
--   GRN/RMI/WIR/WII/FGR/FGD  022 trigger, per table + prefix -> -001
--   QTN  frontend generateNextQtnNo over customer enquiries -> QTN-001
--   REQ  frontend, per year over raw material requisitions -> REQ-2026-001
--   CMP  027 counter table (never decreases by itself) -> emptied here ->
--        first insert of a year starts at max(existing)+1 = CMP-2026-0001
--   Voided rows count for numbering too -- they are deleted with the rest.
-- =====================================================================


-- =====================================================================
-- PART A -- read-only
-- =====================================================================

-- ---- A1: rows to delete (1..), TEST masters (50..), BLOCKERS (101..) ---
select * from (
            select 1 as n, 'customer complaint attachments' as t, count(*) as rows from "customer complaint attachments"
  union all select 2,  'customer complaints',            count(*) from "customer complaints"
  union all select 3,  'customer complaint counters',    count(*) from "customer complaint counters"
  union all select 4,  'quality log readings',           count(*) from "quality log readings"
  union all select 5,  'quality logs',                   count(*) from "quality logs"
  union all select 6,  'job order receipt',              count(*) from "job order receipt"
  union all select 7,  'job order dispatch',             count(*) from "job order dispatch"
  union all select 8,  'finished goods transactions',    count(*) from "finished goods transactions"
  union all select 9,  'wip transactions',               count(*) from "wip transactions"
  union all select 10, 'raw material transactions',      count(*) from "raw material transactions"
  union all select 11, 'raw material requisitions',      count(*) from "raw material requisitions"
  union all select 12, 'production shift verifications', count(*) from "production shift verifications"
  union all select 13, 'production log hours',           count(*) from "production log hours"
  union all select 14, 'production logs',                count(*) from "production logs"
  union all select 15, 'production route card stages',   count(*) from "production route card stages"
  union all select 16, 'production route cards',         count(*) from "production route cards"
  union all select 17, 'production order cancellations', count(*) from "production order cancellations"
  union all select 18, 'production orders',              count(*) from "production orders"
  union all select 19, 'customer orders',                count(*) from "customer orders"
  union all select 20, 'customer po headers',            count(*) from "customer po headers"
  union all select 21, 'customer enquiries',             count(*) from "customer enquiries"
  union all select 22, 'maintenance log items',          count(*) from "maintenance log items"
  union all select 23, 'maintenance logs',               count(*) from "maintenance logs"
  union all select 24, 'maintenance plan',               count(*) from "maintenance plan"
  -- ---- TEST masters + their link rows
  union all select 50, 'TEST quality master',            count(*) from "quality master" where part_serial_number like 'TEST-%'
  union all select 51, 'TEST cycle time master',         count(*) from "cycle time master" where part_serial_number like 'TEST-%'
  union all select 52, 'TEST production batch master',   count(*) from "production batch master" where part_serial_number like 'TEST-%'
  union all select 53, 'TEST product raw materials',     count(*) from "product raw materials" where part_serial_number like 'TEST-%'
  union all select 54, 'TEST rm suppliers',              count(*) from "rm suppliers" where raw_material_code like 'TEST-%'
  union all select 55, 'TEST vendor job work types',     count(*) from "vendor job work types" where vendor_id like 'TEST-%' or job_work_code like 'TEST-%'
  union all select 56, 'TEST machine operations',        count(*) from "machine operations" where machine_id like 'TEST-%'
  union all select 57, 'TEST maintenance master',        count(*) from "maintenance master" where machine_id like 'TEST-%'
  union all select 58, 'TEST maintenance schedule',      count(*) from "maintenance schedule" where machine_id like 'TEST-%'
  union all select 59, 'TEST products master',          count(*) from "products master" where part_serial_number like 'TEST-%'
  union all select 60, 'TEST raw materials master',     count(*) from "raw materials master" where raw_material_code like 'TEST-%'
  union all select 61, 'TEST suppliers master',         count(*) from "suppliers master" where supplier_id like 'TEST-%'
  union all select 62, 'TEST vendors master',           count(*) from "vendors master" where vendor_id like 'TEST-%'
  union all select 63, 'TEST job work master',          count(*) from "job work master" where job_work_code like 'TEST-%'
  union all select 64, 'TEST machines master',          count(*) from "machines master" where machine_id like 'TEST-%'
  union all select 65, 'TEST operations master',        count(*) from "operations master" where operation_name like 'TEST-%'
  union all select 66, 'TEST customers master',         count(*) from "customers master" where customer_id like 'TEST-%'
  union all select 67, 'TEST employees master',         count(*) from "employees master" e where e.employee_id like 'TEST-%'
                                                          and not exists (select 1 from "app users" a where a.employee_id = e.employee_id)
  union all select 68, 'INFO TEST employees KEPT (linked to a login)', count(*) from "employees master" e where e.employee_id like 'TEST-%'
                                                          and exists (select 1 from "app users" a where a.employee_id = e.employee_id)
  union all select 69, 'INFO real vendors linked to TEST-JW* (link deleted)', count(*) from "vendor job work types" where job_work_code like 'TEST-%' and vendor_id not like 'TEST-%'
  -- ---- BLOCKERS: real master rows pointing at a TEST master. Must be 0.
  union all select 101, 'BLOCKER real part BOM using a TEST RM',          count(*) from "product raw materials" where raw_material_code like 'TEST-%' and part_serial_number not like 'TEST-%'
  union all select 102, 'BLOCKER real cycle time on a TEST machine',      count(*) from "cycle time master" where machine_id like 'TEST-%' and part_serial_number not like 'TEST-%'
  union all select 103, 'BLOCKER real RM linked to a TEST supplier',      count(*) from "rm suppliers" where supplier_id like 'TEST-%' and raw_material_code not like 'TEST-%'
  union all select 104, 'BLOCKER real machine with a TEST operation',     count(*) from "machine operations" where operation like 'TEST-%' and machine_id not like 'TEST-%'
) x
order by n;

-- ---- A2: public base tables not in the classification. Must be empty.
select table_name from information_schema.tables
where table_schema = 'public' and table_type = 'BASE TABLE'
  and table_name not in (
    -- transaction
    'customer enquiries','customer po headers','customer orders','production orders','production order cancellations',
    'production route cards','production route card stages','production logs','production log hours',
    'production shift verifications','quality logs','quality log readings','job order dispatch','job order receipt',
    'raw material transactions','wip transactions','finished goods transactions','raw material requisitions',
    'maintenance logs','maintenance log items','maintenance plan','customer complaints',
    'customer complaint attachments','customer complaint counters',
    -- master
    'customers master','products master','product raw materials','cycle time master','production batch master',
    'quality master','raw materials master','rm suppliers','suppliers master','vendors master','job work master',
    'vendor job work types','machines master','machine operations','operations master','maintenance master',
    'maintenance schedule','employees master','shifts master','users master','machine operations master',
    -- other (kept)
    'app users','user module access')
order by 1;

-- ---- A3: FKs from a KEPT table (master / other / any schema) into an
-- emptied table. Must be empty -- otherwise the delete fails (NO ACTION) or
-- cascades into kept data (CASCADE / SET NULL).
with emptied(relname) as (values
  ('customer enquiries'),('customer po headers'),('customer orders'),('production orders'),('production order cancellations'),
  ('production route cards'),('production route card stages'),('production logs'),('production log hours'),
  ('production shift verifications'),('quality logs'),('quality log readings'),('job order dispatch'),('job order receipt'),
  ('raw material transactions'),('wip transactions'),('finished goods transactions'),('raw material requisitions'),
  ('maintenance logs'),('maintenance log items'),('maintenance plan'),('customer complaints'),
  ('customer complaint attachments'),('customer complaint counters'))
select sn.nspname || '.' || src.relname as referencing_table, tgt.relname as referenced_table, con.conname,
       case con.confdeltype when 'c' then 'CASCADE' when 'n' then 'SET NULL' when 'd' then 'SET DEFAULT' else 'NO ACTION/RESTRICT' end as on_delete
from pg_constraint con
join pg_class src on src.oid = con.conrelid join pg_namespace sn on sn.oid = src.relnamespace
join pg_class tgt on tgt.oid = con.confrelid join pg_namespace tn on tn.oid = tgt.relnamespace
where con.contype = 'f' and tn.nspname = 'public'
  and tgt.relname in (select relname from emptied)
  and not (sn.nspname = 'public' and src.relname in (select relname from emptied))
order by 1, 2;

-- ---- A4: triggers on DELETE / TRUNCATE. Expected (repo): production logs
-- trg_production_logs_verified_lock; production log hours
-- trg_production_log_hours_verified_lock + trg_production_log_hours_closed_guard
-- -- all return at once for postgres. Read anything else before Part B.
select event_object_table as tbl, trigger_name, action_timing, event_manipulation
from information_schema.triggers
where trigger_schema = 'public' and event_manipulation in ('DELETE', 'TRUNCATE')
order by 1, 2;

-- ---- A5: editor role. Expect: postgres, false.
select current_user, is_app_caller() as is_app_caller;

-- ---- A6: Storage files to delete by hand (complaint-attachments bucket).
select name, created_at from storage.objects where bucket_id = 'complaint-attachments' order by name;


-- =====================================================================
-- PART B -- dry run. ONE self-contained DO block (the Supabase SQL editor
-- does not keep begin; / temp tables across statements). It counts, deletes,
-- counts again, then RAISES AN EXCEPTION whose message is the full
-- before / after / ok table -- the editor shows it as the error, and the
-- exception rolls back every delete automatically. Expect the first line
-- "DRY RUN (rolled back): 0 row(s) not ok".
--
-- PART C -- run the SAME block with ONE change:
--     c_dry_run constant boolean := false;
-- and then the final SELECT below it (in the same run). With false the
-- block commits if every row is ok; if any row is not ok it raises
-- "ABORTED" and still rolls everything back.
-- =====================================================================
do $reset$
declare
  c_dry_run constant boolean := true;   -- PART C: false
  -- One query = every count. kind: tx / test must be 0 after; real / kept
  -- must be unchanged.
  v_sql constant text := $q$
            select 'tx' as kind, 'customer complaint attachments' as t, (select count(*) from "customer complaint attachments")::numeric as rows
  union all select 'tx', 'customer complaints',            (select count(*) from "customer complaints")
  union all select 'tx', 'customer complaint counters',    (select count(*) from "customer complaint counters")
  union all select 'tx', 'quality log readings',           (select count(*) from "quality log readings")
  union all select 'tx', 'quality logs',                   (select count(*) from "quality logs")
  union all select 'tx', 'job order receipt',              (select count(*) from "job order receipt")
  union all select 'tx', 'job order dispatch',             (select count(*) from "job order dispatch")
  union all select 'tx', 'finished goods transactions',    (select count(*) from "finished goods transactions")
  union all select 'tx', 'wip transactions',               (select count(*) from "wip transactions")
  union all select 'tx', 'raw material transactions',      (select count(*) from "raw material transactions")
  union all select 'tx', 'raw material requisitions',      (select count(*) from "raw material requisitions")
  union all select 'tx', 'production shift verifications', (select count(*) from "production shift verifications")
  union all select 'tx', 'production log hours',           (select count(*) from "production log hours")
  union all select 'tx', 'production logs',                (select count(*) from "production logs")
  union all select 'tx', 'production route card stages',   (select count(*) from "production route card stages")
  union all select 'tx', 'production route cards',         (select count(*) from "production route cards")
  union all select 'tx', 'production order cancellations', (select count(*) from "production order cancellations")
  union all select 'tx', 'production orders',              (select count(*) from "production orders")
  union all select 'tx', 'customer orders',                (select count(*) from "customer orders")
  union all select 'tx', 'customer po headers',            (select count(*) from "customer po headers")
  union all select 'tx', 'customer enquiries',             (select count(*) from "customer enquiries")
  union all select 'tx', 'maintenance log items',          (select count(*) from "maintenance log items")
  union all select 'tx', 'maintenance logs',               (select count(*) from "maintenance logs")
  union all select 'tx', 'maintenance plan',               (select count(*) from "maintenance plan")
  union all select 'test', 'quality master',          (select count(*) from "quality master" where part_serial_number like 'TEST-%')
  union all select 'test', 'cycle time master',       (select count(*) from "cycle time master" where part_serial_number like 'TEST-%')
  union all select 'test', 'production batch master', (select count(*) from "production batch master" where part_serial_number like 'TEST-%')
  union all select 'test', 'product raw materials',   (select count(*) from "product raw materials" where part_serial_number like 'TEST-%')
  union all select 'test', 'rm suppliers',            (select count(*) from "rm suppliers" where raw_material_code like 'TEST-%')
  union all select 'test', 'vendor job work types',   (select count(*) from "vendor job work types" where vendor_id like 'TEST-%' or job_work_code like 'TEST-%')
  union all select 'test', 'machine operations',      (select count(*) from "machine operations" where machine_id like 'TEST-%')
  union all select 'test', 'maintenance master',      (select count(*) from "maintenance master" where machine_id like 'TEST-%')
  union all select 'test', 'maintenance schedule',    (select count(*) from "maintenance schedule" where machine_id like 'TEST-%')
  union all select 'test', 'products master',         (select count(*) from "products master" where part_serial_number like 'TEST-%')
  union all select 'test', 'raw materials master',    (select count(*) from "raw materials master" where raw_material_code like 'TEST-%')
  union all select 'test', 'suppliers master',        (select count(*) from "suppliers master" where supplier_id like 'TEST-%')
  union all select 'test', 'vendors master',          (select count(*) from "vendors master" where vendor_id like 'TEST-%')
  union all select 'test', 'job work master',         (select count(*) from "job work master" where job_work_code like 'TEST-%')
  union all select 'test', 'machines master',         (select count(*) from "machines master" where machine_id like 'TEST-%')
  union all select 'test', 'operations master',       (select count(*) from "operations master" where operation_name like 'TEST-%')
  union all select 'test', 'customers master',        (select count(*) from "customers master" where customer_id like 'TEST-%')
  union all select 'test', 'employees master',        (select count(*) from "employees master" e where e.employee_id like 'TEST-%'
                                                         and not exists (select 1 from "app users" a where a.employee_id = e.employee_id))
  union all select 'real', 'quality master',          (select count(*) from "quality master" where part_serial_number not like 'TEST-%')
  union all select 'real', 'cycle time master',       (select count(*) from "cycle time master" where part_serial_number not like 'TEST-%')
  union all select 'real', 'production batch master', (select count(*) from "production batch master" where part_serial_number not like 'TEST-%')
  union all select 'real', 'product raw materials',   (select count(*) from "product raw materials" where part_serial_number not like 'TEST-%')
  union all select 'real', 'rm suppliers',            (select count(*) from "rm suppliers" where raw_material_code not like 'TEST-%')
  union all select 'real', 'vendor job work types',   (select count(*) from "vendor job work types" where vendor_id not like 'TEST-%' and job_work_code not like 'TEST-%')
  union all select 'real', 'machine operations',      (select count(*) from "machine operations" where machine_id not like 'TEST-%')
  union all select 'real', 'maintenance master',      (select count(*) from "maintenance master" where machine_id not like 'TEST-%')
  union all select 'real', 'maintenance schedule',    (select count(*) from "maintenance schedule" where machine_id not like 'TEST-%')
  union all select 'real', 'products master',         (select count(*) from "products master" where part_serial_number not like 'TEST-%')
  union all select 'real', 'raw materials master',    (select count(*) from "raw materials master" where raw_material_code not like 'TEST-%')
  union all select 'real', 'RM opening_stock total',  (select coalesce(sum(opening_stock), 0) from "raw materials master" where raw_material_code not like 'TEST-%')
  union all select 'real', 'suppliers master',        (select count(*) from "suppliers master" where supplier_id not like 'TEST-%')
  union all select 'real', 'vendors master',          (select count(*) from "vendors master" where vendor_id not like 'TEST-%')
  union all select 'real', 'job work master',         (select count(*) from "job work master" where job_work_code not like 'TEST-%')
  union all select 'real', 'machines master',         (select count(*) from "machines master" where machine_id not like 'TEST-%')
  union all select 'real', 'operations master',       (select count(*) from "operations master" where operation_name not like 'TEST-%')
  union all select 'real', 'customers master',        (select count(*) from "customers master" where customer_id not like 'TEST-%')
  union all select 'real', 'employees master',        (select count(*) from "employees master" e where e.employee_id not like 'TEST-%'
                                                         or exists (select 1 from "app users" a where a.employee_id = e.employee_id))
  union all select 'real', 'shifts master',           (select count(*) from "shifts master")
  union all select 'kept', 'app users',               (select count(*) from "app users")
  union all select 'kept', 'user module access',      (select count(*) from "user module access")
  union all select 'kept', 'auth.users',              (select count(*) from auth.users)
  $q$;
  v_before jsonb;
  v_bad    int;
  v_report text;
begin
  if is_app_caller() then
    raise exception 'Run this as postgres (SQL editor default role), not %', current_user;
  end if;

  -- ---- before
  execute 'select jsonb_object_agg(kind || ''|'' || t, rows) from (' || v_sql || ') x' into v_before;

  -- ---- Transactions, children before parents ----------------------------
  -- Complaints (027). Files stay in Storage (A6 / manual step).
  delete from "customer complaint attachments";
  delete from "customer complaints";
  delete from "customer complaint counters";      -- next = CMP-<year>-0001

  -- Quality
  delete from "quality log readings";
  delete from "quality logs";

  -- Jobwork (receipts, then DCs -- incl. Closed Short / edited / voided)
  delete from "job order receipt";
  delete from "job order dispatch";

  -- Stores ledgers (incl. voided rows) + requisitions
  delete from "finished goods transactions";
  delete from "wip transactions";
  delete from "raw material transactions";
  delete from "raw material requisitions";

  -- Production
  delete from "production shift verifications";
  delete from "production log hours";
  delete from "production logs";
  delete from "production route card stages";
  delete from "production route cards";

  -- Orders (030): cancellations + PRDs, then PO lines, headers, enquiries
  delete from "production order cancellations";
  delete from "production orders";
  delete from "customer orders";
  delete from "customer po headers";
  delete from "customer enquiries";

  -- Maintenance transactions (plan = weekly planned visits; see notes)
  delete from "maintenance log items";
  delete from "maintenance logs";
  delete from "maintenance plan";

  -- ---- TEST masters: link rows first, then the masters ------------------
  -- (A real row pointing at a TEST master is NOT deleted: the master delete
  -- then fails on its FK and the whole block rolls back -- fix the A1
  -- blocker first.)
  delete from "quality master"          where part_serial_number like 'TEST-%';
  delete from "cycle time master"       where part_serial_number like 'TEST-%';
  delete from "production batch master" where part_serial_number like 'TEST-%';
  delete from "product raw materials"   where part_serial_number like 'TEST-%';
  delete from "rm suppliers"            where raw_material_code like 'TEST-%';
  delete from "vendor job work types"   where vendor_id like 'TEST-%' or job_work_code like 'TEST-%';  -- agreed: links to TEST-JW* are test-only
  delete from "machine operations"      where machine_id like 'TEST-%';
  delete from "maintenance master"      where machine_id like 'TEST-%';
  delete from "maintenance schedule"    where machine_id like 'TEST-%';

  delete from "products master"      where part_serial_number like 'TEST-%';
  delete from "raw materials master" where raw_material_code like 'TEST-%';
  delete from "suppliers master"     where supplier_id like 'TEST-%';
  delete from "vendors master"       where vendor_id like 'TEST-%';
  delete from "job work master"      where job_work_code like 'TEST-%';
  delete from "machines master"      where machine_id like 'TEST-%';
  delete from "operations master"    where operation_name like 'TEST-%';
  delete from "customers master"     where customer_id like 'TEST-%';
  delete from "employees master" e   where e.employee_id like 'TEST-%'
    and not exists (select 1 from "app users" a where a.employee_id = e.employee_id);  -- keep a login's employee

  -- ---- after: report table (session temp table, NOT on commit drop, so
  -- Part C's final SELECT in the same run can read it)
  drop table if exists rst_report;
  create temporary table rst_report (kind text, t text, n_before numeric, n_after numeric, ok boolean);
  execute 'insert into rst_report (kind, t, n_before, n_after)
           select kind, t, ($1 ->> (kind || ''|'' || t))::numeric, rows from (' || v_sql || ') x'
    using v_before;
  update rst_report set ok = case when kind in ('tx', 'test') then n_after = 0 else n_after = n_before end;

  select count(*) filter (where not ok) into v_bad from rst_report;
  select string_agg(format('%s  %-4s  %-32s  %s -> %s',
                           case when ok then 'ok ' else 'BAD' end, kind, t, n_before, n_after),
                    E'\n' order by ok, case kind when 'tx' then 1 when 'test' then 2 when 'real' then 3 else 4 end, t)
    into v_report from rst_report;

  if c_dry_run then
    raise exception E'DRY RUN (rolled back): % row(s) not ok\n%', v_bad, v_report;
  elsif v_bad > 0 then
    raise exception E'ABORTED (rolled back, nothing deleted): % row(s) not ok\n%', v_bad, v_report;
  end if;
  raise notice E'RESET COMMITTED\n%', v_report;
end
$reset$;

-- PART C only (same run, after the block with c_dry_run = false):
-- select * from rst_report
-- order by ok, case kind when 'tx' then 1 when 'test' then 2 when 'real' then 3 else 4 end, t;


-- =====================================================================
-- PART D -- OPTIONAL, after Part C: restart id sequences at 1.
-- Cosmetic only: ids are not shown to users and no number is derived from
-- them (doc numbers are max()+1 over the doc column, CMP via its counter).
-- Pros: ids start clean for the demo. Cons: none functional; ids of the
-- deleted rows are re-used, so any external copy (exports, screenshots,
-- Storage paths containing an id) no longer matches. Leave it out unless
-- you want clean ids. Works for serial AND identity columns:
-- =====================================================================
-- do $$
-- declare r record;
-- begin
--   for r in
--     select c.table_name, c.column_name, pg_get_serial_sequence(format('%I.%I', c.table_schema, c.table_name), c.column_name) as seq
--     from information_schema.columns c
--     where c.table_schema = 'public'
--       and c.table_name in ('customer enquiries','customer po headers','customer orders','production route cards',
--         'production route card stages','production logs','production log hours','production shift verifications',
--         'quality logs','quality log readings','job order dispatch','job order receipt','raw material transactions',
--         'wip transactions','finished goods transactions','raw material requisitions','maintenance logs',
--         'maintenance log items','maintenance plan','customer complaints','customer complaint attachments')
--   loop
--     if r.seq is not null then
--       execute format('alter sequence %s restart with 1', r.seq);
--     end if;
--   end loop;
-- end $$;


-- =====================================================================
-- After PART C (manual, outside SQL):
--  1. Storage > complaint-attachments: delete ALL files (list = A6). Keep
--     the bucket itself (027 policies + limits are on it).
--  2. Logins: nothing to do -- auth.users, "app users", "user module
--     access" are kept.
--  3. Hard-refresh open app tabs (they hold stale lists / open logs).
--  4. No schema change: notify pgrst is not needed.
-- =====================================================================
