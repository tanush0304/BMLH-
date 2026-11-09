-- 044_quality_by_category.sql
-- Quality Master by machine category.
--
--   * "quality master".machine_category text (new, nullable).
--   * "quality master".machine_id becomes nullable.
--   * check quality_master_applies_to_check: a row applies to a machine OR a
--     machine category -- machine_id set, or a non-blank machine_category.
--   * No data change: existing rows keep their machine_id, machine_category
--     stays null. The readings FK ("quality log readings".quality_parameter_id)
--     is untouched.
--
-- Matching (frontend, utils/qualityMatch.js): part + operation + exact machine,
-- plus part + operation + the machine's category; same parameter name -> the
-- exact machine's row wins. Category values compare trimmed, case-insensitive.
--
-- Re-runnable. The frontend works BEFORE this is run (category parts hidden).
-- Run PREVIEW first, then CHANGE, then VERIFICATION.

-- ---------------------------------------------------------------- PREVIEW
-- a) Already run? (0 rows = column not there yet)
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'quality master'
  and column_name in ('machine_id', 'machine_category')
order by 1;

-- b) Rows now; rows without a machine (expect 0 before 044).
select count(*) as rows, count(*) filter (where machine_id is null) as without_machine
from public."quality master";

-- c) Machine categories in use (what the "Applies to" dropdown will offer).
select coalesce(nullif(btrim(category), ''), '(blank)') as category, count(*) as machines
from public."machines master"
group by 1 order by 1;

-- d) Views / functions depending on "quality master" (for information; the
--    change below adds a column and drops a NOT NULL only).
select distinct c.relname as dependent, c.relkind
from pg_depend d
join pg_rewrite r on r.oid = d.objid
join pg_class c on c.oid = r.ev_class
where d.refobjid = 'public."quality master"'::regclass and c.oid <> d.refobjid
order by 1;

-- ----------------------------------------------------------------- CHANGE
alter table public."quality master" add column if not exists machine_category text;
alter table public."quality master" alter column machine_id drop not null;

alter table public."quality master" drop constraint if exists quality_master_applies_to_check;
alter table public."quality master" add constraint quality_master_applies_to_check
  check (machine_id is not null or nullif(btrim(machine_category), '') is not null);

notify pgrst, 'reload schema';

-- ----------------------------------------------------------- VERIFICATION
-- 1. Columns: machine_id is_nullable = YES; machine_category text, YES.
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'quality master'
  and column_name in ('machine_id', 'machine_category')
order by 1;

-- 2. Check constraint present (1 row).
select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public."quality master"'::regclass and conname = 'quality_master_applies_to_check';

-- 3. Rows unchanged: same count as PREVIEW b, all still with machine_id,
--    none with a category yet, none violating the check.
select count(*) as rows,
       count(*) filter (where machine_id is not null) as with_machine,
       count(*) filter (where machine_category is not null) as with_category,
       count(*) filter (where machine_id is null and nullif(btrim(machine_category), '') is null) as violating
from public."quality master";

-- ------------------------------------------------------------ ROLLBACK
-- (only while no row uses a category; set NOT NULL fails if any machine_id is null)
--   alter table public."quality master" drop constraint if exists quality_master_applies_to_check;
--   alter table public."quality master" alter column machine_id set not null;
--   alter table public."quality master" drop column if exists machine_category;
--   notify pgrst, 'reload schema';
