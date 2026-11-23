-- =====================================================================
-- 061 -- Full 12-digit Aadhaar on "employee private details".  NOT RUN.
-- Run after 059 / 060.
--
-- aadhaar_number text, check: null or exactly 12 digits. 059's RLS
-- (read / insert / update = supervisor + admin, delete = admin) already
-- covers the new column -- no policy / grant change here.
-- The app also refuses a number failing the Verhoeff check digit or
-- starting with 0 / 1 (utils/aadhaar.js); the DB check is digits only.
--
-- Stored in plain text (no column encryption): accepted by BMLH (user,
-- 2026-11-23). Anyone with Supabase dashboard / SQL / service-role access
-- can read it; app users only through RLS (supervisor / admin).
--
-- CHANGE has TWO parts (statements can't be conditional without a DO block):
--   Part A -- always: add aadhaar_number + its check.
--   Part B -- ONLY IF PREVIEW P1 = 0: drop aadhaar_last4 + its check.
--             If P1 > 0, do NOT run Part B; report the count first (the
--             full number can't be rebuilt from the last 4 digits).
--
-- Every statement stands alone (Supabase SQL editor commits each one):
-- no begin/commit, no temp tables, no DO blocks, no security definer.
-- Re-runnable (if not exists / drop if exists first).
-- =====================================================================


-- ---------------------------------------------------------------- PREVIEW
-- P1. Rows with a last-4 Aadhaar stored. THIS DECIDES PART B:
--     0 -> run Part B;  > 0 -> skip Part B and report the count.
select count(*) as rows_with_aadhaar_last4
from public."employee private details"
where aadhaar_last4 is not null;

-- P2. Current columns + checks (expect aadhaar_last4, no aadhaar_number yet).
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'employee private details'
order by ordinal_position;

select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public."employee private details"'::regclass and contype = 'c'
order by conname;

-- P3. 059's policies (expect the 4: read / insert / update = is_app_supervisor(),
--     delete = is_app_admin()). Unchanged by 061.
select policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'employee private details'
order by policyname;


-- ---------------------------------------------------------------- CHANGE
-- ---- Part A (always) ----
alter table public."employee private details" add column if not exists aadhaar_number text;
alter table public."employee private details" drop constraint if exists employee_private_details_aadhaar_number_check;
alter table public."employee private details" add constraint employee_private_details_aadhaar_number_check
  check (aadhaar_number is null or aadhaar_number ~ '^[0-9]{12}$');
comment on column public."employee private details".aadhaar_number is 'Full 12-digit Aadhaar (061). Supervisor / admin only (059 RLS). Plain text, accepted by BMLH.';
notify pgrst, 'reload schema';

-- ---- Part B: RUN ONLY IF PREVIEW P1 = 0 -- otherwise STOP and report the count ----
alter table public."employee private details" drop constraint if exists employee_private_details_aadhaar_last4_check;
alter table public."employee private details" drop column if exists aadhaar_last4;
notify pgrst, 'reload schema';


-- ---------------------------------------------------------------- VERIFICATION
-- V1. aadhaar_number + its check (expect 1 row each).
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'employee private details' and column_name = 'aadhaar_number';

select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public."employee private details"'::regclass and conname = 'employee_private_details_aadhaar_number_check';

-- V2. aadhaar_last4 (expect 0 rows if Part B ran; 1 row if it was skipped).
select column_name
from information_schema.columns
where table_schema = 'public' and table_name = 'employee private details' and column_name = 'aadhaar_last4';

-- V3. RLS still on (expect true) and 059's 4 policies unchanged.
select relrowsecurity as rls_enabled
from pg_class
where oid = 'public."employee private details"'::regclass;

select policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'employee private details'
order by policyname;

-- V4. OPERATORS STILL CANNOT READ (expect 0 rows): any SELECT / ALL policy
--     without the supervisor / admin check, or any policy for anon / public.
select policyname, cmd, roles, qual
from pg_policies
where schemaname = 'public' and tablename = 'employee private details'
  and (
    (cmd in ('SELECT', 'ALL') and (qual is null or (qual not like '%is_app_supervisor()%' and qual not like '%is_app_admin()%')))
    or 'anon' = any(roles) or 'public' = any(roles)
  );


-- ---------------------------------------------------------------- ROLLBACK
-- Run only to undo 061 (uncomment). WARNING: dropping aadhaar_number deletes
-- every stored full Aadhaar number. Each statement stands alone; re-runnable.
--   alter table public."employee private details" drop constraint if exists employee_private_details_aadhaar_number_check;
--   alter table public."employee private details" drop column if exists aadhaar_number;
-- Only if Part B ran (puts back an EMPTY last-4 column + 059's check):
--   alter table public."employee private details" add column if not exists aadhaar_last4 text;
--   alter table public."employee private details" drop constraint if exists employee_private_details_aadhaar_last4_check;
--   alter table public."employee private details" add constraint employee_private_details_aadhaar_last4_check
--     check (aadhaar_last4 is null or aadhaar_last4 ~ '^[0-9]{4}$');
--   notify pgrst, 'reload schema';
