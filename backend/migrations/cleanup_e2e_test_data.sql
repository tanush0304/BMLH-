-- =====================================================================
-- Cleanup: E2E / browser / API test data (runs of 2026-10-09 .. 2026-10-20)
-- NOT a migration. Review, then run by hand in the Supabase SQL editor.
-- Written for the schema after 037 (030 "production orders" = one row per
-- PRD, "customer orders" = PO line keyed by order_line_id; 031 many receipts
-- per DC; 033/034/035 audit + void columns; 027 complaints + counters; 028
-- shift verifications). Nothing in 036/037 adds a table.
--
-- HOW TO RUN -- separate runs, in order:
--   Part A  read-only. A1 = counts + BLOCKERS (every blocker must be 0);
--           A2..A8 = checks to read before going on (one query each -- the
--           SQL editor only shows the last result, so run them one by one).
--   Part B  dry run: begin; deletes; before/after counts; ROLLBACK.
--   Part C  the same as B, ending in COMMIT. Copy B's block and change ONLY
--           the last line -- B and C must stay identical otherwise.
-- Run as the SQL editor's default role (postgres). Do NOT switch the editor
-- role to "authenticated"/"anon": every 026-037 guard checks is_app_caller()
-- (current_user in ('authenticated','anon')), which is false for postgres,
-- and the 026/027/028/030/033/034 DELETE revokes apply only to those roles.
--
-- WHAT IS "TEST" DATA -- explicit IDs only, no dates, no LIKE patterns on
-- business data:
--   customers   TEST-CUST01, TEST-CUST02 -> their PO lines, PO headers,
--               enquiries; PRDs of those lines ("production orders",
--               cancelled PRDs, legacy customer orders.prd_no) and
--               everything keyed by those PRDs (route cards, stages, logs,
--               hours, shift verifications, quality logs, DCs + receipts
--               incl. Closed Short / voided / edited, WIP, FG, requisitions)
--   parts       TEST-PART01..05, TEST-MANUAL, TEST-LABEL
--   machines    TEST-MC01..03          raw material  TEST-RM01 (its whole ledger)
--   vendor      TEST-VEN01             job work      TEST-JW01
--   suppliers   TEST-SUP01, TEST-SUP02 employees     TEST-EMP01, TEST-EMP02
--   operations  TEST-Turning, TEST-Deburr (only if no real machine uses them)
--   complaints  customer = TEST customer OR part = TEST part
-- Real data can only be hit if a real record was linked to a TEST master;
-- A1's BLOCKERS count exactly those links. Any non-zero blocker means a real
-- row points at TEST data -- stop and decide row by row.
--
-- E2E rows on REAL PRDs / real materials (not matched by the rules above --
-- see A6): the 2026-10-12 shift-verification run on PRD-005 + log 9, the
-- Manual Operations log on PRD-008, DC-001/002/003 (+ JR-009 on DC-002),
-- GRN-002 / RMI-003 / RMI-005 if their material is not TEST-RM01. They are
-- deleted ONLY if you list their ids in the e2e_extra_* tables at the top of
-- Part B (empty by default). A real stage whose status a TEST DC changed
-- (refresh_outsourced_stage) is NOT reset by deleting the DC -- fix by hand.
--
-- LOGINS KEPT: auth.users and "app users" are not deleted or changed
-- (checked as rows 43/44 of Part B). Rows that only record WHO did
-- something (user_id, verified_by, edited_by ...) go with their test rows;
-- nothing a login needs to sign in or get its role lives in those tables.
--
-- DOC NUMBERS: see the review notes. In short: GRN/RMI/WIR/WII/FGR/FGD (022),
-- JR (021), DC (frontend) = max()+1 over what is left; PRD / JC = max over
-- production orders / route cards / cancellations / legacy prd_no; the TEST
-- cancellations go with their lines. Complaint numbers use a counter table
-- (027): reset below to the highest remaining CMP number per year.
-- =====================================================================


-- =====================================================================
-- PART A -- read-only. Run each query on its own.
-- =====================================================================

-- ---- A1: rows that WILL be deleted (n 1..42) + BLOCKERS (n 101..) -----
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
dc    as (select dc_no from "job order dispatch" where prd_no in (select prd_no from prd)),
cmp   as (select id from "customer complaints" where customer_id in (select id from cust) or part_serial_number in (select id from part)),
mlog  as (select id from "maintenance logs" where machine_id in (select id from mc))
select * from (
            select 1 as n, 'customer complaint attachments' as t, count(*) as rows from "customer complaint attachments" where complaint_id in (select id from cmp)
  union all select 2,  'customer complaints',            count(*) from "customer complaints" where id in (select id from cmp)
  union all select 3,  'quality log readings',           count(*) from "quality log readings" where quality_log_id in (select id from qlog)
  union all select 4,  'quality logs',                   count(*) from qlog
  union all select 5,  'quality master',                 count(*) from "quality master" where part_serial_number in (select id from part)
  union all select 6,  'job order receipt',              count(*) from "job order receipt" where dc_no in (select dc_no from dc)
  union all select 7,  'job order dispatch',             count(*) from dc
  union all select 8,  'finished goods transactions',    count(*) from "finished goods transactions" where prd_no in (select prd_no from prd)
  union all select 9,  'wip transactions',               count(*) from "wip transactions" where prd_no in (select prd_no from prd)
  union all select 10, 'raw material transactions',      count(*) from "raw material transactions" where raw_material_code = 'TEST-RM01'
  union all select 11, 'raw material requisitions',      count(*) from "raw material requisitions" where prd_no in (select prd_no from prd) or raw_material_code = 'TEST-RM01' or part_serial_number in (select id from part)
  union all select 12, 'production shift verifications', count(*) from "production shift verifications" where log_id in (select id from plog)
  union all select 13, 'production log hours',           count(*) from "production log hours" where log_id in (select id from plog)
  union all select 14, 'production logs',                count(*) from plog
  union all select 15, 'production route card stages',   count(*) from stage
  union all select 16, 'production route cards',         count(*) from "production route cards" where prd_no in (select prd_no from prd)
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
  union all select 28, 'production batch master',        count(*) from "production batch master" where part_serial_number in (select id from part)
  union all select 29, 'product raw materials',          count(*) from "product raw materials" where part_serial_number in (select id from part)
  union all select 30, 'rm suppliers',                   count(*) from "rm suppliers" where raw_material_code = 'TEST-RM01'
  union all select 31, 'vendor job work types',          count(*) from "vendor job work types" where vendor_id = 'TEST-VEN01' or job_work_code = 'TEST-JW01'
  union all select 32, 'machine operations',             count(*) from "machine operations" where machine_id in (select id from mc)
  union all select 33, 'products master',                count(*) from "products master" where part_serial_number in (select id from part)
  union all select 34, 'raw materials master',           count(*) from "raw materials master" where raw_material_code = 'TEST-RM01'
  union all select 35, 'vendors master',                 count(*) from "vendors master" where vendor_id = 'TEST-VEN01'
  union all select 36, 'job work master',                count(*) from "job work master" where job_work_code = 'TEST-JW01'
  union all select 37, 'machines master',                count(*) from "machines master" where machine_id in (select id from mc)
  union all select 38, 'operations master',              count(*) from "operations master" o where o.operation_name in ('TEST-Turning','TEST-Deburr')
                                                           and not exists (select 1 from "machine operations" m where m.operation = o.operation_name and m.machine_id not in (select id from mc))
  union all select 39, 'suppliers master',               count(*) from "suppliers master" where supplier_id in (select id from sup)
  union all select 40, 'customers master',               count(*) from "customers master" where customer_id in (select id from cust)
  union all select 41, 'employees master',               count(*) from "employees master" e where e.employee_id in (select id from emp)
                                                           and not exists (select 1 from "app users" a where a.employee_id = e.employee_id)
  union all select 42, 'customer complaint counters (rows dropped)', count(*) from "customer complaint counters" c
                                                           where not exists (select 1 from "customer complaints" k where k.complaint_no like 'CMP-' || c.year || '-%' and k.id not in (select id from cmp))
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
  -- (112 "real vendor linked to TEST-JW01" is no longer a blocker: the link
  --  row is test-only and is deleted with row 31; the vendor itself stays.)
  union all select 113, 'BLOCKER DCs on TEST vendor/job work/part, real PRD', count(*) from "job order dispatch" where (vendor_id = 'TEST-VEN01' or job_work_code = 'TEST-JW01' or part_serial_number in (select id from part)) and dc_no not in (select dc_no from dc)
  union all select 114, 'BLOCKER WIP/FG rows by a TEST employee',          (select count(*) from "wip transactions" where employee_id in (select id from emp) and prd_no not in (select prd_no from prd))
                                                                         + (select count(*) from "finished goods transactions" where employee_id in (select id from emp) and prd_no not in (select prd_no from prd))
  union all select 115, 'BLOCKER real complaints naming a TEST employee',  count(*) from "customer complaints" where id not in (select id from cmp)
                                                                           and (received_by in (select id from emp) or investigation_owner in (select id from emp) or action_owner in (select id from emp) or closed_by in (select id from emp))
  union all select 116, 'BLOCKER real FG rows on a TEST part',             count(*) from "finished goods transactions" where part_serial_number in (select id from part) and prd_no not in (select prd_no from prd)
  union all select 117, 'BLOCKER real stages on TEST machine / TEST-JW01', count(*) from "production route card stages" where (machine_id in (select id from mc) or job_work_code = 'TEST-JW01') and id not in (select id from stage)
  union all select 118, 'BLOCKER real PO lines under a TEST PO header',    count(*) from "customer orders" where parent_po_id in (select id from "customer po headers" where customer_id in (select id from cust)) and order_line_id not in (select order_line_id from line)
  union all select 119, 'BLOCKER real PO lines quoting a TEST enquiry',    count(*) from "customer orders" where qtn_no in (select qtn_no from "customer enquiries" where customer_id in (select id from cust)) and order_line_id not in (select order_line_id from line)
  union all select 120, 'BLOCKER real enquiry revisions of a TEST enquiry', count(*) from "customer enquiries" where parent_qtn_no in (select qtn_no from "customer enquiries" where customer_id in (select id from cust)) and customer_id not in (select id from cust)
) x
order by n;

-- ---- A1b: the exact rows behind blockers 103 / 104 (+ the TEST-JW01 vendor
-- links deleted with row 31). Read-only.
with
emp   as (select unnest(array['TEST-EMP01','TEST-EMP02']) as id),
mc    as (select unnest(array['TEST-MC01','TEST-MC02','TEST-MC03']) as id),
line  as (select order_line_id from "customer orders" where customer_id in ('TEST-CUST01','TEST-CUST02')),
prd   as (select prd_no from "production orders" where order_line_id in (select order_line_id from line)
          union select prd_no from "production order cancellations" where order_line_id in (select order_line_id from line)
          union select prd_no from "customer orders" where customer_id in ('TEST-CUST01','TEST-CUST02') and prd_no is not null),
plog  as (select l.id from "production logs" l join "production route card stages" s on s.id = l.stage_id where s.prd_no in (select prd_no from prd))
select '103 log' as blocker, l.id::text as row_id, s.prd_no, s.id::text as stage_id, s.seq::text as stage_seq,
       l.machine_id, l.employee_id,
       (select min(h.log_date)::text || '..' || max(h.log_date)::text from "production log hours" h where h.log_id = l.id) as dates,
       (select string_agg(distinct h.shift_code, ',') from "production log hours" h where h.log_id = l.id) as shifts,
       'planned ' || l.planned_qty || ', open ' || l.is_open as info
from "production logs" l join "production route card stages" s on s.id = l.stage_id
where (l.machine_id in (select id from mc) or l.employee_id in (select id from emp)) and l.id not in (select id from plog)
union all
select '104 hour', h.id::text, s.prd_no, s.id::text, s.seq::text, l.machine_id, h.employee_id,
       h.log_date::text, h.shift_code,
       'log ' || h.log_id || ': produced ' || h.qty_produced || ' / rejected ' || h.qty_rejected || ' / rework ' || h.qty_rework
from "production log hours" h
join "production logs" l on l.id = h.log_id
join "production route card stages" s on s.id = l.stage_id
where h.employee_id in (select id from emp) and h.log_id not in (select id from plog)
union all
select '112 link (deleted)', v.vendor_id, null, null, null, null, null, null, null, 'job work ' || v.job_work_code
from "vendor job work types" v where v.job_work_code = 'TEST-JW01' and v.vendor_id <> 'TEST-VEN01'
order by 1, 3, 2;

-- ---- A1c: IMPACT of deleting a real-PRD log (candidates for e2e_extra_log).
-- Default candidates = the logs behind blockers 103 / 104; add more ids in
-- "extra". One row per candidate. Read it BEFORE Part C -- nothing in this
-- script resets stage status or planned qty; every non-zero / non-Pending
-- value below is an effect you must fix by hand (or accept) afterwards.
--   hours / verifications      deleted with the log (Part B)
--   quality_logs_matched       deleted with the log: same stage + machine +
--                              date + shift as one of its hours (Part B)
--   wip_from / wip_into / dcs  NOT deleted automatically (not tied to a log)
--                              -- list doc_no / dc_no in e2e_extra_wip / _dc
--   accepted_removed           accepted pieces the next stage loses
--   next_stage_consumed        what the next stage already took (log planned
--                              qty + DCs + WIP issued into it); if it is >
--                              (next stage target - accepted_removed) the next
--                              stage is over-planned after the delete
--   stage_status               stays as is (e.g. Completed) -- fix by hand
with
emp   as (select unnest(array['TEST-EMP01','TEST-EMP02']) as id),
mc    as (select unnest(array['TEST-MC01','TEST-MC02','TEST-MC03']) as id),
extra as (select unnest(array[]::bigint[]) as id),   -- e.g. array[9, 14]::bigint[]
line  as (select order_line_id from "customer orders" where customer_id in ('TEST-CUST01','TEST-CUST02')),
prd   as (select prd_no from "production orders" where order_line_id in (select order_line_id from line)
          union select prd_no from "production order cancellations" where order_line_id in (select order_line_id from line)
          union select prd_no from "customer orders" where customer_id in ('TEST-CUST01','TEST-CUST02') and prd_no is not null),
cand  as (select l.id from "production logs" l join "production route card stages" s on s.id = l.stage_id
          where s.prd_no not in (select prd_no from prd)
            and (l.machine_id in (select id from mc) or l.employee_id in (select id from emp)
                 or exists (select 1 from "production log hours" h where h.log_id = l.id and h.employee_id in (select id from emp))
                 or l.id in (select id from extra)))
select l.id as log_id, s.prd_no, s.seq as stage_seq, s.status as stage_status, l.planned_qty, l.is_open,
       (select count(*) from "production logs" o where o.stage_id = s.id and o.id <> l.id) as other_logs_on_stage,
       (select count(*) from "production log hours" h where h.log_id = l.id) as hours,
       (select count(*) from "production log hours" h where h.log_id = l.id and h.employee_id in (select id from emp)) as hours_by_test_emp,
       (select count(*) from "production shift verifications" v where v.log_id = l.id) as verifications,
       (select string_agg(v.log_date || ' ' || v.shift_code || ' ' || v.status, '; ') from "production shift verifications" v where v.log_id = l.id) as verification_status,
       (select count(*) from "quality logs" q where q.stage_id = l.stage_id and q.machine_id = l.machine_id
          and exists (select 1 from "production log hours" h where h.log_id = l.id and h.log_date = q.log_date and h.shift_code = q.shift_code)) as quality_logs_matched,
       (select coalesce(sum(h.qty_produced - h.qty_rejected - h.qty_rework), 0) from "production log hours" h where h.log_id = l.id) as accepted_removed,
       (select string_agg(w.doc_no, ',') from "wip transactions" w where w.stage_id = s.id) as wip_from_stage,
       (select string_agg(w.doc_no, ',') from "wip transactions" w where w.target_stage_id = s.id) as wip_into_stage,
       (select string_agg(d.dc_no, ',') from "job order dispatch" d where d.stage_id = s.id) as dcs_on_stage,
       n.seq as next_stage_seq, n.status as next_stage_status,
       (select coalesce(sum(o.planned_qty), 0) from "production logs" o where o.stage_id = n.id)
       + (select coalesce(sum(d.qty), 0) from "job order dispatch" d where d.stage_id = n.id and d.voided_at is null)
       + (select coalesce(sum(w.qty), 0) from "wip transactions" w where w.target_stage_id = n.id) as next_stage_consumed,
       (select string_agg(d.dc_no, ',') from "job order dispatch" d where d.stage_id = n.id) as dcs_on_next_stage
from cand c
join "production logs" l on l.id = c.id
join "production route card stages" s on s.id = l.stage_id
left join lateral (select * from "production route card stages" x where x.prd_no = s.prd_no and x.seq > s.seq order by x.seq limit 1) n on true
order by s.prd_no, s.seq, l.id;

-- ---- A2: FK coverage. Every FK that points at a table this script deletes
-- from, from a table it does NOT clean. Each row = a table that could hold a
-- row pointing at TEST data (the delete would then fail, or cascade). Expect
-- only rows you have checked (e.g. a view-less audit table). Read-only.
with cleaned(relname) as (values
  ('customer complaint attachments'),('customer complaints'),('customer complaint counters'),
  ('quality log readings'),('quality logs'),('quality master'),('job order receipt'),('job order dispatch'),
  ('finished goods transactions'),('wip transactions'),('raw material transactions'),('raw material requisitions'),
  ('production shift verifications'),('production log hours'),('production logs'),('production route card stages'),
  ('production route cards'),('production order cancellations'),('production orders'),('customer orders'),
  ('customer po headers'),('customer enquiries'),('maintenance log items'),('maintenance logs'),('maintenance plan'),
  ('maintenance schedule'),('maintenance master'),('cycle time master'),('production batch master'),
  ('product raw materials'),('rm suppliers'),('vendor job work types'),('machine operations'),('products master'),
  ('raw materials master'),('vendors master'),('job work master'),('machines master'),('operations master'),
  ('suppliers master'),('customers master'),('employees master'))
select src.relname as referencing_table, tgt.relname as referenced_table, con.conname,
       case con.confdeltype when 'c' then 'CASCADE' when 'n' then 'SET NULL' when 'd' then 'SET DEFAULT' else 'NO ACTION/RESTRICT' end as on_delete
from pg_constraint con
join pg_class src on src.oid = con.conrelid
join pg_class tgt on tgt.oid = con.confrelid
join pg_namespace ns on ns.oid = src.relnamespace
where con.contype = 'f' and ns.nspname = 'public'
  and tgt.relname in (select relname from cleaned)
  and src.relname not in (select relname from cleaned)
order by 1, 2;

-- ---- A3: triggers that fire on DELETE (or TRUNCATE) on public tables.
-- Expected from the repo: "production logs" trg_production_logs_verified_lock
-- (026/028), "production log hours" trg_production_log_hours_verified_lock
-- (026/028) and trg_production_log_hours_closed_guard (035) -- all return at
-- once when is_app_caller() is false. Anything else listed: read it first.
select event_object_table as tbl, trigger_name, action_timing, event_manipulation, action_statement
from information_schema.triggers
where trigger_schema = 'public' and event_manipulation in ('DELETE', 'TRUNCATE')
order by 1, 2;

-- ---- A4: the editor really bypasses the guards. Expect: postgres, false.
select current_user, is_app_caller() as is_app_caller;

-- ---- A5: test logins (never selects passwords). Confirm these are exactly
-- the TEST supervisor, TEST supervisor 2 and TEST operator.
select u.id, u.email, a.role, u.created_at, u.last_sign_in_at
from auth.users u left join "app users" a on a.user_id = u.id
where u.email like '%@bmlh.test'
order by u.email;

-- ---- A6: every row in a public BASE table that names a test login in a
-- uuid column (user_id, entered_by, verified_by, edited_by, voided_by,
-- created_by, cancelled_by, closed_short_by, ...). Run before Part B: shows
-- E2E rows on real PRDs that the rules above do not catch. Run again after
-- Part C: whatever is left must be decided before the logins are deleted
-- (FK columns to auth.users without ON DELETE block the delete).
select c.table_name, c.column_name,
       (xpath('/row/n/text()', query_to_xml(format(
          'select count(*) as n from %I.%I where %I in (select id from auth.users where email like %L)',
          c.table_schema, c.table_name, c.column_name, '%@bmlh.test'), false, true, '')))[1]::text::int as rows
from information_schema.columns c
join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name and t.table_type = 'BASE TABLE'
where c.table_schema = 'public' and c.data_type = 'uuid'
order by rows desc, 1, 2;

-- ---- A7: the known E2E rows on real PRDs -- what they point at. If a row's
-- prd_no / material is NOT a TEST one, it is not in the rule set; put its id
-- in the e2e_extra_* tables of Part B if you decide to delete it.
select 'DC' as kind, d.dc_no as doc, d.prd_no, d.part_serial_number as part_or_rm, d.qty::text as qty, d.voided_at::text as voided
from "job order dispatch" d where d.dc_no in ('DC-001','DC-002','DC-003')
union all
select 'RM ' || r.transaction_type, r.doc_no, null, r.raw_material_code, r.qty::text, r.voided_at::text
from "raw material transactions" r where r.doc_no in ('GRN-002','GRN-003','GRN-004','RMI-003','RMI-004','RMI-005')
union all
select 'log', l.id::text, s.prd_no, l.machine_id, l.planned_qty::text, l.is_open::text
from "production logs" l join "production route card stages" s on s.id = l.stage_id
where s.prd_no in ('PRD-005','PRD-008') or l.user_id in (select id from auth.users where email like '%@bmlh.test')
order by 1, 2;

-- Storage files of the TEST complaints (delete these by hand -- run BEFORE
-- Part C, the rows are gone afterwards):
--   select c.complaint_no, a.file_path from "customer complaint attachments" a
--   join "customer complaints" c on c.id = a.complaint_id
--   where c.customer_id in ('TEST-CUST01','TEST-CUST02')
--      or c.part_serial_number in ('TEST-PART01','TEST-PART02','TEST-PART03','TEST-PART04','TEST-PART05','TEST-MANUAL','TEST-LABEL');

-- ---- A8: PRD-001 / 002 / 003 -- NOT deleted by this script (not proven
-- test). Read-only facts for the decision.
select co.prd_no as legacy_prd, po.prd_no, co.customer_id, cm.customer_name, co.po_number, co.part_serial_number,
       co.order_qty, co.created_at,
       (select count(*) from "production route card stages" s where s.prd_no = po.prd_no) as stages,
       (select count(*) from "production logs" l join "production route card stages" s on s.id = l.stage_id where s.prd_no = po.prd_no) as logs,
       (select count(*) from "job order dispatch" d where d.prd_no = po.prd_no) as dcs,
       (select count(*) from "finished goods transactions" f where f.prd_no = po.prd_no) as fg_rows
from "customer orders" co
left join "production orders" po on po.order_line_id = co.order_line_id
left join "customers master" cm on cm.customer_id = co.customer_id
where co.prd_no in ('PRD-001','PRD-002','PRD-003') or po.prd_no in ('PRD-001','PRD-002','PRD-003')
order by po.prd_no;


-- =====================================================================
-- PART B -- dry run (ends in ROLLBACK). Part C = this block with COMMIT.
-- =====================================================================
begin;

-- Optional explicit extras (E2E rows on REAL PRDs, decided from A6/A7).
-- Empty = nothing extra is deleted. Example: values (9), (14)
create temporary table e2e_extra_log (id bigint)  on commit drop;   -- production logs.id
create temporary table e2e_extra_dc  (dc_no text) on commit drop;   -- job order dispatch.dc_no
create temporary table e2e_extra_rm  (doc_no text) on commit drop;  -- raw material transactions.doc_no
create temporary table e2e_extra_wip (doc_no text) on commit drop;  -- wip transactions.doc_no (A1c wip_* columns)
-- An e2e_extra_log id also deletes its hours, shift verifications and the
-- quality logs (+ readings) on the same stage + machine + date + shift
-- (A1c quality_logs_matched). WIP rows and DCs are not tied to a log: list
-- them here / in e2e_extra_dc. Stage status / planned qty are NOT reset --
-- see A1c and fix by hand after Part C.
-- insert into e2e_extra_log values (...);
-- insert into e2e_extra_dc  values (...);
-- insert into e2e_extra_rm  values (...);
-- insert into e2e_extra_wip values (...);

create temporary table e2e_part on commit drop as
  select unnest(array['TEST-PART01','TEST-PART02','TEST-PART03','TEST-PART04','TEST-PART05','TEST-MANUAL','TEST-LABEL']) as id;
create temporary table e2e_mc on commit drop as
  select unnest(array['TEST-MC01','TEST-MC02','TEST-MC03']) as id;
create temporary table e2e_line on commit drop as
  select order_line_id from "customer orders" where customer_id in ('TEST-CUST01','TEST-CUST02');
create temporary table e2e_prd on commit drop as
  select prd_no from "production orders" where order_line_id in (select order_line_id from e2e_line)
  union select prd_no from "production order cancellations" where order_line_id in (select order_line_id from e2e_line)
  union select prd_no from "customer orders" where customer_id in ('TEST-CUST01','TEST-CUST02') and prd_no is not null;
create temporary table e2e_stage on commit drop as
  select id from "production route card stages" where prd_no in (select prd_no from e2e_prd);
create temporary table e2e_log on commit drop as
  select id from "production logs" where stage_id in (select id from e2e_stage)
  union select id from e2e_extra_log;
create temporary table e2e_dc on commit drop as
  select dc_no from "job order dispatch" where prd_no in (select prd_no from e2e_prd)
  union select dc_no from e2e_extra_dc;
create temporary table e2e_qlog on commit drop as
  select id from "quality logs" where prd_no in (select prd_no from e2e_prd)
  union
  select q.id from "quality logs" q
  join "production logs" l on l.id in (select id from e2e_extra_log)
                          and q.stage_id = l.stage_id and q.machine_id = l.machine_id
  where exists (select 1 from "production log hours" h
                where h.log_id = l.id and h.log_date = q.log_date and h.shift_code = q.shift_code);
create temporary table e2e_mlog on commit drop as
  select id from "maintenance logs" where machine_id in (select id from e2e_mc);
create temporary table e2e_cmp on commit drop as
  select id from "customer complaints"
  where customer_id in ('TEST-CUST01','TEST-CUST02') or part_serial_number in (select id from e2e_part);

-- Live counts (a view, so it re-counts each time it is read):
-- test = rows matching the rules, total = all rows in the table.
create temporary view e2e_counts as
            select 1 as n, 'customer complaint attachments' as t, (select count(*) from "customer complaint attachments" where complaint_id in (select id from e2e_cmp)) as test, (select count(*) from "customer complaint attachments") as total
  union all select 2,  'customer complaints',            (select count(*) from "customer complaints" where id in (select id from e2e_cmp)), (select count(*) from "customer complaints")
  union all select 3,  'quality log readings',           (select count(*) from "quality log readings" where quality_log_id in (select id from e2e_qlog)), (select count(*) from "quality log readings")
  union all select 4,  'quality logs',                   (select count(*) from "quality logs" where id in (select id from e2e_qlog)), (select count(*) from "quality logs")
  union all select 5,  'quality master',                 (select count(*) from "quality master" where part_serial_number in (select id from e2e_part)), (select count(*) from "quality master")
  union all select 6,  'job order receipt',              (select count(*) from "job order receipt" where dc_no in (select dc_no from e2e_dc)), (select count(*) from "job order receipt")
  union all select 7,  'job order dispatch',             (select count(*) from "job order dispatch" where dc_no in (select dc_no from e2e_dc)), (select count(*) from "job order dispatch")
  union all select 8,  'finished goods transactions',    (select count(*) from "finished goods transactions" where prd_no in (select prd_no from e2e_prd)), (select count(*) from "finished goods transactions")
  union all select 9,  'wip transactions',               (select count(*) from "wip transactions" where prd_no in (select prd_no from e2e_prd) or doc_no in (select doc_no from e2e_extra_wip)), (select count(*) from "wip transactions")
  union all select 10, 'raw material transactions',      (select count(*) from "raw material transactions" where raw_material_code = 'TEST-RM01' or doc_no in (select doc_no from e2e_extra_rm)), (select count(*) from "raw material transactions")
  union all select 11, 'raw material requisitions',      (select count(*) from "raw material requisitions" where prd_no in (select prd_no from e2e_prd) or raw_material_code = 'TEST-RM01' or part_serial_number in (select id from e2e_part)), (select count(*) from "raw material requisitions")
  union all select 12, 'production shift verifications', (select count(*) from "production shift verifications" where log_id in (select id from e2e_log)), (select count(*) from "production shift verifications")
  union all select 13, 'production log hours',           (select count(*) from "production log hours" where log_id in (select id from e2e_log)), (select count(*) from "production log hours")
  union all select 14, 'production logs',                (select count(*) from "production logs" where id in (select id from e2e_log)), (select count(*) from "production logs")
  union all select 15, 'production route card stages',   (select count(*) from "production route card stages" where id in (select id from e2e_stage)), (select count(*) from "production route card stages")
  union all select 16, 'production route cards',         (select count(*) from "production route cards" where prd_no in (select prd_no from e2e_prd)), (select count(*) from "production route cards")
  union all select 17, 'production order cancellations', (select count(*) from "production order cancellations" where order_line_id in (select order_line_id from e2e_line)), (select count(*) from "production order cancellations")
  union all select 18, 'production orders',              (select count(*) from "production orders" where order_line_id in (select order_line_id from e2e_line)), (select count(*) from "production orders")
  union all select 19, 'customer orders (PO lines)',     (select count(*) from "customer orders" where order_line_id in (select order_line_id from e2e_line)), (select count(*) from "customer orders")
  union all select 20, 'customer po headers',            (select count(*) from "customer po headers" where customer_id in ('TEST-CUST01','TEST-CUST02')), (select count(*) from "customer po headers")
  union all select 21, 'customer enquiries',             (select count(*) from "customer enquiries" where customer_id in ('TEST-CUST01','TEST-CUST02')), (select count(*) from "customer enquiries")
  union all select 22, 'maintenance log items',          (select count(*) from "maintenance log items" where maintenance_log_id in (select id from e2e_mlog)), (select count(*) from "maintenance log items")
  union all select 23, 'maintenance logs',               (select count(*) from "maintenance logs" where id in (select id from e2e_mlog)), (select count(*) from "maintenance logs")
  union all select 24, 'maintenance plan',               (select count(*) from "maintenance plan" where machine_id in (select id from e2e_mc)), (select count(*) from "maintenance plan")
  union all select 25, 'maintenance schedule',           (select count(*) from "maintenance schedule" where machine_id in (select id from e2e_mc)), (select count(*) from "maintenance schedule")
  union all select 26, 'maintenance master',             (select count(*) from "maintenance master" where machine_id in (select id from e2e_mc)), (select count(*) from "maintenance master")
  union all select 27, 'cycle time master',              (select count(*) from "cycle time master" where part_serial_number in (select id from e2e_part)), (select count(*) from "cycle time master")
  union all select 28, 'production batch master',        (select count(*) from "production batch master" where part_serial_number in (select id from e2e_part)), (select count(*) from "production batch master")
  union all select 29, 'product raw materials',          (select count(*) from "product raw materials" where part_serial_number in (select id from e2e_part)), (select count(*) from "product raw materials")
  union all select 30, 'rm suppliers',                   (select count(*) from "rm suppliers" where raw_material_code = 'TEST-RM01'), (select count(*) from "rm suppliers")
  union all select 31, 'vendor job work types',          (select count(*) from "vendor job work types" where vendor_id = 'TEST-VEN01' or job_work_code = 'TEST-JW01'), (select count(*) from "vendor job work types")
  union all select 32, 'machine operations',             (select count(*) from "machine operations" where machine_id in (select id from e2e_mc)), (select count(*) from "machine operations")
  union all select 33, 'products master',                (select count(*) from "products master" where part_serial_number in (select id from e2e_part)), (select count(*) from "products master")
  union all select 34, 'raw materials master',           (select count(*) from "raw materials master" where raw_material_code = 'TEST-RM01'), (select count(*) from "raw materials master")
  union all select 35, 'vendors master',                 (select count(*) from "vendors master" where vendor_id = 'TEST-VEN01'), (select count(*) from "vendors master")
  union all select 36, 'job work master',                (select count(*) from "job work master" where job_work_code = 'TEST-JW01'), (select count(*) from "job work master")
  union all select 37, 'machines master',                (select count(*) from "machines master" where machine_id in (select id from e2e_mc)), (select count(*) from "machines master")
  union all select 38, 'operations master',              (select count(*) from "operations master" o where o.operation_name in ('TEST-Turning','TEST-Deburr')
                                                            and not exists (select 1 from "machine operations" m where m.operation = o.operation_name and m.machine_id not in (select id from e2e_mc))), (select count(*) from "operations master")
  union all select 39, 'suppliers master',               (select count(*) from "suppliers master" where supplier_id in ('TEST-SUP01','TEST-SUP02')), (select count(*) from "suppliers master")
  union all select 40, 'customers master',               (select count(*) from "customers master" where customer_id in ('TEST-CUST01','TEST-CUST02')), (select count(*) from "customers master")
  union all select 41, 'employees master',               (select count(*) from "employees master" e where e.employee_id in ('TEST-EMP01','TEST-EMP02')
                                                            and not exists (select 1 from "app users" a where a.employee_id = e.employee_id)), (select count(*) from "employees master")
  -- Logins are KEPT: these two rows must read test_before = 0 and real_ok.
  union all select 43, 'app users (kept)',               0::bigint, (select count(*) from "app users")
  union all select 44, 'auth.users (kept)',              0::bigint, (select count(*) from auth.users);

create temporary table e2e_before on commit drop as select * from e2e_counts;

-- ---- Deletes, children before parents ------------------------------
-- Complaints (027): attachment rows, then complaints. Files stay in Storage.
delete from "customer complaint attachments" where complaint_id in (select id from e2e_cmp);
delete from "customer complaints" where id in (select id from e2e_cmp);

-- Complaint counters: back to the highest remaining CMP number per year; a
-- year with no complaint left loses its row (next = CMP-<year>-0001).
-- (The only UPDATE in this script; this table has no trigger.)
with remaining as (
  select substring(complaint_no from '^CMP-(\d{4})-')::int as year,
         max(substring(complaint_no from '^CMP-\d{4}-(\d+)$')::int) as last_no
  from "customer complaints"
  group by 1
)
update "customer complaint counters" c
set last_no = r.last_no
from remaining r
where r.year = c.year and c.last_no <> r.last_no;
delete from "customer complaint counters" c
where not exists (select 1 from "customer complaints" where complaint_no like 'CMP-' || c.year || '-%');

-- Quality (032 audit triggers are BEFORE UPDATE only)
delete from "quality log readings" where quality_log_id in (select id from e2e_qlog);
delete from "quality logs" where id in (select id from e2e_qlog);
delete from "quality master" where part_serial_number in (select id from e2e_part);

-- Jobwork (031 many receipts per DC; Closed Short, edited (033), voided (034)
-- rows are ordinary rows here -- no DELETE trigger on either table)
delete from "job order receipt" where dc_no in (select dc_no from e2e_dc);
delete from "job order dispatch" where dc_no in (select dc_no from e2e_dc);

-- Stores ledgers, voided rows included (026/034 DELETE revoke is for the
-- app roles only; 025/034/036 triggers are INSERT/UPDATE only)
delete from "finished goods transactions" where prd_no in (select prd_no from e2e_prd);
delete from "wip transactions" where prd_no in (select prd_no from e2e_prd) or doc_no in (select doc_no from e2e_extra_wip);
delete from "raw material transactions" where raw_material_code = 'TEST-RM01' or doc_no in (select doc_no from e2e_extra_rm);
delete from "raw material requisitions" where prd_no in (select prd_no from e2e_prd) or raw_material_code = 'TEST-RM01' or part_serial_number in (select id from e2e_part);

-- Production (026/028/035 DELETE guards return at once for non-app callers)
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
delete from "maintenance log items" where maintenance_log_id in (select id from e2e_mlog);
delete from "maintenance logs" where id in (select id from e2e_mlog);
delete from "maintenance plan" where machine_id in (select id from e2e_mc);
delete from "maintenance schedule" where machine_id in (select id from e2e_mc);
delete from "maintenance master" where machine_id in (select id from e2e_mc);

-- Masters: link tables first, then the masters
delete from "cycle time master" where part_serial_number in (select id from e2e_part);
delete from "production batch master" where part_serial_number in (select id from e2e_part);
delete from "product raw materials" where part_serial_number in (select id from e2e_part);
delete from "rm suppliers" where raw_material_code = 'TEST-RM01';
delete from "vendor job work types" where vendor_id = 'TEST-VEN01' or job_work_code = 'TEST-JW01';  -- link rows only; real vendors stay
delete from "machine operations" where machine_id in (select id from e2e_mc);

delete from "products master" where part_serial_number in (select id from e2e_part);
delete from "raw materials master" where raw_material_code = 'TEST-RM01';
delete from "vendors master" where vendor_id = 'TEST-VEN01';
delete from "job work master" where job_work_code = 'TEST-JW01';
delete from "machines master" where machine_id in (select id from e2e_mc);
delete from "operations master" o where o.operation_name in ('TEST-Turning','TEST-Deburr')
  and not exists (select 1 from "machine operations" m where m.operation = o.operation_name);
delete from "suppliers master" where supplier_id in ('TEST-SUP01','TEST-SUP02');
delete from "customers master" where customer_id in ('TEST-CUST01','TEST-CUST02');
delete from "employees master" e where e.employee_id in ('TEST-EMP01','TEST-EMP02')
  and not exists (select 1 from "app users" a where a.employee_id = e.employee_id);  -- keep a login's linked employee

-- Before / after. Expect every test_after = 0 and real_ok = true on every
-- row (real rows = total - test, unchanged). operations master may keep a
-- TEST- row if a real machine was tagged with it (the guard keeps it).
select b.n, b.t, b.test as test_before, a.test as test_after,
       b.total - b.test as real_before, a.total - a.test as real_after,
       (b.total - b.test) = (a.total - a.test) as real_ok
from e2e_before b join e2e_counts a using (n)
order by real_ok, b.n;

-- The view depends on the on-commit-drop temp tables: drop it first, or
-- COMMIT fails trying to drop them (and rolls everything back).
drop view e2e_counts;
rollback;   -- PART C: identical block, but this line is   commit;


-- =====================================================================
-- After PART C (manual, outside SQL):
--  1. Re-run A6: rows still naming a test login. Decide them before step 3.
--  2. Storage > complaint-attachments: delete the TEST complaint files
--     listed by the storage query in Part A (run it before Part C).
--  3. The 3 test logins (A5) and their "app users" rows are KEPT (decision
--     2026-10-20: used to enter DEMO data via the UI). Parts B/C never touch
--     auth.users or "app users"; a TEST employee linked from "app users" is
--     kept too. Delete the logins only after the demo, as a separate step
--     (A6 first: FK columns to auth.users block the delete).
--  4. No schema change: notify pgrst is not needed.
-- =====================================================================
