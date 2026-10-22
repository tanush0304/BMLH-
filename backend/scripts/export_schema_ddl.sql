-- export_schema_ddl.sql
-- READ-ONLY. One SELECT that outputs a DDL script (no data) for schema public of
-- the LIVE project, one statement per row, in an order that runs top-to-bottom in
-- an EMPTY Supabase project:
--   settings -> types -> sequences -> tables -> sequence ownership -> PK/unique
--   -> functions -> column defaults -> checks -> indexes -> FKs -> views (by
--   dependency depth) -> triggers -> RLS -> policies -> grants -> default privileges
--   -> STORAGE section (bucket row + storage.objects policies, clearly marked).
--
-- How to use: in the Supabase SQL editor set the row limit to "No limit", and
-- replace the last SELECT with the one-cell variant below, then copy that cell.
-- Do NOT export as CSV: CSV quoting (doubled quotes, wrapped cells) breaks the SQL.
--   select string_agg(ddl, E'\n' order by sec, sub collate "C") from out;
-- The public part runs inside begin/commit (a failure rolls it all back); the
-- STORAGE part comes after the commit and runs separately.
--
-- Unqualified names in the output follow the search_path of the session that
-- runs this export; the script re-sets that same search_path in its 2nd row.

with recursive
rel as (   -- public tables, partitioned tables, views, matviews, sequences (not extension-owned)
  select c.oid, c.relname, c.relkind, c.relpersistence, c.relrowsecurity,
         c.relforcerowsecurity, c.relacl, c.relowner, c.reloptions,
         format('%I.%I', n.nspname, c.relname) as qn
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind in ('r', 'p', 'v', 'm', 'S')
    and not c.relispartition
    and not exists (select 1 from pg_depend d
                    where d.classid = 'pg_class'::regclass and d.objid = c.oid and d.deptype = 'e')
),
fn as (    -- public functions + procedures (not extension-owned, no aggregates)
  select p.oid, p.proacl, p.proowner,
         format('%I.%I(%s)', n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)) as sig
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prokind in ('f', 'p')
    and not exists (select 1 from pg_depend d
                    where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')
),
typ as (   -- public enums, domains, standalone composite types
  select t.oid, t.typname, t.typtype, t.typbasetype, t.typtypmod, t.typdefault, t.typnotnull,
         t.typrelid, format('%I.%I', n.nspname, t.typname) as qn
  from pg_type t
  join pg_namespace n on n.oid = t.typnamespace
  where n.nspname = 'public'
    and (t.typtype in ('e', 'd')
         or (t.typtype = 'c' and exists (select 1 from pg_class c where c.oid = t.typrelid and c.relkind = 'c')))
    and not exists (select 1 from pg_depend d
                    where d.classid = 'pg_type'::regclass and d.objid = t.oid and d.deptype = 'e')
),
vdep as (  -- view -> view dependencies (through the view's rewrite rule)
  select distinct r.ev_class as vid, d.refobjid as dep
  from pg_rewrite r
  join pg_depend d on d.classid = 'pg_rewrite'::regclass and d.objid = r.oid
                  and d.refclassid = 'pg_class'::regclass and d.refobjid <> r.ev_class
  where r.ev_class in (select oid from rel where relkind in ('v', 'm'))
    and d.refobjid in (select oid from rel where relkind in ('v', 'm'))
),
vlvl as (
  select oid as vid, 0 as depth from rel where relkind in ('v', 'm')
  union all
  select vdep.vid, vlvl.depth + 1 from vdep join vlvl on vdep.dep = vlvl.vid
),
vord as (select vid, max(depth) as depth from vlvl group by vid),
pol as (   -- every policy, public + storage
  select n.nspname, c.relname, format('%I.%I', n.nspname, c.relname) || '~' || p.polname as sortkey,
         format('create policy %I on %I.%I as %s for %s to %s%s%s;',
                p.polname, n.nspname, c.relname,
                case when p.polpermissive then 'permissive' else 'restrictive' end,
                case p.polcmd when 'r' then 'select' when 'a' then 'insert'
                              when 'w' then 'update' when 'd' then 'delete' else 'all' end,
                (select string_agg(case when x = 0 then 'public' else quote_ident(pg_get_userbyid(x)) end,
                                   ', ' order by 1)
                 from unnest(p.polroles) x),
                coalesce(' using (' || pg_get_expr(p.polqual, p.polrelid) || ')', ''),
                coalesce(' with check (' || pg_get_expr(p.polwithcheck, p.polrelid) || ')', '')) as ddl
  from pg_policy p
  join pg_class c on c.oid = p.polrelid
  join pg_namespace n on n.oid = c.relnamespace
),
out(sec, sub, ddl) as (
  -- 0 settings (first row = set check_function_bodies = off)
  select 0, '0', 'set check_function_bodies = off;'
  union all select 0, '1', format('set search_path = %s;', current_setting('search_path'))
  union all select 0, '1b', 'begin;'
  union all select 89, '', 'commit;'
  union all select 0, '2', format('-- BMLH schema public DDL, exported %s from %s (no data)',
                                  to_char(now(), 'YYYY-MM-DD HH24:MI TZ'), current_database())

  -- section headers
  union all
  select h.sec, '', '-- ===== ' || h.title || ' ====='
  from (values (1, 'extensions on the live project (comments only; Supabase defaults)'),
               (2, 'types'), (4, 'sequences'), (5, 'tables'), (6, 'sequence ownership'),
               (7, 'primary key / unique / exclusion constraints'), (8, 'functions'),
               (9, 'column defaults'), (10, 'check constraints'), (11, 'indexes'),
               (12, 'foreign keys'), (13, 'views (dependency order)'), (14, 'materialized view indexes'),
               (15, 'triggers'), (16, 'row level security'), (17, 'policies'),
               (18, 'grants: schema'), (19, 'grants: tables / views / sequences'),
               (20, 'grants: columns'), (21, 'grants: functions'), (22, 'default privileges'),
               (90, 'STORAGE -- separate part: run after the public part (storage schema is Supabase-managed)'))
       as h(sec, title)

  -- 1 extensions (commented out; review by hand)
  union all
  select 1, e.extname,
         format('-- create extension if not exists %I with schema %I;  -- live version %s',
                e.extname, n.nspname, e.extversion)
  from pg_extension e join pg_namespace n on n.oid = e.extnamespace

  -- 2 types: enums, then domains, then composites
  union all
  select 2, '1' || t.qn,
         format('create type %s as enum (%s);', t.qn,
                (select string_agg(quote_literal(e.enumlabel), ', ' order by e.enumsortorder)
                 from pg_enum e where e.enumtypid = t.oid))
  from typ t where t.typtype = 'e'
  union all
  select 2, '2' || t.qn,
         format('create domain %s as %s%s%s%s;', t.qn, format_type(t.typbasetype, t.typtypmod),
                coalesce(' default ' || t.typdefault, ''),
                case when t.typnotnull then ' not null' else '' end,
                coalesce((select string_agg(format(' constraint %I %s', c.conname, pg_get_constraintdef(c.oid)), '' order by c.conname)
                          from pg_constraint c where c.contypid = t.oid), ''))
  from typ t where t.typtype = 'd'
  union all
  select 2, '3' || t.qn,
         format('create type %s as (%s);', t.qn,
                (select string_agg(format('%I %s', a.attname, format_type(a.atttypid, a.atttypmod)), ', ' order by a.attnum)
                 from pg_attribute a where a.attrelid = t.typrelid and a.attnum > 0 and not a.attisdropped))
  from typ t where t.typtype = 'c'

  -- 4 sequences (identity sequences are created by their column)
  union all
  select 4, r.qn,
         format('create sequence if not exists %s as %s increment by %s minvalue %s maxvalue %s start with %s cache %s%s;',
                r.qn, format_type(s.seqtypid, null), s.seqincrement, s.seqmin, s.seqmax, s.seqstart, s.seqcache,
                case when s.seqcycle then ' cycle' else '' end)
  from rel r join pg_sequence s on s.seqrelid = r.oid
  where r.relkind = 'S'
    and not exists (select 1 from pg_depend d
                    where d.classid = 'pg_class'::regclass and d.objid = r.oid and d.deptype = 'i')

  -- 5 tables: columns, types, collation, identity, generated, NOT NULL (defaults in 9)
  union all
  select 5, r.qn,
         format(E'create %stable %s (\n%s\n)%s;',
                case when r.relpersistence = 'u' then 'unlogged ' else '' end,
                r.qn,
                coalesce((
                  select string_agg(format('    %I %s%s%s%s%s',
                           a.attname,
                           format_type(a.atttypid, a.atttypmod),
                           case when a.attcollation <> 0 and a.attcollation <> ty.typcollation
                                then (select format(' collate %I.%I', cn.nspname, co.collname)
                                      from pg_collation co join pg_namespace cn on cn.oid = co.collnamespace
                                      where co.oid = a.attcollation)
                                else '' end,
                           case a.attidentity when 'a' then ' generated always as identity'
                                              when 'd' then ' generated by default as identity' else '' end,
                           case when a.attgenerated = 's'
                                then ' generated always as (' || pg_get_expr(ad.adbin, ad.adrelid) || ') stored'
                                else '' end,
                           case when a.attnotnull then ' not null' else '' end),
                         E',\n' order by a.attnum)
                  from pg_attribute a
                  join pg_type ty on ty.oid = a.atttypid
                  left join pg_attrdef ad on ad.adrelid = a.attrelid and ad.adnum = a.attnum
                  where a.attrelid = r.oid and a.attnum > 0 and not a.attisdropped), ''),
                case when r.relkind = 'p' then ' partition by ' || pg_get_partkeydef(r.oid) else '' end)
  from rel r where r.relkind in ('r', 'p')

  -- 6 sequence ownership (serial-style sequences)
  union all
  select 6, r.qn, format('alter sequence %s owned by %s.%I;', r.qn, t.qn, a.attname)
  from rel r
  join pg_depend d on d.classid = 'pg_class'::regclass and d.objid = r.oid and d.deptype = 'a'
                  and d.refclassid = 'pg_class'::regclass
  join rel t on t.oid = d.refobjid
  join pg_attribute a on a.attrelid = d.refobjid and a.attnum = d.refobjsubid
  where r.relkind = 'S'

  -- 7 PK / unique / exclusion, 10 checks, 12 FKs (FKs after all unique indexes)
  union all
  select case when c.contype in ('p', 'u', 'x') then 7 when c.contype = 'c' then 10 else 12 end,
         r.qn || '~' || c.conname,
         format('alter table only %s add constraint %I %s;', r.qn, c.conname, pg_get_constraintdef(c.oid))
  from pg_constraint c join rel r on r.oid = c.conrelid
  where c.contype in ('p', 'u', 'x', 'c', 'f') and c.conislocal

  -- 8 functions (security definer + SET search_path are part of pg_get_functiondef)
  union all
  select 8, f.sig, pg_get_functiondef(f.oid) || ';'
  from fn f

  -- 9 column defaults (after functions: defaults may call public functions)
  union all
  select 9, r.qn || '~' || a.attname,
         format('alter table only %s alter column %I set default %s;', r.qn, a.attname, pg_get_expr(ad.adbin, ad.adrelid))
  from pg_attrdef ad
  join pg_attribute a on a.attrelid = ad.adrelid and a.attnum = ad.adnum
  join rel r on r.oid = ad.adrelid
  where r.relkind in ('r', 'p') and a.attgenerated <> 's' and not a.attisdropped

  -- 11 indexes not backing a constraint (partial / unique / expression), 14 on matviews
  union all
  select case when r.relkind = 'm' then 14 else 11 end,
         r.qn || '~' || ic.relname,
         pg_get_indexdef(i.indexrelid) || ';'
  from pg_index i
  join rel r on r.oid = i.indrelid
  join pg_class ic on ic.oid = i.indexrelid
  where not exists (select 1 from pg_constraint c
                    where c.conindid = i.indexrelid and c.conrelid = i.indrelid and c.contype in ('p', 'u', 'x'))

  -- 13 views + matviews, deepest dependencies last
  union all
  select 13, lpad(v.depth::text, 3, '0') || r.qn,
         case when r.relkind = 'v'
           then format(E'create or replace view %s%s as\n%s;', r.qn,
                       coalesce(' with (' || array_to_string(r.reloptions, ', ') || ')', ''),
                       regexp_replace(pg_get_viewdef(r.oid, true), ';\s*$', ''))
           else format(E'create materialized view %s%s as\n%s\nwith no data;', r.qn,
                       coalesce(' with (' || array_to_string(r.reloptions, ', ') || ')', ''),
                       regexp_replace(pg_get_viewdef(r.oid, true), ';\s*$', ''))
         end
  from rel r join vord v on v.vid = r.oid

  -- 15 triggers on public tables/views, plus triggers elsewhere (e.g. auth.users) that call public functions
  union all
  select 15, r.qn || '~' || t.tgname,
         pg_get_triggerdef(t.oid, false) || ';'
         || case t.tgenabled when 'D' then format(E'\nalter table %s disable trigger %I;', r.qn, t.tgname)
                             when 'R' then format(E'\nalter table %s enable replica trigger %I;', r.qn, t.tgname)
                             when 'A' then format(E'\nalter table %s enable always trigger %I;', r.qn, t.tgname)
                             else '' end
  from pg_trigger t join rel r on r.oid = t.tgrelid
  where not t.tgisinternal
  union all
  select 15, 'zz~' || format('%I.%I', n.nspname, c.relname) || '~' || t.tgname,
         '-- trigger outside public calling a public function (create after the function exists):' || E'\n'
         || pg_get_triggerdef(t.oid, false) || ';'
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where not t.tgisinternal and n.nspname <> 'public'
    and t.tgfoid in (select oid from fn)

  -- 16 RLS
  union all
  select 16, r.qn || '~1', format('alter table %s enable row level security;', r.qn)
  from rel r where r.relkind in ('r', 'p') and r.relrowsecurity
  union all
  select 16, r.qn || '~2', format('alter table %s force row level security;', r.qn)
  from rel r where r.relkind in ('r', 'p') and r.relforcerowsecurity

  -- 17 policies (public)
  union all
  select 17, p.sortkey, p.ddl from pol p where p.nspname = 'public'

  -- 18 schema usage
  union all
  select 18, g.gname,
         format('grant %s on schema public to %s%s;', string_agg(a.privilege_type, ', ' order by a.privilege_type),
                g.gname, case when a.is_grantable then ' with grant option' else '' end)
  from pg_namespace n
  cross join lateral aclexplode(n.nspacl) a
  cross join lateral (select case when a.grantee = 0 then 'public' else quote_ident(pg_get_userbyid(a.grantee)) end) g(gname)
  where n.nspname = 'public'
    and (a.grantee = 0 or pg_get_userbyid(a.grantee) in ('anon', 'authenticated', 'service_role'))
  group by g.gname, a.is_grantable

  -- 19 tables / views / sequences: revoke everything the empty project's defaults gave, then re-grant live ACL
  union all
  select 19, r.qn || '~0',
         format('revoke all on %s %s from public, anon, authenticated, service_role;',
                case when r.relkind = 'S' then 'sequence' else 'table' end, r.qn)
  from rel r
  union all
  select 19, r.qn || '~1' || g.gname,
         format('grant %s on %s %s to %s%s;', string_agg(a.privilege_type, ', ' order by a.privilege_type),
                case when r.relkind = 'S' then 'sequence' else 'table' end, r.qn, g.gname,
                case when a.is_grantable then ' with grant option' else '' end)
  from rel r
  cross join lateral aclexplode(coalesce(r.relacl, acldefault(case when r.relkind = 'S' then 's' else 'r' end::"char", r.relowner))) a
  cross join lateral (select case when a.grantee = 0 then 'public' else quote_ident(pg_get_userbyid(a.grantee)) end) g(gname)
  where a.grantee = 0 or pg_get_userbyid(a.grantee) in ('anon', 'authenticated', 'service_role')
  group by r.qn, r.relkind, g.gname, a.is_grantable

  -- 20 column-level grants (e.g. 033 receipt UPDATE (qty_received, receipt_date))
  union all
  select 20, r.qn || '~' || g.gname || '~' || a.privilege_type,
         format('grant %s (%s) on table %s to %s%s;', a.privilege_type,
                string_agg(quote_ident(at.attname), ', ' order by at.attnum), r.qn, g.gname,
                case when a.is_grantable then ' with grant option' else '' end)
  from rel r
  join pg_attribute at on at.attrelid = r.oid and at.attnum > 0 and not at.attisdropped and at.attacl is not null
  cross join lateral aclexplode(at.attacl) a
  cross join lateral (select case when a.grantee = 0 then 'public' else quote_ident(pg_get_userbyid(a.grantee)) end) g(gname)
  where a.grantee = 0 or pg_get_userbyid(a.grantee) in ('anon', 'authenticated', 'service_role')
  group by r.qn, g.gname, a.privilege_type, a.is_grantable

  -- 21 functions (null proacl = default EXECUTE to PUBLIC, made explicit)
  union all
  select 21, f.sig || '~0', format('revoke all on routine %s from public, anon, authenticated, service_role;', f.sig)
  from fn f
  union all
  select 21, f.sig || '~1' || g.gname,
         format('grant %s on routine %s to %s%s;', string_agg(a.privilege_type, ', ' order by a.privilege_type),
                f.sig, g.gname, case when a.is_grantable then ' with grant option' else '' end)
  from fn f
  cross join lateral aclexplode(coalesce(f.proacl, acldefault('f', f.proowner))) a
  cross join lateral (select case when a.grantee = 0 then 'public' else quote_ident(pg_get_userbyid(a.grantee)) end) g(gname)
  where a.grantee = 0 or pg_get_userbyid(a.grantee) in ('anon', 'authenticated', 'service_role')
  group by f.sig, g.gname, a.is_grantable

  -- 22 default privileges (schema public + global), revoke then re-grant
  union all
  select 22, pg_get_userbyid(da.defaclrole) || '~' || ot.kw || '~0',
         format('alter default privileges for role %I%s revoke all on %s from public, anon, authenticated, service_role;',
                pg_get_userbyid(da.defaclrole),
                case when da.defaclnamespace = 0 then '' else ' in schema public' end, ot.kw)
  from pg_default_acl da
  join (values ('r', 'tables'), ('S', 'sequences'), ('f', 'functions'), ('T', 'types')) ot(t, kw)
    on ot.t = da.defaclobjtype::text
  where da.defaclnamespace in (0, 'public'::regnamespace::oid)
    and pg_get_userbyid(da.defaclrole) = 'postgres'
  union all
  select 22, pg_get_userbyid(da.defaclrole) || '~' || ot.kw || '~1' || g.gname,
         format('alter default privileges for role %I%s grant %s on %s to %s%s;',
                pg_get_userbyid(da.defaclrole),
                case when da.defaclnamespace = 0 then '' else ' in schema public' end,
                string_agg(a.privilege_type, ', ' order by a.privilege_type), ot.kw, g.gname,
                case when a.is_grantable then ' with grant option' else '' end)
  from pg_default_acl da
  join (values ('r', 'tables'), ('S', 'sequences'), ('f', 'functions'), ('T', 'types')) ot(t, kw)
    on ot.t = da.defaclobjtype::text
  cross join lateral aclexplode(da.defaclacl) a
  cross join lateral (select case when a.grantee = 0 then 'public' else quote_ident(pg_get_userbyid(a.grantee)) end) g(gname)
  where da.defaclnamespace in (0, 'public'::regnamespace::oid)
    and pg_get_userbyid(da.defaclrole) = 'postgres'
    and (a.grantee = 0 or pg_get_userbyid(a.grantee) in ('anon', 'authenticated', 'service_role'))
  group by da.defaclrole, da.defaclnamespace, ot.kw, g.gname, a.is_grantable

  -- 90 STORAGE: bucket config row (not user data) + policies on storage.objects / storage.buckets
  union all
  select 90, '1' || b.id,
         format('insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values (%L, %L, %L, %s, %L) on conflict (id) do nothing;',
                b.id, b.name, b.public, coalesce(b.file_size_limit::text, 'null'), b.allowed_mime_types)
  from storage.buckets b
  where b.id = 'complaint-attachments'
  union all
  select 90, '2' || p.sortkey, p.ddl
  from pol p
  where p.nspname = 'storage' and p.relname in ('objects', 'buckets')
)

select string_agg(ddl, E'\n' order by sec, sub collate "C") from out;