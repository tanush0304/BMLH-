-- 030 pre-flight part F (one query, read-only): definitions still needed
-- for the rewrite -- "order material shortfall" (built on "order material
-- requirement") and its columns.
select c.relname as view_name, pg_get_viewdef(c.oid, true) as definition,
       (select string_agg(a.attname || ' ' || format_type(a.atttypid, a.atttypmod), ', ' order by a.attnum)
          from pg_attribute a where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped) as columns
from pg_class c
where c.relnamespace = (select oid from pg_namespace where nspname = 'public')
  and c.relname in ('order material shortfall', 'customer po summary');
