-- 030 pre-flight part A (checks 1, 2, 3, 4, 5, 6): READ-ONLY, one query.
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
  -- A. "customer orders" itself
  select 1 as check_no, 'customer orders: columns' as check_name,
         (select jsonb_agg(jsonb_build_object('column', a.attname, 'type', format_type(a.atttypid, a.atttypmod), 'not_null', a.attnotnull,
                   'default', pg_get_expr(d.adbin, d.adrelid), 'identity', a.attidentity) order by a.attnum)
            from pg_attribute a left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
           where a.attrelid = (select oid from co) and a.attnum > 0 and not a.attisdropped) as result
  union all
  select 2, 'customer orders: own constraints',
         (select jsonb_agg(jsonb_build_object('name', conname, 'def', pg_get_constraintdef(oid)) order by conname)
            from pg_constraint where conrelid = (select oid from co))
  union all
  select 3, 'FKs that reference customer orders',
         (select coalesce(jsonb_agg(jsonb_build_object('table', r.relname, 'name', k.conname, 'def', pg_get_constraintdef(k.oid)) order by r.relname), '[]'::jsonb)
            from pg_constraint k join pg_class r on r.oid = k.conrelid
           where k.confrelid = (select oid from co) and k.contype = 'f')
  union all
  select 4, 'triggers on customer orders',
         (select coalesce(jsonb_agg(jsonb_build_object('name', tgname, 'def', pg_get_triggerdef(oid)) order by tgname), '[]'::jsonb)
            from pg_trigger where tgrelid = (select oid from co) and not tgisinternal)
  union all
  select 5, 'RLS + policies (customer orders, route cards, stages)',
         (select jsonb_agg(jsonb_build_object('table', c.relname, 'rls', c.relrowsecurity,
                   'policies', (select coalesce(jsonb_agg(jsonb_build_object('name', p.polname, 'cmd', p.polcmd,
                                   'using', pg_get_expr(p.polqual, p.polrelid), 'check', pg_get_expr(p.polwithcheck, p.polrelid))), '[]'::jsonb)
                                from pg_policy p where p.polrelid = c.oid)) order by c.relname)
            from pg_class c
           where c.relnamespace = (select oid from ns)
             and c.relname in ('customer orders', 'production route cards', 'production route card stages'))
  union all
  select 6, 'grants to anon / authenticated (orders, cards, stages, batch master)',
         (select coalesce(jsonb_agg(jsonb_build_object('table', table_name, 'grantee', grantee, 'privileges', privs) order by table_name, grantee), '[]'::jsonb)
            from (select table_name, grantee, string_agg(privilege_type, ', ' order by privilege_type) as privs
                    from information_schema.role_table_grants
                   where table_schema = 'public' and grantee in ('anon', 'authenticated')
                     and table_name in ('customer orders', 'production route cards', 'production route card stages', 'production batch master')
                   group by table_name, grantee) g)
) checks
order by check_no;
