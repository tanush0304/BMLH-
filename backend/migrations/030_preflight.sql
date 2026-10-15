-- 030 pre-flight: READ-ONLY, ONE query -> one result set (one row per
-- check). Run it in the Supabase SQL editor and send back the whole grid
-- (Copy as CSV/JSON). Nothing here changes data. 19 rows: check 15 (the
-- dynamic per-table count) is removed -- it failed on live with
-- 'relation "quality" does not exist'; see 030_preflight_diag15.sql.
--
-- No name is ever cast to regclass: every table/view is found by joining
-- pg_class on relname + the public schema oid, so a missing or oddly named
-- object gives null/'MISSING', never an error. Nothing is executed
-- dynamically.
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
  union all
  -- B. Views and functions that read "customer orders" / order_qty
  select 7, 'views that mention customer orders or order_qty (name -> definition)',
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
  union all
  -- C. Planning inputs
  select 10, 'production route cards: columns',
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
  union all
  -- D. Data the migration touches
  select 13, 'overview',
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
  union all
  -- E. Cleanup script objects: table or view? ("quality log results" etc.)
  select 18, 'relkind of objects used by the cleanup script (r=table, v=view)',
         (select jsonb_object_agg(n.name, coalesce((select r.relkind::text from rel r where r.relname = n.name), 'MISSING'))
            from unnest(array['quality log results', 'quality log readings', 'quality logs', 'raw material requisitions',
                              'customer po headers', 'production shift verifications', 'production log hours',
                              'job order receipt', 'job order dispatch', 'jobwork stage status', 'job order status',
                              'finished goods order status', 'order material requirement', 'order material shortfall']) as n(name))
  union all
  select 19, 'FKs into quality logs / quality log readings (cascade?)',
         (select coalesce(jsonb_agg(jsonb_build_object('table', src.relname, 'def', pg_get_constraintdef(k.oid))), '[]'::jsonb)
            from pg_constraint k
            join pg_class src on src.oid = k.conrelid
            join rel tgt on tgt.oid = k.confrelid
           where k.contype = 'f' and tgt.relname in ('quality logs', 'quality log readings'))
  union all
  select 20, 'helper functions present',
         (select coalesce(jsonb_agg(proname order by proname), '[]'::jsonb)
            from pg_proc where pronamespace = (select oid from ns)
              and proname in ('is_app_caller', 'is_app_supervisor', 'is_app_admin', 'stage_dispatch_remaining', 'refresh_outsourced_stage'))
) checks
order by check_no;
