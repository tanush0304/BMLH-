-- =====================================================================
-- 035 -- Correct a Rejected shift on a CLOSED log (Shift Verification,
-- open item 10, option A).  NOT RUN.
--
-- Today (026 + 028) "production log hours" has NO closed-log rule: any app
-- user can update -- or insert / delete -- hours of a closed log as long as
-- that (log, date, shift) is not Approved. 028 already gives:
--   * entered_by := auth.uid() on every app save (trg_hours_stamp_entered_by)
--   * Rejected -> Pending on any app save of that shift (trg_hours_reset_rejected_shift)
--   * Approved shift hours locked, admin bypass (trg_production_log_hours_verified_lock)
--   * Approve refused when any hour of the shift was entered by the caller
--     (guard_shift_verification) -- so a corrector can never approve their own
--     correction (option i) with no new SQL.
--
-- New here (app callers only; SQL editor / service_role bypass as in 026):
--   a) Closed log (is_open = false):
--      - INSERT / DELETE of hours refused (admin bypass).
--      - UPDATE: supervisor/admin only, and only if that hour's
--        (log_id, log_date, shift_code) verification is Rejected -- or
--        Pending because a correction of it already started (028 resets
--        Rejected -> Pending after the first corrected row and the app saves
--        one row per request) and only by the supervisor who started it
--        ("Another supervisor is correcting this shift", 42501); a
--        never-corrected Pending shift stays locked. Admin
--        bypasses the role/Rejected rule (as for the Approved lock) but not
--        b)-d). Operators stay blocked on closed logs.
--      Open logs: unchanged (the operator Correct flow in Data Entry / Manual Ops).
--   b) Column lock on closed-log updates: editable = qty_produced,
--      qty_rejected, qty_rework, the 8 idle columns, remarks; trigger-owned =
--      entered_by (028), edited_by / edited_at / previous_qty_* (here),
--      updated_at; everything else refused (42501).
--   c) Audit: edited_by / edited_at, previous_qty_produced /
--      previous_qty_rejected / previous_qty_rework (value before the LATEST
--      change of that column) -- stamped only by a closed-log correction;
--      restored on any other update; null on insert.
--   d) Knock-on: if the row's ACCEPTED (greatest(0, produced - rejected -
--      rework), same as stage_dispatch_remaining) goes down, the decrease must
--      be <= stage_dispatch_remaining(next stage) (23514). The app saves one
--      row per request, so row checks add up to the log total. No next stage
--      -> the FG Receipt ceiling is frontend-only (open item 2); not checked.
--   e) planned_qty sync (closed logs, after qty_produced changes) -- the DB
--      doesn't store HOW a log was closed, so the rule works from the figures:
--        End Log set planned := min(reservation, produced). So:
--        planned =  old produced  -> planned := new produced   (End Log capped
--                                    by production; also an MSC log that used
--                                    exactly its reservation)
--        planned <  old produced  -> planned := min(planned, new produced)
--                                    (capped by the reservation: End Log with
--                                    overproduction / MSC overproduction)
--        planned >  old produced  -> unchanged (Mark Stage Complete with an
--                                    unused reservation: MSC never touches
--                                    planned_qty, so neither does a correction)
--      A planned increase must fit stage_dispatch_remaining(this stage)
--      (23514) -- the pieces come from the same upstream pool.
--      Written by a security-definer trigger function (028's log guard would
--      refuse a planned increase when another shift of the log is Approved);
--      it only acts for API requests (auth.uid() not null).
--   f) Stage status: never changed. A Completed stage stays Completed; more
--      accepted simply adds to the next stage's pool, less is limited by d).
--      Mark Stage Complete's processed-vs-target check is NOT re-run.
--
-- Lock order: the log row, then this stage, then the next stage (log before
-- stage, as 028/030; stages in seq order).
--
-- =====================================================================
-- STEP 1 -- pre-checks. Run on its own; send me the output.
--
-- 1a. Hour columns (no edited_by / edited_at / previous_qty_* yet; I need the
--     full list -- every column not editable/owned is locked on closed logs):
--   select column_name, data_type, column_default
--   from information_schema.columns
--   where table_schema = 'public' and table_name = 'production log hours'
--   order by ordinal_position;
--
-- 1b. Triggers on hours + logs (expect 028's stamp / reset / verified_lock and
--     026/017 ones; none named *closed* / *planned_sync*):
--   select event_object_table, trigger_name, action_timing, event_manipulation
--   from information_schema.triggers
--   where event_object_table in ('production log hours', 'production logs')
--   order by 1, 2;
--
-- 1c. Grants / RLS on hours (UPDATE must be allowed for authenticated today):
--   select grantee, privilege_type from information_schema.role_table_grants
--   where table_schema = 'public' and table_name = 'production log hours'
--     and grantee in ('anon', 'authenticated') order by 1, 2;
--   select policyname, cmd, roles from pg_policies where tablename = 'production log hours';
--
-- 1d. How closed logs look today (for the e) rule) -- counts per case:
--   select case when l.planned_qty = t.produced then 'planned = produced'
--               when l.planned_qty < t.produced then 'planned < produced'
--               else 'planned > produced' end as case_, s.status as stage_status, count(*)
--   from "production logs" l
--   join (select log_id, sum(coalesce(qty_produced, 0)) as produced
--         from "production log hours" group by log_id) t on t.log_id = l.id
--   left join "production route card stages" s on s.id = l.stage_id
--   where not l.is_open
--   group by 1, 2 order by 1, 2;
--
-- 1e. Helpers exist (expect 4):
--   select proname from pg_proc where proname in
--   ('is_app_caller', 'is_app_supervisor', 'is_app_admin', 'stage_dispatch_remaining');
--
-- =====================================================================
-- STEP 2 -- the migration.

begin;

-- 1. Audit columns ------------------------------------------------------
alter table "production log hours"
  add column if not exists edited_by             uuid,
  add column if not exists edited_at             timestamptz,
  add column if not exists previous_qty_produced numeric,
  add column if not exists previous_qty_rejected numeric,
  add column if not exists previous_qty_rework   numeric;

-- 2. Accepted per hour row (same expression as stage_dispatch_remaining).
create or replace function hour_accepted(p_produced numeric, p_rejected numeric, p_rework numeric)
returns numeric language sql immutable as $$
  select greatest(0, coalesce(p_produced, 0) - coalesce(p_rejected, 0) - coalesce(p_rework, 0));
$$;

-- 3. planned_qty after a correction (rule e in the header).
create or replace function corrected_planned_qty(p_planned numeric, p_old_produced numeric, p_new_produced numeric)
returns numeric language sql immutable as $$
  select case
    when p_planned is null              then null
    when p_planned = p_old_produced     then p_new_produced
    when p_planned < p_old_produced     then least(p_planned, p_new_produced)
    else p_planned
  end;
$$;

-- 4. Closed-log guard + audit + knock-on (BEFORE). Named so it runs after
--    028's trg_hours_stamp_entered_by and before 028's verified_lock.
create or replace function guard_production_log_hours_correction() returns trigger
language plpgsql set search_path = public as $$  -- invoker (is_app_caller needs current_user)
declare
  v_editable constant text[] := array['qty_produced', 'qty_rejected', 'qty_rework',
    'opr_issue', 'program_issue', 'tool_issue', 'power_issue', 'inspection',
    'breakdown', 'mc_clean', 'lunch', 'remarks'];
  v_owned constant text[] := array['entered_by', 'edited_by', 'edited_at', 'updated_at',
    'previous_qty_produced', 'previous_qty_rejected', 'previous_qty_rework'];
  v_log "production logs";
  v_stage "production route card stages";
  v_next "production route card stages";
  v_status text;
  v_since timestamptz;
  v_key text;
  v_changed boolean := false;
  v_acc_drop numeric;
  v_room numeric;
  v_old_total numeric;
  v_new_total numeric;
  v_new_planned numeric;
begin
  if tg_op = 'INSERT' then
    new.edited_by := null;  new.edited_at := null;
    new.previous_qty_produced := null;  new.previous_qty_rejected := null;  new.previous_qty_rework := null;
  end if;

  if not is_app_caller() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  -- Lock the log first (log before stage).
  select * into v_log from "production logs"
  where id = case when tg_op = 'INSERT' then new.log_id else old.log_id end
  for update;

  if tg_op <> 'UPDATE' then
    if found and not v_log.is_open and not is_app_admin() then
      raise exception 'Production log % is closed -- hours can''t be added or deleted', v_log.id
        using errcode = '42501';
    end if;
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  -- UPDATE on an open log: unchanged flow; audit columns stay as stored.
  if not found or v_log.is_open then
    new.edited_by := old.edited_by;  new.edited_at := old.edited_at;
    new.previous_qty_produced := old.previous_qty_produced;
    new.previous_qty_rejected := old.previous_qty_rejected;
    new.previous_qty_rework := old.previous_qty_rework;
    return new;
  end if;

  -- Closed log.
  if not is_app_admin() then
    if not is_app_supervisor() then
      raise exception 'Production log % is closed -- only a supervisor or admin can correct its hours (Shift Verification)', v_log.id
        using errcode = '42501';
    end if;
    select status, coalesce(rejected_at, updated_at) into v_status, v_since
    from "production shift verifications"
    where log_id = old.log_id and log_date = old.log_date and shift_code = old.shift_code;
    -- Rejected, or Pending only because a correction already started (028's
    -- reset turns Rejected -> Pending after the FIRST corrected row; the app
    -- saves one row per request, so the rest of the same correction must
    -- still pass) -- and then only for the supervisor who started it: every
    -- hour edited in THIS correction must be theirs. Pending shifts never
    -- corrected stay locked.
    -- "This correction" = edited at/after v_since. 028's reset clears
    -- rejected_at and sets updated_at := now() in the same transaction as the
    -- first corrected row (whose edited_at is that same now()), so for a
    -- Pending row v_since is the reset time; hours from an earlier correction
    -- (before a re-reject) are older and don't count. v_since null -> every
    -- edited hour counts (previous behaviour).
    if coalesce(v_status, 'Pending') <> 'Rejected' then
      if v_status = 'Pending' and exists (
           select 1 from "production log hours"
           where log_id = old.log_id and log_date = old.log_date
             and shift_code = old.shift_code and edited_at is not null
             and (v_since is null or edited_at >= v_since)) then
        if exists (
             select 1 from "production log hours"
             where log_id = old.log_id and log_date = old.log_date
               and shift_code = old.shift_code and edited_at is not null
               and (v_since is null or edited_at >= v_since)
               and edited_by is distinct from auth.uid()) then
          raise exception 'Another supervisor is correcting this shift' using errcode = '42501';
        end if;
      else
        raise exception 'Only a Rejected shift of a closed log can be corrected -- this shift is %', coalesce(v_status, 'Pending')
          using errcode = '42501';
      end if;
    end if;
  end if;

  for v_key in select jsonb_object_keys(to_jsonb(new)) loop
    if (to_jsonb(new) -> v_key) is distinct from (to_jsonb(old) -> v_key) then
      if v_key = any (v_editable) then
        v_changed := true;
      elsif v_key <> all (v_owned) then
        raise exception '% cannot be changed on an hour of a closed log', v_key using errcode = '42501';
      end if;
    end if;
  end loop;

  if not v_changed then
    new.edited_by := old.edited_by;  new.edited_at := old.edited_at;
    new.previous_qty_produced := old.previous_qty_produced;
    new.previous_qty_rejected := old.previous_qty_rejected;
    new.previous_qty_rework := old.previous_qty_rework;
    return new;
  end if;

  -- Stages in seq order: this one, then the next.
  select * into v_stage from "production route card stages" where id = v_log.stage_id for update;
  select * into v_next from "production route card stages"
  where prd_no = v_stage.prd_no and seq > v_stage.seq
  order by seq limit 1
  for update;

  -- d) knock-on: accepted down by more than the next stage still has unused?
  v_acc_drop := hour_accepted(old.qty_produced, old.qty_rejected, old.qty_rework)
              - hour_accepted(new.qty_produced, new.qty_rejected, new.qty_rework);
  if v_acc_drop > 0 and v_next.id is not null then
    v_room := stage_dispatch_remaining(v_next.id);
    if v_acc_drop > v_room then
      raise exception 'Accepted qty can be lowered by at most % -- the next stage (Stage %) has already taken the rest',
        v_room, v_next.seq using errcode = '23514';
    end if;
  end if;

  -- e) planned_qty increase must fit this stage's pool (the AFTER trigger writes it).
  if new.qty_produced is distinct from old.qty_produced then
    select coalesce(sum(coalesce(qty_produced, 0)), 0) into v_old_total
    from "production log hours" where log_id = old.log_id;
    v_new_total := v_old_total - coalesce(old.qty_produced, 0) + coalesce(new.qty_produced, 0);
    v_new_planned := corrected_planned_qty(v_log.planned_qty, v_old_total, v_new_total);
    if v_new_planned > v_log.planned_qty then
      v_room := stage_dispatch_remaining(v_stage.id);
      if v_new_planned - v_log.planned_qty > v_room then
        raise exception 'Produced qty can be raised by at most % -- that is all this stage still has available',
          v_room using errcode = '23514';
      end if;
    end if;
  end if;

  -- c) audit
  new.edited_by := auth.uid();
  new.edited_at := now();
  new.previous_qty_produced := case when new.qty_produced is distinct from old.qty_produced
                                    then old.qty_produced else old.previous_qty_produced end;
  new.previous_qty_rejected := case when new.qty_rejected is distinct from old.qty_rejected
                                    then old.qty_rejected else old.previous_qty_rejected end;
  new.previous_qty_rework   := case when new.qty_rework is distinct from old.qty_rework
                                    then old.qty_rework else old.previous_qty_rework end;
  return new;
end;
$$;

drop trigger if exists trg_production_log_hours_closed_guard on "production log hours";
create trigger trg_production_log_hours_closed_guard
  before insert or update or delete on "production log hours"
  for each row execute function guard_production_log_hours_correction();

-- 5. planned_qty sync (AFTER). Security definer: 028's log guard would refuse
--    a planned increase when another shift of the log is Approved. Acts only
--    for API requests (auth.uid() set); SQL editor edits are left alone.
create or replace function sync_closed_log_planned_qty() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_log "production logs";
  v_new_total numeric;
  v_old_total numeric;
  v_planned numeric;
begin
  if auth.uid() is null then
    return null;
  end if;
  select * into v_log from "production logs" where id = new.log_id;
  if not found or v_log.is_open then
    return null;
  end if;
  select coalesce(sum(coalesce(qty_produced, 0)), 0) into v_new_total
  from "production log hours" where log_id = new.log_id;
  v_old_total := v_new_total - coalesce(new.qty_produced, 0) + coalesce(old.qty_produced, 0);
  v_planned := corrected_planned_qty(v_log.planned_qty, v_old_total, v_new_total);
  if v_planned is distinct from v_log.planned_qty then
    update "production logs" set planned_qty = v_planned where id = new.log_id;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_production_log_hours_planned_sync on "production log hours";
create trigger trg_production_log_hours_planned_sync
  after update of qty_produced on "production log hours"
  for each row
  when (new.qty_produced is distinct from old.qty_produced)
  execute function sync_closed_log_planned_qty();

commit;

notify pgrst, 'reload schema';

-- =====================================================================
-- STEP 3 -- verify after the run (SQL editor), one result set:
--
-- select 'columns' as chk, jsonb_agg(column_name order by column_name) as result
-- from information_schema.columns
-- where table_schema = 'public' and table_name = 'production log hours'
--   and column_name in ('edited_by', 'edited_at', 'previous_qty_produced', 'previous_qty_rejected', 'previous_qty_rework')
-- union all
-- select 'triggers', jsonb_agg(distinct trigger_name)
-- from information_schema.triggers
-- where trigger_name in ('trg_production_log_hours_closed_guard', 'trg_production_log_hours_planned_sync')
-- union all
-- select 'definer', jsonb_agg(proname || '=' || prosecdef order by proname)
-- from pg_proc where proname in ('guard_production_log_hours_correction', 'sync_closed_log_planned_qty')
-- union all
-- select 'planned rule', jsonb_build_array(
--   corrected_planned_qty(40, 40, 35), corrected_planned_qty(40, 40, 45),
--   corrected_planned_qty(30, 40, 25), corrected_planned_qty(30, 40, 35), corrected_planned_qty(50, 40, 45))
-- union all
-- select 'nothing edited yet', to_jsonb((select count(*) from "production log hours" where edited_at is not null));
--
-- Expect: 5 columns; 2 triggers; guard=false (invoker), sync=true (definer);
-- planned rule [35, 45, 25, 30, 50]; nothing edited yet = 0.
--
-- If PostgREST still complains about unknown columns: notify pgrst, 'reload schema';
-- =====================================================================
