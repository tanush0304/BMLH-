-- Drops the unique constraint on "machines master".machine_name.
--
-- Hit this as a real blocker while loading BMLH's actual 23-machine fleet:
-- several real machines share a plain name ("CNC 1", "VMC 2", etc.) with
-- existing demo/pilot rows that happen to use the same generic placeholder
-- names. machine_id is already this table's real primary key, so two
-- genuinely different machines sharing a display name isn't invalid data --
-- it's normal for a real shop floor. Going forward, UI that lists machines
-- shows name + id together (e.g. "CNC 1 (MC-008)") precisely because name
-- alone can no longer be assumed unique.
--
-- The constraint name below was read directly from the actual error
-- Postgres raised on insert (23505 duplicate key violates unique
-- constraint "machines_machine_name_key"), not guessed. To double check
-- before running, this confirms the same name:
--   select conname from pg_constraint
--   where conrelid = '"machines master"'::regclass and contype = 'u';

alter table "machines master"
  drop constraint if exists machines_machine_name_key;
