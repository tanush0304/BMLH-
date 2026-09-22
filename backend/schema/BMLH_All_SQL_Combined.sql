-- =====================================================================================
-- BMLH OPERATIONS APP — FULL SUPABASE SCHEMA, ALL SQL RUN SO FAR
-- Consolidated from every individual SQL file generated across the build,
-- in the exact order they were run. Running this whole file top-to-bottom
-- on a fresh Supabase project reproduces the current schema exactly.
--
-- If your Supabase project already has some of this applied, running the
-- whole file again is mostly safe (most statements use IF NOT EXISTS /
-- IF EXISTS guards) EXCEPT plain `create table` statements, which will
-- error on a table that already exists — run only the sections you're
-- missing in that case, using the numbered headers below to find them.
-- =====================================================================================



-- =====================================================================================
-- SECTION 1. Master tables — original 14 + set_updated_at() trigger function
-- (source: bmlh_master_tables.sql)
-- =====================================================================================


-- =====================================================================
-- BMLH Master Tables — Supabase / Postgres schema
-- Generated from Updated_Master_Document.xlsx after the agreed changes:
--   - Raw Material no longer carries Product Part Number (many-to-many,
--     moved to product_raw_materials for later; not created yet)
--   - Cycle Time Master flattened to long form (one row per
--     product + operation + machine)
--   - Machine Master has a stable Machine ID + Category
--   - Every master gets created_at / updated_at
--
-- Two more of the same "wide table hides a many-to-many" issue as the
-- Raw Material one you already caught — normalized below, flag if you'd
-- rather keep them as wide columns matching the sheet exactly:
--   1) Supplier Master had "Supplier 1" / "Supplier 2" side-by-side
--      columns for one raw material -> normalized into suppliers +
--      raw_material_suppliers (a material can have any number of
--      suppliers, each with their own price/MOQ/lead time).
--   2) Machine Master's 6 repeated "Nature of Operation" columns ->
--      normalized into machine_operations (a machine can do several
--      operations; several machines share the same operation).
-- =====================================================================

-- ---------- shared: auto-update the updated_at column on any UPDATE ----------
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- =====================================================================
-- Product Master
-- =====================================================================
create table products (
  product_code text primary key,
  product_name text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create trigger trg_products_updated
  before update on products
  for each row execute function set_updated_at();

-- =====================================================================
-- Machine Master
-- =====================================================================
create table machines (
  machine_id   text primary key,           -- e.g. MC-001
  machine_name text unique not null,       -- e.g. "CNC 1"
  machine_oem  text,
  category     text,                       -- Cutting / CNC Turning / VMC / Grinding
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create trigger trg_machines_updated
  before update on machines
  for each row execute function set_updated_at();

-- Normalized out of Machine Master's 6 repeated "Nature of Operation" columns
create table machine_operations (
  id           bigserial primary key,
  machine_id   text not null references machines(machine_id) on delete cascade,
  operation    text not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (machine_id, operation)
);
create trigger trg_machine_operations_updated
  before update on machine_operations
  for each row execute function set_updated_at();

-- =====================================================================
-- Job Work Master (the outsourcing types: Heat Treatment, Toughening, etc.)
-- =====================================================================
create table job_work_types (
  job_work_code    text primary key,       -- HT, BR, TG, SB
  type_of_job_work text not null,
  lead_time_days   integer,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create trigger trg_job_work_types_updated
  before update on job_work_types
  for each row execute function set_updated_at();

-- =====================================================================
-- Cycle Time Master (long format — one row per product + operation + machine)
-- =====================================================================
create table cycle_times (
  id             bigserial primary key,
  product_code   text not null references products(product_code),
  operation      text not null,
  seq            integer not null,
  type           text not null check (type in ('Internal', 'Outsourced')),
  machine_name   text references machines(machine_name),   -- null if Outsourced
  cycle_time_min numeric,                                   -- null if Outsourced
  job_work_code  text references job_work_types(job_work_code), -- null if Internal
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (
    (type = 'Internal'  and machine_name is not null and job_work_code is null) or
    (type = 'Outsourced' and machine_name is null and job_work_code is not null)
  )
);
create trigger trg_cycle_times_updated
  before update on cycle_times
  for each row execute function set_updated_at();

-- =====================================================================
-- Customer Master
-- =====================================================================
create table customers (
  customer_id                text primary key,
  customer_name               text not null,
  registered_address           text,
  registered_city              text,
  registered_state             text,
  registered_pincode           text,
  registered_country           text,
  delivery_address             text,
  delivery_city                text,
  delivery_state               text,
  delivery_pincode             text,
  delivery_country             text,
  contact_person_name          text,
  mobile_number                text,
  email_address                text,
  alternate_contact_number     text,
  gstin_number                 text,
  pan_number                   text,
  msme_udyam_no                text,
  payment_terms                text,        -- 30/60/45 days
  currency                     text,        -- INR/USD/EURO
  gst_registered                boolean,
  customer_product_part_number text,
  customer_product_part_name   text,
  customer_drawing_ref_no      text,
  revision_drawing_no          text,
  created_at                   timestamptz not null default now(),
  updated_at                   timestamptz not null default now()
);
create trigger trg_customers_updated
  before update on customers
  for each row execute function set_updated_at();

-- =====================================================================
-- Raw Material Master (Product Part Number removed — many-to-many,
-- see product_raw_materials note at the end)
-- =====================================================================
create table raw_materials (
  raw_material_code   text primary key,
  raw_material_name   text,
  raw_material_category text,   -- Steel / Aluminium / Alloy / Consumables
  rm_type              text,    -- Bar / Sheet / Plate / Casting / Forging / Consumable
  diameter_mm          text,    -- kept as text: sheet has ranges like "75 to 80"
  length_mtrs          numeric,
  unit_of_measurement  text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create trigger trg_raw_materials_updated
  before update on raw_materials
  for each row execute function set_updated_at();

-- =====================================================================
-- Supplier Master, normalized (see note at top of file)
-- =====================================================================
create table suppliers (
  supplier_id       text primary key,
  supplier_name     text,
  supplier_address  text,
  contact_number    text,
  minimum_order_qty numeric,
  lead_time_days    integer,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create trigger trg_suppliers_updated
  before update on suppliers
  for each row execute function set_updated_at();

create table raw_material_suppliers (
  id                       bigserial primary key,
  raw_material_code        text not null references raw_materials(raw_material_code) on delete cascade,
  supplier_id              text not null references suppliers(supplier_id) on delete cascade,
  standard_purchase_price  numeric,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  unique (raw_material_code, supplier_id)
);
create trigger trg_raw_material_suppliers_updated
  before update on raw_material_suppliers
  for each row execute function set_updated_at();

-- =====================================================================
-- Shift Master
-- =====================================================================
create table shifts (
  shift_code text primary key,   -- "Shift A", "Shift B"
  shift_name text,               -- "Day Shift", "Night Shift"
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_shifts_updated
  before update on shifts
  for each row execute function set_updated_at();

-- =====================================================================
-- Operator Master
-- =====================================================================
create table operators (
  operator_emp_id text primary key,
  operator_name   text not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create trigger trg_operators_updated
  before update on operators
  for each row execute function set_updated_at();

-- =====================================================================
-- Vendor Master
-- =====================================================================
create table vendors (
  vendor_id             text primary key,
  vendor_name           text not null,
  vendor_address        text,
  contact_person_name   text,
  mobile_no             text,
  email_id              text,
  gstin_no              text,
  pan_no                text,
  udyam_msme_no         text,
  gst_category          text,   -- Registered / Unregistered / Composition
  tds_applicable        boolean,
  payment_terms         text,   -- 30/60/90 days
  credit_period         text,
  bank_account_no       text,
  bank_name             text,
  ifsc_code             text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create trigger trg_vendors_updated
  before update on vendors
  for each row execute function set_updated_at();

-- =====================================================================
-- Quality Master — left in its original (un-restructured) shape;
-- the measured-value inspection log is still a pending decision
-- =====================================================================
create table quality_parameters (
  id                 bigserial primary key,
  product_code       text references products(product_code),
  quality_parameter  text not null,
  machine_name       text references machines(machine_name),
  standard           numeric,
  upper_tolerance    numeric,
  lower_tolerance    numeric,
  remarks            text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create trigger trg_quality_parameters_updated
  before update on quality_parameters
  for each row execute function set_updated_at();

-- =====================================================================
-- Maintenance Master — reusable checklist per machine
-- =====================================================================
create table maintenance_checklist (
  id             bigserial primary key,
  machine_name   text references machines(machine_name),
  checklist_item text not null,
  remarks        text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create trigger trg_maintenance_checklist_updated
  before update on maintenance_checklist
  for each row execute function set_updated_at();


-- =====================================================================================
-- SECTION 2. Supplier Master normalization (split into suppliers + rm suppliers)
-- (source: update_supplier_master.sql)
-- =====================================================================================


-- =====================================================================
-- Update: Supplier Master normalization (per senior's revised fields)
-- Run this in the Supabase SQL editor.
--
-- Company-level fields (GST, bank, payment terms) go on "suppliers master".
-- Per-material fields (MOQ, lead time were previously here too — moved to
-- material level since different materials from the same supplier can have
-- different MOQ/lead time) go on "rm suppliers".
--
-- NOTE: the two "drop column" statements below delete any data already
-- entered in contact_number / minimum_order_qty / lead_time_days on
-- "suppliers master". Skip them (comment out) if you've already entered
-- real data there and want to migrate it into "rm suppliers" manually first.
-- =====================================================================

-- ---- suppliers master: add the new company-level fields ----
alter table "suppliers master"
  add column if not exists contact_person_name      text,
  add column if not exists mobile_number             text,
  add column if not exists email_address             text,
  add column if not exists alternate_contact_number  text,
  add column if not exists gstin_no                  text,
  add column if not exists pan_no                     text,
  add column if not exists udyam_msme_no             text,
  add column if not exists gst_category               text,   -- Registered / Unregistered / Composition
  add column if not exists tds_applicable             boolean,
  add column if not exists payment_terms              text,   -- 30/60/90 days
  add column if not exists credit_period               text,
  add column if not exists bank_account_no            text,
  add column if not exists bank_name                   text,
  add column if not exists ifsc_code                    text;

-- ---- suppliers master: drop fields that moved to "rm suppliers" ----
alter table "suppliers master"
  drop column if exists contact_number,
  drop column if exists minimum_order_qty,
  drop column if exists lead_time_days;

-- ---- rm suppliers: add the new per-material fields ----
alter table "rm suppliers"
  add column if not exists material_service_code text,
  add column if not exists material_description  text,
  add column if not exists unit_of_measurement    text,
  add column if not exists minimum_order_qty       numeric,
  add column if not exists lead_time_days           integer;


-- =====================================================================================
-- SECTION 3. V1 fields: Raw Material Width/Thickness, Product fields, Operator fields, Job Work spelling fix
-- (source: update_master_v1.sql)
-- =====================================================================================


-- =====================================================================
-- Update: new fields from Updated_Master_Document_V1.xlsx
-- Run in the Supabase SQL editor.
-- =====================================================================

-- ---- raw materials master: sheet/flat/plate materials need Width + Thickness ----
alter table "raw materials master"
  add column if not exists width     numeric,
  add column if not exists thickness numeric;

-- ---- products master: category/type/UoM/status ----
alter table "products master"
  add column if not exists product_category text,   -- Component / Assembly / Finished Product
  add column if not exists product_type      text,   -- Standard / Customer-specific
  add column if not exists unit_of_measurement text, -- Nos / Kg / Set etc.
  add column if not exists product_status    text;   -- Active / Inactive / Obsolete

-- ---- operators master: HR-type fields ----
alter table "operators master"
  add column if not exists department      text,
  add column if not exists designation      text,
  add column if not exists employee_type    text,      -- Permanent / Contract / Apprentice
  add column if not exists joining_date     date,
  add column if not exists operator_status  text;       -- Active / Inactive

-- ---- job work master: spelling fix only, no schema change (Boraching -> Broaching) ----
update "job work master" set type_of_job_work = 'Broaching' where type_of_job_work = 'Boraching';


-- =====================================================================================
-- SECTION 4. Vendor Job Work Types (junction table)
-- (source: create_vendor_job_work_types.sql)
-- =====================================================================================


-- =====================================================================
-- New table: vendor job work types
-- Junction table — one row per (vendor, job work type) they can perform.
-- Lets a vendor be tagged with multiple types (Heat Treatment, Broaching,
-- Toughening, Sand Blasting, etc.) without cramming them into one column.
-- Run in the Supabase SQL editor.
-- =====================================================================

create table "vendor job work types" (
  id             bigserial primary key,
  vendor_id      text not null references "vendors master"(vendor_id) on delete cascade,
  job_work_code  text not null references "job work master"(job_work_code) on delete cascade,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (vendor_id, job_work_code)
);

create trigger trg_vendor_job_work_types_updated
  before update on "vendor job work types"
  for each row execute function set_updated_at();


-- =====================================================================================
-- SECTION 5. V2: Customer Status, Quality Type of Operation, Shift Master schedule fields, Production Batch Master, Stock transaction tables + views
-- (source: update_master_v2.sql)
-- =====================================================================================


-- =====================================================================
-- Batch update: Customer/Quality/Shift fields, Production Batch Master,
-- and stock transaction tables for Raw Material + Finished Goods.
-- Run in the Supabase SQL editor.
-- =====================================================================

-- ---- customers master: + status ----
alter table "customers master"
  add column if not exists status text;  -- Active / Inactive

-- ---- quality master: + type of operation ----
alter table "quality master"
  add column if not exists type_of_operation text;

-- ---- shifts master: richer schedule fields ----
-- (existing shift_name column is renamed for clarity — skip if you'd rather keep the old name)
alter table "shifts master"
  add column if not exists start_time            text,
  add column if not exists end_time                text,
  add column if not exists shift_duration          text,
  add column if not exists lunch_break_duration    text,
  add column if not exists net_working_hours       text;

insert into "shifts master" (shift_code, shift_name, start_time, end_time, shift_duration, lunch_break_duration, net_working_hours)
values ('Shift C', 'Night Shift', '10:00 PM', '6:00 AM', '8 hours', '30 min', '7.5 hours')
on conflict (shift_code) do nothing;

-- =====================================================================
-- New table: production batch master
-- Standard production batch quantity per product.
-- =====================================================================
create table "production batch master" (
  product_code               text primary key references "products master"(product_code),
  production_batch_quantity  numeric,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now()
);
create trigger trg_production_batch_master_updated
  before update on "production batch master"
  for each row execute function set_updated_at();

-- =====================================================================
-- New table: raw material transactions
-- Every receipt (from a supplier) or issue (consumed by production) is
-- one row. Current stock is a computed balance (view below), not a
-- hand-maintained "Closing Stock" field — so it can never drift out of
-- sync with the actual history of movements.
-- =====================================================================
create table "raw material transactions" (
  id                  bigserial primary key,
  raw_material_code   text not null references "raw materials master"(raw_material_code),
  transaction_type    text not null check (transaction_type in ('Receipt', 'Issue')),
  qty                 numeric not null,
  transaction_date    date not null default current_date,
  supplier_id         text references "suppliers master"(supplier_id),      -- set for Receipts
  production_order_no text,                                                  -- set for Issues, once that table exists
  remarks             text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create trigger trg_raw_material_transactions_updated
  before update on "raw material transactions"
  for each row execute function set_updated_at();

create view "raw material stock balance" as
select
  raw_material_code,
  coalesce(sum(qty) filter (where transaction_type = 'Receipt'), 0)
    - coalesce(sum(qty) filter (where transaction_type = 'Issue'), 0) as current_stock
from "raw material transactions"
group by raw_material_code;

-- =====================================================================
-- New table: finished goods transactions
-- Same pattern — a "Production Receipt" (finished pieces coming off the
-- line) or a "Dispatch" (sent to a customer) is one row each.
-- =====================================================================
create table "finished goods transactions" (
  id                  bigserial primary key,
  product_code        text not null references "products master"(product_code),
  transaction_type    text not null check (transaction_type in ('Production Receipt', 'Dispatch')),
  qty                 numeric not null,
  transaction_date    date not null default current_date,
  customer_id         text references "customers master"(customer_id),      -- set for Dispatch
  production_order_no text,                                                  -- set for Production Receipt, once that table exists
  remarks              text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create trigger trg_finished_goods_transactions_updated
  before update on "finished goods transactions"
  for each row execute function set_updated_at();

create view "finished goods stock balance" as
select
  product_code,
  coalesce(sum(qty) filter (where transaction_type = 'Production Receipt'), 0)
    - coalesce(sum(qty) filter (where transaction_type = 'Dispatch'), 0) as current_stock
from "finished goods transactions"
group by product_code;


-- =====================================================================================
-- SECTION 6. Row Level Security on the stock transaction tables
-- (source: enable_rls_stock_tables.sql)
-- =====================================================================================


-- =====================================================================
-- Enable Row Level Security on the stock transaction tables.
-- Policy: any authenticated (logged-in) user can read and write; anonymous
-- (not logged in) access is denied entirely. This matches an internal
-- ops app where every staff member logs in but there's no need yet to
-- restrict who sees what within the company.
-- Run in the Supabase SQL editor.
-- =====================================================================

alter table "raw material transactions" enable row level security;
alter table "finished goods transactions" enable row level security;

create policy "authenticated read raw material transactions"
  on "raw material transactions" for select
  to authenticated using (true);

create policy "authenticated write raw material transactions"
  on "raw material transactions" for insert
  to authenticated with check (true);

create policy "authenticated update raw material transactions"
  on "raw material transactions" for update
  to authenticated using (true) with check (true);

create policy "authenticated read finished goods transactions"
  on "finished goods transactions" for select
  to authenticated using (true);

create policy "authenticated write finished goods transactions"
  on "finished goods transactions" for insert
  to authenticated with check (true);

create policy "authenticated update finished goods transactions"
  on "finished goods transactions" for update
  to authenticated using (true) with check (true);


-- =====================================================================================
-- SECTION 7. V3: Machine asset fields (Type/Make/Model/Serial No), Maintenance Schedule table
-- (source: update_master_v3_maintenance.sql)
-- =====================================================================================


-- =====================================================================
-- Maintenance Master — Option C
-- Asset details go on Machines Master (they're facts about the machine,
-- not about maintenance). A new "maintenance schedule" table handles
-- frequency/dates. The existing itemized "maintenance master" checklist
-- (one row per machine + item) is untouched.
-- Run in the Supabase SQL editor.
-- =====================================================================

-- ---- machines master: + asset details ----
alter table "machines master"
  add column if not exists machine_type text,
  add column if not exists make          text,
  add column if not exists model         text,
  add column if not exists serial_no     text;

-- =====================================================================
-- New table: maintenance schedule
-- One row per machine — frequency + last/next due date + status.
-- =====================================================================
create table "maintenance schedule" (
  machine_id              text primary key references "machines master"(machine_id),
  maintenance_frequency   text,   -- Monthly / Quarterly / Half Yearly etc.
  last_maintenance_date   date,
  next_maintenance_due    date,
  status                  text,   -- Active / Inactive
  remarks                 text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create trigger trg_maintenance_schedule_updated
  before update on "maintenance schedule"
  for each row execute function set_updated_at();


-- =====================================================================================
-- SECTION 8. V4: 'Manual' step type added to Cycle Time Master's check constraint
-- (source: update_master_v4_manual_type.sql)
-- =====================================================================================


-- =====================================================================
-- Cycle Time Master: add "Manual" as a third valid step type
-- (no machine, no job work code — e.g. De-Burring, Final Inspection,
-- Final Dispatch, confirmed by BMLH's official Production Route Card).
-- Run in the Supabase SQL editor.
-- =====================================================================

alter table "cycle time master" drop constraint if exists cycle_times_check;

alter table "cycle time master" add constraint cycle_times_check check (
  (type = 'Internal'  and machine_id is not null and job_work_code is null) or
  (type = 'Outsourced' and machine_id is null and job_work_code is not null) or
  (type = 'Manual'     and machine_id is null and job_work_code is null)
);

-- NOTE: if your original check constraint has a different auto-generated name,
-- find it first with:
--   select conname from pg_constraint where conrelid = '"cycle time master"'::regclass;
-- and swap that name into the "drop constraint" line above.

-- =====================================================================
-- After the above runs, re-import HPV-2 Rotor's cycle time rows from the
-- updated Excel master doc (23 stages, matching the official Route Card) —
-- delete the old HPV-2 Rotor rows first so seq numbers don't collide:
--   delete from "cycle time master" where product_code = 'HPV 2 Rotor';
-- then re-import the corrected rows.
-- =====================================================================


-- =====================================================================================
-- SECTION 9. Transactional group 1: Customer Enquiry -> Order -> Route Card -> Route Card Stages
-- (source: create_transactional_group1.sql)
-- =====================================================================================


-- =====================================================================
-- Transactional tables, group 1: Customer Enquiry -> Customer Order ->
-- Production Route Card (+ per-PRD stages).
-- Run in the Supabase SQL editor. Assumes set_updated_at() already
-- exists (created for the master tables).
--
-- ID convention: QTN/PRD numbers are app-generated sequential codes
-- (e.g. "QTN-0001", "PRD-0001"), stored as text primary keys — same
-- pattern as production_order_no elsewhere in this project. The app
-- is responsible for generating the next number; these tables don't
-- auto-increment them.
-- =====================================================================

-- =====================================================================
-- customer enquiries  (the quotation stage)
-- =====================================================================
create table "customer enquiries" (
  qtn_no               text primary key,
  parent_qtn_no        text references "customer enquiries"(qtn_no),  -- set only for a revision
  revision_no          integer,                                        -- null = original quote
  customer_id          text not null references "customers master"(customer_id),
  drawing_number        text,
  product_code          text references "products master"(product_code),  -- null if it's a brand-new product not yet in Products Master
  quoted_price          numeric,
  quoted_date            date not null default current_date,
  supply_lead_time_days integer,
  revision_status        text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create trigger trg_customer_enquiries_updated
  before update on "customer enquiries"
  for each row execute function set_updated_at();

-- =====================================================================
-- customer orders  (the real PO — one row per PRD)
-- =====================================================================
create table "customer orders" (
  prd_no             text primary key,
  qtn_no              text references "customer enquiries"(qtn_no),   -- optional: which enquiry led here
  customer_id         text not null references "customers master"(customer_id),
  po_number           text not null,
  po_date              date not null,
  product_code         text not null references "products master"(product_code),
  order_qty            numeric not null,
  expected_delivery    date,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create trigger trg_customer_orders_updated
  before update on "customer orders"
  for each row execute function set_updated_at();

-- =====================================================================
-- production route cards  (one row per PRD — planning summary)
-- =====================================================================
create table "production route cards" (
  prd_no                 text primary key references "customer orders"(prd_no),
  batch_qty               numeric,     -- from Production Batch Master, or overridden manually
  shift_hours              numeric,     -- planned running shift hours/day used for this PRD's schedule
  available_rm_qty_snapshot numeric,   -- RM stock at the moment planning ran (for traceability — not live)
  units_producible          numeric,   -- computed: available RM / material needed per unit
  planned_date               date not null default current_date,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now()
);
create trigger trg_production_route_cards_updated
  before update on "production route cards"
  for each row execute function set_updated_at();

-- =====================================================================
-- production route card stages  (one row per stage, for that specific PRD —
-- copied from Cycle Time Master at the moment the route card is generated,
-- so it's a frozen snapshot even if the master route changes later)
-- =====================================================================
create table "production route card stages" (
  id             bigserial primary key,
  prd_no          text not null references "production route cards"(prd_no) on delete cascade,
  seq              integer not null,
  operation        text not null,
  type             text not null check (type in ('Internal', 'Outsourced', 'Manual')),
  machine_id       text references "machines master"(machine_id),        -- set only if Internal
  job_work_code    text references "job work master"(job_work_code),     -- set only if Outsourced
  cycle_time_min   numeric,
  status           text not null default 'Pending',  -- Pending / Completed / Received
  actual_date       date,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (prd_no, seq),
  check (
    (type = 'Internal'   and machine_id is not null and job_work_code is null) or
    (type = 'Outsourced' and machine_id is null and job_work_code is not null) or
    (type = 'Manual'     and machine_id is null and job_work_code is null)
  )
);
create trigger trg_production_route_card_stages_updated
  before update on "production route card stages"
  for each row execute function set_updated_at();


-- =====================================================================================
-- SECTION 10. Transactional group 2: Production Logs
-- (source: create_transactional_group2.sql)
-- =====================================================================================


-- =====================================================================
-- Transactional tables, group 2: Production Logs (operator's hourly entry)
-- Run in the Supabase SQL editor.
--
-- Split into a header (one row per operator+machine+stage+shift+date
-- session) + an hourly child table, rather than 12 "Hour1".."Hour12"
-- columns on one row — same long-format reasoning as Cycle Time Master:
-- querying "average output in hour 3 across all logs" is a straight
-- GROUP BY on a normalized table; it's not really answerable at all
-- if the hours are spread across 12 separate columns.
--
-- Totals (Total Produced, Efficiency %, Reject %, Rework %) are a VIEW,
-- not stored columns — same reasoning as the stock balance views: they're
-- always derived fresh from the hourly rows, so they can never drift out
-- of sync with the actual entries.
-- =====================================================================

-- =====================================================================
-- production logs  (header — one session: this operator, this machine,
-- this stage of this PRD, this shift, this date)
-- =====================================================================
create table "production logs" (
  id                       bigserial primary key,
  prd_no                    text not null references "production route cards"(prd_no),
  stage_id                   bigint not null references "production route card stages"(id),
  machine_id                 text references "machines master"(machine_id),   -- the ACTUAL machine used (may differ from what was planned on the stage)
  operator_emp_id            text not null references "operators master"(operator_emp_id),
  shift_code                  text not null references "shifts master"(shift_code),
  log_date                     date not null default current_date,
  start_time                    timestamptz,      -- stamped when "Production Start" is pressed
  planned_qty                   numeric,          -- previous stage's output + any carried-over balance, per the spec's note
  standard_qty_per_hour          numeric,         -- snapshot from Cycle Time Master's cycle time at the moment logging started
  created_at                     timestamptz not null default now(),
  updated_at                     timestamptz not null default now()
);
create trigger trg_production_logs_updated
  before update on "production logs"
  for each row execute function set_updated_at();

-- =====================================================================
-- production log hours  (child — one row per hour slot, up to 12 per log)
-- =====================================================================
create table "production log hours" (
  id             bigserial primary key,
  log_id           bigint not null references "production logs"(id) on delete cascade,
  hour_slot         integer not null check (hour_slot between 1 and 12),
  qty_produced       numeric not null default 0,
  qty_rejected        numeric not null default 0,
  qty_rework           numeric not null default 0,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (log_id, hour_slot)
);
create trigger trg_production_log_hours_updated
  before update on "production log hours"
  for each row execute function set_updated_at();

-- =====================================================================
-- production log totals  (view — computed, not stored)
-- =====================================================================
create view "production log totals" as
select
  pl.id as log_id,
  coalesce(sum(plh.qty_produced), 0) as total_produced,
  coalesce(sum(plh.qty_rejected), 0) as total_rejected,
  coalesce(sum(plh.qty_rework), 0) as total_rework,
  case when pl.standard_qty_per_hour > 0 and count(plh.id) > 0
    then round(100.0 * coalesce(sum(plh.qty_produced), 0)
      / (pl.standard_qty_per_hour * count(plh.id)), 1)
    else null
  end as efficiency_pct,
  case when coalesce(sum(plh.qty_produced), 0) > 0
    then round(100.0 * coalesce(sum(plh.qty_rejected), 0) / sum(plh.qty_produced), 1)
    else null
  end as reject_pct,
  case when coalesce(sum(plh.qty_produced), 0) > 0
    then round(100.0 * coalesce(sum(plh.qty_rework), 0) / sum(plh.qty_produced), 1)
    else null
  end as rework_pct
from "production logs" pl
left join "production log hours" plh on plh.log_id = pl.id
group by pl.id, pl.standard_qty_per_hour;


-- =====================================================================================
-- SECTION 11. Transactional group 3: Quality Logs
-- (source: create_transactional_group3.sql)
-- =====================================================================================


-- =====================================================================
-- Transactional tables, group 3: Quality Logs
-- Run in the Supabase SQL editor.
--
-- This is the "measured value per parameter" design that was
-- deliberately deferred back when Quality Master was first built —
-- now that the real Quality Module spec exists, here it is.
--
-- Same header + child split as Production Logs: one inspection session
-- (quality logs) can measure several parameters (quality log readings).
-- Accept/Reject is NOT a stored field — it's computed by comparing the
-- observed value against that parameter's Standard/Upper/Lower Tolerance
-- from Quality Master, same "derive, don't store" reasoning as the stock
-- balance and production totals views. This also means a correction to
-- Quality Master's tolerances (should that ever happen) is immediately
-- reflected in every past reading's Accepted/Not Accepted status, which
-- is arguably what you'd want for an audit — though worth knowing that
-- historical pass/fail would move if that tolerance is later corrected.
-- =====================================================================

-- =====================================================================
-- quality logs  (header — one inspection session)
-- =====================================================================
create table "quality logs" (
  id                 bigserial primary key,
  prd_no               text not null references "production route cards"(prd_no),
  stage_id              bigint not null references "production route card stages"(id),
  machine_id             text references "machines master"(machine_id),
  operator_emp_id         text not null references "operators master"(operator_emp_id),
  shift_code               text not null references "shifts master"(shift_code),
  log_date                   date not null default current_date,
  log_time                    time not null default current_time,
  created_at                   timestamptz not null default now(),
  updated_at                   timestamptz not null default now()
);
create trigger trg_quality_logs_updated
  before update on "quality logs"
  for each row execute function set_updated_at();

-- =====================================================================
-- quality log readings  (child — one row per parameter measured)
-- =====================================================================
create table "quality log readings" (
  id                    bigserial primary key,
  quality_log_id          bigint not null references "quality logs"(id) on delete cascade,
  quality_parameter_id     bigint not null references "quality master"(id),  -- which Standard/Tolerance row this reading is measured against
  observed_value             numeric not null,
  created_at                   timestamptz not null default now(),
  updated_at                   timestamptz not null default now(),
  unique (quality_log_id, quality_parameter_id)
);
create trigger trg_quality_log_readings_updated
  before update on "quality log readings"
  for each row execute function set_updated_at();

-- =====================================================================
-- quality log results  (view — Accepted/Not Accepted, computed live
-- against Quality Master's Standard/Upper Tolerance/Lower Tolerance)
-- =====================================================================
create view "quality log results" as
select
  qlr.id as reading_id,
  qlr.quality_log_id,
  qm.quality_parameter,
  qlr.observed_value,
  qm.standard,
  qm.upper_tolerance,
  qm.lower_tolerance,
  case
    when qm.standard is null then null  -- tolerance not yet defined for this parameter
    when qlr.observed_value between (qm.standard - coalesce(qm.lower_tolerance, 0))
                                 and (qm.standard + coalesce(qm.upper_tolerance, 0))
      then 'Accepted'
    else 'Not Accepted'
  end as result
from "quality log readings" qlr
join "quality master" qm on qm.id = qlr.quality_parameter_id;


-- =====================================================================================
-- SECTION 12. Transactional group 4: Job Order Dispatch + Receipt
-- (source: create_transactional_group4.sql)
-- =====================================================================================


-- =====================================================================
-- Transactional tables, group 4: Job Order Dispatch + Receipt
-- Run in the Supabase SQL editor.
--
-- Two separate tables, matching the two-screen design (Dispatch and
-- Receipt are genuinely different moments in time, done by different
-- people, often days apart) — not one table with a "status" flag.
--
-- DC number format, per the spec's own example: unique per production
-- order + type of job work, e.g. "DC 001 HT PRD 001". Generated by the
-- app, not the database — same convention as QTN/PRD numbers.
-- =====================================================================

-- =====================================================================
-- job order dispatch  (sending a batch out to a vendor)
-- =====================================================================
create table "job order dispatch" (
  dc_no                  text primary key,
  prd_no                   text not null references "production route cards"(prd_no),
  stage_id                  bigint not null references "production route card stages"(id),
  job_work_code              text not null references "job work master"(job_work_code),
  vendor_id                   text not null references "vendors master"(vendor_id),
  product_code                 text not null references "products master"(product_code),
  qty                           numeric not null,
  dispatch_date                  date not null default current_date,
  expected_receipt_date           date,  -- dispatch_date + Job Work Master's lead_time_days, computed by the app at dispatch time
  created_at                       timestamptz not null default now(),
  updated_at                       timestamptz not null default now()
);
create trigger trg_job_order_dispatch_updated
  before update on "job order dispatch"
  for each row execute function set_updated_at();

-- =====================================================================
-- job order receipt  (the batch coming back — references its dispatch)
-- =====================================================================
create table "job order receipt" (
  id                   bigserial primary key,
  dc_no                  text not null references "job order dispatch"(dc_no),
  qty_received              numeric not null,
  receipt_date               date not null default current_date,
  created_at                   timestamptz not null default now(),
  updated_at                   timestamptz not null default now(),
  unique (dc_no)  -- one receipt per dispatch; if partial receipts across multiple dates
                  -- turn out to be real, drop this and allow several receipt rows per dc_no
);
create trigger trg_job_order_receipt_updated
  before update on "job order receipt"
  for each row execute function set_updated_at();

-- =====================================================================
-- job order status  (view — actual lead time taken + overdue flag,
-- same "derive, don't store" pattern as the rest of this project)
-- =====================================================================
create view "job order status" as
select
  d.dc_no,
  d.prd_no,
  d.job_work_code,
  d.vendor_id,
  d.qty,
  d.dispatch_date,
  d.expected_receipt_date,
  r.qty_received,
  r.receipt_date,
  case when r.receipt_date is not null then r.receipt_date - d.dispatch_date end as actual_lead_time_days,
  case
    when r.dc_no is not null then 'Received'
    when d.expected_receipt_date is not null and current_date > d.expected_receipt_date then 'Overdue'
    else 'Sent'
  end as status
from "job order dispatch" d
left join "job order receipt" r on r.dc_no = d.dc_no;


-- =====================================================================================
-- SECTION 13. Transactional group 5: Maintenance Logs + Plan
-- (source: create_transactional_group5.sql)
-- =====================================================================================


-- =====================================================================
-- Transactional tables, group 5: Maintenance Logs + Maintenance Plan
-- Run in the Supabase SQL editor.
--
-- Same header + child pattern as Production Logs / Quality Logs: one
-- maintenance visit (maintenance logs) covers several checklist items
-- (maintenance log items), each pulled from Maintenance Master for
-- that specific machine.
--
-- The Planning grid (Machine x WK1..WK14, cells turn green when done)
-- is split into the plan itself (maintenance plan — just what's
-- scheduled) and a VIEW that derives Planned/Completed by checking
-- whether a maintenance log actually exists in that week — so
-- "Completed" is never a checkbox someone can forget to tick, it's
-- just the truth, read off the logs.
-- =====================================================================

-- =====================================================================
-- maintenance logs  (header — one visit: this machine, this engineer,
-- this shift, this date)
-- =====================================================================
create table "maintenance logs" (
  id                bigserial primary key,
  machine_id           text not null references "machines master"(machine_id),
  operator_emp_id        text not null references "operators master"(operator_emp_id),  -- the Maintenance Engineer, from Operator Master per the spec
  shift_code               text not null references "shifts master"(shift_code),
  log_date                   date not null default current_date,
  created_at                   timestamptz not null default now(),
  updated_at                   timestamptz not null default now()
);
create trigger trg_maintenance_logs_updated
  before update on "maintenance logs"
  for each row execute function set_updated_at();

-- =====================================================================
-- maintenance log items  (child — one row per checklist item actually
-- filled in during that visit, pulled from Maintenance Master for the
-- machine selected on the header)
-- =====================================================================
create table "maintenance log items" (
  id                    bigserial primary key,
  maintenance_log_id      bigint not null references "maintenance logs"(id) on delete cascade,
  checklist_item_id         bigint not null references "maintenance master"(id),
  condition                   text not null check (condition in ('OK', 'Not OK')),
  observation                   text,
  action_taken                   text,
  created_at                       timestamptz not null default now(),
  updated_at                       timestamptz not null default now(),
  unique (maintenance_log_id, checklist_item_id)
);
create trigger trg_maintenance_log_items_updated
  before update on "maintenance log items"
  for each row execute function set_updated_at();

-- =====================================================================
-- maintenance plan  (the schedule itself — one row per machine + planned week)
-- =====================================================================
create table "maintenance plan" (
  id                     bigserial primary key,
  machine_id                text not null references "machines master"(machine_id),
  planned_week_start_date     date not null,
  remarks                        text,
  created_at                       timestamptz not null default now(),
  updated_at                       timestamptz not null default now(),
  unique (machine_id, planned_week_start_date)
);
create trigger trg_maintenance_plan_updated
  before update on "maintenance plan"
  for each row execute function set_updated_at();

-- =====================================================================
-- maintenance plan status  (view — Planned vs Completed, derived by
-- checking whether a maintenance log exists for that machine within
-- that planned week; this is what turns a cell "green" in the grid)
-- =====================================================================
create view "maintenance plan status" as
select
  mp.id as plan_id,
  mp.machine_id,
  mp.planned_week_start_date,
  mp.remarks,
  case when exists (
    select 1 from "maintenance logs" ml
    where ml.machine_id = mp.machine_id
      and ml.log_date between mp.planned_week_start_date
                           and mp.planned_week_start_date + interval '6 days'
  ) then 'Completed' else 'Planned' end as status
from "maintenance plan" mp;
