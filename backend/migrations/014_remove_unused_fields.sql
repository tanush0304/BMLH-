-- =====================================================================
-- 014: Remove fields BMLH's latest specs don't ask for, and cut the
-- raw-material supplier link to supplier + price + lead time.
-- Run AFTER 013 and after the senior agrees. Drops are permanent; every
-- one of these is empty or unused, except customers master.our_vendor_code,
-- which holds Yuken's 30728 (kept in 009 if you ever want it back).
-- Delete any line you don't want. Transaction-wrapped.
--
-- NOT dropped: machines master.category. It was my idea, but check
-- whether any screen reads it first.
-- =====================================================================
begin;

alter table "products master"
  drop column if exists product_category,
  drop column if exists product_type;

alter table "machines master"
  drop column if exists machine_type,
  drop column if exists make,
  drop column if exists serial_no;

alter table "customers master"
  drop column if exists our_vendor_code;

alter table "rm suppliers"
  drop column if exists material_service_code,
  drop column if exists material_description,
  drop column if exists unit_of_measurement,
  drop column if exists minimum_order_qty;

commit;

notify pgrst, 'reload schema';
