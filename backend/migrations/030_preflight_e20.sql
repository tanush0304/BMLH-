-- 030 pre-flight check 20 (one query, read-only): helper functions present.
select 20 as check_no, proname
from pg_proc
where pronamespace = (select oid from pg_namespace where nspname = 'public')
  and proname in ('is_app_caller', 'is_app_supervisor', 'is_app_admin', 'stage_dispatch_remaining', 'refresh_outsourced_stage')
order by proname;
