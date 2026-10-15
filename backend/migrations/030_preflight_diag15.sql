-- 030 pre-flight, check 15 diagnostic: READ-ONLY, executes NOTHING dynamic.
-- One row per public base table with a prd_no column: the exact SQL text
-- check 15 ran for it, plus how the name renders and anything on the table
-- that runs when it is read (row security policies, rules) -- one of these
-- produced 'relation "quality" does not exist'. Send back the whole grid.
with
ns as (select oid from pg_namespace where nspname = 'public'),
prd_tables as (
  select c.oid, c.relname, c.relkind, c.relrowsecurity, c.relforcerowsecurity, c.relhasrules
  from pg_class c
  join pg_attribute a on a.attrelid = c.oid and a.attname = 'prd_no' and a.attnum > 0 and not a.attisdropped
  where c.relnamespace = (select oid from ns) and c.relkind in ('r', 'p')
)
select
  t.relname                                   as table_name,
  t.oid::regclass::text                       as oid_regclass_text,
  quote_ident(t.relname)                      as quote_ident_name,
  format('%I.%I', 'public', t.relname)        as schema_qualified_name,
  t.oid::regclass::text = quote_ident(t.relname)
    or t.oid::regclass::text = format('%I.%I', 'public', t.relname) as regclass_text_ok,
  t.relkind,
  -- the exact text check 15 passed to query_to_xml for this table
  'select count(*) as n from ' || t.oid::regclass::text ||
  ' where prd_no in (select co.prd_no from public."customer orders" co'
  ' where not exists (select 1 from public."production route cards" r where r.prd_no = co.prd_no))' as check15_sql,
  -- things that run when the table is read
  t.relrowsecurity                            as rls_enabled,
  t.relforcerowsecurity                       as rls_forced,
  (select coalesce(jsonb_agg(jsonb_build_object('policy', p.polname, 'cmd', p.polcmd,
            'using', pg_get_expr(p.polqual, p.polrelid))), '[]'::jsonb)
     from pg_policy p where p.polrelid = t.oid) as policies,
  t.relhasrules                               as has_rules,
  (select coalesce(jsonb_agg(jsonb_build_object('rule', r.rulename, 'def', pg_get_ruledef(r.oid))), '[]'::jsonb)
     from pg_rewrite r where r.ev_class = t.oid and r.rulename <> '_RETURN') as rules,
  -- does anything attached to this table mention "quality" unquoted?
  exists (select 1 from pg_policy p where p.polrelid = t.oid
            and pg_get_expr(p.polqual, p.polrelid) ~* '(^|[^"])quality') as policy_mentions_quality,
  exists (select 1 from pg_rewrite r where r.ev_class = t.oid and r.rulename <> '_RETURN'
            and pg_get_ruledef(r.oid) ~* '(^|[^"])quality')          as rule_mentions_quality
from prd_tables t
order by t.relname;
