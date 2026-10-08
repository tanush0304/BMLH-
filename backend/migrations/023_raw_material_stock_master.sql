-- 023: Raw material opening stock / source / cost, closing stock that
-- includes opening stock, and the read-only "raw material stock master"
-- view behind Masters > Stores Master – Raw Material.
--
-- STEP 1 -- run first, on its own, and send the output back. The redefinition
-- below assumes the live view has exactly (raw_material_code, current_stock),
-- as in the old combined schema file. CREATE OR REPLACE VIEW can only add
-- columns at the end -- if the live view has other columns or a different
-- order, STEP 2 must be adjusted first, otherwise it fails and rolls back.
--
--   select pg_get_viewdef('"raw material stock balance"', true);
--
--   -- and anything that depends on it (it must keep working):
--   select distinct dependent.relname
--   from pg_depend d
--   join pg_rewrite r on r.oid = d.objid
--   join pg_class dependent on dependent.oid = r.ev_class
--   join pg_class source on source.oid = d.refobjid
--   where source.relname = 'raw material stock balance'
--     and dependent.relname <> source.relname;
--
-- STEP 2 -- the migration.

begin;

alter table "raw materials master"
  add column if not exists rm_source text,
  add column if not exists opening_stock numeric not null default 0,
  add column if not exists cost_per_unit numeric;

alter table "raw materials master"
  drop constraint if exists raw_materials_master_rm_source_check;
alter table "raw materials master"
  add constraint raw_materials_master_rm_source_check
  check (rm_source in ('Trading', 'Manufacturing'));   -- null allowed (not yet set)

-- Closing stock = opening_stock + receipts - issues. Same first two columns
-- as before (raw_material_code, current_stock), so every existing reader --
-- RM Issue / Receipt "Current Stock", Production Planning availability --
-- now gets the closing figure without code changes; receipts and issued are
-- added at the end. Driven from the master (left join), so a material with
-- an opening stock but no transactions yet still has a row.
create or replace view "raw material stock balance" as
select
  rm.raw_material_code,
  rm.opening_stock
    + coalesce(t.receipts, 0)
    - coalesce(t.issued, 0) as current_stock,
  coalesce(t.receipts, 0) as receipts,
  coalesce(t.issued, 0) as issued
from "raw materials master" rm
left join (
  select
    raw_material_code,
    sum(qty) filter (where transaction_type = 'Receipt') as receipts,
    sum(qty) filter (where transaction_type = 'Issue') as issued
  from "raw material transactions"
  group by raw_material_code
) t on t.raw_material_code = rm.raw_material_code;

-- One row per raw material x BOM part ("product raw materials"); a material
-- with no BOM gets one row with a blank part. Stock figures are per
-- material, so they repeat on each of its part rows. units_producible =
-- floor(closing / consumption), blank when there's no BOM or consumption
-- is 0/blank.
create or replace view "raw material stock master" as
select
  rm.raw_material_code || '|' || coalesce(bom.part_serial_number, '') as row_key,
  rm.raw_material_code,
  rm.raw_material_name,
  sup.supplier_names,
  rm.raw_material_category,
  rm.rm_type,
  rm.unit_of_measurement,
  rm.rm_source,
  rm.diameter_mm,
  rm.length_mtrs,
  rm.width,
  rm.thickness,
  bom.part_serial_number,
  p.part_name,
  p.part_drawing_reference_number,
  rm.opening_stock,
  bal.receipts,
  bal.issued,
  bal.current_stock as closing_stock,
  rm.cost_per_unit,
  bom.consumption_per_unit,
  case when bom.consumption_per_unit > 0
       then floor(bal.current_stock / bom.consumption_per_unit)
  end as units_producible
from "raw materials master" rm
join "raw material stock balance" bal on bal.raw_material_code = rm.raw_material_code
left join (
  select rs.raw_material_code,
         string_agg(distinct s.supplier_name, ', ') as supplier_names
  from "rm suppliers" rs
  join "suppliers master" s on s.supplier_id = rs.supplier_id
  group by rs.raw_material_code
) sup on sup.raw_material_code = rm.raw_material_code
left join "product raw materials" bom on bom.raw_material_code = rm.raw_material_code
left join "products master" p on p.part_serial_number = bom.part_serial_number;

grant select on "raw material stock master" to authenticated;

commit;

-- After running:
--   select column_name from information_schema.columns
--   where table_name = 'raw materials master'
--     and column_name in ('rm_source', 'opening_stock', 'cost_per_unit');          -- 3 rows
--   -- closing = opening + receipts - issued for every material:
--   select count(*) from "raw material stock balance" b
--   join "raw materials master" rm using (raw_material_code)
--   where b.current_stock <> rm.opening_stock + b.receipts - b.issued;            -- 0
--   select count(*) from "raw materials master";                                  -- N
--   select count(distinct raw_material_code) from "raw material stock master";    -- same N
--   notify pgrst, 'reload schema';
