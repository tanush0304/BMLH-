-- 030 pre-flight: READ-ONLY, ONE query -> one result set (one row per
-- check). Run it in the Supabase SQL editor and send back the whole grid
-- (Copy as CSV/JSON). Nothing here changes data. (query_to_xml only runs
-- SELECT count(*) statements built from the catalog.)
with
co  as (select to_regclass('public."customer orders"') as oid),
rc  as (select to_regclass('public."production route cards"') as oid),
unplanned as (
  select c.prd_no from "customer orders" c
  where not exists (select 1 from "production route cards" r where r.prd_no = c.prd_no)
)
select * from (
  -- A. "customer orders" itself
  select 1 as check_no, 'customer orders: columns' as check_name,
         (select jsonb_agg(jsonb_build_object('column', column_name, 'type', data_type, 'nullable', is_nullable, 'default', column_default) order by ordinal_position)
            from information_schema.columns where table_schema = 'public' and table_name = 'customer orders') as result
  union all
  select 2, 'customer orders: own constraints',
         (select jsonb_agg(jsonb_build_object('name', conname, 'def', pg_get_constraintdef(oid)) order by conname)
            from pg_constraint where conrelid = (select oid from co))
  union all
  select 3, 'FKs that reference customer orders',
         (select coalesce(jsonb_agg(jsonb_build_object('table', conrelid::regclass::text, 'name', conname, 'def', pg_get_constraintdef(oid)) order by conrelid::regclass::text), '[]'::jsonb)
            from pg_constraint where confrelid = (select oid from co) and contype = 'f')
  union all
  select 4, 'triggers on customer orders',
         (select coalesce(jsonb_agg(jsonb_build_object('name', tgname, 'def', pg_get_triggerdef(oid)) order by tgname), '[]'::jsonb)
            from pg_trigger where tgrelid = (select oid from co) and not tgisinternal)
  union all
  select 5, 'RLS + policies (customer orders, route cards, stages)',
         (select jsonb_agg(jsonb_build_object('table', c.relname, 'rls', c.relrowsecurity,
                   'policies', (select coalesce(jsonb_agg(jsonb_build_object('name', p.polname, 'cmd', p.polcmd, 'using', pg_get_expr(p.polqual, p.polrelid), 'check', pg_get_expr(p.polwithcheck, p.polrelid))), '[]'::jsonb)
                                from pg_policy p where p.polrelid = c.oid)) order by c.relname)
            from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relname in ('customer orders', 'production route cards', 'production route card stages'))
  union all
  select 6, 'grants to anon / authenticated (orders, cards, stages, batch master)',
         (select jsonb_agg(jsonb_build_object('table', table_name, 'grantee', grantee, 'privileges', privs) order by table_name, grantee)
            from (select table_name, grantee, string_agg(privilege_type, ', ' order by privilege_type) as privs
                    from information_schema.role_table_grants
                   where table_schema = 'public' and grantee in ('anon', 'authenticated')
                     and table_name in ('customer orders', 'production route cards', 'production route card stages', 'production batch master')
                   group by table_name, grantee) g)
  union all
  -- B. Views and functions that read "customer orders" / order_qty
  select 7, 'views that mention customer orders or order_qty (name -> definition)',
         (select coalesce(jsonb_object_agg(viewname, definition), '{}'::jsonb)
            from pg_views where schemaname = 'public'
              and (definition ilike '%customer orders%' or definition ilike '%order_qty%'))
  union all
  select 8, 'views built on those views (name -> depends on)',
         (select coalesce(jsonb_agg(distinct jsonb_build_object('view', v.relname, 'depends_on', base.relname)), '[]'::jsonb)
            from pg_depend d
            join pg_rewrite rw on rw.oid = d.objid
            join pg_class v on v.oid = rw.ev_class
            join pg_class base on base.oid = d.refobjid
           where base.relkind = 'v' and v.oid <> base.oid and base.relnamespace = 'public'::regnamespace
             and base.relname in (select viewname from pg_views where schemaname = 'public'
                                    and (definition ilike '%customer orders%' or definition ilike '%order_qty%')))
  union all
  select 9, 'functions that mention customer orders or order_qty',
         (select coalesce(jsonb_agg(jsonb_build_object('function', p.oid::regprocedure::text, 'security_definer', p.prosecdef) order by p.proname), '[]'::jsonb)
            from pg_proc p
           where p.pronamespace = 'public'::regnamespace
             and (p.prosrc ilike '%customer orders%' or p.prosrc ilike '%order_qty%'))
  union all
  -- C. Planning inputs
  select 10, 'production route cards: columns',
         (select jsonb_agg(jsonb_build_object('column', column_name, 'type', data_type, 'nullable', is_nullable) order by ordinal_position)
            from information_schema.columns where table_schema = 'public' and table_name = 'production route cards')
  union all
  select 11, 'production batch master: columns',
         (select jsonb_agg(jsonb_build_object('column', column_name, 'type', data_type, 'nullable', is_nullable) order by ordinal_position)
            from information_schema.columns where table_schema = 'public' and table_name = 'production batch master')
  union all
  select 12, 'tables with a prd_no column (+ FK target)',
         (select jsonb_agg(jsonb_build_object('table', c.table_name,
                   'fk', (select string_agg(pg_get_constraintdef(con.oid), '; ') from pg_constraint con
                           where con.conrelid = format('public.%I', c.table_name)::regclass and con.contype = 'f'
                             and pg_get_constraintdef(con.oid) ilike '%(prd_no)%')) order by c.table_name)
            from information_schema.columns c
            join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name and t.table_type = 'BASE TABLE'
           where c.table_schema = 'public' and c.column_name = 'prd_no')
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
  select 15, 'rows referencing unplanned PRDs, per table (must all be 0)',
         (select coalesce(jsonb_object_agg(c.table_name,
                   (xpath('/row/n/text()', query_to_xml(format(
                      'select count(*) as n from public.%I where prd_no in (select co.prd_no from public."customer orders" co where not exists (select 1 from public."production route cards" r where r.prd_no = co.prd_no))',
                      c.table_name), false, true, '')))[1]::text::int), '{}'::jsonb)
            from information_schema.columns c
            join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name and t.table_type = 'BASE TABLE'
           where c.table_schema = 'public' and c.column_name = 'prd_no' and c.table_name <> 'customer orders')
  union all
  select 16, 'planned PRDs: order qty vs route-card batch qty',
         (select coalesce(jsonb_agg(jsonb_build_object('prd_no', c.prd_no, 'order_qty', c.order_qty, 'batch_qty', r.batch_qty) order by c.prd_no), '[]'::jsonb)
            from "customer orders" c join "production route cards" r on r.prd_no = c.prd_no)
  union all
  select 17, 'PO lines per PO (customer + po_number)',
         (select jsonb_agg(jsonb_build_object('customer', customer_id, 'po', po_number, 'lines', n) order by customer_id, po_number)
            from (select customer_id, po_number, count(*) as n from "customer orders" group by 1, 2) x)
  union all
  -- E. Cleanup script objects: table or view? (quality log results etc.)
  select 18, 'relkind of objects used by the cleanup script (r=table, v=view)',
         (select jsonb_object_agg(name, coalesce((select c.relkind::text from pg_class c
                    where c.oid = to_regclass(format('public.%I', name))), 'MISSING'))
            from unnest(array['quality log results', 'quality log readings', 'quality logs', 'raw material requisitions',
                              'customer po headers', 'production shift verifications', 'production log hours',
                              'job order receipt', 'job order dispatch', 'jobwork stage status', 'job order status',
                              'finished goods order status', 'order material requirement', 'order material shortfall']) as name)
  union all
  select 19, 'FKs into quality logs / quality log readings (cascade?)',
         (select coalesce(jsonb_agg(jsonb_build_object('table', conrelid::regclass::text, 'def', pg_get_constraintdef(oid))), '[]'::jsonb)
            from pg_constraint
           where contype = 'f' and confrelid in (to_regclass('public."quality logs"'), to_regclass('public."quality log readings"')))
  union all
  select 20, 'helper functions present',
         (select coalesce(jsonb_agg(proname order by proname), '[]'::jsonb)
            from pg_proc where pronamespace = 'public'::regnamespace
              and proname in ('is_app_caller', 'is_app_supervisor', 'is_app_admin', 'stage_dispatch_remaining', 'refresh_outsourced_stage'))
) checks
order by check_no;
