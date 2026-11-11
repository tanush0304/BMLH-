-- 047_stage_complete_supervisor.sql
-- Mark Stage Complete = supervisor / admin only, enforced in the DB.
--
--   Guard trigger on "production route card stages" (BEFORE INSERT / UPDATE):
--   an app caller (is_app_caller()) who is NOT is_app_supervisor() may not
--     * change a stage's status TO 'Completed', or
--     * change a stage's status FROM 'Completed' (reopen, Completed -> Pending)
--     * insert a stage that is already 'Completed'.
--   42501 "Only a supervisor or admin can mark a stage complete." /
--   "... can reopen a completed stage.".
--
--   Not affected:
--     * 'Pending' <-> 'Received' (jobwork): the 019 / 031 / 034 functions
--       (refresh_outsourced_stage, create_job_order_receipt, void_entry) still
--       work for every role -- they never set or leave 'Completed'.
--     * SQL editor / service role: is_app_caller() false -> bypass.
--     * Every other column (dates, machine, planned values ...).
--   The 031 AFTER trigger trg_stage_finished_refresh_next is untouched.
--
-- The app already hides the button for operators (they see "ask a
-- supervisor"); this is the safety net for a direct API call.
--
-- Every statement stands alone (no temp tables / session state -- the
-- Supabase SQL editor commits each statement). Re-runnable.
-- Run PREVIEW alone first, then CHANGE, then VERIFICATION.

-- ---------------------------------------------------------------- PREVIEW
-- a) Helpers this relies on (expect 2 rows: is_app_caller, is_app_supervisor).
select proname from pg_proc
where proname in ('is_app_caller', 'is_app_supervisor')
  and pronamespace = 'public'::regnamespace
order by 1;

-- b) Stage status mix today (on 2026-11-11 every stage was Pending).
select status, count(*) from public."production route card stages" group by 1 order by 1;

-- c) Existing triggers on the stages table (047 adds one; expect 031's
--    trg_stage_finished_refresh_next among them).
select trigger_name, action_timing, string_agg(event_manipulation, ', ' order by event_manipulation) as events
from information_schema.triggers
where event_object_table = 'production route card stages'
group by 1, 2 order by 1;

-- d) Who can UPDATE the stages table today (authenticated -> the guard matters).
select grantee, string_agg(privilege_type, ', ' order by privilege_type) as privileges
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'production route card stages'
  and grantee in ('anon', 'authenticated')
group by 1 order by 1;

-- e) App users by role (who will still be able to complete stages).
select role, count(*) from public."app users" group by 1 order by 1;

-- ----------------------------------------------------------------- CHANGE
create or replace function public.guard_stage_complete_supervisor() returns trigger
language plpgsql set search_path = public as $$  -- invoker (is_app_caller needs current_user)
begin
  if not is_app_caller() or is_app_supervisor() then
    return new;  -- SQL editor / service role; supervisor + admin
  end if;
  if tg_op = 'INSERT' then
    if new.status = 'Completed' then
      raise exception 'Only a supervisor or admin can mark a stage complete.' using errcode = '42501';
    end if;
    return new;
  end if;
  if new.status is distinct from old.status then
    if new.status = 'Completed' then
      raise exception 'Only a supervisor or admin can mark a stage complete.' using errcode = '42501';
    end if;
    if old.status = 'Completed' then
      raise exception 'Only a supervisor or admin can reopen a completed stage.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_stage_complete_supervisor on public."production route card stages";

create trigger trg_stage_complete_supervisor
  before insert or update on public."production route card stages"
  for each row execute function public.guard_stage_complete_supervisor();

revoke all on function public.guard_stage_complete_supervisor() from public, anon;

grant execute on function public.guard_stage_complete_supervisor() to authenticated, service_role;

notify pgrst, 'reload schema';

-- ----------------------------------------------------------- VERIFICATION
-- 1. Trigger: expect trg_stage_complete_supervisor | BEFORE | INSERT, UPDATE
--    (and 031's trg_stage_finished_refresh_next still listed, AFTER UPDATE).
select trigger_name, action_timing, string_agg(event_manipulation, ', ' order by event_manipulation) as events
from information_schema.triggers
where event_object_table = 'production route card stages'
group by 1, 2 order by 1;

-- 2. Function is invoker (expect prosecdef = false) and checks both helpers.
select proname, prosecdef,
       position('is_app_supervisor' in pg_get_functiondef(oid)) > 0 as checks_supervisor,
       position('is_app_caller' in pg_get_functiondef(oid)) > 0 as checks_app_caller
from pg_proc where proname = 'guard_stage_complete_supervisor';

-- 3. EXECUTE: expect authenticated + service_role, no anon.
select r.rolname, has_function_privilege(r.rolname, 'public.guard_stage_complete_supervisor()', 'execute') as can_execute
from pg_roles r where r.rolname in ('anon', 'authenticated', 'service_role') order by 1;

-- 4. Nothing changed in the data: expect the same counts as PREVIEW b.
select status, count(*) from public."production route card stages" group by 1 order by 1;

-- 5. Behaviour (test in the app, not here -- the SQL editor bypasses the guard):
--    operator: Mark Stage Complete via API -> 42501 "Only a supervisor or admin
--    can mark a stage complete."; supervisor: works; jobwork receipt that
--    closes an outsourced stage -> still Received for an operator.

-- ------------------------------------------------------------ ROLLBACK
-- (only if needed)
--   drop trigger if exists trg_stage_complete_supervisor on public."production route card stages";
--   drop function if exists public.guard_stage_complete_supervisor();
--   notify pgrst, 'reload schema';
