-- =====================================================================
-- GO-LIVE CLEANUP -- PREVIEW (read-only). NOT a migration.
-- Run in the Supabase SQL editor BEFORE cleanup_golive.sql and keep the
-- results to compare with the verification queries at the end of it.
-- Every query here only SELECTs. The SQL editor shows only the LAST
-- result of a run, so run each numbered query on its own.
-- Schema: after migration 040.
-- =====================================================================


-- ---- P1: tables that cleanup_golive.sql EMPTIES (expect any numbers) ----
select * from (
            select 1 as n, 'customer complaint attachments' as t, count(*) as rows from "customer complaint attachments"
  union all select 2,  'customer complaints',            count(*) from "customer complaints"
  union all select 3,  'customer complaint counters',    count(*) from "customer complaint counters"
  union all select 4,  'quality log readings',           count(*) from "quality log readings"
  union all select 5,  'quality logs',                   count(*) from "quality logs"
  union all select 6,  'maintenance log items',          count(*) from "maintenance log items"
  union all select 7,  'maintenance logs',               count(*) from "maintenance logs"
  union all select 8,  'maintenance plan',               count(*) from "maintenance plan"
  union all select 9,  'production shift verifications', count(*) from "production shift verifications"
  union all select 10, 'production log hours',           count(*) from "production log hours"
  union all select 11, 'production logs',                count(*) from "production logs"
  union all select 12, 'job order receipt',              count(*) from "job order receipt"
  union all select 13, 'job order dispatch',             count(*) from "job order dispatch"
  union all select 14, 'wip transactions',               count(*) from "wip transactions"
  union all select 15, 'finished goods transactions',    count(*) from "finished goods transactions"
  union all select 16, 'raw material transactions',      count(*) from "raw material transactions"
  union all select 17, 'raw material requisitions',      count(*) from "raw material requisitions"
  union all select 18, 'production route card stages',   count(*) from "production route card stages"
  union all select 19, 'production route cards',         count(*) from "production route cards"
  union all select 20, 'production order cancellations', count(*) from "production order cancellations"
  union all select 21, 'production orders',              count(*) from "production orders"
  union all select 22, 'customer orders',                count(*) from "customer orders"
  union all select 23, 'customer po headers',            count(*) from "customer po headers"
  union all select 24, 'customer enquiries',             count(*) from "customer enquiries"
) x order by n;


-- ---- P2: tables that are KEPT (must be identical after the cleanup) ----
-- "RM opening_stock total" is the one kept value that DOES change (-> 0).
select * from (
            select 101 as n, 'customers master' as t, count(*)::numeric as rows from "customers master"
  union all select 102, 'employees master',          count(*) from "employees master"
  union all select 103, 'shifts master',             count(*) from "shifts master"
  union all select 104, 'suppliers master',          count(*) from "suppliers master"
  union all select 105, 'vendors master',            count(*) from "vendors master"
  union all select 106, 'job work master',           count(*) from "job work master"
  union all select 107, 'vendor job work types',     count(*) from "vendor job work types"
  union all select 108, 'machines master',           count(*) from "machines master"
  union all select 109, 'machine operations',        count(*) from "machine operations"
  union all select 111, 'operations master',         count(*) from "operations master"
  union all select 112, 'raw materials master',      count(*) from "raw materials master"
  union all select 113, 'rm suppliers',              count(*) from "rm suppliers"
  union all select 114, 'products master',           count(*) from "products master"
  union all select 115, 'product raw materials',     count(*) from "product raw materials"
  union all select 116, 'cycle time master',         count(*) from "cycle time master"
  union all select 117, 'production batch master',   count(*) from "production batch master"
  union all select 118, 'quality master',            count(*) from "quality master"
  union all select 119, 'maintenance master',        count(*) from "maintenance master"
  union all select 120, 'maintenance schedule',      count(*) from "maintenance schedule"
  union all select 201, 'app users',                 count(*) from "app users"
  union all select 202, 'user module access',        count(*) from "user module access"
  union all select 203, 'auth.users',                count(*) from auth.users
  union all select 301, 'RM opening_stock total (-> 0)', coalesce(sum(opening_stock), 0) from "raw materials master"
  union all select 302, 'RM rows with opening_stock <> 0', count(*) filter (where opening_stock <> 0) from "raw materials master"
) x order by n;


-- ---- P3: public base tables NOT classified above. MUST return no rows.
-- If a row appears, tell Claude/decide (empty or keep) before running the
-- cleanup -- the cleanup also aborts by itself in that case.
select table_name from information_schema.tables
where table_schema = 'public' and table_type = 'BASE TABLE'
  and table_name not in (
    'customer complaint attachments','customer complaints','customer complaint counters',
    'quality log readings','quality logs','maintenance log items','maintenance logs','maintenance plan',
    'production shift verifications','production log hours','production logs',
    'job order receipt','job order dispatch','wip transactions','finished goods transactions',
    'raw material transactions','raw material requisitions',
    'production route card stages','production route cards','production order cancellations',
    'production orders','customer orders','customer po headers','customer enquiries',
    'customers master','employees master','shifts master','suppliers master','vendors master',
    'job work master','vendor job work types','machines master','machine operations',
    'operations master','raw materials master','rm suppliers',
    'products master','product raw materials','cycle time master','production batch master',
    'quality master','maintenance master','maintenance schedule',
    'app users','user module access')
order by 1;


-- ---- P4: FKs from a KEPT table into an emptied one. MUST return no rows
-- (else the delete fails, or cascades into kept data).
with emptied(relname) as (values
  ('customer complaint attachments'),('customer complaints'),('customer complaint counters'),
  ('quality log readings'),('quality logs'),('maintenance log items'),('maintenance logs'),('maintenance plan'),
  ('production shift verifications'),('production log hours'),('production logs'),
  ('job order receipt'),('job order dispatch'),('wip transactions'),('finished goods transactions'),
  ('raw material transactions'),('raw material requisitions'),
  ('production route card stages'),('production route cards'),('production order cancellations'),
  ('production orders'),('customer orders'),('customer po headers'),('customer enquiries'))
select sn.nspname || '.' || src.relname as referencing_table, tgt.relname as referenced_table, con.conname
from pg_constraint con
join pg_class src on src.oid = con.conrelid join pg_namespace sn on sn.oid = src.relnamespace
join pg_class tgt on tgt.oid = con.confrelid join pg_namespace tn on tn.oid = tgt.relnamespace
where con.contype = 'f' and tn.nspname = 'public'
  and tgt.relname in (select relname from emptied)
  and not (sn.nspname = 'public' and src.relname in (select relname from emptied))
order by 1, 2;


-- ---- P5: triggers that fire on DELETE in public. Expected (repo, 026/028/035):
--   production logs       trg_production_logs_verified_lock
--   production log hours  trg_production_log_hours_verified_lock,
--                         trg_production_log_hours_closed_guard
-- All three return at once when is_app_caller() is false (SQL editor).
-- Any OTHER row: read its function before running the cleanup.
select event_object_table as tbl, trigger_name, action_timing
from information_schema.triggers
where trigger_schema = 'public' and event_manipulation = 'DELETE'
order by 1, 2;


-- ---- P6: editor role. Expect: postgres | false.
select current_user, is_app_caller() as is_app_caller;


-- ---- P7: current doc numbers (highest in use). After the cleanup all
-- of these tables are empty, so the next number of each is 001.
select 'GRN/RMI' as kind, max(doc_no) as highest from "raw material transactions"
union all select 'WIR/WII', max(doc_no) from "wip transactions"
union all select 'FGR/FGD', max(doc_no) from "finished goods transactions"
union all select 'JR',  max(receipt_no) from "job order receipt"
union all select 'DC',  max(dc_no) from "job order dispatch"
union all select 'PRD', max(prd_no) from "production orders"
union all select 'JC',  max(jc_no) from "production route cards"
union all select 'CMP', max(complaint_no) from "customer complaints"
union all select 'CMP counter', (select string_agg(year || ':' || last_no, ', ') from "customer complaint counters");


-- ---- P8: Storage files in the complaint-attachments bucket (removed
-- by hand after the cleanup -- see the end of cleanup_golive.sql).
select name, created_at, metadata ->> 'size' as bytes
from storage.objects where bucket_id = 'complaint-attachments' order by name;


-- ---- P9: the backup schema is complete. Every public base table should
-- have a copy in backup_20261106 (rows = missing copies; expect none).
select t.table_name as missing_in_backup
from information_schema.tables t
where t.table_schema = 'public' and t.table_type = 'BASE TABLE'
  and not exists (select 1 from information_schema.tables b
                  where b.table_schema = 'backup_20261106' and b.table_name = t.table_name)
order by 1;
