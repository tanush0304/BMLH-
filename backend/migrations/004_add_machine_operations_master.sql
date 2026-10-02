-- Replaces Machine Master's hardcoded OPERATION_OPTIONS array (a JS
-- constant, not a DB table) with a real master table, so the "Other" field
-- is no longer limited to tracking a single custom value per machine.
--
-- "machine ops" already stores operation as free text with no FK, so
-- operation_name is a natural primary key here -- no separate code needed
-- (unlike job work master, which has a code distinct from its display name).
--
-- Seed data = the union of the old hardcoded 10 options AND every distinct
-- value already live in "machine ops" today (confirmed via a direct query
-- before writing this), so nothing currently selected on any machine --
-- old demo machines or the real fleet just loaded -- goes from "visible
-- because it happens to match" to "orphaned because it's not in the seed."

create table "machine operations master" (
  operation_name text primary key,
  created_at timestamptz not null default now()
);

insert into "machine operations master" (operation_name) values
  ('Turning'),
  ('Milling'),
  ('Drilling'),
  ('Grinding'),
  ('Cutting'),
  ('Broaching'),
  ('Boring'),
  ('Tapping'),
  ('Deburring'),
  ('Inspection'),
  ('Face Drilling'),
  ('Face Grinding'),
  ('Final Surface Grinding'),
  ('Finish Turning'),
  ('Finish Turning ONE'),
  ('Finish Turning TWO'),
  ('ID Boring'),
  ('ID Final Grinding'),
  ('OD Grinding'),
  ('Reaming'),
  ('Reaming ONE'),
  ('Reaming TWO'),
  ('Rough Turning'),
  ('Rough Turning ONE'),
  ('Rough Turning TWO'),
  ('Slotting'),
  ('Surface Finish Grinding'),
  ('Surface Grinding ONE'),
  ('Surface Rough Grinding');
