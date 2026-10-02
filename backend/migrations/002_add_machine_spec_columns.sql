-- Adds BMLH's real machine spec fields to "machines master", needed to load
-- the real 23-machine fleet (Machine Master.xlsx). All text, not numeric --
-- the source data has non-numeric values like "No Specification" and
-- "> 250 x 500", so these must stay free text, not be parsed into numbers.

alter table "machines master"
  add column chuck_dia text,
  add column x_axis text,
  add column y_axis text,
  add column fifth_axis text,
  add column dia text;
