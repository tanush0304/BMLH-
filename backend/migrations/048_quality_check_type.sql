-- 048_quality_check_type.sql
-- Quality parameters: Check Type "Measured" (default, as today) or "Gauge"
-- (OK / Not OK, no numeric value).
--
--   1. "quality master".check_type text not null default 'Measured'
--      (check in ('Measured','Gauge')) -- every existing row becomes Measured;
--      gauge_ref text null (gauge name / no.). Standard / tolerances stay as
--      they are (the app requires Standard for Measured, hides it for Gauge).
--      Check Type is fixed once the parameter has readings (BEFORE UPDATE
--      trigger: "Has readings -- add a new parameter instead", 23514;
--      is_app_caller() bypass).
--   2. "quality log readings": observed_value becomes NULLABLE; gauge_result
--      text null (check in ('OK','Not OK')); previous_gauge_result (032-style
--      audit). Check: exactly ONE of observed_value / gauge_result is set.
--      Trigger: the reading must match its parameter's check type (Gauge ->
--      gauge_result, Measured -> observed_value); is_app_caller() bypass.
--   3. Edit audit for gauge results: a second 032 trigger using the existing
--      audit_record_edit('gauge_result', ...) -- supervisor / admin only, keeps
--      previous_gauge_result (observed_value keeps its own 032 trigger).
--   4. View "quality log results" (live definition, column names / order kept,
--      appended only: check_type, gauge_ref, gauge_result): a Gauge reading's
--      result = OK -> 'Accepted', Not OK -> 'Not Accepted'; Measured unchanged.
--      reloptions: none (as live). "report quality inspections" is NOT changed
--      (it reads result) -- it keeps security_invoker=true.
--
-- Every statement stands alone (no begin/commit, no temp tables, no session
-- state -- the Supabase SQL editor commits each statement). Re-runnable.
-- The frontend hides Check Type / Gauge until this is run (probe on
-- "quality master".check_type).
-- Run PREVIEW alone first, then CHANGE top to bottom, then VERIFICATION.

-- ---------------------------------------------------------------- PREVIEW
-- a) Columns must not exist yet on the first run: expect 0 rows.
select table_name, column_name from information_schema.columns
where table_schema = 'public'
  and ((table_name = 'quality master' and column_name in ('check_type', 'gauge_ref'))
    or (table_name = 'quality log readings' and column_name in ('gauge_result', 'previous_gauge_result')))
order by 1, 2;

-- b) Parameters and readings today (all become Measured; every reading must
--    have a value -- expect readings_without_value = 0).
select (select count(*) from public."quality master") as parameters,
       (select count(*) from public."quality master" where standard is null) as parameters_without_standard,
       (select count(*) from public."quality log readings") as readings,
       (select count(*) from public."quality log readings" where observed_value is null) as readings_without_value;

-- c) View columns today (expect the live list; 048 only appends).
select c.relname, string_agg(a.attname, ',' order by a.attnum) as cols, c.reloptions
from pg_class c join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
where c.relname in ('quality log results', 'report quality inspections')
group by c.relname, c.reloptions order by 1;

-- d) Triggers on readings today (expect 032's trg_quality_log_readings_edit_audit).
select trigger_name, action_timing, string_agg(event_manipulation, ', ' order by event_manipulation) as events
from information_schema.triggers where event_object_table = 'quality log readings'
group by 1, 2 order by 1;

-- e) Grants on the two tables (column-level grants below are harmless if
--    table-level ones exist).
select table_name, grantee, string_agg(privilege_type, ', ' order by privilege_type) as privileges
from information_schema.role_table_grants
where table_schema = 'public' and table_name in ('quality master', 'quality log readings')
  and grantee in ('anon', 'authenticated')
group by 1, 2 order by 1, 2;

-- ----------------------------------------------------------------- CHANGE
-- 1. Quality Master ------------------------------------------------------------
alter table public."quality master"
  add column if not exists check_type text not null default 'Measured';

alter table public."quality master"
  drop constraint if exists quality_master_check_type_check;

alter table public."quality master"
  add constraint quality_master_check_type_check check (check_type in ('Measured', 'Gauge'));

alter table public."quality master"
  add column if not exists gauge_ref text;

comment on column public."quality master".check_type is
  'Measured (numeric value vs Standard +/- tolerance) or Gauge (OK / Not OK) (048).';

-- Check Type is fixed once the parameter has readings (add a new parameter instead)
create or replace function public.guard_quality_master_check_type() returns trigger
language plpgsql set search_path = public as $$  -- invoker (is_app_caller needs current_user)
begin
  if not is_app_caller() then
    return new;
  end if;
  if new.check_type is distinct from old.check_type
     and exists (select 1 from "quality log readings" r where r.quality_parameter_id = old.id) then
    raise exception 'Has readings -- add a new parameter instead' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_quality_master_check_type on public."quality master";

create trigger trg_quality_master_check_type
  before update on public."quality master"
  for each row execute function public.guard_quality_master_check_type();
comment on column public."quality master".gauge_ref is
  'Gauge name / no. for Gauge parameters (048, optional).';

-- 2. Readings --------------------------------------------------------------------
alter table public."quality log readings"
  alter column observed_value drop not null;

alter table public."quality log readings"
  add column if not exists gauge_result text;

alter table public."quality log readings"
  add column if not exists previous_gauge_result text;

alter table public."quality log readings"
  drop constraint if exists quality_log_readings_gauge_result_check;

alter table public."quality log readings"
  add constraint quality_log_readings_gauge_result_check
    check (gauge_result is null or gauge_result in ('OK', 'Not OK'));

alter table public."quality log readings"
  drop constraint if exists quality_log_readings_value_or_gauge;

alter table public."quality log readings"
  add constraint quality_log_readings_value_or_gauge
    check ((observed_value is null) <> (gauge_result is null));

comment on column public."quality log readings".gauge_result is
  'OK / Not OK for a Gauge parameter (048); null for Measured (observed_value set instead).';

-- reading must match its parameter's check type
create or replace function public.guard_quality_reading_check_type() returns trigger
language plpgsql set search_path = public as $$  -- invoker (is_app_caller needs current_user)
declare
  v_type text;
begin
  if not is_app_caller() then
    return new;
  end if;
  select check_type into v_type from "quality master" where id = new.quality_parameter_id;
  if coalesce(v_type, 'Measured') = 'Gauge' then
    if new.gauge_result is null or new.observed_value is not null then
      raise exception 'This is a Gauge check -- record OK or Not OK (no value).' using errcode = '23514';
    end if;
  else
    if new.observed_value is null or new.gauge_result is not null then
      raise exception 'This is a Measured check -- enter the observed value.' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_quality_reading_check_type on public."quality log readings";

create trigger trg_quality_reading_check_type
  before insert or update on public."quality log readings"
  for each row execute function public.guard_quality_reading_check_type();

-- 3. Edit audit for gauge results (032's function; supervisor / admin only,
--    keeps previous_gauge_result; same locked columns as 032)
--    Checked against 032's audit_record_edit source: for an app caller it
--    ALWAYS stamps edited_by := auth.uid(), edited_at := now() (even when its
--    tracked column is unchanged) and, when unchanged, puts previous_<col>
--    back. Both triggers therefore write the same stamps (now() is fixed per
--    transaction) and each only touches its own previous_ column -- they never
--    conflict, in either order.
drop trigger if exists trg_quality_log_readings_gauge_audit on public."quality log readings";

create trigger trg_quality_log_readings_gauge_audit
  before update on public."quality log readings"
  for each row execute function audit_record_edit(
    'gauge_result', 'id', 'quality_log_id', 'quality_parameter_id', 'created_at');

-- 4. View (live definition + Gauge result; appended columns only; no reloptions)
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
    -- 048 (appended)
    qm.check_type,
    qm.gauge_ref,
    qlr.gauge_result
   FROM "quality log readings" qlr
     JOIN "quality master" qm ON qm.id = qlr.quality_parameter_id;

-- 5. Grants -----------------------------------------------------------------------
grant insert (check_type, gauge_ref), update (check_type, gauge_ref) on public."quality master" to authenticated;

grant insert (gauge_result), update (gauge_result) on public."quality log readings" to authenticated;

revoke all on function public.guard_quality_reading_check_type() from public, anon;

grant execute on function public.guard_quality_reading_check_type() to authenticated, service_role;

revoke all on function public.guard_quality_master_check_type() from public, anon;

grant execute on function public.guard_quality_master_check_type() to authenticated, service_role;

notify pgrst, 'reload schema';

-- ----------------------------------------------------------- VERIFICATION
-- 1. New columns: expect check_type (NO null, default 'Measured'), gauge_ref,
--    gauge_result, previous_gauge_result; observed_value is_nullable = YES.
select table_name, column_name, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and ((table_name = 'quality master' and column_name in ('check_type', 'gauge_ref'))
    or (table_name = 'quality log readings' and column_name in ('observed_value', 'gauge_result', 'previous_gauge_result')))
order by 1, 2;

-- 2. Existing data: expect every parameter Measured, every reading has a
--    value and no gauge result.
select check_type, count(*) from public."quality master" group by 1 order by 1;
select count(*) filter (where observed_value is not null and gauge_result is null) as measured_readings,
       count(*) filter (where gauge_result is not null) as gauge_readings,
       count(*) as total
from public."quality log readings";

-- 3. Constraints: expect quality_master_check_type_check,
--    quality_log_readings_gauge_result_check, quality_log_readings_value_or_gauge.
select conrelid::regclass as table_name, conname from pg_constraint
where conname in ('quality_master_check_type_check', 'quality_log_readings_gauge_result_check',
                  'quality_log_readings_value_or_gauge')
order by 1, 2;

-- 4. Triggers on readings: expect 032's trg_quality_log_readings_edit_audit +
--    trg_quality_log_readings_gauge_audit (UPDATE) + trg_quality_reading_check_type
--    (INSERT, UPDATE).
select trigger_name, action_timing, string_agg(event_manipulation, ', ' order by event_manipulation) as events
from information_schema.triggers where event_object_table = 'quality log readings'
group by 1, 2 order by 1;

-- 4b. Quality Master trigger: expect trg_quality_master_check_type | BEFORE | UPDATE.
select trigger_name, action_timing, string_agg(event_manipulation, ', ' order by event_manipulation) as events
from information_schema.triggers where event_object_table = 'quality master'
  and trigger_name = 'trg_quality_master_check_type'
group by 1, 2;

-- 4c. Parameters whose Check Type is now locked (have readings) -- for info.
select qm.id, qm.part_serial_number, qm.quality_parameter, qm.check_type, count(r.id) as readings
from public."quality master" qm join public."quality log readings" r on r.quality_parameter_id = qm.id
group by 1, 2, 3, 4 order by 1;

-- 5. Views: "quality log results" = old columns + check_type, gauge_ref,
--    gauge_result, reloptions null; "report quality inspections" unchanged,
--    reloptions {security_invoker=true}.
select c.relname, string_agg(a.attname, ',' order by a.attnum) as cols, c.reloptions
from pg_class c join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
where c.relname in ('quality log results', 'report quality inspections')
group by c.relname, c.reloptions order by 1;

-- 6. Results unchanged for existing (Measured) readings: expect 0 rows
--    (no reading whose result differs from the old formula).
select r.reading_id, r.result
from public."quality log results" r
where r.check_type = 'Measured'
  and r.result is distinct from (case
        when r.standard is null then null
        when r.observed_value >= r.standard - coalesce(r.lower_tolerance, 0)
         and r.observed_value <= r.standard + coalesce(r.upper_tolerance, 0) then 'Accepted'
        else 'Not Accepted' end);

-- ------------------------------------------------------------ ROLLBACK
-- (only if needed; observed_value can be NOT NULL again only while no Gauge
--  reading exists -- delete / convert those first)
--   (CREATE OR REPLACE can't drop the appended columns: drop + re-create both views)
--   drop view if exists public."report quality inspections";
--   drop view if exists public."quality log results";
--   create view public."quality log results" as
--    SELECT qlr.id AS reading_id, qlr.quality_log_id, qm.quality_parameter, qlr.observed_value,
--       qm.standard, qm.upper_tolerance, qm.lower_tolerance,
--           CASE
--               WHEN qm.standard IS NULL THEN NULL::text
--               WHEN qlr.observed_value >= (qm.standard - COALESCE(qm.lower_tolerance, 0::numeric)) AND qlr.observed_value <= (qm.standard + COALESCE(qm.upper_tolerance, 0::numeric)) THEN 'Accepted'::text
--               ELSE 'Not Accepted'::text
--           END AS result
--      FROM "quality log readings" qlr
--        JOIN "quality master" qm ON qm.id = qlr.quality_parameter_id;
--   create view public."report quality inspections" with (security_invoker = true) as
--    SELECT q.id AS quality_log_id, q.prd_no, q.stage_id, s.seq AS stage_seq, s.operation, q.machine_id,
--       m.machine_name, COALESCE(m.category, 'Uncategorised'::text) AS machine_category,
--       q.log_date, q.shift_code, q.employee_id,
--       count(r.quality_log_id) AS readings,
--       count(*) FILTER (WHERE r.result = 'Not Accepted'::text) AS ng_readings,
--           CASE
--               WHEN count(r.quality_log_id) = 0 THEN 'No readings'::text
--               WHEN count(*) FILTER (WHERE r.result = 'Not Accepted'::text) = 0 THEN 'Accepted'::text
--               ELSE 'Rejected'::text
--           END AS inspection_result
--      FROM "quality logs" q
--        JOIN "production route card stages" s ON s.id = q.stage_id
--        LEFT JOIN "machines master" m ON m.machine_id = q.machine_id
--        LEFT JOIN "quality log results" r ON r.quality_log_id = q.id
--     GROUP BY q.id, s.seq, s.operation, m.machine_name, m.category;
--   grant select on public."quality log results", public."report quality inspections" to authenticated;
--   drop trigger if exists trg_quality_reading_check_type on public."quality log readings";
--   drop trigger if exists trg_quality_log_readings_gauge_audit on public."quality log readings";
--   drop function if exists public.guard_quality_reading_check_type();
--   alter table public."quality log readings" drop constraint if exists quality_log_readings_value_or_gauge;
--   alter table public."quality log readings" drop constraint if exists quality_log_readings_gauge_result_check;
--   alter table public."quality log readings" drop column if exists previous_gauge_result;
--   alter table public."quality log readings" drop column if exists gauge_result;
--   alter table public."quality log readings" alter column observed_value set not null;
--   drop trigger if exists trg_quality_master_check_type on public."quality master";
--   drop function if exists public.guard_quality_master_check_type();
--   alter table public."quality master" drop constraint if exists quality_master_check_type_check;
--   alter table public."quality master" drop column if exists gauge_ref;
--   alter table public."quality master" drop column if exists check_type;
--   notify pgrst, 'reload schema';
