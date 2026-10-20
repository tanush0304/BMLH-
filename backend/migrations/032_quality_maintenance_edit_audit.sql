-- 032: Supervisor/admin edits on Quality Inspection and Maintenance Checklist
-- entries, with an audit trail (same idea as 025 for Stores).
--
-- Until now these four tables were insert-only from the app. Now:
--
--   table                      editable                                  locked (never changes)
--   "quality logs"             employee_id, shift_code                   prd_no, stage_id, machine_id, log_date, log_time
--   "quality log readings"     observed_value                            quality_log_id, quality_parameter_id
--   "maintenance logs"         employee_id, shift_code, maintenance_type machine_id, log_date
--   "maintenance log items"    condition, observation, action_taken      maintenance_log_id, checklist_item_id
--
-- Every app update (role authenticated/anon) must come from a supervisor or
-- admin ("app users".role) -- the screens hide Edit for everyone else; this
-- is the database-side guarantee. SQL editor / dashboard / service_role skip
-- the check (026 is_app_caller()). Each edit stamps edited_by / edited_at;
-- a reading keeps previous_observed_value and an item previous_condition
-- (the value just before the LATEST change of that column). The audit
-- columns are trigger-owned: edited_by / edited_at are always overwritten, and
-- a direct write to previous_<column> is undone (old value restored) unless
-- the tracked column itself changed. No DELETE change.
--
-- STEP 1 -- run first, on its own. Expect 18 rows; observed_value must be
-- numeric and condition text (the previous_* columns below use those types) (the schema file is stale:
-- operator_emp_id was renamed to employee_id in 013; maintenance_type is
-- the app's column on "maintenance logs"):
--
--   select table_name, column_name, data_type from information_schema.columns
--   where table_schema = 'public' and (
--        (table_name = 'quality logs'          and column_name in ('prd_no','stage_id','machine_id','employee_id','shift_code','log_date','log_time'))
--     or (table_name = 'quality log readings'  and column_name in ('quality_log_id','quality_parameter_id','observed_value'))
--     or (table_name = 'maintenance logs'      and column_name in ('machine_id','employee_id','shift_code','log_date','maintenance_type'))
--     or (table_name = 'maintenance log items' and column_name in ('maintenance_log_id','checklist_item_id','condition')))
--   order by 1, 2;
--
--   -- UPDATE must be granted and allowed by RLS for authenticated:
--   select table_name, privilege_type from information_schema.role_table_grants
--   where grantee = 'authenticated' and privilege_type = 'UPDATE'
--     and table_name in ('quality logs','quality log readings','maintenance logs','maintenance log items');   -- 4 rows
--   select tablename, policyname, cmd, roles from pg_policies
--   where tablename in ('quality logs','quality log readings','maintenance logs','maintenance log items');
--   (RLS off, or an UPDATE / ALL policy for authenticated -- send me the output if unsure.)
--
-- STEP 2 -- the migration.

begin;

alter table "quality logs"
  add column if not exists edited_by uuid,
  add column if not exists edited_at timestamptz;

alter table "quality log readings"
  add column if not exists edited_by uuid,
  add column if not exists edited_at timestamptz,
  add column if not exists previous_observed_value numeric;

alter table "maintenance logs"
  add column if not exists edited_by uuid,
  add column if not exists edited_at timestamptz;

alter table "maintenance log items"
  add column if not exists edited_by uuid,
  add column if not exists edited_at timestamptz,
  add column if not exists previous_condition text;

-- TG_ARGV[0] = column whose old value is kept in previous_<column> ('-' = none);
-- TG_ARGV[1..] = columns that may never change on this table.
create or replace function audit_record_edit()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_col text;
  v_track text := TG_ARGV[0];
  i int;
begin
  if not is_app_caller() then
    return new;
  end if;

  if not exists (
    select 1 from "app users"
    where user_id = auth.uid() and role in ('supervisor', 'admin')
  ) then
    raise exception 'Only a supervisor or admin can edit a saved entry'
      using errcode = '42501';
  end if;

  for i in 1 .. TG_NARGS - 1 loop
    v_col := TG_ARGV[i];
    if (to_jsonb(new) -> v_col) is distinct from (to_jsonb(old) -> v_col) then
      raise exception '% cannot be changed on a saved entry', v_col
        using errcode = '42501';
    end if;
  end loop;

  new.edited_by := auth.uid();
  new.edited_at := now();
  if v_track <> '-' then
    if (to_jsonb(new) -> v_track) is distinct from (to_jsonb(old) -> v_track) then
      new := jsonb_populate_record(new, jsonb_build_object('previous_' || v_track, to_jsonb(old) -> v_track));
    else
      -- Tracked column unchanged: keep the stored previous_ value as it was.
      new := jsonb_populate_record(new, jsonb_build_object('previous_' || v_track, to_jsonb(old) -> ('previous_' || v_track)));
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_quality_logs_edit_audit on "quality logs";
create trigger trg_quality_logs_edit_audit
  before update on "quality logs"
  for each row execute function audit_record_edit(
    '-', 'id', 'prd_no', 'stage_id', 'machine_id', 'log_date', 'log_time', 'created_at');

drop trigger if exists trg_quality_log_readings_edit_audit on "quality log readings";
create trigger trg_quality_log_readings_edit_audit
  before update on "quality log readings"
  for each row execute function audit_record_edit(
    'observed_value', 'id', 'quality_log_id', 'quality_parameter_id', 'created_at');

drop trigger if exists trg_maintenance_logs_edit_audit on "maintenance logs";
create trigger trg_maintenance_logs_edit_audit
  before update on "maintenance logs"
  for each row execute function audit_record_edit(
    '-', 'id', 'machine_id', 'log_date', 'created_at');

drop trigger if exists trg_maintenance_log_items_edit_audit on "maintenance log items";
create trigger trg_maintenance_log_items_edit_audit
  before update on "maintenance log items"
  for each row execute function audit_record_edit(
    'condition', 'id', 'maintenance_log_id', 'checklist_item_id', 'created_at');

commit;

-- After running:
--   select event_object_table, trigger_name from information_schema.triggers
--   where trigger_name in ('trg_quality_logs_edit_audit','trg_quality_log_readings_edit_audit',
--                          'trg_maintenance_logs_edit_audit','trg_maintenance_log_items_edit_audit');   -- 4 rows
--   notify pgrst, 'reload schema';
--   -- as a supervisor, edit a reading from the app, then:
--   select id, observed_value, previous_observed_value, edited_by, edited_at
--   from "quality log readings" where edited_at is not null order by edited_at desc limit 5;
