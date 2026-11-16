-- 054_quality_jobwork_receipt.sql
-- Quality schema for incoming (jobwork) inspections. Schema only -- the gate
-- itself is 055.
--
--   1. "quality logs".receipt_id bigint null, FK -> "job order receipt"(id),
--      partial index. An inspection of material back from a jobwork DC names
--      the receipt (JR) it inspects.
--   2. "quality logs".machine_id becomes nullable; check
--      quality_logs_machine_or_receipt_check: a log is EITHER a machine
--      inspection (machine_id set, receipt_id null) OR a receipt inspection
--      (receipt_id set, machine_id null). Existing rows all have a machine.
--   3. Guard trg_quality_log_receipt_guard (BEFORE INSERT / UPDATE, invoker,
--      is_app_caller() bypass): a receipt log's PRD + stage must be the
--      receipt's DC PRD + stage, the DC must not be void, and receipt_id can't
--      be changed once saved.
--   4. "quality master".job_work_code text null, FK -> "job work master".
--      A Job Work row = part + job_work_code (+ operation), no machine, no
--      category. quality_master_applies_to_check (044) is REPLACED: a row is a
--      Job Work row (job_work_code set, machine_id + machine_category empty)
--      OR a machine / category row as before (job_work_code empty).
--   5. Column grants for authenticated (no definer).
--
-- Not changed: "report quality inspections" (029) already LEFT JOINs the
-- machine, so a receipt log shows machine null / category 'Uncategorised'
-- (the frontend shows "Jobwork" for it). "quality log results" untouched.
-- 032's edit audit on "quality logs" keeps machine_id locked (null stays null).
--
-- Needs 026 (is_app_caller), 044. Every statement stands alone (no
-- begin/commit, no temp tables, no session state). Re-runnable.
-- The frontend hides the receipt inspection + Job Work option until this is
-- run (probes on "quality logs".receipt_id and "quality master".job_work_code).
-- Run PREVIEW first, then CHANGE top to bottom, then VERIFICATION.

-- ---------------------------------------------------------------- PREVIEW
-- a) Already run? First run: receipt_id / job_work_code missing, machine_id is_nullable NO.
select table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and ((table_name = 'quality logs' and column_name in ('machine_id', 'receipt_id'))
    or (table_name = 'quality master' and column_name in ('machine_id', 'machine_category', 'job_work_code')))
order by 1, 2;

-- b) Key types the FKs point at: expect "job order receipt".id bigint,
--    "job work master".job_work_code text.
select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and ((table_name = 'job order receipt' and column_name = 'id')
    or (table_name = 'job work master' and column_name = 'job_work_code'));

-- c) Rows today: every quality log must have a machine (without_machine 0).
select count(*) as quality_logs, count(*) filter (where machine_id is null) as without_machine
from public."quality logs";

-- d) Quality Master rows by target (the replaced check must accept all of them).
select count(*) as rows,
       count(*) filter (where machine_id is not null) as with_machine,
       count(*) filter (where nullif(btrim(machine_category), '') is not null) as with_category
from public."quality master";

-- e) Check constraints today on both tables (044's quality_master_applies_to_check expected).
select conrelid::regclass as table_name, conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid in ('public."quality logs"'::regclass, 'public."quality master"'::regclass) and contype = 'c'
order by 1, 2;

-- f) Triggers on "quality logs" today (032 audit expected).
select tgname from pg_trigger where tgrelid = 'public."quality logs"'::regclass and not tgisinternal order by 1;

-- ----------------------------------------------------------------- CHANGE
-- 1. receipt_id + FK + index
alter table public."quality logs" add column if not exists receipt_id bigint;

alter table public."quality logs" drop constraint if exists quality_logs_receipt_id_fkey;

alter table public."quality logs" add constraint quality_logs_receipt_id_fkey
  foreign key (receipt_id) references public."job order receipt"(id);

create index if not exists quality_logs_receipt_idx on public."quality logs" (receipt_id) where receipt_id is not null;

comment on column public."quality logs".receipt_id is
  'Jobwork receipt (JR) this incoming inspection covers; null for a machine inspection (054).';

-- 2. machine_id nullable + machine-or-receipt check
alter table public."quality logs" alter column machine_id drop not null;

alter table public."quality logs" drop constraint if exists quality_logs_machine_or_receipt_check;

alter table public."quality logs" add constraint quality_logs_machine_or_receipt_check
  check ((machine_id is not null and receipt_id is null) or (machine_id is null and receipt_id is not null));

-- 3. Receipt guard
create or replace function public.guard_quality_log_receipt() returns trigger
language plpgsql set search_path = public as $$  -- invoker
declare
  v_dc         "job order dispatch";
  v_dc_no      text;
  v_receipt_no text;
begin
  if not is_app_caller() then
    return new;  -- SQL editor / service role
  end if;
  if tg_op = 'UPDATE' then
    if new.receipt_id is distinct from old.receipt_id then
      raise exception 'The jobwork receipt of an inspection can''t be changed -- log a new inspection instead.' using errcode = '23514';
    end if;
    if new.prd_no is not distinct from old.prd_no and new.stage_id is not distinct from old.stage_id then
      return new;  -- nothing this guard checks changed
    end if;
  end if;
  if new.receipt_id is null then
    return new;
  end if;
  select r.dc_no, r.receipt_no into v_dc_no, v_receipt_no
  from "job order receipt" r where r.id = new.receipt_id;
  if not found then
    return new;  -- the FK reports a missing receipt
  end if;
  select * into v_dc from "job order dispatch" where dc_no = v_dc_no;
  if not found then
    return new;
  end if;
  if v_dc.voided_at is not null then
    raise exception 'DC % is void -- there is nothing to inspect on %.', v_dc.dc_no, v_receipt_no using errcode = '23514';
  end if;
  if v_dc.prd_no is distinct from new.prd_no or v_dc.stage_id is distinct from new.stage_id then
    raise exception 'Receipt % (DC %) belongs to % and another stage -- pick the receipt''s own PRD and stage.', v_receipt_no, v_dc.dc_no, v_dc.prd_no
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_quality_log_receipt() from public, anon;

drop trigger if exists trg_quality_log_receipt_guard on public."quality logs";

create trigger trg_quality_log_receipt_guard
  before insert or update on public."quality logs"
  for each row execute function public.guard_quality_log_receipt();

-- 4. Quality Master Job Work rows
alter table public."quality master" add column if not exists job_work_code text;

alter table public."quality master" drop constraint if exists quality_master_job_work_code_fkey;

alter table public."quality master" add constraint quality_master_job_work_code_fkey
  foreign key (job_work_code) references public."job work master"(job_work_code);

comment on column public."quality master".job_work_code is
  'Job Work row: part + job work code (+ operation) for incoming inspections of jobwork receipts; machine_id and machine_category empty (054).';

alter table public."quality master" drop constraint if exists quality_master_applies_to_check;

alter table public."quality master" add constraint quality_master_applies_to_check
  check (
    (nullif(btrim(job_work_code), '') is not null and machine_id is null and nullif(btrim(machine_category), '') is null)
    or (nullif(btrim(job_work_code), '') is null and (machine_id is not null or nullif(btrim(machine_category), '') is not null))
  );

-- 5. Grants (column level; harmless where table-level grants exist)
grant select (receipt_id), insert (receipt_id) on public."quality logs" to authenticated;

grant select (job_work_code), insert (job_work_code), update (job_work_code) on public."quality master" to authenticated;

notify pgrst, 'reload schema';

-- ----------------------------------------------------------- VERIFICATION
-- 1. Columns: quality logs.machine_id YES, receipt_id bigint YES;
--    quality master.job_work_code text YES.
select table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and ((table_name = 'quality logs' and column_name in ('machine_id', 'receipt_id'))
    or (table_name = 'quality master' and column_name = 'job_work_code'))
order by 1, 2;

-- 2. Constraints: 4 rows (both FKs, both checks) with the definitions above.
select conrelid::regclass as table_name, conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conname in ('quality_logs_receipt_id_fkey', 'quality_logs_machine_or_receipt_check',
                  'quality_master_job_work_code_fkey', 'quality_master_applies_to_check')
order by 1, 2;

-- 3. Guard: trigger present; function NOT security definer (prosecdef false);
--    no EXECUTE for anon / public in proacl.
select tgname from pg_trigger where tgname = 'trg_quality_log_receipt_guard';
select proname, prosecdef, proacl from pg_proc
where pronamespace = 'public'::regnamespace and proname = 'guard_quality_log_receipt';

-- 4. Data unchanged: same counts as PREVIEW c / d; no receipt logs yet;
--    nothing violates the checks.
select count(*) as quality_logs,
       count(*) filter (where receipt_id is not null) as receipt_logs,
       count(*) filter (where machine_id is null) as without_machine
from public."quality logs";
select count(*) as rows, count(*) filter (where job_work_code is not null) as job_work_rows
from public."quality master";

-- 5. Column privileges for authenticated (INSERT, SELECT on receipt_id;
--    INSERT, SELECT, UPDATE on job_work_code).
select table_name, column_name, string_agg(privilege_type, ', ' order by privilege_type) as privileges
from information_schema.column_privileges
where table_schema = 'public' and grantee = 'authenticated'
  and ((table_name = 'quality logs' and column_name = 'receipt_id')
    or (table_name = 'quality master' and column_name = 'job_work_code'))
group by 1, 2 order by 1, 2;

-- 6. Report view still reads (a number, no error).
select count(*) from public."report quality inspections";

-- --------------------------------------------------------------- ROLLBACK
-- Run only to undo 054, and only while no receipt log / Job Work row exists
-- (machine_id set not null fails otherwise). Undo 055 first if it was run.
--
-- drop trigger if exists trg_quality_log_receipt_guard on public."quality logs";
-- drop function if exists public.guard_quality_log_receipt();
-- alter table public."quality logs" drop constraint if exists quality_logs_machine_or_receipt_check;
-- alter table public."quality logs" alter column machine_id set not null;
-- drop index if exists public.quality_logs_receipt_idx;
-- alter table public."quality logs" drop constraint if exists quality_logs_receipt_id_fkey;
-- alter table public."quality logs" drop column if exists receipt_id;
-- alter table public."quality master" drop constraint if exists quality_master_applies_to_check;
-- alter table public."quality master" add constraint quality_master_applies_to_check
--   check (machine_id is not null or nullif(btrim(machine_category), '') is not null);
-- alter table public."quality master" drop constraint if exists quality_master_job_work_code_fkey;
-- alter table public."quality master" drop column if exists job_work_code;
-- notify pgrst, 'reload schema';
