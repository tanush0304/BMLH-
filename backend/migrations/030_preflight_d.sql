-- 030 pre-flight part D (checks 13, 14, 16, 17): READ-ONLY, one query.
-- Split from 030_preflight.sql to find the statement that fails on live.
with
ns  as (select oid from pg_namespace where nspname = 'public'),
rel as (select c.oid, c.relname, c.relkind from pg_class c where c.relnamespace = (select oid from ns)),
co  as (select oid from rel where relname = 'customer orders' and relkind in ('r', 'p')),
-- base tables in public that have a prd_no column
prd_tables as (
  select r.oid, r.relname
  from rel r
  join pg_attribute a on a.attrelid = r.oid and a.attname = 'prd_no' and a.attnum > 0 and not a.attisdropped
  where r.relkind in ('r', 'p')
),
unplanned as (
  select c.prd_no from "customer orders" c
  where not exists (select 1 from "production route cards" r where r.prd_no = c.prd_no)
)
select * from (
  -- D. Data the migration touches
  select 13 as check_no, 'overview' as check_name,
         jsonb_build_object(
           'orders', (select count(*) from "customer orders"),
           'route_cards', (select count(*) from "production route cards"),
           'unplanned_prds', (select count(*) from unplanned),
           'order_qty_null_or_le_0', (select count(*) from "customer orders" where order_qty is null or order_qty <= 0),
           'prd_not_PRD_NNN', (select coalesce(jsonb_agg(prd_no), '[]'::jsonb) from "customer orders" where prd_no !~ '^PRD-\d+$'),
           'max_prd', (select max(substring(prd_no from '^PRD-(\d+)$')::int) from "customer orders"),
           'max_jc', (select max(substring(jc_no from '^JC-(\d+)$')::int) from "production route cards"))
  union all
  select 14, 'unplanned PRDs (no route card) -> go back to planning',
         (select coalesce(jsonb_agg(jsonb_build_object('prd_no', c.prd_no, 'customer', c.customer_id, 'po', c.po_number, 'part', c.part_serial_number, 'order_qty', c.order_qty) order by c.prd_no), '[]'::jsonb)
            from "customer orders" c where c.prd_no in (select prd_no from unplanned))
  union all
  select 16, 'planned PRDs: order qty vs route-card batch qty',
         (select coalesce(jsonb_agg(jsonb_build_object('prd_no', c.prd_no, 'order_qty', c.order_qty, 'batch_qty', r.batch_qty) order by c.prd_no), '[]'::jsonb)
            from "customer orders" c join "production route cards" r on r.prd_no = c.prd_no)
  union all
  select 17, 'PO lines per PO (customer + po_number)',
         (select coalesce(jsonb_agg(jsonb_build_object('customer', customer_id, 'po', po_number, 'lines', n) order by customer_id, po_number), '[]'::jsonb)
            from (select customer_id, po_number, count(*) as n from "customer orders" group by 1, 2) x)
) checks
order by check_no;
