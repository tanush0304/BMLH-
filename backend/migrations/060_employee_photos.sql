-- =====================================================================
-- 060 -- Employee photos.  NOT RUN.  Run after 059.
--
-- 1. Private Storage bucket "employee-photos": public = false, JPEG / PNG
--    only, 2 MB per file (the app uploads a 400x400 JPEG, ~85 % quality).
-- 2. Policies on storage.objects for that bucket only -- read, upload,
--    replace AND delete = is_app_supervisor() (supervisor + admin, 028).
--    User decision (D = a): supervisors may delete too, so Replace / Remove
--    always delete the old file. Nothing for operators or anon.
-- 3. "employee private details".photo_path text (059's RLS: supervisor /
--    admin only). Check: null, or "<employee id>/<timestamp>.jpg" where
--    the id has every char outside [A-Za-z0-9_-] replaced by "_" (same
--    rule as the app, utils/employeePhoto.js photoPath) -- no names /
--    Aadhaar in file names, and a row cannot point at another employee's file.
--
-- Every statement stands alone (Supabase SQL editor commits each one):
-- no begin/commit, no temp tables, no DO blocks, no security definer.
-- Re-runnable (on conflict / if not exists / drop if exists first).
-- =====================================================================


-- ---------------------------------------------------------------- PREVIEW
-- P1. Bucket already there? (expect 0 rows on the first run)
select id, name, public, file_size_limit, allowed_mime_types
from storage.buckets
where id = 'employee-photos';

-- P2. Existing storage.objects policies for this bucket (expect 0 rows first run).
select policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
  and (coalesce(qual, '') like '%employee-photos%' or coalesce(with_check, '') like '%employee-photos%')
order by policyname;

-- P3. Broad storage.objects policies (no bucket_id condition) -- these would
--     open EVERY bucket, this one included. Expect 0 rows; if any, stop and report.
select policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
  and coalesce(qual, '') not like '%bucket_id%'
  and coalesce(with_check, '') not like '%bucket_id%';

-- P4. photo_path not there yet (expect 0 rows); 059's table exists.
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'employee private details' and column_name = 'photo_path';

select to_regclass('public."employee private details"') as private_table;

-- P5. Role helpers (is_app_supervisor = role in ('supervisor', 'admin')).
select pg_get_functiondef('public.is_app_supervisor()'::regprocedure) as is_app_supervisor;


-- ---------------------------------------------------------------- CHANGE
-- 1. Bucket (private, 2 MB, JPEG / PNG); settings re-applied on a re-run
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('employee-photos', 'employee-photos', false, 2097152, array['image/jpeg', 'image/png'])
on conflict (id) do update
  set public = false, file_size_limit = 2097152, allowed_mime_types = array['image/jpeg', 'image/png'];

-- 2. Policies: supervisor / admin only, this bucket only
drop policy if exists "employee-photos read" on storage.objects;
create policy "employee-photos read" on storage.objects for select to authenticated
  using (bucket_id = 'employee-photos' and public.is_app_supervisor());

drop policy if exists "employee-photos upload" on storage.objects;
create policy "employee-photos upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'employee-photos' and public.is_app_supervisor());

drop policy if exists "employee-photos replace" on storage.objects;
create policy "employee-photos replace" on storage.objects for update to authenticated
  using (bucket_id = 'employee-photos' and public.is_app_supervisor())
  with check (bucket_id = 'employee-photos' and public.is_app_supervisor());

drop policy if exists "employee-photos delete" on storage.objects;
create policy "employee-photos delete" on storage.objects for delete to authenticated
  using (bucket_id = 'employee-photos' and public.is_app_supervisor());

-- 3. photo_path on the private table (covered by 059's supervisor / admin RLS)
alter table public."employee private details" add column if not exists photo_path text;
alter table public."employee private details" drop constraint if exists employee_private_details_photo_path_check;
alter table public."employee private details" add constraint employee_private_details_photo_path_check
  check (photo_path is null
         or photo_path ~ ('^' || regexp_replace(employee_id, '[^A-Za-z0-9_-]', '_', 'g') || '/[0-9]{10,16}\.jpg$'));
comment on column public."employee private details".photo_path is 'employee-photos bucket path "<employee id>/<timestamp>.jpg" (060).';

notify pgrst, 'reload schema';


-- ---------------------------------------------------------------- VERIFICATION
-- V1. Bucket (expect public false, 2097152, {image/jpeg,image/png}).
select id, public, file_size_limit, allowed_mime_types
from storage.buckets
where id = 'employee-photos';

-- V2. Policies for the bucket (expect exactly 4: read SELECT, upload INSERT,
--     replace UPDATE, delete DELETE; all is_app_supervisor(); roles {authenticated}).
select policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
  and (coalesce(qual, '') like '%employee-photos%' or coalesce(with_check, '') like '%employee-photos%')
order by policyname;

-- V3. OPERATORS HAVE NO POLICY ON THE BUCKET (expect 0 rows): any policy
--     touching employee-photos without the supervisor check, or for anon / public.
select policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
  and (coalesce(qual, '') like '%employee-photos%' or coalesce(with_check, '') like '%employee-photos%')
  and (
    (cmd in ('SELECT', 'DELETE', 'ALL') and coalesce(qual, '') not like '%is_app_supervisor()%')
    or (cmd in ('INSERT', 'ALL') and coalesce(with_check, '') not like '%is_app_supervisor()%')
    or (cmd = 'UPDATE' and (coalesce(qual, '') not like '%is_app_supervisor()%' or coalesce(with_check, '') not like '%is_app_supervisor()%'))
    or 'anon' = any(roles) or 'public' = any(roles)
  );

-- V4. No broad storage.objects policy that would open every bucket (expect 0 rows).
select policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
  and coalesce(qual, '') not like '%bucket_id%'
  and coalesce(with_check, '') not like '%bucket_id%';

-- V5. photo_path column + check (expect 1 row each).
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'employee private details' and column_name = 'photo_path';

select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public."employee private details"'::regclass and conname = 'employee_private_details_photo_path_check';


-- ---------------------------------------------------------------- ROLLBACK
-- Run only to undo 060 (uncomment). WARNING: dropping photo_path loses the
-- links; the files stay in the bucket until it is emptied.
--   drop policy if exists "employee-photos read" on storage.objects;
--   drop policy if exists "employee-photos upload" on storage.objects;
--   drop policy if exists "employee-photos replace" on storage.objects;
--   drop policy if exists "employee-photos delete" on storage.objects;
--   alter table public."employee private details" drop constraint if exists employee_private_details_photo_path_check;
--   alter table public."employee private details" drop column if exists photo_path;
--   notify pgrst, 'reload schema';
-- The bucket itself: empty it and delete it in the Supabase dashboard
-- (Storage -> employee-photos -> Empty bucket, then Delete bucket);
-- Supabase does not allow deleting storage objects / buckets with SQL.
