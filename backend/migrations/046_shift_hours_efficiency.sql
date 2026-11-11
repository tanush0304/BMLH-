-- 046_shift_hours_efficiency.sql
-- Production Data Entry: shift-hours limit + good-qty efficiency + per-hour setup.
--
--   1. "production log hours".setup_min integer NULL (0-60): setup minutes per
--      hour row (setup can change mid-shift). Counted in the existing
--      "idle <= 60 per hour" check (production_log_hours_idle_max_60).
--   2. Helpers: parse_shift_time_min(text) (same rules as the app's
--      parseTimeToMinutes: "6:00 AM" / "18:00"), parse_lunch_min(text) (the
--      app's parseLunchMinutes: "60 min" / "1 hour" / blank = 0),
--      shift_gross_minutes(shift) = end - start (break INSIDE, midnight wraps),
--      shift_net_minutes(shift) = gross - lunch_break_duration, hour_slot_minutes(shift,
--      slot) = that slot's real length (short last slot = its minutes; a slot
--      beyond the shift = 60, overtime), fmt_hrs(minutes) -> "10.5".
--   3. 035's closed-log correction guard: setup_min added to its editable
--      columns (the rest of the function is 035's body unchanged), so a
--      supervisor's Correct can change it.
--   4. Shift-hours guard (BEFORE INSERT/UPDATE on "production log hours"),
--      per LOG and per MACHINE + log_date + shift_code (all logs; the row
--      itself excluded); BOTH must hold:
--        gross: Σ slot minutes           <= end - start (e.g. 12 h)
--        net:   Σ (slot minutes - lunch) <= end - start - lunch_break_duration
--                                           (e.g. 11 h; break unreadable ->
--                                           gross only)
--      23514 with worked / remaining hours. Bypass: is_app_caller() false (SQL
--      editor / service role) and is_app_supervisor() (supervisor / admin may
--      run overtime past both). Shift with unreadable times -> no limit. An
--      UPDATE is checked when log / date / shift / slot change or Lunch is
--      lowered (old over-limit rows stay editable for qty / idle / setup).
--      Per machine + date + shift advisory lock against two parallel saves.
--   5. Views (column names / order kept EXACTLY; new columns appended only;
--      security_invoker set explicitly on the two report views as before;
--      grants reset to authenticated SELECT only, nothing for anon):
--        "production log totals"   efficiency_pct = 100 x Σ good / Σ target
--                                  (+ total_good, target_qty, setup_min,
--                                  slot_minutes)
--        "report production hours" + setup_min, slot_minutes, good_qty,
--                                  target_qty (reports: efficiency = Σ good /
--                                  Σ target)
--        "report production setup" setting time WITHOUT double count: Σ row
--                                  setup_min grouped by the HOUR's log_date /
--                                  shift_code (one row per log x date x
--                                  shift), plus the header setting_time_min
--                                  ONLY for logs with no row setup at all
--                                  (every setup_min null = old logs), on the
--                                  header's log_date / shift_code as before.
--      Per hour row:
--        good   = qty_produced - qty_rejected - qty_rework
--        net    = max(0, slot minutes - setup_min - 8 idle columns (incl. lunch))
--        target = net / cycle time (min); cycle time = log cycle_time_min, else
--                 60 / standard_qty_per_hour (older logs). No cycle time or
--                 Σ target = 0 -> efficiency null.
--
-- Nothing is stored for efficiency (views only), so old logs need no update;
-- PREVIEW b shows old vs new efficiency per log.
-- The app keeps the old formula until this is run (probe on setup_min).
--
-- Re-runnable (if not exists / or replace / drop ... if exists).
-- Run PREVIEW alone first, then everything from CHANGE down, then
-- VERIFICATION.

-- ---------------------------------------------------------------- PREVIEW
-- 0) The 3 views must have exactly these columns today (expect 3 rows, all
--    matches = true). If any is false STOP -- the live view changed.
select v.view, v.cols = v.expected as matches, v.cols
from (
  select 'production log totals' as view,
         (select string_agg(attname, ',' order by attnum) from pg_attribute
          where attrelid = 'public."production log totals"'::regclass and attnum > 0 and not attisdropped) as cols,
         'log_id,total_produced,total_rejected,total_rework,efficiency_pct,reject_pct,rework_pct' as expected
  union all
  select 'report production hours',
         (select string_agg(attname, ',' order by attnum) from pg_attribute
          where attrelid = 'public."report production hours"'::regclass and attnum > 0 and not attisdropped),
         'log_id,prd_no,stage_id,stage_seq,operation,machine_id,machine_name,machine_category,log_date,shift_code,employee_id,planned_qty,cycle_time_min,standard_qty_per_hour,shift_hours,hour_rows,produced,rejected,rework,opr_issue,program_issue,tool_issue,power_issue,inspection,breakdown,mc_clean,lunch'
  union all
  select 'report production setup',
         (select string_agg(attname, ',' order by attnum) from pg_attribute
          where attrelid = 'public."report production setup"'::regclass and attnum > 0 and not attisdropped),
         'log_id,prd_no,machine_id,machine_category,log_date,shift_code,setting_time_min'
) v;

-- 0b) Current view options -- note them (live before 046: the two report
--     views security_invoker=true, "production log totals" none; CHANGE 5
--     sets them explicitly).
select relname, reloptions from pg_class
where relname in ('production log totals', 'report production hours', 'report production setup')
order by relname;

-- 0c) Shifts: gross = end - start (limit on Σ slot minutes), net = gross -
--     lunch_break_duration (limit on Σ (slot - Lunch column)). gross_hrs null
--     = times unreadable -> no limit; net_hrs null = break unreadable -> gross only.
with sh0 as (
  select shift_code,
         case when s_min is null or e_min is null or s_min = e_min then null
              else ((e_min - s_min) % 1440 + 1440) % 1440 end as gross_min,
         lunch_min
  from (select shift_code, (case
        when start_time::text ~* '^\s*\d{1,2}:\d{2}\s*(am|pm)\s*$' then
          ((substring(start_time::text from '^\s*(\d{1,2})')::int % 12)
            + case when start_time::text ~* 'pm' then 12 else 0 end) * 60
          + substring(start_time::text from ':(\d{2})')::int
        when start_time::text ~ '^\s*\d{1,2}:\d{2}\s*$' then
          substring(start_time::text from '^\s*(\d{1,2})')::int * 60 + substring(start_time::text from ':(\d{2})')::int
      end) as s_min, (case
        when end_time::text ~* '^\s*\d{1,2}:\d{2}\s*(am|pm)\s*$' then
          ((substring(end_time::text from '^\s*(\d{1,2})')::int % 12)
            + case when end_time::text ~* 'pm' then 12 else 0 end) * 60
          + substring(end_time::text from ':(\d{2})')::int
        when end_time::text ~ '^\s*\d{1,2}:\d{2}\s*$' then
          substring(end_time::text from '^\s*(\d{1,2})')::int * 60 + substring(end_time::text from ':(\d{2})')::int
      end) as e_min,
               (case
        when lunch_break_duration::text is null or btrim(lunch_break_duration::text) = '' then 0
        when lower(btrim(lunch_break_duration::text)) ~ '^\d+(\.\d+)?\s*hours?$' then
          round(substring(lower(btrim(lunch_break_duration::text)) from '^(\d+(?:\.\d+)?)')::numeric * 60)::int
        when lower(btrim(lunch_break_duration::text)) ~ '^\d+(\.\d+)?\s*(min|mins|minutes?)?$' then
          round(substring(lower(btrim(lunch_break_duration::text)) from '^(\d+(?:\.\d+)?)')::numeric)::int
      end) as lunch_min
        from public."shifts master") t
),
sh as (
  select shift_code, gross_min,
         case when gross_min is null or lunch_min is null then null else greatest(0, gross_min - lunch_min) end as net_min
  from sh0
)
select s.shift_code, s.start_time, s.end_time, s.lunch_break_duration,
       round(sh.gross_min / 60.0, 2) as gross_hrs, round(sh.net_min / 60.0, 2) as net_hrs
from public."shifts master" s left join sh on sh.shift_code = s.shift_code
order by 1;

-- a1) Machine + date + shift ALREADY over a limit (all logs together): gross
--     (slot_hrs > gross_hrs) or net (worked_hrs = slot - lunch > net_hrs).
with sh0 as (
  select shift_code,
         case when s_min is null or e_min is null or s_min = e_min then null
              else ((e_min - s_min) % 1440 + 1440) % 1440 end as gross_min,
         lunch_min
  from (select shift_code, (case
        when start_time::text ~* '^\s*\d{1,2}:\d{2}\s*(am|pm)\s*$' then
          ((substring(start_time::text from '^\s*(\d{1,2})')::int % 12)
            + case when start_time::text ~* 'pm' then 12 else 0 end) * 60
          + substring(start_time::text from ':(\d{2})')::int
        when start_time::text ~ '^\s*\d{1,2}:\d{2}\s*$' then
          substring(start_time::text from '^\s*(\d{1,2})')::int * 60 + substring(start_time::text from ':(\d{2})')::int
      end) as s_min, (case
        when end_time::text ~* '^\s*\d{1,2}:\d{2}\s*(am|pm)\s*$' then
          ((substring(end_time::text from '^\s*(\d{1,2})')::int % 12)
            + case when end_time::text ~* 'pm' then 12 else 0 end) * 60
          + substring(end_time::text from ':(\d{2})')::int
        when end_time::text ~ '^\s*\d{1,2}:\d{2}\s*$' then
          substring(end_time::text from '^\s*(\d{1,2})')::int * 60 + substring(end_time::text from ':(\d{2})')::int
      end) as e_min,
               (case
        when lunch_break_duration::text is null or btrim(lunch_break_duration::text) = '' then 0
        when lower(btrim(lunch_break_duration::text)) ~ '^\d+(\.\d+)?\s*hours?$' then
          round(substring(lower(btrim(lunch_break_duration::text)) from '^(\d+(?:\.\d+)?)')::numeric * 60)::int
        when lower(btrim(lunch_break_duration::text)) ~ '^\d+(\.\d+)?\s*(min|mins|minutes?)?$' then
          round(substring(lower(btrim(lunch_break_duration::text)) from '^(\d+(?:\.\d+)?)')::numeric)::int
      end) as lunch_min
        from public."shifts master") t
),
sh as (
  select shift_code, gross_min,
         case when gross_min is null or lunch_min is null then null else greatest(0, gross_min - lunch_min) end as net_min
  from sh0
),
hr as (
  select h.*,
         case when sh.gross_min is null or (h.hour_slot - 1) * 60 >= sh.gross_min then 60
              else least(60, sh.gross_min - (h.hour_slot - 1) * 60) end as slot_min
  from public."production log hours" h
  left join sh on sh.shift_code = h.shift_code
)
select l.machine_id, hr.log_date, hr.shift_code,
       round(sum(hr.slot_min) / 60.0, 2) as slot_hrs, round(max(sh.gross_min) / 60.0, 2) as gross_hrs,
       round(sum(greatest(0, hr.slot_min - hr.lunch)) / 60.0, 2) as worked_hrs, round(max(sh.net_min) / 60.0, 2) as net_hrs,
       count(distinct hr.log_id) as logs, count(*) as hour_rows
from hr
join public."production logs" l on l.id = hr.log_id
join sh on sh.shift_code = hr.shift_code
where l.machine_id is not null and sh.gross_min is not null
group by 1, 2, 3
having sum(hr.slot_min) > max(sh.gross_min)
    or sum(greatest(0, hr.slot_min - hr.lunch)) > max(sh.net_min)
order by 2, 1, 3;

-- a2) Single logs ALREADY over a limit (gross or net) for a date + shift.
with sh0 as (
  select shift_code,
         case when s_min is null or e_min is null or s_min = e_min then null
              else ((e_min - s_min) % 1440 + 1440) % 1440 end as gross_min,
         lunch_min
  from (select shift_code, (case
        when start_time::text ~* '^\s*\d{1,2}:\d{2}\s*(am|pm)\s*$' then
          ((substring(start_time::text from '^\s*(\d{1,2})')::int % 12)
            + case when start_time::text ~* 'pm' then 12 else 0 end) * 60
          + substring(start_time::text from ':(\d{2})')::int
        when start_time::text ~ '^\s*\d{1,2}:\d{2}\s*$' then
          substring(start_time::text from '^\s*(\d{1,2})')::int * 60 + substring(start_time::text from ':(\d{2})')::int
      end) as s_min, (case
        when end_time::text ~* '^\s*\d{1,2}:\d{2}\s*(am|pm)\s*$' then
          ((substring(end_time::text from '^\s*(\d{1,2})')::int % 12)
            + case when end_time::text ~* 'pm' then 12 else 0 end) * 60
          + substring(end_time::text from ':(\d{2})')::int
        when end_time::text ~ '^\s*\d{1,2}:\d{2}\s*$' then
          substring(end_time::text from '^\s*(\d{1,2})')::int * 60 + substring(end_time::text from ':(\d{2})')::int
      end) as e_min,
               (case
        when lunch_break_duration::text is null or btrim(lunch_break_duration::text) = '' then 0
        when lower(btrim(lunch_break_duration::text)) ~ '^\d+(\.\d+)?\s*hours?$' then
          round(substring(lower(btrim(lunch_break_duration::text)) from '^(\d+(?:\.\d+)?)')::numeric * 60)::int
        when lower(btrim(lunch_break_duration::text)) ~ '^\d+(\.\d+)?\s*(min|mins|minutes?)?$' then
          round(substring(lower(btrim(lunch_break_duration::text)) from '^(\d+(?:\.\d+)?)')::numeric)::int
      end) as lunch_min
        from public."shifts master") t
),
sh as (
  select shift_code, gross_min,
         case when gross_min is null or lunch_min is null then null else greatest(0, gross_min - lunch_min) end as net_min
  from sh0
),
hr as (
  select h.*,
         case when sh.gross_min is null or (h.hour_slot - 1) * 60 >= sh.gross_min then 60
              else least(60, sh.gross_min - (h.hour_slot - 1) * 60) end as slot_min
  from public."production log hours" h
  left join sh on sh.shift_code = h.shift_code
)
select hr.log_id, l.prd_no, l.machine_id, hr.log_date, hr.shift_code,
       round(sum(hr.slot_min) / 60.0, 2) as slot_hrs, round(max(sh.gross_min) / 60.0, 2) as gross_hrs,
       round(sum(greatest(0, hr.slot_min - hr.lunch)) / 60.0, 2) as worked_hrs, round(max(sh.net_min) / 60.0, 2) as net_hrs,
       count(*) as hour_rows
from hr
join public."production logs" l on l.id = hr.log_id
join sh on sh.shift_code = hr.shift_code
where sh.gross_min is not null
group by 1, 2, 3, 4, 5
having sum(hr.slot_min) > max(sh.gross_min)
    or sum(greatest(0, hr.slot_min - hr.lunch)) > max(sh.net_min)
order by 4, 1;

-- b) OLD vs NEW efficiency per existing log (setup_min does not exist yet ->
--    counted as 0 here; header setting time is NOT deducted, same as the new
--    rule for rows).
with sh0 as (
  select shift_code,
         case when s_min is null or e_min is null or s_min = e_min then null
              else ((e_min - s_min) % 1440 + 1440) % 1440 end as gross_min,
         lunch_min
  from (select shift_code, (case
        when start_time::text ~* '^\s*\d{1,2}:\d{2}\s*(am|pm)\s*$' then
          ((substring(start_time::text from '^\s*(\d{1,2})')::int % 12)
            + case when start_time::text ~* 'pm' then 12 else 0 end) * 60
          + substring(start_time::text from ':(\d{2})')::int
        when start_time::text ~ '^\s*\d{1,2}:\d{2}\s*$' then
          substring(start_time::text from '^\s*(\d{1,2})')::int * 60 + substring(start_time::text from ':(\d{2})')::int
      end) as s_min, (case
        when end_time::text ~* '^\s*\d{1,2}:\d{2}\s*(am|pm)\s*$' then
          ((substring(end_time::text from '^\s*(\d{1,2})')::int % 12)
            + case when end_time::text ~* 'pm' then 12 else 0 end) * 60
          + substring(end_time::text from ':(\d{2})')::int
        when end_time::text ~ '^\s*\d{1,2}:\d{2}\s*$' then
          substring(end_time::text from '^\s*(\d{1,2})')::int * 60 + substring(end_time::text from ':(\d{2})')::int
      end) as e_min,
               (case
        when lunch_break_duration::text is null or btrim(lunch_break_duration::text) = '' then 0
        when lower(btrim(lunch_break_duration::text)) ~ '^\d+(\.\d+)?\s*hours?$' then
          round(substring(lower(btrim(lunch_break_duration::text)) from '^(\d+(?:\.\d+)?)')::numeric * 60)::int
        when lower(btrim(lunch_break_duration::text)) ~ '^\d+(\.\d+)?\s*(min|mins|minutes?)?$' then
          round(substring(lower(btrim(lunch_break_duration::text)) from '^(\d+(?:\.\d+)?)')::numeric)::int
      end) as lunch_min
        from public."shifts master") t
),
sh as (
  select shift_code, gross_min,
         case when gross_min is null or lunch_min is null then null else greatest(0, gross_min - lunch_min) end as net_min
  from sh0
),
hr as (
  select h.*,
         case when sh.gross_min is null or (h.hour_slot - 1) * 60 >= sh.gross_min then 60
              else least(60, sh.gross_min - (h.hour_slot - 1) * 60) end as slot_min
  from public."production log hours" h
  left join sh on sh.shift_code = h.shift_code
),
per_log as (
  select l.id as log_id, l.prd_no, l.machine_id, l.stage_id,
         l.standard_qty_per_hour, l.cycle_time_min,
         coalesce(l.cycle_time_min,
                  case when l.standard_qty_per_hour > 0 then 60.0 / l.standard_qty_per_hour end) as ct,
         count(hr.id) as hour_rows,
         coalesce(sum(hr.qty_produced), 0) as produced,
         coalesce(sum(coalesce(hr.qty_produced, 0) - coalesce(hr.qty_rejected, 0) - coalesce(hr.qty_rework, 0)), 0) as good,
         coalesce(sum(greatest(0, hr.slot_min - (hr.opr_issue + hr.program_issue + hr.tool_issue + hr.power_issue + hr.inspection + hr.breakdown + hr.mc_clean + hr.lunch))), 0) as net_min
  from public."production logs" l
  join hr on hr.log_id = l.id
  group by l.id
)
select log_id, prd_no, machine_id, stage_id, hour_rows, produced, good,
       round(net_min / nullif(ct, 0), 2) as target_qty,
       case when standard_qty_per_hour > 0 and hour_rows > 0
            then round(100.0 * produced / (standard_qty_per_hour * hour_rows), 1) end as old_efficiency_pct,
       case when ct > 0 and net_min > 0
            then round(100.0 * good / (net_min / ct), 1) end as new_efficiency_pct,
       case when ct > 0 and net_min > 0 and standard_qty_per_hour > 0 and hour_rows > 0
            then round(100.0 * good / (net_min / ct), 1)
               - round(100.0 * produced / (standard_qty_per_hour * hour_rows), 1) end as difference
from per_log
order by log_id;

-- c) Logs with hours but no cycle time (efficiency stays null / "No cycle time").
select l.id as log_id, l.prd_no, l.machine_id, l.stage_id, l.cycle_time_min, l.standard_qty_per_hour
from public."production logs" l
where exists (select 1 from public."production log hours" h where h.log_id = l.id)
  and coalesce(l.cycle_time_min, 0) <= 0 and coalesce(l.standard_qty_per_hour, 0) <= 0
order by l.id;

-- ----------------------------------------------------------------- CHANGE
begin;

-- 1. Per-hour setup -----------------------------------------------------------
alter table public."production log hours"
  add column if not exists setup_min integer;

alter table public."production log hours"
  drop constraint if exists production_log_hours_setup_min_check,
  add constraint production_log_hours_setup_min_check
    check (setup_min is null or (setup_min >= 0 and setup_min <= 60));

-- idle <= 60 per hour now includes setup (017's rule + coalesce(setup_min, 0)).
alter table public."production log hours"
  drop constraint if exists production_log_hours_idle_max_60,
  add constraint production_log_hours_idle_max_60
    check (opr_issue + program_issue + tool_issue + power_issue
           + inspection + breakdown + mc_clean + lunch + coalesce(setup_min, 0) <= 60);

comment on column public."production log hours".setup_min is
  'Setup minutes in this hour (046). Null = not entered (old rows). Deducted from the slot for the target qty.';

-- 2. Helpers -------------------------------------------------------------------
create or replace function public.parse_shift_time_min(p text) returns integer
language sql immutable set search_path = public as $$
  select (case
        when p ~* '^\s*\d{1,2}:\d{2}\s*(am|pm)\s*$' then
          ((substring(p from '^\s*(\d{1,2})')::int % 12)
            + case when p ~* 'pm' then 12 else 0 end) * 60
          + substring(p from ':(\d{2})')::int
        when p ~ '^\s*\d{1,2}:\d{2}\s*$' then
          substring(p from '^\s*(\d{1,2})')::int * 60 + substring(p from ':(\d{2})')::int
      end)
$$;

create or replace function public.shift_gross_minutes(p_shift text) returns integer
language sql stable set search_path = public as $$
  select case when s_min is null or e_min is null or s_min = e_min then null
              else ((e_min - s_min) % 1440 + 1440) % 1440 end
  from (select parse_shift_time_min(start_time::text) as s_min, parse_shift_time_min(end_time::text) as e_min
        from "shifts master" where shift_code = p_shift) t
$$;

create or replace function public.parse_lunch_min(p text) returns integer
language sql immutable set search_path = public as $$
  select (case
        when p is null or btrim(p) = '' then 0
        when lower(btrim(p)) ~ '^\d+(\.\d+)?\s*hours?$' then
          round(substring(lower(btrim(p)) from '^(\d+(?:\.\d+)?)')::numeric * 60)::int
        when lower(btrim(p)) ~ '^\d+(\.\d+)?\s*(min|mins|minutes?)?$' then
          round(substring(lower(btrim(p)) from '^(\d+(?:\.\d+)?)')::numeric)::int
      end)
$$;

-- net = gross - lunch_break_duration; null when the times or the break can't be read
create or replace function public.shift_net_minutes(p_shift text) returns integer
language sql stable set search_path = public as $$
  select case when g is null or l is null then null else greatest(0, g - l) end
  from (select shift_gross_minutes(p_shift) as g,
               (select parse_lunch_min(lunch_break_duration::text) from "shifts master" where shift_code = p_shift) as l) t
$$;

create or replace function public.hour_slot_minutes(p_shift text, p_slot integer) returns integer
language sql stable set search_path = public as $$
  select case when g is null or (p_slot - 1) * 60 >= g then 60
              else least(60, g - (p_slot - 1) * 60) end
  from (select shift_gross_minutes(p_shift) as g) t
$$;

create or replace function public.fmt_hrs(p_minutes numeric) returns text
language sql immutable set search_path = public as $$
  select coalesce(nullif(trim(trailing '.' from trim(trailing '0' from round(coalesce(p_minutes, 0) / 60.0, 2)::text)), ''), '0')
$$;

-- 3. 035's closed-log correction guard + setup_min (body otherwise as 035) --
create or replace function guard_production_log_hours_correction() returns trigger
language plpgsql set search_path = public as $$  -- invoker (is_app_caller needs current_user)
declare
  v_editable constant text[] := array['qty_produced', 'qty_rejected', 'qty_rework',
    'opr_issue', 'program_issue', 'tool_issue', 'power_issue', 'inspection',
    'breakdown', 'mc_clean', 'lunch', 'setup_min', 'remarks'];  -- 046: + setup_min
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

-- 4. Shift-hours guard --------------------------------------------------------
create or replace function public.guard_production_log_hours_shift_limit() returns trigger
language plpgsql set search_path = public as $$  -- invoker (is_app_caller needs current_user)
declare
  v_gross   integer;
  v_net     integer;
  v_mine    integer;
  v_mine_w  integer;
  v_used    integer;
  v_worked  integer;
  v_machine text;
  v_scope   integer;
begin
  if not is_app_caller() or is_app_supervisor() then
    return new;  -- SQL editor / service role; supervisor + admin may run overtime (both limits)
  end if;
  if tg_op = 'UPDATE'
     and new.log_id is not distinct from old.log_id
     and new.log_date is not distinct from old.log_date
     and new.shift_code is not distinct from old.shift_code
     and new.hour_slot is not distinct from old.hour_slot
     and coalesce(new.lunch, 0) >= coalesce(old.lunch, 0) then
    return new;  -- qty / idle / setup edit (or more lunch): worked hours can't grow
  end if;

  v_gross := shift_gross_minutes(new.shift_code);
  if v_gross is null then
    return new;  -- shift times unreadable: no limit (same as the app)
  end if;
  v_net := shift_net_minutes(new.shift_code);  -- null -> gross limit only
  v_mine := hour_slot_minutes(new.shift_code, new.hour_slot);
  v_mine_w := greatest(0, v_mine - coalesce(new.lunch, 0));

  select machine_id into v_machine from "production logs" where id = new.log_id;
  perform pg_advisory_xact_lock(hashtext(concat_ws('|', '046', coalesce(v_machine, 'log:' || new.log_id), new.log_date, new.shift_code)));

  -- scope 1 = this log, scope 2 = every log on the same machine
  for v_scope in 1..2 loop
    if v_scope = 2 and v_machine is null then
      exit;
    end if;
    select coalesce(sum(hour_slot_minutes(h.shift_code, h.hour_slot)), 0),
           coalesce(sum(greatest(0, hour_slot_minutes(h.shift_code, h.hour_slot) - coalesce(h.lunch, 0))), 0)
      into v_used, v_worked
    from "production log hours" h
    join "production logs" l on l.id = h.log_id
    where h.log_date = new.log_date and h.shift_code = new.shift_code
      and h.id is distinct from new.id
      and (case when v_scope = 1 then h.log_id = new.log_id else l.machine_id = v_machine end);

    if v_net is not null and v_worked + v_mine_w > v_net then
      raise exception '% allows % net hrs % for % -- % worked%, % remaining.',
        new.shift_code, fmt_hrs(v_net), case when v_scope = 1 then 'on this log' else 'on ' || v_machine end,
        new.log_date, fmt_hrs(v_worked), case when v_scope = 1 then '' else ' (incl. other logs)' end,
        fmt_hrs(greatest(v_net - v_worked, 0))
        using errcode = '23514';
    end if;
    if v_used + v_mine > v_gross then
      raise exception '% is % hrs (start to end) % for % -- % of hour slots used%, % left.',
        new.shift_code, fmt_hrs(v_gross), case when v_scope = 1 then 'on this log' else 'on ' || v_machine end,
        new.log_date, fmt_hrs(v_used), case when v_scope = 1 then '' else ' (incl. other logs)' end,
        fmt_hrs(greatest(v_gross - v_used, 0))
        using errcode = '23514';
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists trg_production_log_hours_shift_limit on public."production log hours";
create trigger trg_production_log_hours_shift_limit
  before insert or update on public."production log hours"
  for each row execute function public.guard_production_log_hours_shift_limit();

-- 5. Views ----------------------------------------------------------------------
-- (As run on live 2026-11-11: no temp table -- the SQL editor commits each
--  statement, so a temp table "on commit drop" is gone before it is read.
--  reloptions are set explicitly after the views below.)
create or replace view public."production log totals" as
 SELECT pl.id AS log_id,
    COALESCE(sum(plh.qty_produced), 0::numeric) AS total_produced,
    COALESCE(sum(plh.qty_rejected), 0::numeric) AS total_rejected,
    COALESCE(sum(plh.qty_rework), 0::numeric) AS total_rework,
        CASE
            WHEN ct.ct > 0::numeric AND COALESCE(sum(plh.net_min), 0::numeric) > 0::numeric
            THEN round(100.0 * COALESCE(sum(plh.good), 0::numeric) / (sum(plh.net_min) / ct.ct), 1)
            ELSE NULL::numeric
        END AS efficiency_pct,
        CASE
            WHEN COALESCE(sum(plh.qty_produced), 0::numeric) > 0::numeric THEN round(100.0 * COALESCE(sum(plh.qty_rejected), 0::numeric) / sum(plh.qty_produced), 1)
            ELSE NULL::numeric
        END AS reject_pct,
        CASE
            WHEN COALESCE(sum(plh.qty_produced), 0::numeric) > 0::numeric THEN round(100.0 * COALESCE(sum(plh.qty_rework), 0::numeric) / sum(plh.qty_produced), 1)
            ELSE NULL::numeric
        END AS rework_pct,
    -- 046 (appended)
    COALESCE(sum(plh.good), 0::numeric) AS total_good,
        CASE WHEN ct.ct > 0::numeric THEN round(COALESCE(sum(plh.net_min), 0::numeric) / ct.ct, 2) ELSE NULL::numeric END AS target_qty,
    COALESCE(sum(plh.setup_min), 0::bigint) AS setup_min,
    COALESCE(sum(plh.slot_min), 0::bigint) AS slot_minutes
   FROM "production logs" pl
     CROSS JOIN LATERAL (SELECT COALESCE(pl.cycle_time_min,
            CASE WHEN pl.standard_qty_per_hour > 0::numeric THEN 60.0 / pl.standard_qty_per_hour ELSE NULL::numeric END) AS ct) ct
     LEFT JOIN (
       SELECT h.*,
              hour_slot_minutes(h.shift_code, h.hour_slot) AS slot_min,
              COALESCE(h.qty_produced, 0::numeric) - COALESCE(h.qty_rejected, 0::numeric) - COALESCE(h.qty_rework, 0::numeric) AS good,
              GREATEST(0, hour_slot_minutes(h.shift_code, h.hour_slot) - COALESCE(h.setup_min, 0)
                - (h.opr_issue + h.program_issue + h.tool_issue + h.power_issue + h.inspection + h.breakdown + h.mc_clean + h.lunch))::numeric AS net_min
       FROM "production log hours" h
     ) plh ON plh.log_id = pl.id
  GROUP BY pl.id, pl.standard_qty_per_hour, ct.ct;

create or replace view public."report production hours" as
 SELECT pl.id AS log_id,
    pl.prd_no,
    pl.stage_id,
    s.seq AS stage_seq,
    s.operation,
    pl.machine_id,
    m.machine_name,
    COALESCE(m.category, 'Uncategorised'::text) AS machine_category,
    h.log_date,
    h.shift_code,
    h.employee_id,
    pl.planned_qty,
    pl.cycle_time_min,
    pl.standard_qty_per_hour,
    rc.shift_hours,
    count(h.id) AS hour_rows,
    sum(h.qty_produced) AS produced,
    sum(h.qty_rejected) AS rejected,
    sum(h.qty_rework) AS rework,
    sum(h.opr_issue) AS opr_issue,
    sum(h.program_issue) AS program_issue,
    sum(h.tool_issue) AS tool_issue,
    sum(h.power_issue) AS power_issue,
    sum(h.inspection) AS inspection,
    sum(h.breakdown) AS breakdown,
    sum(h.mc_clean) AS mc_clean,
    sum(h.lunch) AS lunch,
    -- 046 (appended)
    COALESCE(sum(h.setup_min), 0::bigint) AS setup_min,
    sum(hour_slot_minutes(h.shift_code, h.hour_slot)) AS slot_minutes,
    sum(COALESCE(h.qty_produced, 0::numeric) - COALESCE(h.qty_rejected, 0::numeric) - COALESCE(h.qty_rework, 0::numeric)) AS good_qty,
        CASE WHEN COALESCE(pl.cycle_time_min,
                CASE WHEN pl.standard_qty_per_hour > 0::numeric THEN 60.0 / pl.standard_qty_per_hour ELSE NULL::numeric END) > 0::numeric
             THEN round(sum(GREATEST(0, hour_slot_minutes(h.shift_code, h.hour_slot) - COALESCE(h.setup_min, 0) - (h.opr_issue + h.program_issue + h.tool_issue + h.power_issue + h.inspection + h.breakdown + h.mc_clean + h.lunch)))::numeric
                  / COALESCE(pl.cycle_time_min, 60.0 / pl.standard_qty_per_hour), 2)
             ELSE NULL::numeric
        END AS target_qty
   FROM "production log hours" h
     JOIN "production logs" pl ON pl.id = h.log_id
     JOIN "production route card stages" s ON s.id = pl.stage_id
     LEFT JOIN "production route cards" rc ON rc.prd_no = pl.prd_no
     LEFT JOIN "machines master" m ON m.machine_id = pl.machine_id
  GROUP BY pl.id, s.seq, s.operation, m.machine_name, m.category, rc.shift_hours, h.log_date, h.shift_code, h.employee_id;

-- Setting time, no double count: row setup per log x HOUR date x shift; the
-- header value only for logs with no row setup at all (old logs).
create or replace view public."report production setup" as
 SELECT pl.id AS log_id,
    pl.prd_no,
    pl.machine_id,
    COALESCE(m.category, 'Uncategorised'::text) AS machine_category,
    pl.log_date,
    pl.shift_code,
    COALESCE(pl.setting_time_min, 0) AS setting_time_min
   FROM "production logs" pl
     LEFT JOIN "machines master" m ON m.machine_id = pl.machine_id
  WHERE NOT EXISTS (SELECT 1 FROM "production log hours" x WHERE x.log_id = pl.id AND x.setup_min IS NOT NULL)
 UNION ALL
 SELECT pl.id AS log_id,
    pl.prd_no,
    pl.machine_id,
    COALESCE(m.category, 'Uncategorised'::text) AS machine_category,
    h.log_date,
    h.shift_code,
    COALESCE(sum(h.setup_min), 0)::integer AS setting_time_min
   FROM "production log hours" h
     JOIN "production logs" pl ON pl.id = h.log_id
     LEFT JOIN "machines master" m ON m.machine_id = pl.machine_id
  WHERE EXISTS (SELECT 1 FROM "production log hours" x WHERE x.log_id = pl.id AND x.setup_min IS NOT NULL)
  GROUP BY pl.id, pl.prd_no, pl.machine_id, m.category, h.log_date, h.shift_code;

-- reloptions as before 046 ("production log totals" had none -- left as is)
alter view public."report production hours" set (security_invoker = true);
alter view public."report production setup" set (security_invoker = true);

-- view grants: authenticated SELECT only, nothing for anon
revoke all on public."production log totals", public."report production hours",
              public."report production setup" from authenticated, anon;
grant select on public."production log totals", public."report production hours",
                public."report production setup" to authenticated;

-- 6. Grants on the new functions (039: no PUBLIC / anon EXECUTE) -------------
revoke all on function public.parse_shift_time_min(text) from public, anon;
revoke all on function public.shift_gross_minutes(text) from public, anon;
revoke all on function public.parse_lunch_min(text) from public, anon;
revoke all on function public.shift_net_minutes(text) from public, anon;
revoke all on function public.hour_slot_minutes(text, integer) from public, anon;
revoke all on function public.fmt_hrs(numeric) from public, anon;
revoke all on function public.guard_production_log_hours_shift_limit() from public, anon;
grant execute on function public.parse_shift_time_min(text) to authenticated, service_role;
grant execute on function public.shift_gross_minutes(text) to authenticated, service_role;
grant execute on function public.parse_lunch_min(text) to authenticated, service_role;
grant execute on function public.shift_net_minutes(text) to authenticated, service_role;
grant execute on function public.hour_slot_minutes(text, integer) to authenticated, service_role;
grant execute on function public.fmt_hrs(numeric) to authenticated, service_role;
grant execute on function public.guard_production_log_hours_shift_limit() to authenticated, service_role;

commit;

notify pgrst, 'reload schema';

-- ----------------------------------------------------------- VERIFICATION
-- 1. Column + checks: expect setup_min | integer | YES, and the two checks.
select column_name, data_type, is_nullable from information_schema.columns
where table_schema = 'public' and table_name = 'production log hours' and column_name = 'setup_min';
select conname, pg_get_constraintdef(oid) from pg_constraint
where conrelid = 'public."production log hours"'::regclass
  and conname in ('production_log_hours_setup_min_check', 'production_log_hours_idle_max_60');

-- 2. Per shift: gross / net hrs (expect e.g. 12 / 11) and slot minutes
--    (full slots 60, last slot = remainder, beyond = 60).
select s.shift_code, s.start_time, s.end_time, s.lunch_break_duration,
       fmt_hrs(shift_gross_minutes(s.shift_code)) as gross_hrs, fmt_hrs(shift_net_minutes(s.shift_code)) as net_hrs,
       array(select hour_slot_minutes(s.shift_code, n) from generate_series(1, 13) n) as slots_1_to_13
from public."shifts master" s order by 1;

-- 3. Triggers on hours: expect trg_production_log_hours_shift_limit (INSERT, UPDATE)
--    next to 026 / 028 / 035's.
select trigger_name, string_agg(event_manipulation, ', ' order by event_manipulation) as events
from information_schema.triggers
where event_object_table = 'production log hours'
group by 1 order by 1;

-- 4. 035 guard now lists setup_min: expect true.
select position('''setup_min''' in pg_get_functiondef('public.guard_production_log_hours_correction'::regproc)) > 0 as has_setup_min;

-- 5. Views: column lists (old columns first, unchanged; new ones at the end).
select c.relname, string_agg(a.attname, ',' order by a.attnum) as cols
from pg_class c join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
where c.relname in ('production log totals', 'report production hours', 'report production setup')
group by 1 order by 1;

-- 6. View options: expect security_invoker=true on "report production hours"
--    and "report production setup"; "production log totals" null (as before).
select relname, reloptions from pg_class
where relname in ('production log totals', 'report production hours', 'report production setup')
order by relname;

-- 7. View grants: expect exactly one row per view -- authenticated | SELECT;
--    no anon row, no other privilege.
select table_name, grantee, string_agg(privilege_type, ', ' order by privilege_type) as privileges
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('production log totals', 'report production hours', 'report production setup')
  and grantee in ('anon', 'authenticated')
group by 1, 2 order by 1, 2;

-- 8. Efficiency now (compare with PREVIEW b new_efficiency_pct -- expect equal;
--    setup_min is still null on old rows).
select log_id, total_produced, total_good, target_qty, efficiency_pct, setup_min, slot_minutes
from public."production log totals" order by log_id;

-- 9. Setting time totals: expect report_total = Σ header setting time (no row
--    setup yet on live, so every log still uses its header value).
select (select coalesce(sum(setting_time_min), 0) from public."report production setup") as report_total,
       (select coalesce(sum(setting_time_min), 0) from public."production logs") as header_total;

-- 10. Function grants: expect authenticated + service_role only.
select p.proname, array_agg(distinct r.rolname order by r.rolname) as can_execute
from pg_proc p
cross join pg_roles r
where p.proname in ('parse_shift_time_min', 'parse_lunch_min', 'shift_gross_minutes', 'shift_net_minutes', 'hour_slot_minutes', 'fmt_hrs',
                    'guard_production_log_hours_shift_limit')
  and r.rolname in ('anon', 'authenticated', 'service_role')
  and has_function_privilege(r.rolname, p.oid, 'execute')
group by 1 order by 1;

-- ------------------------------------------------------------ ROLLBACK
-- (only if needed; restores the 3 live view definitions as they were before
--  046 -- CREATE OR REPLACE cannot drop appended columns, so the views are
--  dropped and re-created: re-check grants + security_invoker afterwards)
--   begin;
--   drop trigger if exists trg_production_log_hours_shift_limit on public."production log hours";
--   drop function if exists public.guard_production_log_hours_shift_limit();
--   -- 035's guard: re-run section 4 of 035_shift_correction_closed_log.sql (without setup_min)
--   drop view if exists public."production log totals";
--   create view public."production log totals" with (security_invoker = true) as
--    SELECT pl.id AS log_id,
--       COALESCE(sum(plh.qty_produced), 0::numeric) AS total_produced,
--       COALESCE(sum(plh.qty_rejected), 0::numeric) AS total_rejected,
--       COALESCE(sum(plh.qty_rework), 0::numeric) AS total_rework,
--           CASE
--               WHEN pl.standard_qty_per_hour > 0::numeric AND count(plh.id) > 0 THEN round(100.0 * COALESCE(sum(plh.qty_produced), 0::numeric) / (pl.standard_qty_per_hour * count(plh.id)::numeric), 1)
--               ELSE NULL::numeric
--           END AS efficiency_pct,
--           CASE
--               WHEN COALESCE(sum(plh.qty_produced), 0::numeric) > 0::numeric THEN round(100.0 * COALESCE(sum(plh.qty_rejected), 0::numeric) / sum(plh.qty_produced), 1)
--               ELSE NULL::numeric
--           END AS reject_pct,
--           CASE
--               WHEN COALESCE(sum(plh.qty_produced), 0::numeric) > 0::numeric THEN round(100.0 * COALESCE(sum(plh.qty_rework), 0::numeric) / sum(plh.qty_produced), 1)
--               ELSE NULL::numeric
--           END AS rework_pct
--      FROM "production logs" pl
--        LEFT JOIN "production log hours" plh ON plh.log_id = pl.id
--     GROUP BY pl.id, pl.standard_qty_per_hour;
--   -- (use PREVIEW 0b's reloptions: drop "with (security_invoker = true)" if it was not set)
--   drop view if exists public."report production hours";
--   create view public."report production hours" with (security_invoker = true) as
--    SELECT pl.id AS log_id, pl.prd_no, pl.stage_id, s.seq AS stage_seq, s.operation, pl.machine_id,
--       m.machine_name, COALESCE(m.category, 'Uncategorised'::text) AS machine_category,
--       h.log_date, h.shift_code, h.employee_id, pl.planned_qty, pl.cycle_time_min,
--       pl.standard_qty_per_hour, rc.shift_hours, count(h.id) AS hour_rows,
--       sum(h.qty_produced) AS produced, sum(h.qty_rejected) AS rejected, sum(h.qty_rework) AS rework,
--       sum(h.opr_issue) AS opr_issue, sum(h.program_issue) AS program_issue, sum(h.tool_issue) AS tool_issue,
--       sum(h.power_issue) AS power_issue, sum(h.inspection) AS inspection, sum(h.breakdown) AS breakdown,
--       sum(h.mc_clean) AS mc_clean, sum(h.lunch) AS lunch
--      FROM "production log hours" h
--        JOIN "production logs" pl ON pl.id = h.log_id
--        JOIN "production route card stages" s ON s.id = pl.stage_id
--        LEFT JOIN "production route cards" rc ON rc.prd_no = pl.prd_no
--        LEFT JOIN "machines master" m ON m.machine_id = pl.machine_id
--     GROUP BY pl.id, s.seq, s.operation, m.machine_name, m.category, rc.shift_hours, h.log_date, h.shift_code, h.employee_id;
--   drop view if exists public."report production setup";
--   create view public."report production setup" with (security_invoker = true) as
--    SELECT pl.id AS log_id, pl.prd_no, pl.machine_id,
--       COALESCE(m.category, 'Uncategorised'::text) AS machine_category,
--       pl.log_date, pl.shift_code, COALESCE(pl.setting_time_min, 0) AS setting_time_min
--      FROM "production logs" pl
--        LEFT JOIN "machines master" m ON m.machine_id = pl.machine_id;
--   grant select on public."production log totals", public."report production hours",
--                   public."report production setup" to authenticated;
--   alter table public."production log hours" drop constraint if exists production_log_hours_idle_max_60,
--     add constraint production_log_hours_idle_max_60
--       check (opr_issue + program_issue + tool_issue + power_issue + inspection + breakdown + mc_clean + lunch <= 60);
--   alter table public."production log hours" drop constraint if exists production_log_hours_setup_min_check;
--   alter table public."production log hours" drop column if exists setup_min;
--   drop function if exists public.hour_slot_minutes(text, integer);
--   drop function if exists public.shift_net_minutes(text);
--   drop function if exists public.parse_lunch_min(text);
--   drop function if exists public.shift_gross_minutes(text);
--   drop function if exists public.parse_shift_time_min(text);
--   drop function if exists public.fmt_hrs(numeric);
--   commit;
--   notify pgrst, 'reload schema';
