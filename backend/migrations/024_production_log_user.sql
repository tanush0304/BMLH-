-- 024: Record which login opened each production log, so Production Data
-- Entry / Manual Operations can reload the user's own open log when the
-- screen is reopened.
--
-- STEP 1 -- run first, on its own. If user_id already exists, send the output
-- back before STEP 2 (its type must be uuid for the default below):
--
--   select column_name, data_type, column_default
--   from information_schema.columns
--   where table_name = 'production logs' and column_name = 'user_id';
--
--   -- open logs today (these have no user_id and won't auto-reload; they can
--   -- still be resumed by picking the same PRD + machine + stage):
--   select id, prd_no, stage_id, machine_id, start_time
--   from "production logs" where is_open order by start_time;
--
-- STEP 2 -- the migration.

begin;

-- Filled by the database from the caller's login on every insert -- the
-- screens don't send it. Existing rows stay null (unknown).
alter table "production logs" add column if not exists user_id uuid;
alter table "production logs" alter column user_id set default auth.uid();

create index if not exists production_logs_open_by_user
  on "production logs" (user_id)
  where is_open;

-- At most one open log per machine (on top of one open log per PRD + stage).
-- Before running, check that no machine already has two open logs -- this
-- must return zero rows, otherwise the index fails and the migration rolls back:
--   select machine_id, count(*) from "production logs"
--   where is_open and machine_id is not null group by 1 having count(*) > 1;
create unique index if not exists production_logs_one_open_per_machine
  on "production logs" (machine_id)
  where is_open and machine_id is not null;

commit;

-- After running:
--   select column_default from information_schema.columns
--   where table_name = 'production logs' and column_name = 'user_id';   -- auth.uid()
--   -- start a log from the app, then:
--   select id, user_id from "production logs" order by id desc limit 1; -- user_id filled
--   notify pgrst, 'reload schema';
