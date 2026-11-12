-- =====================================================================
-- 050_hour_slot_no_overlap.sql                         written 2026-11-12
-- One machine can't run two logs in the same hour.
--
-- "production log hours".hour_slot is the CLOCK position inside the shift
-- (slot 1 = shift start .. +1 h; 046's hour_slot_minutes relies on it).
-- Unique today only per (log_id, log_date, shift_code, hour_slot), so two
-- logs on the same machine could both save e.g. slot 3 of SHIFT-A.
--
-- 050 refuses, for app callers (supervisor/admin included), an hour row whose
-- machine + log_date + shift_code + hour_slot is already used by ANOTHER log:
--   23514 "Hour 3 of SHIFT-A on MC-012 for 12-11-2026 is already logged on
--          PRD-003 (log #41)."
-- Checked on INSERT, and on UPDATE only when log_id / log_date / shift_code /
-- hour_slot change (qty / idle / setup / lunch edits are never refused, so
-- Shift Verification corrections keep working). Rows already overlapping
-- stay as they are (PREVIEW lists them).
--
-- NOT enforced here (grid rule only, decision 2026-11-12): "new hours start
-- after the last slot already used". hour_slot 1-12 is unchanged.
--
-- Same advisory lock key as 046's shift-hours guard (machine + date + shift),
-- so two parallel saves on one machine are serialised by both triggers.
-- is_app_caller() bypass (SQL editor / service role), as 026-047.
-- Not covered: an admin moving a whole log to another machine (040 locks
-- machine_id for everyone else) -- that log's hours are not re-checked.
--
-- Every statement stands alone (Supabase SQL editor commits each one):
-- no temp tables, no session state, no begin/commit. Re-runnable.
-- Frontend works with or without it (the grid already closes used slots).
-- =====================================================================


-- ---------------------------------------------------------------------
-- PREVIEW (read-only) -- run first
-- ---------------------------------------------------------------------

-- P1. Existing overlaps: machine + date + shift + slot used by 2+ logs.
--     Left as they are; only new / moved rows are checked.
select l.machine_id, h.log_date, h.shift_code, h.hour_slot,
       count(distinct h.log_id)                                  as logs,
       string_agg(distinct l.prd_no || ' (log #' || h.log_id || ')', ', ') as used_by
from public."production log hours" h
join public."production logs" l on l.id = h.log_id
where l.machine_id is not null
group by l.machine_id, h.log_date, h.shift_code, h.hour_slot
having count(distinct h.log_id) > 1
order by h.log_date desc, l.machine_id, h.shift_code, h.hour_slot;

-- P2. Hour rows whose log has no machine (never checked by 050).
select count(*) as hour_rows_without_machine
from public."production log hours" h
join public."production logs" l on l.id = h.log_id
where l.machine_id is null;

-- P3. Prerequisites exist (expect 1 row each): is_app_caller (026), 046 trigger.
select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'is_app_caller';
select tgname from pg_trigger
where tgrelid = 'public."production log hours"'::regclass and tgname = 'trg_production_log_hours_shift_limit';


-- ---------------------------------------------------------------------
-- CHANGE 1. Guard function
-- ---------------------------------------------------------------------
create or replace function public.guard_production_log_hours_slot_overlap() returns trigger
language plpgsql set search_path = public as $$  -- invoker (is_app_caller needs current_user)
declare
  v_machine text;
  v_other   record;
begin
  if not is_app_caller() then
    return new;  -- SQL editor / service role
  end if;
  if tg_op = 'UPDATE'
     and new.log_id is not distinct from old.log_id
     and new.log_date is not distinct from old.log_date
     and new.shift_code is not distinct from old.shift_code
     and new.hour_slot is not distinct from old.hour_slot then
    return new;  -- value edit on the same slot: nothing moves
  end if;

  select machine_id into v_machine from "production logs" where id = new.log_id;
  if v_machine is null then
    return new;
  end if;

  -- same key as 046's guard -> one lock per machine + date + shift
  perform pg_advisory_xact_lock(hashtext(concat_ws('|', '046', v_machine, new.log_date, new.shift_code)));

  select h.log_id, l.prd_no
    into v_other
  from "production log hours" h
  join "production logs" l on l.id = h.log_id
  where l.machine_id = v_machine
    and h.log_date = new.log_date
    and h.shift_code = new.shift_code
    and h.hour_slot = new.hour_slot
    and h.log_id <> new.log_id
  order by h.log_id
  limit 1;

  if found then
    raise exception 'Hour % of % on % for % is already logged on % (log #%).',
      new.hour_slot, new.shift_code, v_machine, to_char(new.log_date, 'DD-MM-YYYY'),
      coalesce(v_other.prd_no, 'another PRD'), v_other.log_id
      using errcode = '23514';
  end if;
  return new;
end;
$$;

-- CHANGE 2. Nobody calls it directly (trigger firing doesn't need EXECUTE).
revoke all on function public.guard_production_log_hours_slot_overlap() from public, anon;

-- CHANGE 3. Trigger
drop trigger if exists trg_production_log_hours_slot_overlap on public."production log hours";

create trigger trg_production_log_hours_slot_overlap
  before insert or update on public."production log hours"
  for each row execute function public.guard_production_log_hours_slot_overlap();

-- CHANGE 4. Reload PostgREST (no schema shape change, harmless).
notify pgrst, 'reload schema';


-- ---------------------------------------------------------------------
-- VERIFICATION (read-only)
-- ---------------------------------------------------------------------

-- V1. Trigger present + enabled ('O'), BEFORE INSERT OR UPDATE, row level.
select tgname, tgenabled, pg_get_triggerdef(oid) as def
from pg_trigger
where tgrelid = 'public."production log hours"'::regclass
  and tgname in ('trg_production_log_hours_slot_overlap', 'trg_production_log_hours_shift_limit')
order by tgname;

-- V2. Function: invoker (prosecdef = false), search_path set, no anon/public EXECUTE.
select p.proname, p.prosecdef, p.proconfig,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon_exec
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'guard_production_log_hours_slot_overlap';

-- V3. Same as P1 -- the count must not grow after 050 (old overlaps only).


-- ---------------------------------------------------------------------
-- MANUAL TEST (in the app, TEST data only -- not SQL):
--   Machine X, today, SHIFT-A: log 1 saves hour 3. End it. Start log 2 on X
--   (supervisor, another PRD) -> the grid shows hours 1-3 closed. A direct
--   API insert of hour 3 for log 2 -> 23514 "Hour 3 of SHIFT-A on X ... is
--   already logged on PRD-... (log #...)". Editing log 1's hour 3 qty -> OK.
-- ---------------------------------------------------------------------


-- ---------------------------------------------------------------------
-- ROLLBACK (only if needed)
-- ---------------------------------------------------------------------
-- drop trigger if exists trg_production_log_hours_slot_overlap on public."production log hours";
-- drop function if exists public.guard_production_log_hours_slot_overlap();
-- notify pgrst, 'reload schema';
