begin;

alter table "production log hours"
  add column if not exists log_date    date,
  add column if not exists shift_code  text references "shifts master"(shift_code),
  add column if not exists employee_id text references "employees master"(employee_id);

-- Backfill existing hour rows from their parent log
update "production log hours" h
set log_date    = l.log_date,
    shift_code  = l.shift_code,
    employee_id = l.employee_id
from "production logs" l
where l.id = h.log_id
  and (h.log_date is null or h.shift_code is null or h.employee_id is null);

create or replace function fill_hour_attribution() returns trigger as $$
declare l record;
begin
  if new.log_date is null or new.shift_code is null or new.employee_id is null then
    select * into l from "production logs" where id = new.log_id;
    new.log_date    := coalesce(new.log_date, l.log_date);
    new.shift_code  := coalesce(new.shift_code, l.shift_code);
    new.employee_id := coalesce(new.employee_id, l.employee_id);
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_hours_fill_attribution on "production log hours";
create trigger trg_hours_fill_attribution
  before insert on "production log hours"
  for each row execute function fill_hour_attribution();

alter table "production log hours"
  alter column log_date    set not null,
  alter column shift_code  set not null,
  alter column employee_id set not null;

alter table "production log hours"
  drop constraint if exists "production log hours_log_id_hour_slot_key";
alter table "production log hours"
  drop constraint if exists production_log_hours_slot_key;
alter table "production log hours"
  add constraint production_log_hours_slot_key
  unique (log_id, log_date, shift_code, hour_slot);

commit;
notify pgrst, 'reload schema';