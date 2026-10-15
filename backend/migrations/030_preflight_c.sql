-- 030 pre-flight part C (checks 10, 11, 12): READ-ONLY, one query.
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
  -- C. Planning inputs
  select 10 as check_no, 'production route cards: columns' as check_name,
         (select jsonb_agg(jsonb_build_object('column', a.attname, 'type', format_type(a.atttypid, a.atttypmod), 'not_null', a.attnotnull) order by a.attnum)
            from rel r join pg_attribute a on a.attrelid = r.oid and a.attnum > 0 and not a.attisdropped
           where r.relname = 'production route cards')
  union all
  select 11, 'production batch master: columns',
         (select jsonb_agg(jsonb_build_object('column', a.attname, 'type', format_type(a.atttypid, a.atttypmod), 'not_null', a.attnotnull) order by a.attnum)
            from rel r join pg_attribute a on a.attrelid = r.oid and a.attnum > 0 and not a.attisdropped
           where r.relname = 'production batch master')
  union all
  select 12, 'tables with a prd_no column (+ their FKs on prd_no)',
         (select jsonb_agg(jsonb_build_object('table', t.relname,
                   'fk', (select string_agg(pg_get_constraintdef(k.oid), '; ') from pg_constraint k
                           where k.conrelid = t.oid and k.contype = 'f'
                             and k.conkey = array[(select a.attnum from pg_attribute a where a.attrelid = t.oid and a.attname = 'prd_no')])) order by t.relname)
            from prd_tables t)
) checks
order by check_no;
