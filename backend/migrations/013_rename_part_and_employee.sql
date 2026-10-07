-- =====================================================================
-- 013: Consistent naming across the whole backend.
--   product_code        -> part_serial_number   (every table and view)
--   product_name        -> part_name            (products master)
--   users master        -> employees master
--     user_emp_id       -> employee_id          (every table)
--     user_name         -> employee_name, user_status -> employee_status
--   machines master: machine_oem -> manufacturer_name
-- NOT renamed: user_id (the login account), app_users.role and its
-- 'operator' value, part_drawing_reference_number.
--
-- DO NOT RUN until the frontend change is ready. The app breaks the
-- moment this runs if it still uses the old names. Run in one paste.
-- =====================================================================
begin;

do $$
declare r record;
begin
  -- product_code -> part_serial_number: tables first, then views
  for r in select c.table_name from information_schema.columns c
           join information_schema.tables t using (table_schema, table_name)
           where c.table_schema = 'public' and c.column_name = 'product_code'
             and t.table_type = 'BASE TABLE' loop
    execute format('alter table public.%I rename column product_code to part_serial_number', r.table_name);
  end loop;
  for r in select c.table_name from information_schema.columns c
           join information_schema.tables t using (table_schema, table_name)
           where c.table_schema = 'public' and c.column_name = 'product_code'
             and t.table_type = 'VIEW' loop
    execute format('alter view public.%I rename column product_code to part_serial_number', r.table_name);
  end loop;
end $$;

alter table "products master" rename column product_name to part_name;

alter table "users master" rename to "employees master";
alter table "employees master" rename column user_name to employee_name;
alter table "employees master" rename column user_status to employee_status;

do $$
declare r record;
begin
  -- user_emp_id -> employee_id everywhere
  for r in select c.table_name from information_schema.columns c
           join information_schema.tables t using (table_schema, table_name)
           where c.table_schema = 'public' and c.column_name = 'user_emp_id'
             and t.table_type = 'BASE TABLE' loop
    execute format('alter table public.%I rename column user_emp_id to employee_id', r.table_name);
  end loop;
  for r in select c.table_name from information_schema.columns c
           join information_schema.tables t using (table_schema, table_name)
           where c.table_schema = 'public' and c.column_name = 'user_emp_id'
             and t.table_type = 'VIEW' loop
    execute format('alter view public.%I rename column user_emp_id to employee_id', r.table_name);
  end loop;
end $$;

alter table "machines master" rename column machine_oem to manufacturer_name;

-- The hour-attribution trigger function (migration 010) names the old column
-- inside its body, which Postgres does not rewrite. Recreate it if it exists.
do $$
begin
  if exists (select 1 from pg_proc where proname = 'fill_hour_attribution') then
    execute $f$
      create or replace function fill_hour_attribution() returns trigger as $fn$
      declare l record;
      begin
        if new.log_date is null or new.shift_code is null or new.employee_id is null then
          select * into l from "production logs" where id = new.log_id;
          new.log_date   := coalesce(new.log_date, l.log_date);
          new.shift_code := coalesce(new.shift_code, l.shift_code);
          new.employee_id := coalesce(new.employee_id, l.employee_id);
        end if;
        return new;
      end;
      $fn$ language plpgsql
    $f$;
  end if;
end $$;

-- Safety net: any old name left anywhere in public rolls everything back.
do $$
declare n int;
begin
  select count(*) into n from information_schema.columns
  where table_schema = 'public'
    and column_name in ('product_code','product_name','user_emp_id','user_name','user_status','machine_oem');
  if n > 0 then
    raise exception '% columns still use an old name - nothing saved', n;
  end if;
end $$;

commit;

notify pgrst, 'reload schema';

-- Check after running:
--   select table_name, column_name from information_schema.columns
--   where table_schema = 'public' and column_name in ('part_serial_number','employee_id') order by 1;
