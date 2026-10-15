-- 030 pre-flight part B (checks 7, 8, 9): READ-ONLY, one query.
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
  -- B. Views and functions that read "customer orders" / order_qty
  select 7 as check_no, 'views that mention customer orders or order_qty (name -> definition)' as check_name,
         (select coalesce(jsonb_object_agg(r.relname, pg_get_viewdef(r.oid, true)), '{}'::jsonb)
            from rel r
           where r.relkind in ('v', 'm')
             and (pg_get_viewdef(r.oid, true) ilike '%customer orders%' or pg_get_viewdef(r.oid, true) ilike '%order_qty%'))
  union all
  select 8, 'views built on those views (view -> depends on)',
         (select coalesce(jsonb_agg(distinct jsonb_build_object('view', v.relname, 'depends_on', base.relname)), '[]'::jsonb)
            from pg_depend d
            join pg_rewrite rw on rw.oid = d.objid
            join pg_class v on v.oid = rw.ev_class
            join rel base on base.oid = d.refobjid
           where base.relkind in ('v', 'm') and v.oid <> base.oid
             and (pg_get_viewdef(base.oid, true) ilike '%customer orders%' or pg_get_viewdef(base.oid, true) ilike '%order_qty%'))
  union all
  select 9, 'functions that mention customer orders or order_qty',
         (select coalesce(jsonb_agg(jsonb_build_object('function', p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
                   'security_definer', p.prosecdef) order by p.proname), '[]'::jsonb)
            from pg_proc p
           where p.pronamespace = (select oid from ns)
             and (p.prosrc ilike '%customer orders%' or p.prosrc ilike '%order_qty%'))
) checks
order by check_no;
