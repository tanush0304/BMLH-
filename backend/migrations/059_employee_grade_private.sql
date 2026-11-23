-- =====================================================================
-- 059 -- Employee grade + "employee private details".  NOT RUN.
-- Assumes 058 has run ("employees master" = read for all signed-in users,
-- write for supervisor / admin).
--
-- 1. "employees master".grade: free text, optional, max 30 characters
--    (check employees_master_grade_len). Visible to everyone who can see
--    Employee Master (058's read policy).
-- 2. New table "employee private details" (one row per employee):
--      employee_id   text PK, FK -> "employees master" ON DELETE RESTRICT
--                    (user decision: a cascade would let a supervisor's
--                    employee delete remove private rows past "delete admin
--                    only"; with restrict an admin removes the private row first)
--      phone_1, phone_2, address   text, optional
--      aadhaar_last4 text, exactly 4 digits when set (check)
--      updated_at    timestamptz, updated_by uuid -- stamped by an INVOKER
--                    trigger for app callers (is_app_caller(), 026)
--    RLS: SELECT / INSERT / UPDATE = is_app_supervisor() (supervisor +
--    admin, 028); DELETE = is_app_admin() (026). No policy for operators
--    -> with RLS on they see and change nothing. Nothing for anon.
--
-- Every statement stands alone (Supabase SQL editor commits each one):
-- no begin/commit, no temp tables, no DO blocks, no security definer.
-- Re-runnable (if not exists / drop if exists before every create).
-- =====================================================================


-- ---------------------------------------------------------------- PREVIEW
-- P1. "employees master" columns (expect NO grade yet; employee_id text, the PK).
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'employees master'
order by ordinal_position;

select con.conname, con.contype, pg_get_constraintdef(con.oid) as definition
from pg_constraint con
where con.conrelid = 'public."employees master"'::regclass and con.contype in ('p', 'u', 'c')
order by 1;

-- P2. The private table does not exist yet (expect NULL).
select to_regclass('public."employee private details"') as private_table;

-- P3. Role helpers: is_app_supervisor() = role in ('supervisor', 'admin');
--     is_app_admin() = role = 'admin'; is_app_caller() = current_user in app roles.
select pg_get_functiondef('public.is_app_supervisor()'::regprocedure) as is_app_supervisor;
select pg_get_functiondef('public.is_app_admin()'::regprocedure) as is_app_admin;
select pg_get_functiondef('public.is_app_caller()'::regprocedure) as is_app_caller;

-- P4. "employees master" policies after 058 (expect "employees master read"
--     SELECT true + "employees master write" ALL is_app_supervisor()).
select policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'employees master'
order by policyname;

-- P5. Existing grades that would break the 30-char check (expect 0 -- column is new).
--     (Only meaningful on a re-run.)
select count(*) as grades_over_30
from public."employees master"
where to_jsonb("employees master") ? 'grade'
  and char_length(to_jsonb("employees master") ->> 'grade') > 30;


-- ---------------------------------------------------------------- CHANGE
-- 1. Grade on "employees master"
alter table public."employees master" add column if not exists grade text;
alter table public."employees master" drop constraint if exists employees_master_grade_len;
alter table public."employees master" add constraint employees_master_grade_len check (grade is null or char_length(grade) <= 30);
comment on column public."employees master".grade is 'Free-text grade, optional, max 30 characters (059).';

-- 2. Private details table
create table if not exists public."employee private details" (
  employee_id   text primary key,
  phone_1       text,
  phone_2       text,
  address       text,
  aadhaar_last4 text,
  updated_at    timestamptz not null default now(),
  updated_by    uuid default auth.uid()
);
alter table public."employee private details" drop constraint if exists employee_private_details_employee_fkey;
alter table public."employee private details" add constraint employee_private_details_employee_fkey
  foreign key (employee_id) references public."employees master" (employee_id) on delete restrict;
alter table public."employee private details" drop constraint if exists employee_private_details_aadhaar_last4_check;
alter table public."employee private details" add constraint employee_private_details_aadhaar_last4_check
  check (aadhaar_last4 is null or aadhaar_last4 ~ '^[0-9]{4}$');
comment on table public."employee private details" is 'Employee phones / address / Aadhaar last 4. Supervisor + admin only (RLS, 059).';

-- 3. Stamp who / when (INVOKER; the SQL editor / service role keep what they write)
create or replace function public.stamp_employee_private_details() returns trigger
language plpgsql set search_path = public as $$  -- invoker: is_app_caller() needs current_user
begin
  if is_app_caller() then
    new.updated_at := now();
    new.updated_by := auth.uid();
  end if;
  return new;
end;
$$;
revoke all on function public.stamp_employee_private_details() from public;
revoke all on function public.stamp_employee_private_details() from anon;
drop trigger if exists trg_employee_private_stamp on public."employee private details";
create trigger trg_employee_private_stamp
  before insert or update on public."employee private details"
  for each row execute function public.stamp_employee_private_details();

-- 4. RLS + policies (supervisor / admin read + write, admin delete; nothing else)
alter table public."employee private details" enable row level security;
drop policy if exists "employee private details read" on public."employee private details";
drop policy if exists "employee private details insert" on public."employee private details";
drop policy if exists "employee private details update" on public."employee private details";
drop policy if exists "employee private details delete" on public."employee private details";
create policy "employee private details read" on public."employee private details" for select to authenticated using (public.is_app_supervisor());
create policy "employee private details insert" on public."employee private details" for insert to authenticated with check (public.is_app_supervisor());
create policy "employee private details update" on public."employee private details" for update to authenticated using (public.is_app_supervisor()) with check (public.is_app_supervisor());
create policy "employee private details delete" on public."employee private details" for delete to authenticated using (public.is_app_admin());

-- 5. Grants (Supabase gives new tables to anon + authenticated by default)
revoke all on public."employee private details" from public;
revoke all on public."employee private details" from anon;
revoke truncate, references, trigger on public."employee private details" from authenticated;
grant select, insert, update, delete on public."employee private details" to authenticated;

notify pgrst, 'reload schema';


-- ---------------------------------------------------------------- VERIFICATION
-- V1. grade column + check (expect 1 row each).
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'employees master' and column_name = 'grade';

select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public."employees master"'::regclass and conname = 'employees_master_grade_len';

-- V2. Private table: columns, PK, FK (ON DELETE RESTRICT), aadhaar check.
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'employee private details'
order by ordinal_position;

select conname, contype, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public."employee private details"'::regclass
order by conname;

-- V3. RLS on (expect true).
select relrowsecurity as rls_enabled
from pg_class
where oid = 'public."employee private details"'::regclass;

-- V4. Policies (expect exactly 4: read SELECT is_app_supervisor(),
--     insert INSERT with_check is_app_supervisor(), update UPDATE both
--     is_app_supervisor(), delete DELETE is_app_admin(); roles {authenticated}).
select policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'employee private details'
order by policyname;

-- V5. OPERATORS CANNOT READ (expect 0 rows): any policy that could let a
--     row be seen (SELECT / ALL) without the supervisor/admin check, or any
--     policy for anon / public.
select policyname, cmd, roles, qual
from pg_policies
where schemaname = 'public' and tablename = 'employee private details'
  and (
    (cmd in ('SELECT', 'ALL') and (qual is null or (qual not like '%is_app_supervisor()%' and qual not like '%is_app_admin()%')))
    or 'anon' = any(roles) or 'public' = any(roles)
  );

-- V6. Grants (expect authenticated = DELETE, INSERT, SELECT, UPDATE; no anon row).
select grantee, string_agg(privilege_type, ', ' order by privilege_type) as privileges
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'employee private details'
  and grantee in ('authenticated', 'anon')
group by grantee
order by 1;

-- V7. Trigger present; its function is NOT security definer (expect prosecdef false).
select t.tgname, p.proname, p.prosecdef as security_definer
from pg_trigger t join pg_proc p on p.oid = t.tgfoid
where t.tgrelid = 'public."employee private details"'::regclass and not t.tgisinternal;


-- ---------------------------------------------------------------- ROLLBACK
-- Run only to undo 059 (uncomment). WARNING: dropping the table deletes
-- every stored phone / address / Aadhaar last 4; dropping grade deletes
-- every grade. Each statement stands alone; re-runnable.
--   drop trigger if exists trg_employee_private_stamp on public."employee private details";
--   drop policy if exists "employee private details read" on public."employee private details";
--   drop policy if exists "employee private details insert" on public."employee private details";
--   drop policy if exists "employee private details update" on public."employee private details";
--   drop policy if exists "employee private details delete" on public."employee private details";
--   drop table if exists public."employee private details";
--   drop function if exists public.stamp_employee_private_details();
--   alter table public."employees master" drop constraint if exists employees_master_grade_len;
--   alter table public."employees master" drop column if exists grade;
--   notify pgrst, 'reload schema';
