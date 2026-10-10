-- 027: Customer Complaints (Quality module).
--
--   "customer complaints"             one row per complaint: Registration
--                                     (sections 1-3) + Investigation & Closure
--                                     (sections 4-7) on the same row
--   "customer complaint attachments"  photos / PDFs / Excel files, one row per
--                                     file in Storage bucket "complaint-attachments"
--
-- complaint_no = CMP-YYYY-NNNN (year of complaint_date, 4+ digits, restarting
-- each year), assigned by a BEFORE INSERT trigger from a per-year counter
-- table ("customer complaint counters"). Unlike 022's max()+1, a number is
-- never reused after a delete (e.g. the TEST cleanup). A failed insert rolls
-- its counter bump back too, so failures leave no gap. The counter row's
-- update lock serialises concurrent inserts for the same year; the unique
-- constraint is the backstop. The screens never send a number.
--
-- Requires 026 (is_app_caller()), which is already run.
--
-- Status 'Closed' can be set (or a Closed complaint changed) by
-- supervisor/admin only ("app users".role, same check as 017/025) -- for app
-- requests only. SQL editor / dashboard / service_role skip the guard (same
-- is_app_caller() bypass as 026), so data fixes on closed complaints work.
--
-- Trigger order: both triggers are BEFORE INSERT and fire alphabetically,
-- so trg_customer_complaints_guard runs before trg_customer_complaints_no.
-- That is fine: on INSERT the guard only reads status (complaint_no is not
-- assigned yet and is not looked at); on UPDATE the number trigger doesn't
-- fire and the guard compares old/new complaint_no.
--
-- STEP 1 -- run first, on its own. The three referenced key columns must be
-- the primary key / unique on their tables (the foreign keys need that):
--
--   select tc.table_name, kcu.column_name, tc.constraint_type
--   from information_schema.table_constraints tc
--   join information_schema.key_column_usage kcu
--     on kcu.constraint_name = tc.constraint_name and kcu.table_name = tc.table_name
--   where tc.table_name in ('customers master', 'products master', 'employees master')
--     and tc.constraint_type in ('PRIMARY KEY', 'UNIQUE');
--   -- expect customer_id, part_serial_number, employee_id
--
-- STEP 2 -- the migration.

begin;

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------
create table if not exists "customer complaints" (
  id                          bigint generated always as identity primary key,
  complaint_no                text not null,

  -- 1 Complaint Details
  complaint_date              date not null default current_date,
  customer_id                 text not null references "customers master" (customer_id),
  contact_person              text,
  contact_number_email        text,
  complaint_source            text,

  -- 2 Product Details
  part_serial_number          text not null references "products master" (part_serial_number),
  customer_po_no              text,
  invoice_no                  text,
  batch_lot_no                text,
  qty_supplied                numeric check (qty_supplied >= 0),
  qty_complained              numeric check (qty_complained >= 0),
  manufacturing_date          date,

  -- 3 Complaint Classification
  complaint_type              text,
  complaint_category          text,
  complaint_description       text,
  defect_problem              text,
  severity                    text check (severity in ('Critical', 'Major', 'Minor')),
  priority                    text check (priority in ('High', 'Medium', 'Low')),

  -- 4 Initial Investigation
  received_by                 text references "employees master" (employee_id),
  investigation_owner         text references "employees master" (employee_id),
  initial_assessment          text,
  suspected_cause             text,
  affected_batch_jobs         text,
  containment_action          text,
  containment_date            date,

  -- 5 Root Cause Analysis
  root_cause                  text,
  root_cause_category         text check (root_cause_category in
                                ('Man', 'Machine', 'Material', 'Method', 'Measurement', 'Environment')),
  investigation_method        text check (investigation_method in ('5 Why', 'Fishbone', 'Other')),
  corrective_action           text,
  preventive_action           text,
  action_owner                text references "employees master" (employee_id),
  target_completion_date      date,

  -- 6 Resolution
  replacement_required        boolean,
  rework_required             boolean,
  return_material_required    boolean,
  credit_debit_note_required  boolean,
  replacement_qty             numeric check (replacement_qty >= 0),
  customer_communication      text,
  customer_response           text,

  -- 7 Closure
  action_completion_date      date,
  effectiveness_check         text,
  customer_acceptance         boolean,
  status                      text not null default 'Open' check (status in
                                ('Open', 'Under Investigation', 'Action Pending', 'Resolved', 'Closed')),
  closure_date                date,
  closed_by                   text references "employees master" (employee_id),
  closure_remarks             text,

  created_by                  uuid default auth.uid(),
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),

  constraint customer_complaints_complaint_no_key unique (complaint_no)
);

create index if not exists customer_complaints_status_idx on "customer complaints" (status);

-- ---------------------------------------------------------------------------
-- CMP-YYYY-NNNN on insert, from a per-year counter (never reused)
-- ---------------------------------------------------------------------------
create table if not exists "customer complaint counters" (
  year     int primary key,
  last_no  int not null check (last_no > 0)
);

-- No API access: only assign_complaint_no() (security definer) touches it.
alter table "customer complaint counters" enable row level security;
revoke all on "customer complaint counters" from anon, authenticated;

-- security definer so app users can bump the counter without any grant on
-- it; search_path pinned for that reason.
create or replace function assign_complaint_no()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year int := extract(year from coalesce(new.complaint_date, current_date))::int;
  v_next int;
begin
  -- First complaint of a year inserts the row (starting after any number
  -- already present for that year); later ones bump it. The row lock taken
  -- by the update serialises concurrent inserts for the same year.
  insert into "customer complaint counters" as c (year, last_no)
  values (
    v_year,
    coalesce((
      select max(substring(complaint_no from '^CMP-' || v_year || '-(\d+)$')::int)
      from "customer complaints"
      where complaint_no like 'CMP-' || v_year || '-%'
    ), 0) + 1
  )
  on conflict (year) do update set last_no = c.last_no + 1
  returning last_no into v_next;

  new.complaint_no := 'CMP-' || v_year || '-' || lpad(v_next::text, 4, '0');
  return new;
end;
$$;

revoke all on function assign_complaint_no() from public, anon, authenticated;

drop trigger if exists trg_customer_complaints_no on "customer complaints";
create trigger trg_customer_complaints_no
  before insert on "customer complaints"
  for each row execute function assign_complaint_no();

-- ---------------------------------------------------------------------------
-- Closed = supervisor/admin only; complaint_no / created_by never change;
-- updated_at stamped. App callers only.
-- ---------------------------------------------------------------------------

-- is_app_caller() comes from 026 (already run).

create or replace function guard_customer_complaint()
returns trigger
language plpgsql set search_path = public as $$  -- invoker: is_app_caller() needs the caller's current_user
declare
  v_is_supervisor boolean;
begin
  -- Non-app callers (SQL editor, service_role, dashboard) skip every check.
  -- updated_at is still stamped on their updates.
  if not is_app_caller() then
    if TG_OP = 'UPDATE' then
      new.updated_at := now();
    end if;
    return new;
  end if;

  select exists (
    select 1 from "app users"
    where user_id = auth.uid() and role in ('supervisor', 'admin')
  ) into v_is_supervisor;

  if TG_OP = 'UPDATE' then
    if new.complaint_no is distinct from old.complaint_no or new.created_by is distinct from old.created_by then
      raise exception 'complaint_no / created_by cannot be changed' using errcode = '42501';
    end if;
    if old.status = 'Closed' and not v_is_supervisor then
      raise exception 'Only a supervisor or admin can change a closed complaint' using errcode = '42501';
    end if;
    new.updated_at := now();
  end if;

  if new.status = 'Closed'
     and (TG_OP = 'INSERT' or old.status is distinct from 'Closed')
     and not v_is_supervisor then
    raise exception 'Only a supervisor or admin can close a complaint' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_customer_complaints_guard on "customer complaints";
create trigger trg_customer_complaints_guard
  before insert or update on "customer complaints"
  for each row execute function guard_customer_complaint();

-- ---------------------------------------------------------------------------
-- Attachments (file metadata; the file itself lives in Storage)
-- ---------------------------------------------------------------------------
create table if not exists "customer complaint attachments" (
  id            bigint generated always as identity primary key,
  complaint_id  bigint not null references "customer complaints" (id),
  file_path     text not null unique,   -- object path inside bucket complaint-attachments
  file_name     text not null,
  content_type  text,
  size_bytes    bigint,
  created_by    uuid default auth.uid(),
  created_at    timestamptz not null default now()
);

create index if not exists customer_complaint_attachments_complaint_idx
  on "customer complaint attachments" (complaint_id);

-- ---------------------------------------------------------------------------
-- RLS: authenticated users read / add / update; nobody deletes.
-- ---------------------------------------------------------------------------
alter table "customer complaints" enable row level security;
alter table "customer complaint attachments" enable row level security;

drop policy if exists "authenticated read customer complaints" on "customer complaints";
create policy "authenticated read customer complaints"
  on "customer complaints" for select to authenticated using (true);
drop policy if exists "authenticated insert customer complaints" on "customer complaints";
create policy "authenticated insert customer complaints"
  on "customer complaints" for insert to authenticated with check (true);
drop policy if exists "authenticated update customer complaints" on "customer complaints";
create policy "authenticated update customer complaints"
  on "customer complaints" for update to authenticated using (true) with check (true);

drop policy if exists "authenticated read complaint attachments" on "customer complaint attachments";
create policy "authenticated read complaint attachments"
  on "customer complaint attachments" for select to authenticated using (true);
drop policy if exists "authenticated insert complaint attachments" on "customer complaint attachments";
create policy "authenticated insert complaint attachments"
  on "customer complaint attachments" for insert to authenticated with check (true);

revoke delete on "customer complaints" from anon, authenticated;
revoke delete on "customer complaint attachments" from anon, authenticated;
revoke all on "customer complaints" from anon;
revoke all on "customer complaint attachments" from anon;

-- ---------------------------------------------------------------------------
-- Storage bucket (private) + policies: authenticated users read / upload.
-- 10 MB per file; images, PDF, Excel.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'complaint-attachments', 'complaint-attachments', false, 10485760,
  array[
    'image/*',
    'application/pdf',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
on conflict (id) do nothing;

drop policy if exists "authenticated read complaint-attachments" on storage.objects;
create policy "authenticated read complaint-attachments"
  on storage.objects for select to authenticated
  using (bucket_id = 'complaint-attachments');
drop policy if exists "authenticated upload complaint-attachments" on storage.objects;
create policy "authenticated upload complaint-attachments"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'complaint-attachments');

commit;

-- After running -- verify:
--   select column_name, data_type from information_schema.columns
--   where table_name = 'customer complaints' order by ordinal_position;          -- 51 columns
--   select tgname from pg_trigger
--   where tgrelid = '"customer complaints"'::regclass and not tgisinternal;    -- trg_customer_complaints_no, trg_customer_complaints_guard
--   select tablename, policyname, cmd from pg_policies
--   where tablename in ('customer complaints', 'customer complaint attachments')
--      or policyname like '%complaint-attachments%';                            -- 3 + 2 + 2 policies
--   select id, public, file_size_limit from storage.buckets where id = 'complaint-attachments';
--   select * from "customer complaint counters";                              -- empty until the first complaint
--   notify pgrst, 'reload schema';
--
-- Rollback (only if nothing real has been entered yet):
--   begin;
--   drop policy if exists "authenticated read complaint-attachments" on storage.objects;
--   drop policy if exists "authenticated upload complaint-attachments" on storage.objects;
--   -- then empty + delete bucket complaint-attachments in Dashboard > Storage
--   drop table if exists "customer complaint attachments";
--   drop table if exists "customer complaints";
--   drop table if exists "customer complaint counters";
--   drop function if exists assign_complaint_no();
--   drop function if exists guard_customer_complaint();
--   -- is_app_caller() belongs to 026 -- leave it.
--   commit;
--   notify pgrst, 'reload schema';
