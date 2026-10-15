-- 030 pre-flight check 18 (one query, read-only): table or view?
-- Names are plain text compared with pg_class.relname -- nothing parsed as SQL.
select 18 as check_no, v.name as object, coalesce(c.relkind::text, 'MISSING') as relkind
from (values ('quality log results'), ('quality log readings'), ('quality logs'), ('raw material requisitions'),
             ('customer po headers'), ('production shift verifications'), ('production log hours'),
             ('job order receipt'), ('job order dispatch'), ('jobwork stage status'), ('job order status'),
             ('finished goods order status'), ('order material requirement'), ('order material shortfall')) as v(name)
left join pg_class c on c.relname = v.name
  and c.relnamespace = (select oid from pg_namespace where nspname = 'public')
order by v.name;
