-- 056_jobwork_gauge_and_security.sql
-- 1. Job Work quality parameters are always OK / Not OK:
--    check quality_master_jobwork_gauge_check on "quality master":
--    job_work_code is null or check_type = 'Gauge'.
--    (The frontend already saves Job Work rows as Gauge.)
-- 2. Security tidy-up:
--    a) "app settings": drop the admin insert / update policies (051) and
--       revoke INSERT, UPDATE from authenticated. SELECT + the read policy stay.
--       Settings are changed in the SQL editor only (it is not limited by
--       these grants / policies). No app screen writes them.
--    b) guard_stage_reopens_insert() (049, trigger function): revoke EXECUTE
--       from PUBLIC and anon (no-op when not granted).
--
-- Needs 048 (check_type), 049, 051, 054 (job_work_code).
-- Every statement stands alone (no begin/commit, no temp tables, no session
-- state, no security definer). Re-runnable.
-- Run PREVIEW first, then CHANGE top to bottom, then VERIFICATION.

-- ---------------------------------------------------------------- PREVIEW
-- P1. Job Work rows that are not Gauge -- expect 0 (the constraint can't be
--     added while any exist; Quality Master is empty live).
select id, part_serial_number, job_work_code, type_of_operation, quality_parameter, check_type
from public."quality master"
where job_work_code is not null and check_type is distinct from 'Gauge'
order by id;

-- P2. Constraint already there? (first run: 0 rows)
select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public."quality master"'::regclass and conname = 'quality_master_jobwork_gauge_check';

-- P3. "app settings" policies today (expect: admin insert, admin update, read).
select policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'app settings'
order by policyname;

-- P4. "app settings" table grants today (expect authenticated INSERT, SELECT, UPDATE; nothing for anon).
select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'app settings' and grantee in ('anon', 'authenticated', 'PUBLIC')
order by grantee, privilege_type;

-- P5. Who can execute guard_stage_reopens_insert() today.
select r.rolname,
       has_function_privilege(r.rolname, 'public.guard_stage_reopens_insert()', 'EXECUTE') as can_execute
from pg_roles r
where r.rolname in ('anon', 'authenticated', 'service_role')
order by r.rolname;

select p.proacl
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'guard_stage_reopens_insert';

-- ---------------------------------------------------------------- CHANGE
-- C1. Job Work = Gauge.
alter table public."quality master" drop constraint if exists quality_master_jobwork_gauge_check;

alter table public."quality master" add constraint quality_master_jobwork_gauge_check
  check (job_work_code is null or check_type = 'Gauge');

comment on constraint quality_master_jobwork_gauge_check on public."quality master" is
  'Job Work parameters are always OK / Not OK (Gauge) (056).';

-- C2. "app settings": read-only for the app.
drop policy if exists "app settings admin insert" on public."app settings";

drop policy if exists "app settings admin update" on public."app settings";

revoke insert, update on table public."app settings" from authenticated;

revoke insert, update on table public."app settings" from anon;

-- C3. Reopen history guard: no EXECUTE for PUBLIC / anon (no-op if not granted).
revoke execute on function public.guard_stage_reopens_insert() from public;

revoke execute on function public.guard_stage_reopens_insert() from anon;

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------- VERIFICATION
-- V1. Constraint present: 1 row, definition
--     CHECK ((job_work_code IS NULL) OR (check_type = 'Gauge'::text)).
select conname, convalidated, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public."quality master"'::regclass and conname = 'quality_master_jobwork_gauge_check';

-- V2. No Job Work row breaks it: expect 0.
select count(*) as jobwork_not_gauge
from public."quality master"
where job_work_code is not null and check_type is distinct from 'Gauge';

-- V3. Policies: expect only "app settings read" (SELECT).
select policyname, cmd
from pg_policies
where schemaname = 'public' and tablename = 'app settings'
order by policyname;

-- V4. Grants: expect authenticated SELECT only; no anon / PUBLIC rows.
select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'app settings' and grantee in ('anon', 'authenticated', 'PUBLIC')
order by grantee, privilege_type;

-- V5. Reopen guard: expect anon false.
select has_function_privilege('anon', 'public.guard_stage_reopens_insert()', 'EXECUTE') as anon_can_execute;

-- V6. RLS still on: expect true.
select relrowsecurity from pg_class where oid = 'public."app settings"'::regclass;

-- ---------------------------------------------------------------- ROLLBACK
-- (only if needed; puts back exactly what 051 / 054 left)
--   alter table public."quality master" drop constraint if exists quality_master_jobwork_gauge_check;
--   grant insert, update on table public."app settings" to authenticated;
--   drop policy if exists "app settings admin insert" on public."app settings";
--   create policy "app settings admin insert" on public."app settings"
--     for insert to authenticated with check (is_app_admin());
--   drop policy if exists "app settings admin update" on public."app settings";
--   create policy "app settings admin update" on public."app settings"
--     for update to authenticated using (is_app_admin()) with check (is_app_admin());
--   -- guard_stage_reopens_insert: re-grant only if P5 showed anon / PUBLIC had it:
--   -- grant execute on function public.guard_stage_reopens_insert() to public;
--   notify pgrst, 'reload schema';
