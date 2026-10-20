-- =====================================================================
-- Cleanup: E2E / browser / API test data (runs of 2026-10-09 .. 2026-10-17)
-- NOT a migration. Review, then run by hand in the Supabase SQL editor.
-- Written for the schema after 032 (030 "production orders" = one row per
-- PRD, "customer orders" = PO line keyed by order_line_id; 031 many receipts
-- per DC; 027 complaints; 028 shift verifications; 032 audit columns).
--
-- HOW TO RUN -- three separate runs, in order:
--   Part A  read-only preview: counts per table + BLOCKERS. Every blocker
--           must be 0 before going on (see "Blockers" below).
--   Part B  dry run: begin; deletes; before/after counts; ROLLBACK.
--   Part C  the same as B, ending in COMMIT. Paste B's block and change only
--           the last line -- B and C must stay identical otherwise.
-- Run as the SQL editor's default role (postgres). Do NOT switch the editor
-- to "authenticated"/"anon": the 026/027/028 guards and the 026 DELETE revoke
-- apply only to those app roles, so as postgres nothing below is blocked.
--
-- The SQL editor shows the result of the LAST statement that returns rows. In
-- B and C that is the before/after SELECT just above ROLLBACK / COMMIT. If
-- your editor shows nothing, run B in psql (or ask me for a DO-block variant
-- that reports the counts in an error message -- an error rolls back on its own).
--
-- WHAT IS "TEST" DATA -- explicit IDs only, no dates, no LIKE patterns on
-- business data:
--   customers   TEST-CUST01, TEST-CUST02 (their PO lines, PO headers,
--               enquiries; PRDs of those lines = "production orders",
--               cancelled PRDs, legacy customer orders.prd_no)
--   parts       TEST-PART01..05, TEST-MANUAL, TEST-LABEL
--   machines    TEST-MC01..03          raw material  TEST-RM01
--   vendor      TEST-VEN01             job work      TEST-JW01
--   suppliers   TEST-SUP01, TEST-SUP02 employees     TEST-EMP01, TEST-EMP02
--   operations  TEST-Turning, TEST-Deburr (only if no real machine uses them)
-- Real data can only be hit if a real record was linked to a TEST master;
-- Part A's BLOCKERS count exactly those links. Any non-zero blocker means
-- a real row points at TEST data -- stop and decide row by row.
--
-- DOC NUMBERS: PRD / JC / DC (frontend nextSequenceNo), JR (021), GRN / RMI
-- / WIR / WII / FGR / FGD (022) are max()+1, and deleting the cancellations
-- frees their PRD / JC numbers too. After the commit, each sequence restarts
-- after the highest REMAINING real number, so numbers printed on TEST route
-- cards / DCs (PRD-004.., JC-004.., DC-002..) will be handed out again.
-- Complaint numbers use a counter table (027); it is reset below to the
-- highest remaining real CMP number per year.
-- =====================================================================


-- =====================================================================
-- PART A -- preview (read-only). Run on its own.
-- =====================================================================
with
cust  as (select unnest(array['TEST-CUST01','TEST-CUST02']) as id),
part  as (select unnest(array['TEST-PART01','TEST-PART02','TEST-PART03','TEST-PART04','TEST-PART05','TEST-MANUAL','TEST-LABEL']) as id),
mc    as (select unnest(array['TEST-MC01','TEST-MC02','TEST-MC03']) as id),
emp   as (select unnest(array['TEST-EMP01','TEST-EMP02']) as id),
sup   as (select unnest(array['TEST-SUP01','TEST-SUP02']) as id),
line  as (select order_line_id from "customer orders" where customer_id in (select id from cust)),
prd   as (select prd_no from "production orders" where order_line_id in (select order_line_id from line)
          union select prd_no from "production order cancellations" where order_line_id in (select order_line_id from line)
          union select prd_no from "customer orders" where customer_id in (select id from cust) and prd_no is not null),
stage as (select id from "production route card stages" where prd_no in (select prd_no from prd)),
plog  as (select id from "production logs" where stage_id in (select id from stage)),
qlog  as (select id from "quality logs" where prd_no in (select prd_no from prd)),
cmp   as (select id from "customer complaints" where customer_id in (select id from cust) or part_serial_number in (select id from part)),
mlog  as (select id from "maintenance logs" where machine_id in (select id from mc))
select * from (
  -- ---- rows that WILL be deleted
            select 1 as n, 'customer complaint attachments' as t, count(*) as rows from "customer complaint attachments" where complaint_id in (select id from cmp)
  union all select 2,  'customer complaints',            count(*) from "customer complaints" where id in (select id from cmp)
  union all select 3,  'quality log readings',           count(*) from "quality log readings" where quality_log_id in (select id from qlog)
  union all select 4,  'quality logs',                   count(*) from qlog
  union all select 5,  'quality master',                 count(*) from "quality master" where part_serial_number in (select id from part)
  union all select 6,  'job order receipt',              count(*) from "job order receipt" where dc_no in (select dc_no from "job order dispatch" where prd_no in (select prd_no from prd))
  union all select 7,  'job order dispatch',             count(*) from "job order dispatch" where prd_no in (select prd_no from prd)
  union all select 8,  'finished goods transactions',    count(*) from "finished goods transactions" where prd_no in (select prd_no from prd)
  union all select 9,  'wip transactions',               count(*) from "wip transactions" where prd_no in (select prd_no from prd)
  union all select 10, 'raw material transactions',      count(*) from "raw material transactions" where raw_material_code = 'TEST-RM01'
  union all select 11, 'raw material requisitions',      count(*) from "raw material requisitions" where prd_no in (select prd_no from prd)
  union all select 12, 'production shift verifications', count(*) from "production shift verifications" where log_id in (select id from plog)
  union all select 13, 'production log hours',           count(*) from "production log hours" where log_id in (select id from plog)
  union all select 14, 'production logs',                count(*) from plog
  union all select 15, 'production route card stages',  count(*) from stage
  union all select 16, 'production route cards',        count(*) from "production route cards" where prd_no in (select prd_no from prd)
  union all select 17, 'production order cancellations', count(*) from "production order cancellations" where order_line_id in (select order_line_id from line)
  union all select 18, 'production orders',              count(*) from "production orders" where order_line_id in (select order_line_id from line)
  union all select 19, 'customer orders (PO lines)',     count(*) from line
  union all select 20, 'customer po headers',            count(*) from "customer po headers" where customer_id in (select id from cust)
  union all select 21, 'customer enquiries',             count(*) from "customer enquiries" where customer_id in (select id from cust)
  union all select 22, 'maintenance log items',          count(*) from "maintenance log items" where maintenance_log_id in (select id from mlog)
  union all select 23, 'maintenance logs',               count(*) from mlog
  union all select 24, 'maintenance plan',               count(*) from "maintenance plan" where machine_id in (select id from mc)
  union all select 25, 'maintenance schedule',           count(*) from "maintenance schedule" where machine_id in (select id from mc)
  union all select 26, 'maintenance master',             count(*) from "maintenance master" where machine_id in (select id from mc)
  union all select 27, 'cycle time master',              count(*) from "cycle time master" where part_serial_number in (select id from part)
  union all select 28, 'production batch master',       count(*) from "production batch master" where part_serial_number in (select id from part)
  union all select 29, 'product raw materials',          count(*) from "product raw materials" where part_serial_number in (select id from part)
  union all select 30, 'rm suppliers',                   count(*) from "rm suppliers" where raw_material_code = 'TEST-RM01'
  union all select 31, 'vendor job work types',          count(*) from "vendor job work types" where vendor_id = 'TEST-VEN01'
  union all select 32, 'machine operations',             count(*) from "machine operations" where machine_id in (select id from mc)
  union all select 33, 'products master',               count(*) from "products master" where part_serial_number in (select id from part)
  union all select 34, 'raw materials master',          count(*) from "raw materials master" where raw_material_code = 'TEST-RM01'
  union all select 35, 'vendors master',                 count(*) from "vendors master" where vendor_id = 'TEST-VEN01'
  union all select 36, 'job work master',                count(*) from "job work master" where job_work_code = 'TEST-JW01'
  union all select 37, 'machines master',                count(*) from "machines master" where machine_id in (select id from mc)
  union all select 38, 'operations master',              count(*) from "operations master" where operation_name in ('TEST-Turning','TEST-Deburr')
  union all select 39, 'suppliers master',               count(*) from "suppliers master" where supplier_id in (select id from sup)
  union all select 40, 'customers master',               count(*) from "customers master" where customer_id in (select id from cust)
  union all select 41, 'employees master',               count(*) from "employees master" where employee_id in (select id from emp)
  -- ---- BLOCKERS: real rows linked to TEST masters. Must all be 0.
  union all select 101, 'BLOCKER real PO lines on a TEST part',            count(*) from "customer orders" where part_serial_number in (select id from part) and customer_id not in (select id from cust)
  union all select 102, 'BLOCKER real enquiries on a TEST part',           count(*) from "customer enquiries" where part_serial_number in (select id from part) and customer_id not in (select id from cust)
  union all select 103, 'BLOCKER production logs on TEST machine/employee', count(*) from "production logs" where (machine_id in (select id from mc) or employee_id in (select id from emp)) and id not in (select id from plog)
  union all select 104, 'BLOCKER hours by a TEST employee',                count(*) from "production log hours" where employee_id in (select id from emp) and log_id not in (select id from plog)
  union all select 105, 'BLOCKER quality logs on TEST machine/employee',   count(*) from "quality logs" where (machine_id in (select id from mc) or employee_id in (select id from emp)) and id not in (select id from qlog)
  union all select 106, 'BLOCKER readings on a TEST quality parameter',    count(*) from "quality log readings" where quality_parameter_id in (select id from "quality master" where part_serial_number in (select id from part)) and quality_log_id not in (select id from qlog)
  union all select 107, 'BLOCKER maintenance logs by a TEST employee',     count(*) from "maintenance logs" where employee_id in (select id from emp) and id not in (select id from mlog)
  union all select 108, 'BLOCKER cycle times on a TEST machine',           count(*) from "cycle time master" where machine_id in (select id from mc) and part_serial_number not in (select id from part)
  union all select 109, 'BLOCKER BOM rows using TEST-RM01',                count(*) from "product raw materials" where raw_material_code = 'TEST-RM01' and part_serial_number not in (select id from part)
  union all select 110, 'BLOCKER RM ledger on a TEST part or supplier',    count(*) from "raw material transactions" where (part_serial_number in (select id from part) or supplier_id in (select id from sup)) and raw_material_code <> 'TEST-RM01'
  union all select 111, 'BLOCKER RM-supplier links to a TEST supplier',    count(*) from "rm suppliers" where supplier_id in (select id from sup) and raw_material_code <> 'TEST-RM01'
  union all select 112, 'BLOCKER vendor links to TEST-JW01',               count(*) from "vendor job work types" where job_work_code = 'TEST-JW01' and vendor_id <> 'TEST-VEN01'
  union all select 113, 'BLOCKER DCs on TEST vendor/job work, real PRD',   count(*) from "job order dispatch" where (vendor_id = 'TEST-VEN01' or job_work_code = 'TEST-JW01' or part_serial_number in (select id from part)) and prd_no not in (select prd_no from prd)
  union all select 114, 'BLOCKER WIP/FG rows by a TEST employee',          (select count(*) from "wip transactions" where employee_id in (select id from emp) and prd_no not in (select prd_no from prd))
                                                                         + (select count(*) from "finished goods transactions" where employee_id in (select id from emp) and prd_no not in (select prd_no from prd))
  union all select 115, 'BLOCKER real complaints naming a TEST employee',  count(*) from "customer complaints" where id not in (select id from cmp)
                                                                           and (received_by in (select id from emp) or investigation_owner in (select id from emp) or action_owner in (select id from emp) or closed_by in (select id from emp))
  union all select 116, 'BLOCKER real FG rows on a TEST part',             count(*) from "finished goods transactions" where part_serial_number in (select id from part) and prd_no not in (select prd_no from prd)
) x
order by n;

-- Storage files of the TEST complaints (delete these folders by hand):
--   select c.complaint_no, a.file_path from "customer complaint attachments" a
--   join "customer complaints" c on c.id = a.complaint_id
--   where c.customer_id in ('TEST-CUST01','TEST-CUST02')
--      or c.part_serial_number in ('TEST-PART01','TEST-PART02','TEST-PART03','TEST-PART04','TEST-PART05','TEST-MANUAL','TEST-LABEL');
-- Test logins (delete by hand in Dashboard > Authentication > Users):
--   select u.id, u.email, a.role from auth.users u left join "app users" a on a.user_id = u.id
--   where u.email like '%@bmlh.test';


-- =====================================================================
-- PART B -- dry run (ends in ROLLBACK). Part C = this block with COMMIT.
-- =====================================================================
begin;

create temporary table e2e_line on commit drop as
  select order_line_id from "customer orders" where customer_id in ('TEST-CUST01','TEST-CUST02');
create temporary table e2e_prd on commit drop as
  select prd_no from "production orders" where order_line_id in (select order_line_id from e2e_line)
  union select prd_no from "production order cancellations" where order_line_id in (select order_line_id from e2e_line)
  union select prd_no from "customer orders" where customer_id in ('TEST-CUST01','TEST-CUST02') and prd_no is not null;
create temporary table e2e_stage on commit drop as
  select id from "production route card stages" where prd_no in (select prd_no from e2e_prd);
create temporary table e2e_log on commit drop as
  select id from "production logs" where stage_id in (select id from e2e_stage);
create temporary table e2e_cmp on commit drop as
  select id from "customer complaints"
  where customer_id in ('TEST-CUST01','TEST-CUST02')
     or part_serial_number in ('TEST-PART01','TEST-PART02','TEST-PART03','TEST-PART04','TEST-PART05','TEST-MANUAL','TEST-LABEL');

-- Live counts (a view, so it re-counts each time it is read).
create temporary view e2e_counts as
            select 1 as n, 'customer complaint attachments' as t, (select count(*) from "customer complaint attachments" where complaint_id in (select id from e2e_cmp)) as rows
  union all select 2,  'customer complaints',            (select count(*) from "customer complaints" where id in (select id from e2e_cmp))
  union all select 3,  'quality log readings',           (select count(*) from "quality log readings" where quality_log_id in (select id from "quality logs" where prd_no in (select prd_no from e2e_prd)))
  union all select 4,  'quality logs',                   (select count(*) from "quality logs" where prd_no in (select prd_no from e2e_prd))
  union all select 5,  'quality master',                 (select count(*) from "quality master" where part_serial_number in ('TEST-PART01','TEST-PART02','TEST-PART03','TEST-PART04','TEST-PART05','TEST-MANUAL','TEST-LABEL'))
  union all select 6,  'job order receipt',              (select count(*) from "job order receipt" where dc_no in (select dc_no from "job order dispatch" where prd_no in (select prd_no from e2e_prd)))
  union all select 7,  'job order dispatch',             (select count(*) from "job order dispatch" where prd_no in (select prd_no from e2e_prd))
  union all select 8,  'finished goods transactions',    (select count(*) from "finished goods transactions" where prd_no in (select prd_no from e2e_prd))
  union all select 9,  'wip transactions',               (select count(*) from "wip transactions" where prd_no in (select prd_no from e2e_prd))
  union all select 10, 'raw material transactions',      (select count(*) from "raw material transactions" where raw_material_code = 'TEST-RM01')
  union all select 11, 'raw material requisitions',      (select count(*) from "raw material requisitions" where prd_no in (select prd_no from e2e_prd))
  union all select 12, 'production shift verifications', (select count(*) from "production shift verifications" where log_id in (select id from e2e_log))
  union all select 13, 'production log hours',           (select count(*) from "production log hours" where log_id in (select id from e2e_log))
  union all select 14, 'production logs',                (select count(*) from "production logs" where id in (select id from e2e_log))
  union all select 15, 'production route card stages',  (select count(*) from "production route card stages" where id in (select id from e2e_stage))
  union all select 16, 'production route cards',        (select count(*) from "production route cards" where prd_no in (select prd_no from e2e_prd))
  union all select 17, 'production order cancellations', (select count(*) from "production order cancellations" where order_line_id in (select order_line_id from e2e_line))
  union all select 18, 'production orders',              (select count(*) from "production orders" where order_line_id in (select order_line_id from e2e_line))
  union all select 19, 'customer orders (PO lines)',     (select count(*) from "customer orders" where order_line_id in (select order_line_id from e2e_line))
  union all select 20, 'customer po headers',            (select count(*) from "customer po headers" where customer_id in ('TEST-CUST01','TEST-CUST02'))
  union all select 21, 'customer enquiries',             (select count(*) from "customer enquiries" where customer_id in ('TEST-CUST01','TEST-CUST02'))
  union all select 22, 'maintenance log items',          (select count(*) from "maintenance log items" where maintenance_log_id in (select id from "maintenance logs" where machine_id in ('TEST-MC01','TEST-MC02','TEST-MC03')))
  union all select 23, 'maintenance logs',               (select count(*) from "maintenance logs" where machine_id in ('TEST-MC01','TEST-MC02','TEST-MC03'))
  union all select 24, 'maintenance plan',               (select count(*) from "maintenance plan" where machine_id in ('TEST-MC01','TEST-MC02','TEST-MC03'))
  union all select 25, 'maintenance schedule',           (select count(*) from "maintenance schedule" where machine_id in ('TEST-MC01','TEST-MC02','TEST-MC03'))
  union all select 26, 'maintenance master',             (select count(*) from "maintenance master" where machine_id in ('TEST-MC01','TEST-MC02','TEST-MC03'))
  union all select 27, 'cycle time master',              (select count(*) from "cycle time master" where part_serial_number in ('TEST-PART01','TEST-PART02','TEST-PART03','TEST-PART04','TEST-PART05','TEST-MANUAL','TEST-LABEL'))
  union all select 28, 'production batch master',       (select count(*) from "production batch master" where part_serial_number in ('TEST-PART01','TEST-PART02','TEST-PART03','TEST-PART04','TEST-PART05','TEST-MANUAL','TEST-LABEL'))
  union all select 29, 'product raw materials',          (select count(*) from "product raw materials" where part_serial_number in ('TEST-PART01','TEST-PART02','TEST-PART03','TEST-PART04','TEST-PART05','TEST-MANUAL','TEST-LABEL'))
  union all select 30, 'rm suppliers',                   (select count(*) from "rm suppliers" where raw_material_code = 'TEST-RM01')
  union all select 31, 'vendor job work types',          (select count(*) from "vendor job work types" where vendor_id = 'TEST-VEN01')
  union all select 32, 'machine operations',             (select count(*) from "machine operations" where machine_id in ('TEST-MC01','TEST-MC02','TEST-MC03'))
  union all select 33, 'products master',               (select count(*) from "products master" where part_serial_number in ('TEST-PART01','TEST-PART02','TEST-PART03','TEST-PART04','TEST-PART05','TEST-MANUAL','TEST-LABEL'))
  union all select 34, 'raw materials master',          (select count(*) from "raw materials master" where raw_material_code = 'TEST-RM01')
  union all select 35, 'vendors master',                 (select count(*) from "vendors master" where vendor_id = 'TEST-VEN01')
  union all select 36, 'job work master',                (select count(*) from "job work master" where job_work_code = 'TEST-JW01')
  union all select 37, 'machines master',                (select count(*) from "machines master" where machine_id in ('TEST-MC01','TEST-MC02','TEST-MC03'))
  union all select 38, 'operations master',              (select count(*) from "operations master" where operation_name in ('TEST-Turning','TEST-Deburr'))
  union all select 39, 'suppliers master',               (select count(*) from "suppliers master" where supplier_id in ('TEST-SUP01','TEST-SUP02'))
  union all select 40, 'customers master',               (select count(*) from "customers master" where customer_id in ('TEST-CUST01','TEST-CUST02'))
  union all select 41, 'employees master',               (select count(*) from "employees master" where employee_id in ('TEST-EMP01','TEST-EMP02'));

create temporary table e2e_before on commit drop as select * from e2e_counts;

-- ---- Deletes, children before parents ------------------------------
-- Complaints (027): attachment rows, then complaints. Files stay in Storage.
delete from "customer complaint attachments" where complaint_id in (select id from e2e_cmp);
delete from "customer complaints" where id in (select id from e2e_cmp);

-- Complaint counters: back to the highest remaining real CMP number per
-- year; a year with no real complaint left loses its row (next = 0001).
-- (The only UPDATE in this script; no 025/032 trigger is on this table.)
with remaining as (
  select substring(complaint_no from '^CMP-(\d{4})-')::int as year,
         max(substring(complaint_no from '^CMP-\d{4}-(\d+)$')::int) as last_no
  from "customer complaints"
  group by 1
)
update "customer complaint counters" c
set last_no = r.last_no
from remaining r
where r.year = c.year;
delete from "customer complaint counters" c
where not exists (select 1 from "customer complaints" where complaint_no like 'CMP-' || c.year || '-%');

-- Quality: readings, logs, then the TEST parts' parameters
delete from "quality log readings" where quality_log_id in (select id from "quality logs" where prd_no in (select prd_no from e2e_prd));
delete from "quality logs" where prd_no in (select prd_no from e2e_prd);
delete from "quality master" where part_serial_number in ('TEST-PART01','TEST-PART02','TEST-PART03','TEST-PART04','TEST-PART05','TEST-MANUAL','TEST-LABEL');

-- Jobwork (031: many receipts per DC)
delete from "job order receipt" where dc_no in (select dc_no from "job order dispatch" where prd_no in (select prd_no from e2e_prd));
delete from "job order dispatch" where prd_no in (select prd_no from e2e_prd);

-- Stores ledgers (026's DELETE revoke is for anon/authenticated only)
delete from "finished goods transactions" where prd_no in (select prd_no from e2e_prd);
delete from "wip transactions" where prd_no in (select prd_no from e2e_prd);
delete from "raw material transactions" where raw_material_code = 'TEST-RM01';
delete from "raw material requisitions" where prd_no in (select prd_no from e2e_prd);

-- Production (026/028 locks skip non-app callers such as postgres)
delete from "production shift verifications" where log_id in (select id from e2e_log);
delete from "production log hours" where log_id in (select id from e2e_log);
delete from "production logs" where id in (select id from e2e_log);
delete from "production route card stages" where id in (select id from e2e_stage);
delete from "production route cards" where prd_no in (select prd_no from e2e_prd);

-- Orders (030): cancellation log + PRDs, then PO lines, headers, enquiries
delete from "production order cancellations" where order_line_id in (select order_line_id from e2e_line);
delete from "production orders" where order_line_id in (select order_line_id from e2e_line);
delete from "customer orders" where order_line_id in (select order_line_id from e2e_line);
delete from "customer po headers" where customer_id in ('TEST-CUST01','TEST-CUST02');
delete from "customer enquiries" where customer_id in ('TEST-CUST01','TEST-CUST02');

-- Maintenance
delete from "maintenance log items" where maintenance_log_id in (select id from "maintenance logs" where machine_id in ('TEST-MC01','TEST-MC02','TEST-MC03'));
delete from "maintenance logs" where machine_id in ('TEST-MC01','TEST-MC02','TEST-MC03');
delete from "maintenance plan" where machine_id in ('TEST-MC01','TEST-MC02','TEST-MC03');
delete from "maintenance schedule" where machine_id in ('TEST-MC01','TEST-MC02','TEST-MC03');
delete from "maintenance master" where machine_id in ('TEST-MC01','TEST-MC02','TEST-MC03');

-- Masters: link tables first, then the masters
delete from "cycle time master" where part_serial_number in ('TEST-PART01','TEST-PART02','TEST-PART03','TEST-PART04','TEST-PART05','TEST-MANUAL','TEST-LABEL');
delete from "production batch master" where part_serial_number in ('TEST-PART01','TEST-PART02','TEST-PART03','TEST-PART04','TEST-PART05','TEST-MANUAL','TEST-LABEL');
delete from "product raw materials" where part_serial_number in ('TEST-PART01','TEST-PART02','TEST-PART03','TEST-PART04','TEST-PART05','TEST-MANUAL','TEST-LABEL');
delete from "rm suppliers" where raw_material_code = 'TEST-RM01';
delete from "vendor job work types" where vendor_id = 'TEST-VEN01';
delete from "machine operations" where machine_id in ('TEST-MC01','TEST-MC02','TEST-MC03');

delete from "products master" where part_serial_number in ('TEST-PART01','TEST-PART02','TEST-PART03','TEST-PART04','TEST-PART05','TEST-MANUAL','TEST-LABEL');
delete from "raw materials master" where raw_material_code = 'TEST-RM01';
delete from "vendors master" where vendor_id = 'TEST-VEN01';
delete from "job work master" where job_work_code = 'TEST-JW01';
delete from "machines master" where machine_id in ('TEST-MC01','TEST-MC02','TEST-MC03');
delete from "operations master" o where o.operation_name in ('TEST-Turning','TEST-Deburr')
  and not exists (select 1 from "machine operations" m where m.operation = o.operation_name);
delete from "suppliers master" where supplier_id in ('TEST-SUP01','TEST-SUP02');
delete from "customers master" where customer_id in ('TEST-CUST01','TEST-CUST02');
delete from "employees master" where employee_id in ('TEST-EMP01','TEST-EMP02');

-- Before / after: every "after" should be 0 (operations master may keep a
-- row if a real machine was tagged with it -- the guard above keeps it).
select b.n, b.t, b.rows as before, a.rows as after
from e2e_before b join e2e_counts a using (n)
order by b.n;

-- The view depends on the on-commit-drop temp tables: drop it first, or
-- COMMIT fails trying to drop them (and rolls everything back).
drop view e2e_counts;
rollback;   -- PART C: identical block, but this line is   commit;


-- =====================================================================
-- After PART C (manual, outside SQL):
--  1. Storage > complaint-attachments: delete the TEST complaint folders
--     listed by the Part A storage query (expected: CMP-2026-0001/ with
--     ..._TEST-defect-photo.png and ..._TEST-inspection-report.pdf, plus any
--     CMP-2026-0002/ files).
--  2. Authentication > Users: delete the @bmlh.test logins listed by the
--     Part A login query, after deciding what to do with their "app users"
--     rows and any real rows they verified / edited (see the review notes).
--     Then:  delete from "app users" where user_id in (<their ids>);
--  3. notify pgrst, 'reload schema';  is not needed (no schema change).
-- =====================================================================
