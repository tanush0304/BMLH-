-- 030 pre-flight check 19 (one query, read-only): FKs into the quality tables (cascade?).
select 19 as check_no, src.relname as from_table, k.conname, pg_get_constraintdef(k.oid) as def
from pg_constraint k
join pg_class src on src.oid = k.conrelid
join pg_class tgt on tgt.oid = k.confrelid
where k.contype = 'f'
  and tgt.relnamespace = (select oid from pg_namespace where nspname = 'public')
  and tgt.relname in ('quality logs', 'quality log readings');
