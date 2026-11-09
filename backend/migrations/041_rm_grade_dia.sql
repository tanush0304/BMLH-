-- 041_rm_grade_dia.sql
-- Raw Material Grade: adds "raw materials master".grade (text, nullable,
-- no default). No data changes. Diameter keeps using the existing
-- diameter_mm column (decision 2026-11-07: no separate "dia" column).
--
-- The frontend works before this is run (Grade field hidden until the
-- column exists), so deploy order does not matter.

-- ---------------------------------------------------------------- PREVIEW
-- Run alone first: expect NO row for grade, one row for diameter_mm.
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'raw materials master'
  and column_name in ('grade', 'diameter_mm')
order by column_name;

-- ----------------------------------------------------------------- CHANGE
alter table public."raw materials master"
  add column if not exists grade text;

comment on column public."raw materials master".grade is
  'Material grade, e.g. SCM415H. Free text (add-new list in the app). One RM code per grade + size.';

-- ----------------------------------------------------------- VERIFICATION
-- Expect: grade | text | YES | null
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'raw materials master'
  and column_name = 'grade';

-- Expect: total = row count before, with_grade = 0 (no data changed).
select count(*) as total, count(grade) as with_grade
from public."raw materials master";

notify pgrst, 'reload schema';
