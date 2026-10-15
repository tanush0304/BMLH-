-- 031 pre-flight: READ-ONLY, ONE query -> one result set (one row per
-- check). Run it in the Supabase SQL editor and send back the whole grid
-- (or "Copy as JSON"/CSV). Nothing here changes data.
with
jos as (select to_regclass('public."job order status"') as oid),
jor as (select to_regclass('public."job order receipt"') as oid),
jod as (select to_regclass('public."job order dispatch"') as oid)
select * from (
  -- 1. Live "job order status" definition, columns and options
  select 1 as check_no, 'job order status: definition' as check_name,
         to_jsonb(pg_get_viewdef((select oid from jos), true)) as result
  union all
  select 2, 'job order status: columns',
         (select jsonb_agg(jsonb_build_object('n', attnum, 'name', attname, 'type', format_type(atttypid, atttypmod)) order by attnum)
            from pg_attribute where attrelid = (select oid from jos) and attnum > 0 and not attisdropped)
  union all
  select 3, 'job order status: reloptions',
         (select to_jsonb(reloptions) from pg_class where oid = (select oid from jos))
  union all
  -- 2. Views built on "job order status"
  select 4, 'views depending on job order status',
         (select coalesce(jsonb_agg(distinct v.relname), '[]'::jsonb)
            from pg_depend d
            join pg_rewrite rw on rw.oid = d.objid
            join pg_class v on v.oid = rw.ev_class
           where d.refobjid = (select oid from jos) and v.oid <> (select oid from jos))
  union all
  -- 3. Constraints / indexes / triggers on the two tables
  select 5, 'constraints (receipt + dispatch)',
         (select jsonb_agg(jsonb_build_object('table', conrelid::regclass::text, 'name', conname, 'def', pg_get_constraintdef(oid)) order by conrelid::regclass::text, conname)
            from pg_constraint where conrelid in ((select oid from jor), (select oid from jod)))
  union all
  select 6, 'indexes (receipt + dispatch)',
         (select jsonb_agg(jsonb_build_object('table', tablename, 'name', indexname, 'def', indexdef) order by tablename, indexname)
            from pg_indexes where schemaname = 'public' and tablename in ('job order receipt', 'job order dispatch'))
  union all
  select 7, 'triggers (receipt + dispatch)',
         (select coalesce(jsonb_agg(jsonb_build_object('table', tgrelid::regclass::text, 'name', tgname) order by tgname), '[]'::jsonb)
            from pg_trigger where tgrelid in ((select oid from jor), (select oid from jod)) and not tgisinternal)
  union all
  -- 4. Columns of both tables
  select 8, 'columns (receipt + dispatch)',
         (select jsonb_agg(jsonb_build_object('table', table_name, 'column', column_name, 'type', data_type, 'nullable', is_nullable, 'default', column_default) order by table_name, ordinal_position)
            from information_schema.columns
           where table_schema = 'public' and table_name in ('job order receipt', 'job order dispatch'))
  union all
  -- 5. Grants for the app roles
  select 9, 'grants to anon / authenticated',
         (select jsonb_agg(jsonb_build_object('table', table_name, 'grantee', grantee, 'privileges', privs) order by table_name, grantee)
            from (select table_name, grantee, string_agg(privilege_type, ', ' order by privilege_type) as privs
                    from information_schema.role_table_grants
                   where table_schema = 'public'
                     and table_name in ('job order receipt', 'job order dispatch', 'job order status')
                     and grantee in ('anon', 'authenticated')
                   group by table_name, grantee) g)
  union all
  -- 6. Current RPC body (expect the 021 version)
  select 10, 'create_job_order_receipt: definition',
         to_jsonb(coalesce(pg_get_functiondef(to_regprocedure('public.create_job_order_receipt(text, numeric, date)')), 'NOT FOUND'))
  union all
  -- 7. Data the backfill touches
  select 11, 'DCs with more than one receipt (expect none)',
         (select coalesce(jsonb_agg(jsonb_build_object('dc_no', dc_no, 'receipts', n)), '[]'::jsonb)
            from (select dc_no, count(*) as n from "job order receipt" group by dc_no having count(*) > 1) x)
  union all
  select 12, 'single short receipt -> becomes Closed Short',
         (select coalesce(jsonb_agg(jsonb_build_object('dc_no', d.dc_no, 'sent', d.qty, 'received', r.qty_received, 'receipt_date', r.receipt_date, 'is_open', d.is_open) order by d.dc_no), '[]'::jsonb)
            from "job order dispatch" d join "job order receipt" r on r.dc_no = d.dc_no
           where r.qty_received < d.qty)
  union all
  select 13, 'receipt above sent qty (guard would refuse)',
         (select coalesce(jsonb_agg(jsonb_build_object('dc_no', d.dc_no, 'sent', d.qty, 'received', r.qty_received) order by d.dc_no), '[]'::jsonb)
            from "job order dispatch" d join "job order receipt" r on r.dc_no = d.dc_no
           where r.qty_received > d.qty)
  union all
  select 14, 'inconsistent: open DC with receipt / closed DC without',
         (select coalesce(jsonb_agg(jsonb_build_object('dc_no', dc_no, 'is_open', is_open, 'receipts', n) order by dc_no), '[]'::jsonb)
            from (select d.dc_no, d.is_open, count(r.id) as n
                    from "job order dispatch" d left join "job order receipt" r on r.dc_no = d.dc_no
                   group by d.dc_no, d.is_open) x
           where (is_open and n > 0) or (not is_open and n = 0))
  union all
  select 15, 'overview',
         jsonb_build_object(
           'dispatches', (select count(*) from "job order dispatch"),
           'open_dispatches', (select count(*) from "job order dispatch" where is_open),
           'receipts', (select count(*) from "job order receipt"))
  union all
  -- 8. Helper functions 031 relies on (026 / 028)
  select 16, 'helper functions present',
         (select coalesce(jsonb_agg(proname order by proname), '[]'::jsonb)
            from pg_proc where proname in ('is_app_caller', 'is_app_supervisor')
              and pronamespace = 'public'::regnamespace)
) checks
order by check_no;
