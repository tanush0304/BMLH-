-- 057_quality_samples.sql
-- Several samples per parameter in one inspection (BMLH In-Process Inspection
-- Report: up to 10 observation columns).
--
--   1. "quality log readings".sample_no smallint NOT NULL default 1 -- every
--      existing reading becomes sample 1.
--   2. check quality_log_readings_sample_no_check: sample_no between 1 and 10.
--   3. unique (quality_log_id, quality_parameter_id) REPLACED by
--      quality_log_readings_log_param_sample_key
--      unique (quality_log_id, quality_parameter_id, sample_no).
--   4. The two edit-audit triggers (032 observed_value, 048 gauge_result) are
--      re-created IDENTICALLY with only 'sample_no' added to their locked
--      columns (audit_record_edit itself unchanged) -- a sample can't be
--      renumbered after it is saved.
--   5. "quality log results" = the 053 definition with qlr.sample_no APPENDED
--      as the last column; reloptions stay null (as live); select for
--      authenticated.
--   6. Column grants: authenticated select + insert on sample_no.
--
-- Not changed (checked):
--   * 048 guard trg_quality_reading_check_type (per row: a reading matches its
--     parameter's check type) -- works per sample as it is.
--   * 029 "report quality inspections": an inspection is Rejected when ANY
--     reading is Not Accepted, so one bad sample rejects it; `readings` now
--     counts samples. It depends on "quality log results"; create or replace
--     with an appended column keeps it.
--   * 055 jobwork QC gate: still the LATEST inspection's inspection_result.
--   No new functions (nothing new to revoke from anon).
--
-- Needs 029, 032, 048, 053. Every statement stands alone (no begin/commit,
-- no temp tables, no DO blocks, no security definer). Re-runnable.
-- The frontend hides the Samples control until this is run (probe on
-- "quality log readings".sample_no).
-- Run PREVIEW first, then CHANGE top to bottom, then VERIFICATION.

-- ---------------------------------------------------------------- PREVIEW
-- P1. Current unique constraint name. CHANGE C3 drops
--     "quality log readings_quality_log_id_quality_parameter_id_key" (live name,
--     WITH spaces, so it must be quoted) -- if the name here is different, STOP
--     and report it (the file must be corrected).
select conname, contype, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public."quality log readings"'::regclass and contype in ('u', 'c', 'p')
order by conname;

-- P2. Already run? First run: no sample_no row.
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'quality log readings' and column_name = 'sample_no';

-- P3. Rows today + duplicates per (log, parameter) -- expect duplicates 0.
select count(*) as readings,
       count(*) - count(distinct (quality_log_id, quality_parameter_id)) as duplicates
from public."quality log readings";

-- P4. Triggers today -- keep this output to compare with V5.
select t.tgname, pg_get_triggerdef(t.oid) as definition
from pg_trigger t
where t.tgrelid = 'public."quality log readings"'::regclass
  and t.tgname in ('trg_quality_log_readings_edit_audit', 'trg_quality_log_readings_gauge_audit', 'trg_quality_reading_check_type')
order by t.tgname;

-- P5. View columns + reloptions today. Expect cols ending
--     ...,check_type,gauge_ref,gauge_result,gauge_standard and reloptions null
--     ("report quality inspections": security_invoker=true).
select c.relname, string_agg(a.attname, ',' order by a.attnum) as cols, c.reloptions
from pg_class c join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
where c.oid in ('public."quality log results"'::regclass, 'public."report quality inspections"'::regclass)
group by c.relname, c.reloptions;

-- P6. Inspection results today (V7 must match).
select inspection_result, count(*) from public."report quality inspections" group by 1 order by 1;

-- ---------------------------------------------------------------- CHANGE
-- C1. Column (existing rows = sample 1).
alter table public."quality log readings" add column if not exists sample_no smallint not null default 1;

comment on column public."quality log readings".sample_no is
  'Sample number within the inspection, 1-10 (057). One row per parameter per sample.';

-- C2. 1..10.
alter table public."quality log readings" drop constraint if exists quality_log_readings_sample_no_check;

alter table public."quality log readings" add constraint quality_log_readings_sample_no_check
  check (sample_no between 1 and 10);

-- C3. Unique per (log, parameter, sample).
alter table public."quality log readings" drop constraint if exists quality_log_readings_log_param_sample_key;

alter table public."quality log readings" add constraint quality_log_readings_log_param_sample_key
  unique (quality_log_id, quality_parameter_id, sample_no);

alter table public."quality log readings" drop constraint if exists "quality log readings_quality_log_id_quality_parameter_id_key";

-- C4. Column grants (no update: sample_no is locked after insert).
grant select (sample_no), insert (sample_no) on public."quality log readings" to authenticated;

-- C5. Edit-audit triggers: identical to 032 / 048 + 'sample_no' locked.
drop trigger if exists trg_quality_log_readings_edit_audit on public."quality log readings";

create trigger trg_quality_log_readings_edit_audit
  before update on public."quality log readings"
  for each row execute function audit_record_edit(
    'observed_value', 'id', 'quality_log_id', 'quality_parameter_id', 'created_at', 'sample_no');

drop trigger if exists trg_quality_log_readings_gauge_audit on public."quality log readings";

create trigger trg_quality_log_readings_gauge_audit
  before update on public."quality log readings"
  for each row execute function audit_record_edit(
    'gauge_result', 'id', 'quality_log_id', 'quality_parameter_id', 'created_at', 'sample_no');

-- C6. View: 053 definition + sample_no appended last; no reloptions.
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
    qm.gauge_standard,
    -- 057 (appended)
    qlr.sample_no
   FROM "quality log readings" qlr
     JOIN "quality master" qm ON qm.id = qlr.quality_parameter_id;

grant select on public."quality log results" to authenticated;

-- C7. Read-only views: authenticated keeps SELECT only.
revoke insert, update, delete, truncate, references, trigger on public."quality log results" from authenticated;

revoke insert, update, delete, truncate, references, trigger on public."report quality inspections" from authenticated;

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------- VERIFICATION
-- V1. Column: sample_no smallint, NO, default 1.
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'quality log readings' and column_name = 'sample_no';

-- V2. Every existing reading is sample 1: expect not_sample_1 = 0 (on the first run).
select count(*) as readings, count(*) filter (where sample_no <> 1) as not_sample_1
from public."quality log readings";

-- V3. Constraints: expect quality_log_readings_log_param_sample_key
--     UNIQUE (quality_log_id, quality_parameter_id, sample_no) and
--     quality_log_readings_sample_no_check CHECK (1..10); the old
--     (quality_log_id, quality_parameter_id) unique GONE.
select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public."quality log readings"'::regclass and contype in ('u', 'c')
order by conname;

-- V4. Column grants for authenticated on sample_no: expect INSERT, SELECT.
select grantee, privilege_type
from information_schema.column_privileges
where table_schema = 'public' and table_name = 'quality log readings' and column_name = 'sample_no'
  and grantee in ('anon', 'authenticated')
order by grantee, privilege_type;

-- V5. Triggers -- compare with P4: the two audit triggers differ ONLY by
--     'sample_no' at the end of the argument list; the 048 guard is identical.
select t.tgname, pg_get_triggerdef(t.oid) as definition
from pg_trigger t
where t.tgrelid = 'public."quality log readings"'::regclass
  and t.tgname in ('trg_quality_log_readings_edit_audit', 'trg_quality_log_readings_gauge_audit', 'trg_quality_reading_check_type')
order by t.tgname;

-- V6. View: cols end ...,gauge_standard,sample_no; reloptions null
--     ("report quality inspections" still security_invoker=true); row counts equal.
select c.relname, string_agg(a.attname, ',' order by a.attnum) as cols, c.reloptions
from pg_class c join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
where c.oid in ('public."quality log results"'::regclass, 'public."report quality inspections"'::regclass)
group by c.relname, c.reloptions;

select (select count(*) from public."quality log results") as view_rows,
       (select count(*) from public."quality log readings") as table_rows;

-- V7. Inspection results unchanged: must equal P6.
select inspection_result, count(*) from public."report quality inspections" group by 1 order by 1;

-- V8. anon can't run the guard / audit functions: expect false, false.
select has_function_privilege('anon', 'public.guard_quality_reading_check_type()', 'EXECUTE') as anon_guard,
       has_function_privilege('anon', 'public.audit_record_edit()', 'EXECUTE') as anon_audit;

-- V9. View grants: authenticated SELECT; no anon.
select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and table_name in ('quality log results', 'report quality inspections')
  and grantee in ('anon', 'authenticated')
order by table_name, grantee, privilege_type;

-- ---------------------------------------------------------------- ROLLBACK
-- (only if needed). LOSES DATA: readings with sample_no > 1 are deleted.
-- Order matters: "report quality inspections" depends on "quality log
-- results", which depends on sample_no.
--   drop view if exists public."report quality inspections";
--   drop view if exists public."quality log results";
--   delete from public."quality log readings" where sample_no > 1;
--   alter table public."quality log readings" drop constraint if exists quality_log_readings_log_param_sample_key;
--   alter table public."quality log readings" drop constraint if exists quality_log_readings_sample_no_check;
--   alter table public."quality log readings" add constraint "quality log readings_quality_log_id_quality_parameter_id_key"
--     unique (quality_log_id, quality_parameter_id);
--   drop trigger if exists trg_quality_log_readings_edit_audit on public."quality log readings";
--   create trigger trg_quality_log_readings_edit_audit
--     before update on public."quality log readings"
--     for each row execute function audit_record_edit(
--       'observed_value', 'id', 'quality_log_id', 'quality_parameter_id', 'created_at');
--   drop trigger if exists trg_quality_log_readings_gauge_audit on public."quality log readings";
--   create trigger trg_quality_log_readings_gauge_audit
--     before update on public."quality log readings"
--     for each row execute function audit_record_edit(
--       'gauge_result', 'id', 'quality_log_id', 'quality_parameter_id', 'created_at');
--   alter table public."quality log readings" drop column if exists sample_no;
--   -- 053 view (no reloptions)
--   create view public."quality log results" as
--    SELECT qlr.id AS reading_id,
--       qlr.quality_log_id,
--       qm.quality_parameter,
--       qlr.observed_value,
--       qm.standard,
--       qm.upper_tolerance,
--       qm.lower_tolerance,
--           CASE
--               WHEN qm.check_type = 'Gauge'::text THEN
--                   CASE qlr.gauge_result
--                       WHEN 'OK'::text THEN 'Accepted'::text
--                       WHEN 'Not OK'::text THEN 'Not Accepted'::text
--                       ELSE NULL::text
--                   END
--               WHEN qm.standard IS NULL THEN NULL::text
--               WHEN qlr.observed_value >= (qm.standard - COALESCE(qm.lower_tolerance, 0::numeric)) AND qlr.observed_value <= (qm.standard + COALESCE(qm.upper_tolerance, 0::numeric)) THEN 'Accepted'::text
--               ELSE 'Not Accepted'::text
--           END AS result,
--       qm.check_type,
--       qm.gauge_ref,
--       qlr.gauge_result,
--       qm.gauge_standard
--      FROM "quality log readings" qlr
--        JOIN "quality master" qm ON qm.id = qlr.quality_parameter_id;
--   grant select on public."quality log results" to authenticated;
--   -- 029 view (security_invoker = true)
--   create view public."report quality inspections"
--   with (security_invoker = true) as
--   select
--     q.id                          as quality_log_id,
--     q.prd_no,
--     q.stage_id,
--     s.seq                         as stage_seq,
--     s.operation,
--     q.machine_id,
--     m.machine_name,
--     coalesce(m.category, 'Uncategorised') as machine_category,
--     q.log_date,
--     q.shift_code,
--     q.employee_id,
--     count(r.quality_log_id)       as readings,
--     count(*) filter (where r.result = 'Not Accepted') as ng_readings,
--     case when count(r.quality_log_id) = 0 then 'No readings'
--          when count(*) filter (where r.result = 'Not Accepted') = 0 then 'Accepted'
--          else 'Rejected' end as inspection_result
--   from "quality logs" q
--   join "production route card stages" s on s.id = q.stage_id
--   left join "machines master" m on m.machine_id = q.machine_id
--   left join "quality log results" r on r.quality_log_id = q.id
--   group by q.id, s.seq, s.operation, m.machine_name, m.category;
--   grant select on public."report quality inspections" to authenticated;
--   notify pgrst, 'reload schema';
