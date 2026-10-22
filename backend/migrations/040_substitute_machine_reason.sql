-- =====================================================================
-- 040 -- Substitute machine on a production log: planned machine + reason.
-- NOT RUN.
--
-- Production Data Entry may run a stage on a machine other than the route
-- card's planned one (MACHINE_CHOICE_MODE, frontend). The log then records
-- which machine was planned and why it was substituted:
--   planned_machine_id     text  -> "machines master"(machine_id), nullable
--   substitute_reason      text  'Planned machine busy' | 'Breakdown' |
--                                'Supervisor instruction' | 'Other', nullable
--   substitute_reason_note text  free text, required when reason = 'Other'
-- planned_machine_id is set by a BEFORE INSERT trigger from the stage (client
-- value ignored). Existing logs keep NULLs (= recorded before 040; the app compares the log's
-- machine with the stage's planned machine for display). No backfill: an old
-- log on another machine would have no reason to put in.
--
-- Rules (CHECK constraints, all callers):
--   * planned_machine_id set and machine_id differs  -> substitute_reason
--     required; 'Other' -> note required.
--   * machine_id = planned_machine_id (or planned null) -> no reason stored.
-- Lock (app callers; SQL editor / service role bypass via 026 is_app_caller()):
--   machine_id, planned_machine_id, substitute_reason, substitute_reason_note
--   cannot change after the log is inserted (they describe how the log was
--   started; today only the screen locks machine_id). Admin may still change
--   them (same exception as 026/028).
-- Fits the existing guards:
--   026/028 guard_verified_production_log: once a shift is Approved the whole
--     row except is_open / planned_qty / updated_at is locked -- new columns
--     included automatically (to_jsonb compare). Unchanged.
--   017 verification guard, 024 indexes, 036/037 planned-qty guard (INSERT),
--     035 hour guards: unaffected (they don't read these columns).
--
-- STEP 1 -- pre-check (read-only):
-- a) columns not there yet (expect 0 rows):
--   select column_name from information_schema.columns
--   where table_name = 'production logs'
--     and column_name in ('planned_machine_id', 'substitute_reason', 'substitute_reason_note');
-- b) logs already on a machine other than the stage's (informational; they
--    stay with NULL planned_machine_id / reason):
--   select l.id, l.prd_no, s.seq, s.machine_id as planned, l.machine_id as actual
--   from "production logs" l join "production route card stages" s on s.id = l.stage_id
--   where s.machine_id is not null and l.machine_id is distinct from s.machine_id;
-- c) no triggers already named like the new ones (expect 0 rows):
--   select tgname from pg_trigger where tgname in ('trg_production_logs_machine_lock', 'trg_production_logs_planned_machine');
--
-- STEP 2 -- the change.
-- =====================================================================

begin;

alter table "production logs"
  add column if not exists planned_machine_id text references "machines master" (machine_id),
  add column if not exists substitute_reason text,
  add column if not exists substitute_reason_note text;

alter table "production logs"
  add constraint production_logs_substitute_reason_values
    check (substitute_reason is null
           or substitute_reason in ('Planned machine busy', 'Breakdown', 'Supervisor instruction', 'Other')),
  add constraint production_logs_substitute_reason_required
    check (planned_machine_id is null
           or machine_id is not distinct from planned_machine_id
           or substitute_reason is not null),
  add constraint production_logs_substitute_no_reason_on_planned
    check (planned_machine_id is null
           or machine_id is distinct from planned_machine_id
           or (substitute_reason is null and substitute_reason_note is null)),
  add constraint production_logs_substitute_other_note
    check (substitute_reason is distinct from 'Other'
           or nullif(btrim(substitute_reason_note), '') is not null);

-- Machine + substitute fields are fixed once the log exists (app callers, non-admin).
create or replace function guard_production_log_machine() returns trigger
language plpgsql set search_path = public as $$  -- invoker (is_app_caller needs current_user)
begin
  if not is_app_caller() or is_app_admin() then
    return new;
  end if;
  if new.machine_id is distinct from old.machine_id
     or new.planned_machine_id is distinct from old.planned_machine_id
     or new.substitute_reason is distinct from old.substitute_reason
     or new.substitute_reason_note is distinct from old.substitute_reason_note then
    raise exception 'Production log %: the machine and substitute reason are fixed once the log is started', old.id
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_production_logs_machine_lock on "production logs";
create trigger trg_production_logs_machine_lock
  before update on "production logs"
  for each row execute function guard_production_log_machine();

-- Planned machine is set by the DB on insert (app callers): always the route
-- card stage's own machine_id -- whatever the client sent is ignored. NULL
-- when the stage has no machine (Manual / Outsourced), so no reason is
-- required there. BEFORE row triggers run before the CHECK constraints, so
-- the checks above see this value. Order vs 036's planned-qty guard
-- (trg_production_logs_qty_guard) does not matter -- neither reads the
-- other's columns.
create or replace function set_production_log_planned_machine() returns trigger
language plpgsql set search_path = public as $$  -- invoker (is_app_caller needs current_user)
begin
  if not is_app_caller() then
    return new;
  end if;
  new.planned_machine_id := (
    select machine_id from "production route card stages" where id = new.stage_id
  );
  return new;
end;
$$;

drop trigger if exists trg_production_logs_planned_machine on "production logs";
create trigger trg_production_logs_planned_machine
  before insert on "production logs"
  for each row execute function set_production_log_planned_machine();

-- 039: new functions get no PUBLIC / anon EXECUTE by default privileges;
-- keep both invoker trigger functions executable for authenticated.
grant execute on function guard_production_log_machine() to authenticated, service_role;
revoke execute on function guard_production_log_machine() from public, anon;
grant execute on function set_production_log_planned_machine() to authenticated, service_role;
revoke execute on function set_production_log_planned_machine() from public, anon;

commit;

notify pgrst, 'reload schema';

-- =====================================================================
-- STEP 3 -- verify (read-only):
-- 1. columns + constraints:
--   select column_name, data_type, is_nullable from information_schema.columns
--   where table_name = 'production logs'
--     and column_name in ('planned_machine_id', 'substitute_reason', 'substitute_reason_note');
--   -- expect 3 rows, text, YES
--   select conname, contype from pg_constraint
--   where conrelid = '"production logs"'::regclass
--     and (conname like 'production_logs_substitute%' or conname like '%planned_machine_id_fkey');
--   -- expect the 4 production_logs_substitute_* checks (c) + the FK (f)
-- 2. trigger present, invoker, anon cannot execute:
--   select tgname from pg_trigger where tgname in ('trg_production_logs_machine_lock', 'trg_production_logs_planned_machine');
--   select prosecdef, has_function_privilege('anon', oid, 'execute') as anon_exec,
--          has_function_privilege('authenticated', oid, 'execute') as auth_exec
--   from pg_proc where proname = 'guard_production_log_machine';
--   -- expect false / false / true
-- 3. existing logs untouched (all three new columns NULL):
--   select count(*) filter (where planned_machine_id is not null or substitute_reason is not null) from "production logs";
--   -- expect 0
-- 2b. insert trigger present, invoker, anon cannot execute:
--   select tgname from pg_trigger where tgname = 'trg_production_logs_planned_machine';
--   select prosecdef, has_function_privilege('anon', oid, 'execute') as anon_exec,
--          has_function_privilege('authenticated', oid, 'execute') as auth_exec
--   from pg_proc where proname = 'set_production_log_planned_machine';
--   -- expect false / false / true
-- 4. In the app (after the frontend lands), insert expectations -- check each
--    new log with:
--      select l.id, l.machine_id, l.planned_machine_id, s.machine_id as stage_machine,
--             l.substitute_reason, l.substitute_reason_note
--      from "production logs" l join "production route card stages" s on s.id = l.stage_id
--      order by l.id desc limit 3;
--    a) Start on the planned machine, no reason -> saved; planned_machine_id =
--       stage machine; reason / note NULL.
--    b) Start on a substitute with reason 'Breakdown' -> saved; planned_machine_id
--       = stage machine (NOT the substitute), reason stored.
--    c) Start on a substitute with NO reason (e.g. API call bypassing the UI) ->
--       refused 23514 (production_logs_substitute_reason_required).
--    d) Reason 'Other' with blank note -> refused 23514 (..._other_note).
--    e) Client sends a wrong planned_machine_id (API) -> stored value is still
--       the stage machine (overwritten by the trigger).
--    f) Manual Operations log (stage without machine) -> planned_machine_id NULL,
--       machine_id NULL, no reason -> saved.
--    g) End Log on a/b -> allowed (only is_open / planned_qty change); an API
--       update of machine_id / planned_machine_id / reason as operator ->
--       refused 42501 (trg_production_logs_machine_lock).
--    Use TEST data and End Log afterwards; c/d/e/g are API checks.
-- =====================================================================
