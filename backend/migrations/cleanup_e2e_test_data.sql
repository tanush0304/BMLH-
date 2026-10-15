-- =====================================================================
-- Cleanup: E2E browser test data (runs of 2026-10-09/10, 2026-10-12, and
-- the 031 / 030 tests of 2026-10-15 onwards)
-- NOT a migration -- review, then run manually in the Supabase SQL editor.
-- Written for the schema AFTER 030 ("production orders" = one row per PRD /
-- batch, "customer orders" = PO line keyed by order_line_id). Run it LAST,
-- after 031 and 030 are tested.
--
-- Everything is scoped to the TEST- master records, or to rows hanging off
-- the TEST customer's PO lines (customer TEST-CUST01): their PRDs in
-- "production orders" (PRD-004 .. PRD-009 + any planned in the 030 test),
-- cancelled PRDs, and legacy prd_no values -- so no real data matches.
-- "quality log results" is a VIEW over the readings in the repo schema --
-- confirm with check 18 of 030_preflight.sql (if it is a table, delete it before the readings); readings are deleted
-- before their quality logs below.
-- Step 1 previews what will be deleted; step 2 deletes in one transaction
-- (children before parents). Check the preview counts first.
-- =====================================================================

-- ---------- Step 1: preview -------------------------------------------
with line as (select order_line_id from "customer orders" where customer_id = 'TEST-CUST01'),
prd as (
  select prd_no from "production orders" where order_line_id in (select order_line_id from line)
  union select prd_no from "customer orders" where customer_id = 'TEST-CUST01' and prd_no is not null
)
select 'customer orders (PO lines)' as t, count(*) from "customer orders" where customer_id = 'TEST-CUST01'
union all select 'production orders (PRDs)', count(*) from "production orders" where order_line_id in (select order_line_id from line)
union all select 'production order cancellations', count(*) from "production order cancellations" where order_line_id in (select order_line_id from line)
union all select 'customer po headers', count(*) from "customer po headers" where customer_id = 'TEST-CUST01'
union all select 'customer enquiries', count(*) from "customer enquiries" where customer_id = 'TEST-CUST01'
union all select 'production route cards', count(*) from "production route cards" where prd_no in (select prd_no from prd)
union all select 'production route card stages', count(*) from "production route card stages" where prd_no in (select prd_no from prd)
union all select 'production logs', count(*) from "production logs" where stage_id in (select id from "production route card stages" where prd_no in (select prd_no from prd))
-- Shift verifications (028) of those logs.
union all select 'production shift verifications', count(*) from "production shift verifications" where log_id in (select id from "production logs" where stage_id in (select id from "production route card stages" where prd_no in (select prd_no from prd)))
union all select 'wip transactions', count(*) from "wip transactions" where prd_no in (select prd_no from prd)
union all select 'finished goods transactions', count(*) from "finished goods transactions" where prd_no in (select prd_no from prd)
union all select 'raw material transactions', count(*) from "raw material transactions" where raw_material_code = 'TEST-RM01'
union all select 'job order dispatch', count(*) from "job order dispatch" where prd_no in (select prd_no from prd)
union all select 'job order receipt', count(*) from "job order receipt" where dc_no in (select dc_no from "job order dispatch" where prd_no in (select prd_no from prd))
union all select 'raw material requisitions', count(*) from "raw material requisitions" where prd_no in (select prd_no from prd)
union all select 'quality logs', count(*) from "quality logs" where prd_no in (select prd_no from prd)
union all select 'quality log readings', count(*) from "quality log readings" where quality_log_id in (select id from "quality logs" where prd_no in (select prd_no from prd))
union all select 'maintenance logs', count(*) from "maintenance logs" where machine_id = 'TEST-MC01'
-- Customer complaints (027) raised against a TEST customer or TEST part.
union all select 'customer complaints', count(*) from "customer complaints"
  where customer_id in ('TEST-CUST01', 'TEST-CUST02') or part_serial_number in ('TEST-PART01', 'TEST-PART02', 'TEST-PART03', 'TEST-PART04')
union all select 'customer complaint attachments', count(*) from "customer complaint attachments"
  where complaint_id in (select id from "customer complaints"
    where customer_id in ('TEST-CUST01', 'TEST-CUST02') or part_serial_number in ('TEST-PART01', 'TEST-PART02', 'TEST-PART03', 'TEST-PART04'));

-- Storage files of those complaints (list only -- see the note in Step 2):
--   select a.file_path from "customer complaint attachments" a
--   join "customer complaints" c on c.id = a.complaint_id
--   where c.customer_id in ('TEST-CUST01', 'TEST-CUST02') or c.part_serial_number in ('TEST-PART01', 'TEST-PART02', 'TEST-PART03', 'TEST-PART04');

-- Expected (from the test runs): customer orders 3 (PRD-004, PRD-005, PRD-006),
-- po headers 2 (TEST-PO01, TEST-PO02), enquiries 1 (QTN-006), route cards 3 (JC-004,
-- JC-005, + PRD-006's), WIP 3 (WIR-002, WIR-003, WII-001), FG 4 (FGR-001, FGR-002,
-- FGR-003, FGD-001), RM 2 (GRN-002, RMI-002), dispatch 2 (DC-002, DC-003), quality logs 2,
-- maintenance logs 1, customer complaints 2 (CMP-2026-0001 TEST-CUST01/TEST-PART01,
-- CMP-2026-0002 TEST-CUST02/TEST-PART02), complaint attachments 2.
-- Added 2026-10-15 (031 test): PO line / PRD-009 (TEST-PART03, PO TEST-PO-031,
-- 500), route card JC-008 (1 Outsourced stage), DCs DC-004 (300, received via
-- JR-003 + JR-004) and DC-005 (200, Closed Short) -- so dispatch +2, receipts
-- +2, route cards +1. The 030 test adds its own PO line(s) / PRDs here.
-- Added 2026-10-12 (Shift Verification test): order PRD-008 (TEST-PART04, PO
-- TEST-PO03), route card JC-007 (Stage 1 – TEST-Deburr, Manual), product
-- TEST-PART04 + its cycle time row, production logs on PRD-005 / PRD-008 and
-- their hours, and their "production shift verifications" rows (028).
-- Storage (complaint-attachments bucket), folder CMP-2026-0001/ -- 2 files:
--   CMP-2026-0001/1791636050127_TEST-defect-photo.png
--   CMP-2026-0001/1791636050939_TEST-inspection-report.pdf

-- ---------- Step 2: delete --------------------------------------------
begin;

create temporary table e2e_line on commit drop as
  select order_line_id from "customer orders" where customer_id = 'TEST-CUST01';
create temporary table e2e_prd on commit drop as
  select prd_no from "production orders" where order_line_id in (select order_line_id from e2e_line)
  union select prd_no from "customer orders" where customer_id = 'TEST-CUST01' and prd_no is not null;
create temporary table e2e_stage on commit drop as
  select id from "production route card stages" where prd_no in (select prd_no from e2e_prd);
create temporary table e2e_log on commit drop as
  select id from "production logs" where stage_id in (select id from e2e_stage);

-- Customer complaints (027): attachment rows first, then complaints.
-- The files themselves stay in Storage: SQL deletes on storage.objects are
-- not allowed -- delete the folders (named by complaint no, e.g.
-- CMP-2026-0001/) in Dashboard > Storage > complaint-attachments, using the
-- file list from Step 1.
delete from "customer complaint attachments" where complaint_id in (
  select id from "customer complaints"
  where customer_id in ('TEST-CUST01', 'TEST-CUST02') or part_serial_number in ('TEST-PART01', 'TEST-PART02', 'TEST-PART03', 'TEST-PART04'));
delete from "customer complaints"
  where customer_id in ('TEST-CUST01', 'TEST-CUST02') or part_serial_number in ('TEST-PART01', 'TEST-PART02', 'TEST-PART03', 'TEST-PART04');

-- Reset the complaint counters to the highest remaining real CMP number per
-- year, so real numbering continues straight after it; a year with no real
-- complaints left loses its row (the next one starts at 0001).
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

-- Quality (readings first)
delete from "quality log readings" where quality_log_id in (select id from "quality logs" where prd_no in (select prd_no from e2e_prd));
delete from "quality logs" where prd_no in (select prd_no from e2e_prd);
delete from "quality master" where part_serial_number in ('TEST-PART01', 'TEST-PART02', 'TEST-PART03', 'TEST-PART04');

-- Jobwork
delete from "job order receipt" where dc_no in (select dc_no from "job order dispatch" where prd_no in (select prd_no from e2e_prd));
delete from "job order dispatch" where prd_no in (select prd_no from e2e_prd);

-- Stores ledgers
delete from "finished goods transactions" where prd_no in (select prd_no from e2e_prd);
delete from "wip transactions" where prd_no in (select prd_no from e2e_prd);
delete from "raw material transactions" where raw_material_code = 'TEST-RM01';
delete from "raw material requisitions" where prd_no in (select prd_no from e2e_prd);

-- Production (shift verifications cascade with their logs; deleted first anyway)
delete from "production shift verifications" where log_id in (select id from e2e_log);
delete from "production log hours" where log_id in (select id from e2e_log);
delete from "production logs" where id in (select id from e2e_log);
delete from "production route card stages" where id in (select id from e2e_stage);
delete from "production route cards" where prd_no in (select prd_no from e2e_prd);

-- Orders: PRDs (030) and their cancellation log, then the PO lines
delete from "production order cancellations" where order_line_id in (select order_line_id from e2e_line);
delete from "production orders" where order_line_id in (select order_line_id from e2e_line);
delete from "customer orders" where order_line_id in (select order_line_id from e2e_line);
delete from "customer po headers" where customer_id = 'TEST-CUST01';
delete from "customer enquiries" where customer_id = 'TEST-CUST01';

-- Maintenance
delete from "maintenance log items" where maintenance_log_id in (select id from "maintenance logs" where machine_id = 'TEST-MC01');
delete from "maintenance logs" where machine_id = 'TEST-MC01';
delete from "maintenance plan" where machine_id = 'TEST-MC01';
delete from "maintenance schedule" where machine_id = 'TEST-MC01';
delete from "maintenance master" where machine_id = 'TEST-MC01';

-- Masters (link tables first)
delete from "cycle time master" where part_serial_number in ('TEST-PART01', 'TEST-PART02', 'TEST-PART03', 'TEST-PART04');
delete from "production batch master" where part_serial_number in ('TEST-PART01', 'TEST-PART02', 'TEST-PART03', 'TEST-PART04');
delete from "product raw materials" where part_serial_number in ('TEST-PART01', 'TEST-PART02', 'TEST-PART03', 'TEST-PART04');
delete from "rm suppliers" where raw_material_code = 'TEST-RM01';
delete from "vendor job work types" where vendor_id = 'TEST-VEN01';
delete from "machine operations" where machine_id = 'TEST-MC01';

delete from "products master" where part_serial_number in ('TEST-PART01', 'TEST-PART02', 'TEST-PART03', 'TEST-PART04');
delete from "raw materials master" where raw_material_code = 'TEST-RM01';
delete from "vendors master" where vendor_id = 'TEST-VEN01';
delete from "job work master" where job_work_code = 'TEST-JW01';
delete from "machines master" where machine_id = 'TEST-MC01';
-- Only if no real machine was tagged with it in the meantime:
delete from "operations master" where operation_name = 'TEST-Turning'
  and not exists (select 1 from "machine operations" where operation = 'TEST-Turning');
delete from "suppliers master" where supplier_id in ('TEST-SUP01', 'TEST-SUP02');
delete from "customers master" where customer_id in ('TEST-CUST01', 'TEST-CUST02');
delete from "employees master" where employee_id in ('TEST-EMP01', 'TEST-EMP02');

-- Re-run the Step 1 preview here: every count should be 0. Then:
-- (if no real complaints exist yet, "customer complaint counters" is now
-- empty and the first real complaint gets CMP-2026-0001)
commit;   -- or ROLLBACK; if anything looks wrong

-- TEST operator login (2026-10-12 Shift Verification test): delete it in
-- Dashboard > Authentication > Users (the address in frontend/.env.test,
-- TEST_OPERATOR_EMAIL), then its role row:
--   delete from "app users" where user_id = '987b500d-149e-47ef-9923-8e372913e8fe';  -- operator.test@bmlh.test

-- Note: 022 doc numbers are max()+1 per prefix, so after this cleanup each
-- prefix restarts after the highest REMAINING real number -- TEST numbers
-- above it are handed out again (e.g. if GRN-002 was TEST and GRN-001 is the
-- highest real receipt, the next GRN is GRN-002). Acceptable for this one-off
-- cleanup: app users can't delete ledger rows (026), so it can't recur.
-- Complaint counters are reset above the same way: the next real complaint
-- follows the highest remaining real CMP number for its year.
--
-- Run only after 027: on a DB without the complaint tables the two
-- complaint lines fail -- drop them if 027 hasn't been run.
