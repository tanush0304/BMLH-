-- 053_quality_gauge_standard.sql
-- Quality parameters: a text "Standard" for Gauge parameters (e.g. "M8x1.25 6H").
--
--   1. "quality master".gauge_standard text null. Shown as "Standard" for Gauge
--      parameters (same column as Measured's numeric standard). Never used to
--      calculate a result -- a Gauge result stays OK / Not OK (048).
--   2. Column grant for authenticated (select, insert, update). No definer.
--   3. View "quality log results": 048's definition unchanged, gauge_standard
--      APPENDED as the last column. Column names / order kept. reloptions stay
--      null (as live; no security_invoker / security_barrier set here).
--      "report quality inspections" is NOT changed.
--
-- Needs 048. Every statement stands alone (no begin/commit, no temp tables, no
-- session state -- the Supabase SQL editor commits each statement). Re-runnable.
-- The frontend hides the Gauge Standard field until this is run (probe on
-- "quality master".gauge_standard).
-- Run PREVIEW alone first, then CHANGE top to bottom, then VERIFICATION.

-- ---------------------------------------------------------------- PREVIEW
-- a) Column must not exist yet on the first run: expect 0 rows.
select table_name, column_name from information_schema.columns
where table_schema = 'public' and table_name = 'quality master' and column_name = 'gauge_standard';

-- b) Parameters by check type (048 must be run: check_type exists).
select check_type, count(*) as parameters from public."quality master" group by check_type order by 1;

-- c) View columns + reloptions today. Expect cols ending ...,result,check_type,gauge_ref,gauge_result
--    and reloptions null.
select c.relname, string_agg(a.attname, ',' order by a.attnum) as cols, c.reloptions
from pg_class c join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
where c.relnamespace = 'public'::regnamespace and c.relname = 'quality log results'
group by c.relname, c.reloptions;

-- d) Objects that depend on the view (expect "report quality inspections";
--    create or replace with an appended column keeps them).
select distinct dependent.relname
from pg_depend d
join pg_rewrite r on r.oid = d.objid
join pg_class dependent on dependent.oid = r.ev_class
join pg_class source on source.oid = d.refobjid
where source.relname = 'quality log results' and dependent.relname <> 'quality log results';

-- ----------------------------------------------------------------- CHANGE
-- 1. Column
alter table public."quality master" add column if not exists gauge_standard text;

comment on column public."quality master".gauge_standard is
  'Standard / spec for a Gauge parameter, as text (e.g. M8x1.25 6H). Display only -- never used to calculate the result (053).';

-- 2. Grant (column level; harmless where table-level grants exist)
grant select (gauge_standard), insert (gauge_standard), update (gauge_standard) on public."quality master" to authenticated;

-- 3. View (048 definition + gauge_standard appended last; no reloptions)
create or replace view public."quality log results" as
 SELECT qlr.id AS reading_id,
    qlr.quality_log_id,
    qm.quality_parameter,
    qlr.observed_value,
    qm.standard,
    qm.upper_tolerance,
    qm.lower_tolerance,
        CASE
            WHEN qm.check_type = 'Gauge'::text THEN
                CASE qlr.gauge_result
                    WHEN 'OK'::text THEN 'Accepted'::text
                    WHEN 'Not OK'::text THEN 'Not Accepted'::text
                    ELSE NULL::text
                END
            WHEN qm.standard IS NULL THEN NULL::text
            WHEN qlr.observed_value >= (qm.standard - COALESCE(qm.lower_tolerance, 0::numeric)) AND qlr.observed_value <= (qm.standard + COALESCE(qm.upper_tolerance, 0::numeric)) THEN 'Accepted'::text
            ELSE 'Not Accepted'::text
        END AS result,
    qm.check_type,
    qm.gauge_ref,
    qlr.gauge_result,
    -- 053 (appended)
    qm.gauge_standard
   FROM "quality log readings" qlr
     JOIN "quality master" qm ON qm.id = qlr.quality_parameter_id;

notify pgrst, 'reload schema';

-- ----------------------------------------------------------- VERIFICATION
-- 1. Column: expect gauge_standard, text, is_nullable YES, no default.
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'quality master' and column_name = 'gauge_standard';

-- 2. Grant: expect authenticated with INSERT, SELECT, UPDATE on gauge_standard
--    (column privileges; table-level ones may also show).
select grantee, string_agg(privilege_type, ', ' order by privilege_type) as privileges
from information_schema.column_privileges
where table_schema = 'public' and table_name = 'quality master' and column_name = 'gauge_standard'
group by grantee order by 1;

-- 3. View: expect cols = PREVIEW c + ',gauge_standard' at the END, reloptions null.
select c.relname, string_agg(a.attname, ',' order by a.attnum) as cols, c.reloptions
from pg_class c join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
where c.relnamespace = 'public'::regnamespace and c.relname = 'quality log results'
group by c.relname, c.reloptions;

-- 4. Results unchanged: expect 0 rows (no reading's result depends on gauge_standard;
--    a Gauge result still comes from gauge_result only).
select reading_id, check_type, gauge_result, result
from public."quality log results"
where check_type = 'Gauge'
  and result is distinct from (case gauge_result when 'OK' then 'Accepted' when 'Not OK' then 'Not Accepted' end);

-- 5. "report quality inspections" still reads fine (expect a number, no error).
select count(*) from public."report quality inspections";

-- --------------------------------------------------------------- ROLLBACK
-- Run only to undo 053. View first (it depends on the column), then the column.
-- create or replace cannot drop a column, so the view is dropped and recreated;
-- "report quality inspections" depends on it -- recreate that from its live
-- definition (029, security_invoker = true) after this if you roll back.
--
-- drop view if exists public."quality log results" cascade;
-- create view public."quality log results" as
--  SELECT qlr.id AS reading_id, qlr.quality_log_id, qm.quality_parameter, qlr.observed_value,
--     qm.standard, qm.upper_tolerance, qm.lower_tolerance,
--         CASE
--             WHEN qm.check_type = 'Gauge'::text THEN
--                 CASE qlr.gauge_result WHEN 'OK'::text THEN 'Accepted'::text WHEN 'Not OK'::text THEN 'Not Accepted'::text ELSE NULL::text END
--             WHEN qm.standard IS NULL THEN NULL::text
--             WHEN qlr.observed_value >= (qm.standard - COALESCE(qm.lower_tolerance, 0::numeric)) AND qlr.observed_value <= (qm.standard + COALESCE(qm.upper_tolerance, 0::numeric)) THEN 'Accepted'::text
--             ELSE 'Not Accepted'::text
--         END AS result,
--     qm.check_type, qm.gauge_ref, qlr.gauge_result
--    FROM "quality log readings" qlr JOIN "quality master" qm ON qm.id = qlr.quality_parameter_id;
-- grant select on public."quality log results" to authenticated;
-- (then recreate "report quality inspections" with security_invoker = true + its grants)
-- alter table public."quality master" drop column if exists gauge_standard;
-- notify pgrst, 'reload schema';
