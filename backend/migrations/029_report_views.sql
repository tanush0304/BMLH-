-- 029: read-only views for Reports & Dashboard
--
-- "report production hours"   one row per log x log_date x shift_code x
--                              employee_id: hour-row count, qty sums, the 8
--                              idle-minute sums. Production Status, Daily
--                              Machine and Downtime all sum from here
--                              (avoids PostgREST's 1000-row cap on raw hours).
-- "report production setup"   one row per log: setting time, attributed to the
--                              log's own log_date + shift_code. Kept separate so
--                              setting time is counted once per log no matter
--                              how many hour groups / employees the log has.
-- "report quality inspections" one row per quality log with its readings
--                              rolled up (Accepted only if every reading is;
--                              'No readings' when it has none).
--
-- Formulas stay in the app (utils/reportAggregates.js): efficiency =
-- 100 x sum(produced) / sum(standard_qty_per_hour x hour_rows); available
-- minutes = hour_rows x 60 - lunch; lost = 7 idle categories (no lunch)
-- + setting time.
--
-- security_invoker = true: the caller's RLS on the base tables applies.
-- No tables, triggers or data are changed.

-- ---------------------------------------------------------------- pre-check
-- Run first; every row must come back (expect 43 rows). A missing row means a
-- column name differs on live -- stop and report it.
--   select table_name, column_name from information_schema.columns
--   where table_schema = 'public' and (
--     (table_name = 'production log hours' and column_name in
--       ('id','log_id','log_date','shift_code','employee_id','qty_produced','qty_rejected',
--        'qty_rework','opr_issue','program_issue','tool_issue','power_issue','inspection',
--        'breakdown','mc_clean','lunch'))
--     or (table_name = 'production logs' and column_name in
--       ('id','prd_no','stage_id','machine_id','log_date','shift_code','planned_qty',
--        'standard_qty_per_hour','cycle_time_min','setting_time_min'))
--     or (table_name = 'production route card stages' and column_name in ('id','seq','operation'))
--     or (table_name = 'production route cards' and column_name in ('prd_no','shift_hours'))
--     or (table_name = 'machines master' and column_name in ('machine_id','machine_name','category'))
--     or (table_name = 'quality logs' and column_name in
--       ('id','prd_no','stage_id','machine_id','log_date','shift_code','employee_id'))
--     or (table_name = 'quality log results' and column_name in ('quality_log_id','result'))
--   ) order by 1, 2;
-- (hours 16 + logs 10 + stages 3 + route cards 2 + machines 3 + quality logs 7
--  + quality log results 2 = 43.)

begin;

create or replace view "report production hours"
with (security_invoker = true) as
select
  pl.id                         as log_id,
  pl.prd_no,
  pl.stage_id,
  s.seq                         as stage_seq,
  s.operation,
  pl.machine_id,
  m.machine_name,
  coalesce(m.category, 'Uncategorised') as machine_category,
  h.log_date,
  h.shift_code,
  h.employee_id,
  pl.planned_qty,
  pl.cycle_time_min,
  pl.standard_qty_per_hour,
  rc.shift_hours,
  count(h.id)                   as hour_rows,
  sum(h.qty_produced)           as produced,
  sum(h.qty_rejected)           as rejected,
  sum(h.qty_rework)             as rework,
  sum(h.opr_issue)              as opr_issue,
  sum(h.program_issue)          as program_issue,
  sum(h.tool_issue)             as tool_issue,
  sum(h.power_issue)            as power_issue,
  sum(h.inspection)             as inspection,
  sum(h.breakdown)              as breakdown,
  sum(h.mc_clean)               as mc_clean,
  sum(h.lunch)                  as lunch
from "production log hours" h
join "production logs" pl on pl.id = h.log_id
join "production route card stages" s on s.id = pl.stage_id
left join "production route cards" rc on rc.prd_no = pl.prd_no
left join "machines master" m on m.machine_id = pl.machine_id
group by pl.id, s.seq, s.operation, m.machine_name, m.category, rc.shift_hours,
         h.log_date, h.shift_code, h.employee_id;

create or replace view "report production setup"
with (security_invoker = true) as
select
  pl.id                         as log_id,
  pl.prd_no,
  pl.machine_id,
  coalesce(m.category, 'Uncategorised') as machine_category,
  pl.log_date,
  pl.shift_code,
  coalesce(pl.setting_time_min, 0) as setting_time_min
from "production logs" pl
left join "machines master" m on m.machine_id = pl.machine_id;

create or replace view "report quality inspections"
with (security_invoker = true) as
select
  q.id                          as quality_log_id,
  q.prd_no,
  q.stage_id,
  s.seq                         as stage_seq,
  s.operation,
  q.machine_id,
  m.machine_name,
  coalesce(m.category, 'Uncategorised') as machine_category,
  q.log_date,
  q.shift_code,
  q.employee_id,
  count(r.quality_log_id)       as readings,
  count(*) filter (where r.result = 'Not Accepted') as ng_readings,
  case when count(r.quality_log_id) = 0 then 'No readings'
       when count(*) filter (where r.result = 'Not Accepted') = 0 then 'Accepted'
       else 'Rejected' end as inspection_result
from "quality logs" q
join "production route card stages" s on s.id = q.stage_id
left join "machines master" m on m.machine_id = q.machine_id
left join "quality log results" r on r.quality_log_id = q.id
group by q.id, s.seq, s.operation, m.machine_name, m.category;

grant select on "report production hours", "report production setup",
  "report quality inspections" to authenticated;

commit;

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------- verify
--   select relname, reloptions from pg_class
--   where relname in ('report production hours','report production setup','report quality inspections');
--   -- expect {security_invoker=true} on all three
--   -- totals must match the raw tables:
--   select (select sum(produced) from "report production hours") v,
--          (select sum(qty_produced) from "production log hours") t;
--   select (select sum(setting_time_min) from "report production setup") v,
--          (select coalesce(sum(setting_time_min),0) from "production logs") t;
