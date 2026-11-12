-- =====================================================================
-- 051_hour_qty_caps_jobwork_role.sql                   written 2026-11-12
-- From the seniors' test of PRD-009. Three database guards that match the
-- screens (the screens check first and show a popup; these stop API saves
-- that skip the screens):
--
--   S. "app settings" (key text pk, value text, updated_by, updated_at):
--        authenticated read, admin-only insert / update (is_app_admin()),
--        no delete, no anon. Seeded hour_qty_cap_mode = 'strict',
--        hour_qty_cap_tolerance_pct = '0' (existing values are kept on a
--        re-run). Values are checked on save: mode in strict /
--        supervisor_override / off; tolerance a number 0-100.
--        No app screen: the developer changes the settings in the SQL
--        editor only (update statements in docs/handoff.md).
--   A. Hourly qty cap ("production log hours", BEFORE INSERT / UPDATE):
--        mode (setting hour_qty_cap_mode; missing / invalid -> strict):
--          strict              -> everyone is blocked
--          supervisor_override -> operators blocked, supervisor / admin pass
--                                 (the screen warns them first)
--          off                 -> no hourly cap
--        produced <= standard for that hour
--        standard = floor(max(0, hour_slot_minutes(shift, slot)
--                             - 8 idle - setup) / cycle time
--                         * (1 + tolerance % / 100))
--        tolerance = setting hour_qty_cap_tolerance_pct (missing / invalid -> 0)
--        cycle time = the log's cycle_time_min, else 60 / standard_qty_per_hour;
--        no cycle time -> no cap. JS twin: utils/hourQtyCap.js.
--        UPDATE: checked only when produced / idle / setup changes, so an
--        old row already over the cap stays editable (e.g. remarks).
--   B. Open-log planned cap (same trigger): on an OPEN log, sum produced of
--        all its hours <= the log's planned qty (the material reserved at
--        Start) -- checked only when the save raises the total. Closed-log
--        corrections are left to 046 (they raise planned qty within what's
--        available). The log row is locked so two hour saves serialise.
--   C. Jobwork role ("job order dispatch", "job order receipt", BEFORE
--        INSERT / UPDATE): only supervisor / admin (42501). The screens are
--        already supervisor/admin only (menu + route guard).
--
-- Needs 026 is_app_caller + is_app_admin, 028 is_app_supervisor, 046 hour_slot_minutes +
-- setup_min (PREVIEW P1 / P2). No security definer; is_app_caller() bypass
-- (SQL editor / service role / definer RPCs such as 034's void), as 026-050.
-- BEFORE order on hours (name order): ..._closed_guard (035), ..._qty_cap
-- (new), ..._shift_limit (046), ..._slot_overlap (050). On the jobwork
-- tables the new "..._0_role_guard" fires before every other trigger.
--
-- Every statement stands alone (Supabase SQL editor commits each one): no
-- temp tables, no session state, no begin/commit. Re-runnable.
-- Run PREVIEW alone first, then CHANGE, then VERIFICATION.
-- =====================================================================


-- ---------------------------------------------------------------- PREVIEW
-- P1. Helpers this relies on (expect 4 rows).
select proname from pg_proc
where pronamespace = 'public'::regnamespace and proname in ('is_app_admin', 'is_app_caller', 'is_app_supervisor', 'hour_slot_minutes')
order by 1;

-- P2. Columns this file uses (expect 17 rows).
select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and ((table_name = 'production log hours' and column_name in ('log_id', 'hour_slot', 'shift_code', 'qty_produced', 'opr_issue', 'program_issue',
         'tool_issue', 'power_issue', 'inspection', 'breakdown', 'mc_clean', 'lunch', 'setup_min'))
    or (table_name = 'production logs' and column_name in ('is_open', 'planned_qty', 'cycle_time_min', 'standard_qty_per_hour')))
order by 1, 2;

-- P3. Existing hour rows ALREADY over their hour standard at the seeded
--     setting (strict, 0 % tolerance) -- they stay; only a later change of
--     produced / idle / setup on them is checked.
select h.id, l.prd_no, h.log_id, h.log_date, h.shift_code, h.hour_slot, h.qty_produced,
       floor(greatest(0, hour_slot_minutes(h.shift_code, h.hour_slot)
         - coalesce(h.opr_issue, 0) - coalesce(h.program_issue, 0) - coalesce(h.tool_issue, 0) - coalesce(h.power_issue, 0)
         - coalesce(h.inspection, 0) - coalesce(h.breakdown, 0) - coalesce(h.mc_clean, 0) - coalesce(h.lunch, 0)
         - coalesce(h.setup_min, 0))::numeric
         / coalesce(nullif(l.cycle_time_min, 0), 60.0 / nullif(l.standard_qty_per_hour, 0))) as hour_standard
from public."production log hours" h
join public."production logs" l on l.id = h.log_id
where coalesce(nullif(l.cycle_time_min, 0), 60.0 / nullif(l.standard_qty_per_hour, 0)) > 0
  and coalesce(h.qty_produced, 0) > floor(greatest(0, hour_slot_minutes(h.shift_code, h.hour_slot)
         - coalesce(h.opr_issue, 0) - coalesce(h.program_issue, 0) - coalesce(h.tool_issue, 0) - coalesce(h.power_issue, 0)
         - coalesce(h.inspection, 0) - coalesce(h.breakdown, 0) - coalesce(h.mc_clean, 0) - coalesce(h.lunch, 0)
         - coalesce(h.setup_min, 0))::numeric
         / coalesce(nullif(l.cycle_time_min, 0), 60.0 / nullif(l.standard_qty_per_hour, 0)))
order by l.prd_no, h.log_id, h.log_date, h.hour_slot;

-- P4. Open logs whose produced is ALREADY over planned qty (stay; the next
--     hour that raises the total is refused).
select l.id as log_id, l.prd_no, l.stage_id, l.planned_qty, sum(coalesce(h.qty_produced, 0)) as produced
from public."production logs" l
join public."production log hours" h on h.log_id = l.id
where l.is_open
group by l.id, l.prd_no, l.stage_id, l.planned_qty
having sum(coalesce(h.qty_produced, 0)) > coalesce(l.planned_qty, 0)
order by l.prd_no, l.id;

-- P5. "app settings" not there yet (expect 0 rows before the first run).
select table_name from information_schema.tables where table_schema = 'public' and table_name = 'app settings';


-- ----------------------------------------------------------------- CHANGE
-- S. App settings.
create table if not exists public."app settings" (
  key        text        primary key,
  value      text        not null,
  updated_by uuid,
  updated_at timestamptz not null default now()
);

revoke all on table public."app settings" from public, anon, authenticated;

grant select, insert, update on table public."app settings" to authenticated;

grant all on table public."app settings" to service_role;

alter table public."app settings" enable row level security;

drop policy if exists "app settings read" on public."app settings";

create policy "app settings read" on public."app settings"
  for select to authenticated using (true);

drop policy if exists "app settings admin insert" on public."app settings";

create policy "app settings admin insert" on public."app settings"
  for insert to authenticated with check (is_app_admin());

drop policy if exists "app settings admin update" on public."app settings";

create policy "app settings admin update" on public."app settings"
  for update to authenticated using (is_app_admin()) with check (is_app_admin());

-- Stamps + value checks (app callers; the SQL editor can set anything).
create or replace function public.guard_app_settings() returns trigger
language plpgsql set search_path = public as $$  -- invoker
begin
  new.updated_at := now();
  if not is_app_caller() then
    return new;
  end if;
  new.updated_by := auth.uid();
  if tg_op = 'UPDATE' and new.key is distinct from old.key then
    raise exception 'A setting''s key can''t be changed.' using errcode = '23514';
  end if;
  if new.key = 'hour_qty_cap_mode' and new.value not in ('strict', 'supervisor_override', 'off') then
    raise exception 'Hourly cap mode must be strict, supervisor_override or off.' using errcode = '23514';
  end if;
  if new.key = 'hour_qty_cap_tolerance_pct' then
    -- regex first, cast only a valid number (no short-circuit guarantee in SQL)
    if new.value !~ '^[0-9]+(\.[0-9]+)?$' then
      raise exception 'Hourly cap tolerance must be a number from 0 to 100.' using errcode = '23514';
    end if;
    if new.value::numeric > 100 then
      raise exception 'Hourly cap tolerance must be a number from 0 to 100.' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.guard_app_settings() from public, anon;

drop trigger if exists trg_app_settings_guard on public."app settings";

create trigger trg_app_settings_guard
  before insert or update on public."app settings"
  for each row execute function public.guard_app_settings();

insert into public."app settings" (key, value) values
  ('hour_qty_cap_mode', 'strict'),
  ('hour_qty_cap_tolerance_pct', '0')
on conflict (key) do nothing;

-- A + B. Hour caps.
create or replace function public.guard_production_log_hours_qty_cap() returns trigger
language plpgsql set search_path = public as $$  -- invoker (is_app_caller needs current_user)
declare
  v_log     "production logs";
  v_ct      numeric;
  v_net     numeric;
  v_std     numeric;
  v_other   numeric;
  v_total   numeric;
  v_before  numeric;
  v_mode    text;
  v_pct_txt text;
  v_pct     numeric := 0;
begin
  if not is_app_caller() then
    return new;  -- SQL editor / service role / definer RPCs
  end if;
  if tg_op = 'UPDATE'
     and new.qty_produced is not distinct from old.qty_produced
     and (new.opr_issue, new.program_issue, new.tool_issue, new.power_issue, new.inspection, new.breakdown, new.mc_clean, new.lunch, new.setup_min)
         is not distinct from
         (old.opr_issue, old.program_issue, old.tool_issue, old.power_issue, old.inspection, old.breakdown, old.mc_clean, old.lunch, old.setup_min) then
    return new;  -- nothing the caps depend on changed
  end if;

  select * into v_log from "production logs" where id = new.log_id for update;
  if not found then
    return new;  -- the FK reports it
  end if;

  -- A. per-hour standard (mode + tolerance from "app settings"; missing /
  --    invalid -> strict, 0 %)
  select value into v_mode from "app settings" where key = 'hour_qty_cap_mode';
  if v_mode is null or v_mode not in ('strict', 'supervisor_override', 'off') then
    v_mode := 'strict';
  end if;
  select value into v_pct_txt from "app settings" where key = 'hour_qty_cap_tolerance_pct';
  if v_pct_txt ~ '^[0-9]+(\.[0-9]+)?$' then
    v_pct := v_pct_txt::numeric;
    if v_pct > 100 then
      v_pct := 0;  -- out of range (only the SQL editor can store it) = invalid
    end if;
  end if;
  v_ct := coalesce(nullif(v_log.cycle_time_min, 0), 60.0 / nullif(v_log.standard_qty_per_hour, 0));
  if v_ct is not null and v_ct > 0
     and v_mode <> 'off'
     and not (v_mode = 'supervisor_override' and is_app_supervisor()) then
    v_net := greatest(0, hour_slot_minutes(new.shift_code, new.hour_slot)
      - coalesce(new.opr_issue, 0) - coalesce(new.program_issue, 0) - coalesce(new.tool_issue, 0) - coalesce(new.power_issue, 0)
      - coalesce(new.inspection, 0) - coalesce(new.breakdown, 0) - coalesce(new.mc_clean, 0) - coalesce(new.lunch, 0)
      - coalesce(new.setup_min, 0));
    v_std := floor(v_net::numeric / v_ct * (1 + v_pct / 100));
    if coalesce(new.qty_produced, 0) > v_std then
      raise exception 'Hour %: produced % is more than the standard % for this hour (% min net ÷ % min cycle time).',
        new.hour_slot, coalesce(new.qty_produced, 0), v_std, v_net, round(v_ct, 2)
        using errcode = '23514';
    end if;
  end if;

  -- B. open log: total produced <= planned qty
  if v_log.is_open and v_log.planned_qty is not null then
    select coalesce(sum(coalesce(qty_produced, 0)), 0) into v_other
    from "production log hours" where log_id = new.log_id and id is distinct from new.id;
    v_total := v_other + coalesce(new.qty_produced, 0);
    v_before := v_other + case when tg_op = 'UPDATE' then coalesce(old.qty_produced, 0) else 0 end;
    if v_total > v_log.planned_qty and v_total > v_before then
      raise exception 'Produced % is more than this log''s planned qty % (the material available at Start).',
        v_total, v_log.planned_qty
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.guard_production_log_hours_qty_cap() from public, anon;

drop trigger if exists trg_production_log_hours_qty_cap on public."production log hours";

create trigger trg_production_log_hours_qty_cap
  before insert or update on public."production log hours"
  for each row execute function public.guard_production_log_hours_qty_cap();

-- C. Jobwork: supervisor / admin only.
create or replace function public.guard_jobwork_supervisor() returns trigger
language plpgsql set search_path = public as $$  -- invoker
begin
  if is_app_caller() and not is_app_supervisor() then
    raise exception 'Only a supervisor or admin can enter or change jobwork DCs and receipts.' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_jobwork_supervisor() from public, anon;

drop trigger if exists trg_job_order_dispatch_0_role_guard on public."job order dispatch";

create trigger trg_job_order_dispatch_0_role_guard
  before insert or update on public."job order dispatch"
  for each row execute function public.guard_jobwork_supervisor();

drop trigger if exists trg_job_order_receipt_0_role_guard on public."job order receipt";

create trigger trg_job_order_receipt_0_role_guard
  before insert or update on public."job order receipt"
  for each row execute function public.guard_jobwork_supervisor();

notify pgrst, 'reload schema';


-- ----------------------------------------------------------- VERIFICATION
-- V1. New triggers (expect 3: trg_job_order_dispatch_0_role_guard,
--     trg_job_order_receipt_0_role_guard, trg_production_log_hours_qty_cap;
--     all BEFORE INSERT, UPDATE).
select event_object_table, trigger_name, action_timing, string_agg(event_manipulation, ', ' order by event_manipulation) as events
from information_schema.triggers
where trigger_name in ('trg_production_log_hours_qty_cap', 'trg_job_order_dispatch_0_role_guard', 'trg_job_order_receipt_0_role_guard')
group by 1, 2, 3 order by 1, 2;

-- V2. BEFORE trigger order on hours (expect ..._closed_guard, ..._qty_cap,
--     ..._shift_limit, ..._slot_overlap, plus any older ones by name).
select trigger_name, action_timing, string_agg(event_manipulation, ', ' order by event_manipulation) as events
from information_schema.triggers
where event_object_table = 'production log hours'
group by 1, 2 order by 2, 1;

-- V3. Functions are invoker (prosecdef = false); anon can't execute.
select p.proname, p.prosecdef, has_function_privilege('anon', p.oid, 'EXECUTE') as anon_exec
from pg_proc p
where p.pronamespace = 'public'::regnamespace
  and p.proname in ('guard_production_log_hours_qty_cap', 'guard_jobwork_supervisor', 'guard_app_settings')
order by 1;

-- V4. Nothing changed in the data: P3 / P4 return the same rows as before.

-- V4b. Settings seeded (expect hour_qty_cap_mode = strict,
--      hour_qty_cap_tolerance_pct = 0 on a first run) + grants: authenticated
--      INSERT, SELECT, UPDATE (no DELETE); anon nothing; RLS on; 3 policies.
select key, value, updated_by, updated_at from public."app settings" order by key;
select grantee, string_agg(privilege_type, ', ' order by privilege_type) as privileges
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'app settings' and grantee in ('anon', 'authenticated')
group by 1 order by 1;
select relrowsecurity from pg_class where oid = 'public."app settings"'::regclass;
select policyname, cmd from pg_policies where schemaname = 'public' and tablename = 'app settings' order by 1;

-- V5. Behaviour (in the app on TEST data -- the SQL editor bypasses the guards):
--     hour with cycle time 1 min, 60-min slot, produced 61 via API -> 23514
--     "Hour 1: produced 61 is more than the standard 60 ..."; 60 -> saved;
--     open log planned 100 with 60 saved, new hour 50 -> 23514 "Produced 110 is
--     more than this log's planned qty 100 ..."; operator API insert into
--     "job order dispatch" -> 42501; supervisor DC + receipt -> saved.
--     Settings: supervisor_override -> supervisor's 61 saved, operator's 61
--     refused; tolerance 10 -> standard 66; off -> no hourly cap (planned cap
--     still applies); operator / supervisor update of "app settings" -> refused
--     by RLS; admin mode 'xyz' -> 23514.


-- ------------------------------------------------------------ ROLLBACK
-- (only if needed)
--   drop trigger if exists trg_production_log_hours_qty_cap on public."production log hours";
--   drop trigger if exists trg_job_order_dispatch_0_role_guard on public."job order dispatch";
--   drop trigger if exists trg_job_order_receipt_0_role_guard on public."job order receipt";
--   drop function if exists public.guard_production_log_hours_qty_cap();
--   drop function if exists public.guard_jobwork_supervisor();
--   drop trigger if exists trg_app_settings_guard on public."app settings";
--   drop function if exists public.guard_app_settings();
--   drop table if exists public."app settings";
--   notify pgrst, 'reload schema';
