-- =====================================================================
-- 028: Shift Verification -- per (log, log_date, shift_code)
-- Written, NOT run. DRAFT for review.
--
-- Verification moves from the whole production log (017 verified_by /
-- verified_at) to one row per log per shift in
-- "production shift verifications". A log that spans shifts gets one row
-- per shift. Approving one shift locks only that shift's hour rows.
--
-- Covers machine logs AND Manual Operations logs (same two tables; manual
-- logs have no machine). Same Approve / Reject / lock rules for both.
--
-- Status: Pending / Approved / Rejected (stored). "No entry" (a machine --
-- all of "machines master", there is no active flag -- with no hours for the
-- date + shift) is worked out on screen and never stored; manual logs never
-- show "No entry". A log+shift with hours but no row here counts as Pending.
--
-- a) "production log hours".entered_by = the LAST app user who saved the
--    hour row. A BEFORE INSERT OR UPDATE trigger sets it to auth.uid() on
--    every app save (client values overwritten), so a supervisor who edits
--    or upserts an operator's hour becomes its entrant and can't then
--    approve that shift. Non-app callers (SQL editor) leave it as is.
--    Existing rows are backfilled from the parent log's user_id (024);
--    rows from before 024 stay null (unknown). Needed for "you can't
--    approve your own entries".
-- b) New table + guard trigger:
--    - insert/update by supervisor/admin only (app callers)
--    - the server stamps verified_by/at (Approved) or rejected_by/at
--      (Rejected); client values are overwritten
--    - Approve is refused if any hour row of that log+shift was entered by
--      the caller -- admins included
--    - Reject needs a reason
--    - an Approved row can only be changed by an admin
-- c) Resubmit: ANY app save (insert/update) of hours in a Rejected
--    log+shift sets it back to Pending and clears the reason / rejected
--    stamp. Done by a security definer trigger function: inside it
--    current_user is the owner, so the guard in b) steps aside (same 026
--    is_app_caller() bypass) -- no session flag. App users still can't set
--    Pending directly (the guard requires supervisor/admin).
-- d) 026 lock rewritten:
--    - hours: locked when THEIR (log, log_date, shift_code) is Approved
--    - log header: locked (except close / lower planned_qty, as in 026)
--      when ANY shift of the log is Approved
-- e) Backfill: every log verified under 017 gets an Approved row for each
--    shift it has hours in, with the same verified_by/at.
--    "production logs".verified_by/at and 017's trigger are kept (no DB
--    objects dropped); the app stops writing them.
--
-- Same 026 bypass for non-app callers (SQL editor, service_role).
-- =====================================================================

begin;

-- ---------------------------------------------------------------- a) who entered each hour
alter table "production log hours" add column if not exists entered_by uuid;
alter table "production log hours" alter column entered_by set default auth.uid();

-- Backfill runs BEFORE the stamp trigger below exists.
update "production log hours" h
set entered_by = l.user_id
from "production logs" l
where l.id = h.log_id and h.entered_by is null and l.user_id is not null;

-- Invoker, so is_app_caller() sees the real caller (026 pattern).
create or replace function stamp_hour_entered_by() returns trigger
language plpgsql set search_path = public as $$
begin
  if is_app_caller() then
    new.entered_by := auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_hours_stamp_entered_by on "production log hours";
create trigger trg_hours_stamp_entered_by
  before insert or update on "production log hours"
  for each row execute function stamp_hour_entered_by();

-- ---------------------------------------------------------------- b) table
create table if not exists "production shift verifications" (
  id            bigint generated always as identity primary key,
  log_id        bigint not null references "production logs"(id) on delete cascade,
  log_date      date   not null,
  shift_code    text   not null references "shifts master"(shift_code),
  status        text   not null default 'Pending'
                  check (status in ('Pending', 'Approved', 'Rejected')),
  reject_reason text,
  verified_by   uuid references auth.users(id),
  verified_at   timestamptz,
  rejected_by   uuid references auth.users(id),
  rejected_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint production_shift_verifications_key unique (log_id, log_date, shift_code),
  constraint production_shift_verifications_reason
    check (status <> 'Rejected' or nullif(btrim(reject_reason), '') is not null),
  constraint production_shift_verifications_approved_pair
    check (status <> 'Approved' or (verified_by is not null and verified_at is not null))
);

create index if not exists production_shift_verifications_date_shift
  on "production shift verifications" (log_date, shift_code);

alter table "production shift verifications" enable row level security;
drop policy if exists psv_select on "production shift verifications";
drop policy if exists psv_insert on "production shift verifications";
drop policy if exists psv_update on "production shift verifications";
create policy psv_select on "production shift verifications" for select to authenticated using (true);
create policy psv_insert on "production shift verifications" for insert to authenticated with check (true);
create policy psv_update on "production shift verifications" for update to authenticated using (true) with check (true);
revoke delete on "production shift verifications" from anon, authenticated;

-- is_app_supervisor(): definer so the role lookup gets past "app users" RLS.
create or replace function is_app_supervisor() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from "app users"
                 where user_id = auth.uid() and role in ('supervisor', 'admin'));
$$;

create or replace function guard_shift_verification() returns trigger
language plpgsql set search_path = public as $$  -- invoker (026 bypass needs current_user)
begin
  new.updated_at := now();
  if not is_app_caller() then
    return new;
  end if;

  if not is_app_supervisor() then
    raise exception 'Only a supervisor or admin can verify a shift' using errcode = '42501';
  end if;

  if tg_op = 'UPDATE' then
    if (new.log_id, new.log_date, new.shift_code) is distinct from (old.log_id, old.log_date, old.shift_code) then
      raise exception 'Log / date / shift of a verification can''t be changed' using errcode = '42501';
    end if;
    if old.status = 'Approved' and not is_app_admin() then
      raise exception 'This shift is approved and locked -- only an admin can change it' using errcode = '42501';
    end if;
  end if;

  if new.status = 'Approved' then
    -- Own entries: blocked for everyone, admins included.
    if exists (select 1 from "production log hours"
               where log_id = new.log_id and log_date = new.log_date
                 and shift_code = new.shift_code and entered_by = auth.uid()) then
      raise exception 'You entered this shift''s data -- another supervisor must approve it' using errcode = '42501';
    end if;
    new.verified_by := auth.uid();  new.verified_at := now();
    new.reject_reason := null;  new.rejected_by := null;  new.rejected_at := null;
  elsif new.status = 'Rejected' then
    new.rejected_by := auth.uid();  new.rejected_at := now();
    new.verified_by := null;  new.verified_at := null;
  else  -- Pending (admin un-approve)
    new.verified_by := null;  new.verified_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_shift_verification_guard on "production shift verifications";
create trigger trg_shift_verification_guard
  before insert or update on "production shift verifications"
  for each row execute function guard_shift_verification();

-- ---------------------------------------------------------------- c) resubmit -> Pending
-- security definer: runs as the owner, so the b) guard (is_app_caller()
-- false) lets the Rejected -> Pending reset through for the operator.
create or replace function reset_rejected_shift_on_edit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update "production shift verifications"
  set status = 'Pending', reject_reason = null, rejected_by = null, rejected_at = null,
      updated_at = now()
  where log_id = new.log_id and log_date = new.log_date
    and shift_code = new.shift_code and status = 'Rejected';
  return null;
end;
$$;

drop trigger if exists trg_hours_reset_rejected_shift on "production log hours";
create trigger trg_hours_reset_rejected_shift
  after insert or update on "production log hours"
  for each row execute function reset_rejected_shift_on_edit();

-- ---------------------------------------------------------------- d) 026 lock, per shift
create or replace function guard_verified_production_log_hours() returns trigger
language plpgsql set search_path = public as $$  -- invoker: see 026 header
begin
  if not is_app_caller() or is_app_admin() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  -- Old position (UPDATE / DELETE) and new position (INSERT / UPDATE) are
  -- both checked, so a row can't be moved into or out of an approved shift.
  if (tg_op <> 'INSERT' and exists (
        select 1 from "production shift verifications"
        where log_id = old.log_id and log_date = old.log_date
          and shift_code = old.shift_code and status = 'Approved'))
  or (tg_op <> 'DELETE' and exists (
        select 1 from "production shift verifications"
        where log_id = new.log_id and log_date = new.log_date
          and shift_code = new.shift_code and status = 'Approved')) then
    raise exception 'This shift is approved and locked -- hours can''t be added, changed or deleted (admin only)'
      using errcode = '42501';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create or replace function guard_verified_production_log() returns trigger
language plpgsql set search_path = public as $$  -- invoker: see 026 header
begin
  if not is_app_caller() or is_app_admin() or not exists (
       select 1 from "production shift verifications"
       where log_id = old.id and status = 'Approved') then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'DELETE' then
    raise exception 'Production log % has an approved shift -- only an admin can delete it', old.id
      using errcode = '42501';
  end if;
  if new.is_open is distinct from old.is_open and not (old.is_open = true and new.is_open = false) then
    raise exception 'Production log % has an approved shift -- it can be closed but not reopened', old.id
      using errcode = '42501';
  end if;
  if new.planned_qty is distinct from old.planned_qty
     and not (new.planned_qty is not null and old.planned_qty is not null and new.planned_qty <= old.planned_qty) then
    raise exception 'Production log % has an approved shift -- planned qty can only be reduced (End Log)', old.id
      using errcode = '42501';
  end if;
  if (to_jsonb(new) - array['is_open', 'planned_qty', 'updated_at'])
     is distinct from (to_jsonb(old) - array['is_open', 'planned_qty', 'updated_at']) then
    raise exception 'Production log % has an approved shift -- only an admin can change it', old.id
      using errcode = '42501';
  end if;
  return new;
end;
$$;
-- (026's triggers already point at these two functions by name.)

-- ---------------------------------------------------------------- e) backfill 017 verifications
-- Runs as postgres (SQL editor), so the guard steps aside and keeps the
-- copied verified_by / verified_at.
insert into "production shift verifications" (log_id, log_date, shift_code, status, verified_by, verified_at)
select distinct h.log_id, h.log_date, h.shift_code, 'Approved', l.verified_by, l.verified_at
from "production log hours" h
join "production logs" l on l.id = h.log_id
where l.verified_at is not null
on conflict (log_id, log_date, shift_code) do nothing;

commit;

notify pgrst, 'reload schema';

-- =====================================================================
-- Verification (after running)
-- =====================================================================
-- 1. select count(*) from "production log hours" where entered_by is null;   -- pre-024 rows only
-- 2. select l.id, count(v.*) from "production logs" l
--    left join "production shift verifications" v on v.log_id = l.id
--    where l.verified_at is not null group by 1;                            -- every verified log >= 1
-- 3. select tgname from pg_trigger where tgname in
--    ('trg_shift_verification_guard', 'trg_hours_reset_rejected_shift',
--     'trg_hours_stamp_entered_by');                                         -- 3 rows
-- 4. In the app (TEST data): approve shift A of a log spanning A+B -> A hours
--    locked, B hours still editable; approving own entries -> refused;
--    (as admin too); supervisor edits an operator's hour -> that
--    supervisor can no longer approve the shift; reject -> operator saves
--    hours -> Pending, reason cleared; same on a Manual Operations log.
-- 5. Guard + stamp functions invoker, reset + is_app_supervisor definer
--    (expect f, f, t, t):
--    select proname, prosecdef from pg_proc where proname in
--    ('guard_shift_verification', 'stamp_hour_entered_by',
--     'reset_rejected_shift_on_edit', 'is_app_supervisor');

-- =====================================================================
-- Rollback
-- =====================================================================
-- begin;
-- drop trigger if exists trg_hours_reset_rejected_shift on "production log hours";
-- drop function if exists reset_rejected_shift_on_edit();
-- drop table if exists "production shift verifications";
-- drop function if exists guard_shift_verification();
-- drop function if exists is_app_supervisor();
-- drop trigger if exists trg_hours_stamp_entered_by on "production log hours";
-- drop function if exists stamp_hour_entered_by();
-- alter table "production log hours" drop column if exists entered_by;
-- -- then re-run section a) of 026_db_guards.sql to restore the per-log lock
-- commit;
-- notify pgrst, 'reload schema';
