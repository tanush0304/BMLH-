-- =====================================================================
-- 026: DB guards (server-side copies of frontend-only rules)
-- Written, NOT run. Review, then run once in the Supabase SQL editor.
--
-- a) Verified production logs are locked.
--    Once "production logs".verified_at is set, the log and its hour rows
--    can't be changed or deleted, and no new hour rows can be added --
--    unless the caller's "app users".role = 'admin'.
--    Exception (checked in the code): after verification the app still
--    closes the log:
--      * End Log            -> update { is_open: false, planned_qty: <used> }
--                              (endProductionLog; planned_qty only goes DOWN)
--      * Mark Stage Complete -> update { is_open: false } (closeLog)
--    So on a verified log a non-admin may ONLY set is_open true -> false
--    and/or lower planned_qty; every other column must stay the same.
--    Only APP callers are guarded: when current_user is not 'authenticated'
--    or 'anon' (SQL editor / postgres, service_role, dashboard) the guards
--    step aside, so cleanup scripts and dashboard fixes still work.
--    The guard functions are therefore NOT security definer -- inside a
--    definer function current_user is the function owner, which would make
--    every call look like postgres. Only is_app_admin() is definer (it must
--    read "app users" past RLS); it relies on "app users".user_id (confirmed
--    in the live schema: user_id, employee_id, role, created_at,
--    updated_at, top_level).
--    Hour inserts are blocked too: the screen locks "Add Hour" / "Save
--    Hours" on a verified log, so adding hours after sign-off is the same
--    kind of change.
--
-- b) Stock ledgers: no DELETE for app users.
--    Revokes DELETE on the RM / WIP / FG transaction tables and the jobwork
--    dispatch / receipt tables from anon and authenticated. The app never
--    deletes from them (no screen calls deleteRawMaterialTransaction /
--    deleteFinishedGoodsTransaction; jobwork has no delete at all).
--    Corrections stay as supervisor/admin edits (025). The table owner
--    (SQL editor / postgres) and service_role keep DELETE, so test-data
--    cleanup scripts still work. RPC 019 (create_job_order_receipt) only
--    inserts/updates and is unaffected.
--
-- c) Same bypass for 025's stock-edit audit.
--    audit_stock_transaction_edit() (BEFORE UPDATE on the RM / WIP / FG
--    transaction tables) rejected every caller that isn't a supervisor/admin
--    in "app users" -- including the SQL editor and dashboard, where
--    auth.uid() is null. It is recreated with one added check at the top:
--    non-app callers return early. Everything else is identical to the 025
--    file. The triggers already point at this function by name, so they are
--    not recreated.
--    BEFORE RUNNING: confirm the live body still matches the 025 file:
--      select pg_get_functiondef('audit_stock_transaction_edit()'::regprocedure);
--    If it differs, merge the bypass into the live body instead.
-- =====================================================================

begin;

-- ---------------------------------------------------------------- a) helpers
-- security definer so the role lookup isn't blocked by "app users" RLS
-- (same pattern as 017).
create or replace function is_app_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from "app users" where user_id = auth.uid() and role = 'admin');
$$;

-- True only for requests coming through the app's API roles. Must be called
-- from an INVOKER function so current_user is the caller, not an owner.
create or replace function is_app_caller() returns boolean
language sql stable set search_path = public as $$
  select current_user in ('authenticated', 'anon');
$$;

-- ---------------------------------------------------------------- a) production logs
create or replace function guard_verified_production_log() returns trigger
language plpgsql set search_path = public as $$  -- invoker: see header
begin
  -- Only logs that were already verified BEFORE this statement are locked
  -- (the verify update itself, which sets verified_at, passes through).
  -- Non-app callers (SQL editor, service_role, dashboard) and admins skip.
  if not is_app_caller() or old.verified_at is null or is_app_admin() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'DELETE' then
    raise exception 'Production log % is verified and locked -- only an admin can delete it', old.id
      using errcode = '42501';
  end if;

  -- Allowed on a verified log: close it (is_open true -> false) and/or
  -- lower planned_qty (End Log). Compare every other column unchanged.
  if new.is_open is distinct from old.is_open and not (old.is_open = true and new.is_open = false) then
    raise exception 'Production log % is verified and locked -- it can be closed but not reopened', old.id
      using errcode = '42501';
  end if;
  if new.planned_qty is distinct from old.planned_qty
     and not (new.planned_qty is not null and old.planned_qty is not null and new.planned_qty <= old.planned_qty) then
    raise exception 'Production log % is verified and locked -- planned qty can only be reduced (End Log)', old.id
      using errcode = '42501';
  end if;
  if (to_jsonb(new) - array['is_open', 'planned_qty', 'updated_at'])
     is distinct from (to_jsonb(old) - array['is_open', 'planned_qty', 'updated_at']) then
    raise exception 'Production log % is verified and locked -- only an admin can change it', old.id
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_production_logs_verified_lock on "production logs";
create trigger trg_production_logs_verified_lock
  before update or delete on "production logs"
  for each row execute function guard_verified_production_log();

-- ---------------------------------------------------------------- a) production log hours
create or replace function guard_verified_production_log_hours() returns trigger
language plpgsql set search_path = public as $$  -- invoker: see header
declare
  v_log_id bigint := case when tg_op = 'INSERT' then new.log_id else old.log_id end;
begin
  -- Non-app callers (SQL editor, service_role, dashboard) and admins skip.
  -- The parent-log lookup below runs as the caller: app users can already
  -- read "production logs" (the screens do), so RLS doesn't hide it.
  if not is_app_caller() or is_app_admin() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  -- An UPDATE that moves the row to another log is checked against both.
  if exists (
    select 1 from "production logs"
    where verified_at is not null
      and (id = v_log_id or (tg_op = 'UPDATE' and id = new.log_id))
  ) then
    raise exception 'Production log % is verified and locked -- hours can''t be added, changed or deleted (admin only)', v_log_id
      using errcode = '42501';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists trg_production_log_hours_verified_lock on "production log hours";
create trigger trg_production_log_hours_verified_lock
  before insert or update or delete on "production log hours"
  for each row execute function guard_verified_production_log_hours();

-- ---------------------------------------------------------------- b) no DELETE on stock ledgers
revoke delete on "raw material transactions"   from anon, authenticated;
revoke delete on "wip transactions"            from anon, authenticated;
revoke delete on "finished goods transactions" from anon, authenticated;
revoke delete on "job order dispatch"          from anon, authenticated;
revoke delete on "job order receipt"           from anon, authenticated;

-- ---------------------------------------------------------------- c) 025 audit: bypass for non-app callers
create or replace function audit_stock_transaction_edit()
returns trigger
language plpgsql
as $$
declare
  v_col text;
begin
  -- 026: non-app callers (SQL editor / postgres, service_role, dashboard)
  -- skip the role check and the edit stamp. 025's function is invoker, so
  -- current_user is the real caller here.
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if not exists (
    select 1 from "app users"
    where user_id = auth.uid() and role in ('supervisor', 'admin')
  ) then
    raise exception 'Only a supervisor or admin can edit a stock transaction'
      using errcode = '42501';
  end if;

  foreach v_col in array TG_ARGV loop
    if (to_jsonb(new) -> v_col) is distinct from (to_jsonb(old) -> v_col) then
      raise exception '% cannot be changed on an existing transaction', v_col
        using errcode = '42501';
    end if;
  end loop;

  new.edited_by := auth.uid();
  new.edited_at := now();
  if new.qty is distinct from old.qty then
    new.previous_qty := old.qty;
  else
    new.previous_qty := old.previous_qty;
  end if;
  return new;
end;
$$;

commit;

notify pgrst, 'reload schema';


-- =====================================================================
-- Verification (run after the migration)
-- =====================================================================
-- 1. Triggers present (expect 2 rows):
--   select tgrelid::regclass as table_name, tgname
--   from pg_trigger
--   where tgname in ('trg_production_logs_verified_lock', 'trg_production_log_hours_verified_lock');
--
-- 2. DELETE revoked (expect 0 rows):
--   select table_name, grantee, privilege_type
--   from information_schema.role_table_grants
--   where table_schema = 'public'
--     and privilege_type = 'DELETE'
--     and grantee in ('anon', 'authenticated')
--     and table_name in ('raw material transactions', 'wip transactions',
--                        'finished goods transactions', 'job order dispatch', 'job order receipt');
--
-- 3. Behaviour (in the app, as a SUPERVISOR, on a TEST log, e.g. PRD-005's
--    verified log from the E2E retest):
--    - End Log / Mark Stage Complete on a verified log   -> works
--    - Save Hours / Add Hour on a verified log (bypassing the locked UI,
--      e.g. from the browser console)                    -> "verified and locked"
--    - Same as ADMIN                                     -> works
--    - Stores screens: Edit still works (025), there is no delete path.
--
-- 4. Bypass for non-app callers -- in the SQL editor (runs as postgres),
--    inside a transaction you roll back, on a TEST verified log:
--      begin;
--      update "production logs" set setting_time_min = setting_time_min
--      where prd_no = 'PRD-005' and verified_at is not null;   -- succeeds
--      rollback;
--    And the guard functions must NOT be security definer (expect f, f, t):
--      select proname, prosecdef from pg_proc
--      where proname in ('guard_verified_production_log',
--                        'guard_verified_production_log_hours', 'is_app_admin');
--
-- 5. 025 bypass -- in the SQL editor, inside a transaction you roll back,
--    on a TEST stock row:
--      begin;
--      update "wip transactions" set remarks = remarks where doc_no = 'WIR-003';  -- succeeds
--      rollback;
--    In the app, Stores Edit as SUPERVISOR still stamps edited_by / edited_at /
--    previous_qty, and an OPERATOR edit is still rejected.
--
-- 6. Row counts unchanged (compare with a count taken before running):
--   select (select count(*) from "production logs") logs,
--          (select count(*) from "production log hours") hours;


-- =====================================================================
-- Rollback (undo 026 exactly)
-- =====================================================================
-- begin;
-- drop trigger if exists trg_production_logs_verified_lock on "production logs";
-- drop trigger if exists trg_production_log_hours_verified_lock on "production log hours";
-- drop function if exists guard_verified_production_log();
-- drop function if exists guard_verified_production_log_hours();
-- drop function if exists is_app_admin();
-- drop function if exists is_app_caller();
-- -- restore 025's original audit function (no bypass):
-- create or replace function audit_stock_transaction_edit()
-- returns trigger
-- language plpgsql
-- as $$
-- declare
--   v_col text;
-- begin
--   if not exists (
--     select 1 from "app users"
--     where user_id = auth.uid() and role in ('supervisor', 'admin')
--   ) then
--     raise exception 'Only a supervisor or admin can edit a stock transaction'
--       using errcode = '42501';
--   end if;
--
--   foreach v_col in array TG_ARGV loop
--     if (to_jsonb(new) -> v_col) is distinct from (to_jsonb(old) -> v_col) then
--       raise exception '% cannot be changed on an existing transaction', v_col
--         using errcode = '42501';
--     end if;
--   end loop;
--
--   new.edited_by := auth.uid();
--   new.edited_at := now();
--   if new.qty is distinct from old.qty then
--     new.previous_qty := old.qty;
--   else
--     new.previous_qty := old.previous_qty;
--   end if;
--   return new;
-- end;
-- $$;
-- grant delete on "raw material transactions"   to authenticated;
-- grant delete on "wip transactions"            to authenticated;
-- grant delete on "finished goods transactions" to authenticated;
-- grant delete on "job order dispatch"          to authenticated;
-- grant delete on "job order receipt"           to authenticated;
-- commit;
-- notify pgrst, 'reload schema';
-- (Before running the rollback's GRANTs, check which roles had DELETE
--  before 026 with the query in Verification 2 -- re-grant only those;
--  anon normally had none.)
