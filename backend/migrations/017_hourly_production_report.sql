-- 017: Machine Entry -> BMLH paper "Hourly Production Report"
--
-- Header ("production logs"):
--   setter_employee_id  who set up the machine (employees master)
--   setting_time_min    setting time, minutes (>= 0)
--   cycle_time_min      snapshot from Cycle Time Master (part + seq) at start
--   verified_by/at      shift-incharge verification; supervisor/admin only,
--                       enforced by trigger (not just hidden in the UI)
--
-- Hourly rows ("production log hours"): 8 idle-minute categories + remarks,
--   each integer >= 0 default 0, row total <= 60.
--
-- Footer totals (accepted qty, idle, production time, setting time) are
-- computed live in the UI -- nothing stored.
--
-- Untouched on purpose: qty_produced / qty_rejected / qty_rework, the
-- is_open partial unique index (the stage lock), existing triggers/views.

begin;

-- ---------------------------------------------------------------- header
alter table "production logs"
  add column if not exists setter_employee_id text references "employees master"(employee_id),
  add column if not exists setting_time_min   integer check (setting_time_min >= 0),
  add column if not exists cycle_time_min     numeric check (cycle_time_min > 0),
  add column if not exists verified_by        uuid references auth.users(id),
  add column if not exists verified_at        timestamptz;

alter table "production logs"
  drop constraint if exists production_logs_verified_pair,
  add constraint production_logs_verified_pair
    check ((verified_by is null) = (verified_at is null));

-- ---------------------------------------------------------------- hours
alter table "production log hours"
  add column if not exists opr_issue     integer not null default 0 check (opr_issue >= 0),
  add column if not exists program_issue integer not null default 0 check (program_issue >= 0),
  add column if not exists tool_issue    integer not null default 0 check (tool_issue >= 0),
  add column if not exists power_issue   integer not null default 0 check (power_issue >= 0),
  add column if not exists inspection    integer not null default 0 check (inspection >= 0),
  add column if not exists breakdown     integer not null default 0 check (breakdown >= 0),
  add column if not exists mc_clean      integer not null default 0 check (mc_clean >= 0),
  add column if not exists lunch         integer not null default 0 check (lunch >= 0),
  add column if not exists remarks       text;

alter table "production log hours"
  drop constraint if exists production_log_hours_idle_max_60,
  add constraint production_log_hours_idle_max_60
    check (opr_issue + program_issue + tool_issue + power_issue
           + inspection + breakdown + mc_clean + lunch <= 60);

-- ---------------------------------------------------------------- verification guard
-- Any insert/update that sets or changes verified_by/verified_at must come
-- from a supervisor/admin ("app users".role). The server stamps who/when --
-- client-sent values are overwritten, so verified_by can't be spoofed.
-- security definer so the role lookup isn't blocked by "app users" RLS.
create or replace function guard_production_log_verification() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.verified_by is null and new.verified_at is null then
      return new;
    end if;
  elsif new.verified_by is not distinct from old.verified_by
    and new.verified_at is not distinct from old.verified_at then
    return new;
  end if;

  if not exists (
    select 1 from "app users"
    where user_id = auth.uid() and role in ('supervisor', 'admin')
  ) then
    raise exception 'Only a supervisor or admin can verify a production log'
      using errcode = '42501';
  end if;

  if new.verified_at is not null or new.verified_by is not null then
    new.verified_by := auth.uid();
    new.verified_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_production_logs_verification on "production logs";
create trigger trg_production_logs_verification
  before insert or update on "production logs"
  for each row execute function guard_production_log_verification();

commit;

notify pgrst, 'reload schema';

-- Check after running (expect 5 + 9 rows, 2 constraints, 1 trigger; row
-- counts unchanged from before the migration):
--   select table_name, column_name, data_type, column_default
--   from information_schema.columns
--   where table_schema = 'public'
--     and ((table_name = 'production logs' and column_name in
--            ('setter_employee_id','setting_time_min','cycle_time_min','verified_by','verified_at'))
--       or (table_name = 'production log hours' and column_name in
--            ('opr_issue','program_issue','tool_issue','power_issue','inspection',
--             'breakdown','mc_clean','lunch','remarks')))
--   order by 1, 2;
--   select conname from pg_constraint
--   where conname in ('production_logs_verified_pair','production_log_hours_idle_max_60');
--   select tgname from pg_trigger where tgname = 'trg_production_logs_verification';
--   select (select count(*) from "production logs") logs, (select count(*) from "production log hours") hours;
