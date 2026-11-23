-- =====================================================================
-- 058 -- Masters: read for every signed-in user, write for supervisor /
-- admin only.  NOT RUN.
--
-- Before: master tables have "authenticated full access" (ALL, true) --
-- created in the dashboard, not in any migration -- so an operator could
-- insert / update / delete masters through the API. Operators never write
-- masters through the app (the Masters module and Customer Orders are
-- supervisor/admin only; operator screens only read masters), and no
-- trigger / function writes a master row as a side effect.
--
-- After, per master table (20, list below):
--   "<table> read"   FOR SELECT  TO authenticated USING (true)
--   "<table> write"  FOR ALL     TO authenticated USING / WITH CHECK (is_app_supervisor())
--   (policies are OR-ed: everyone reads, only supervisor / admin write)
-- is_app_supervisor() (028) = role in ('supervisor', 'admin').
--
-- ONE exception, "raw materials master": 036's guard_rm_transaction_qty
-- (INVOKER trigger on RM Receipt / Issue, used by operators in Stores)
-- locks the RM row with SELECT ... FOR UPDATE. Under RLS that lock only
-- sees rows passing an UPDATE policy, so with supervisor-only write an
-- operator's lock would silently lock nothing (036's race protection lost).
-- Extra policy "raw materials master lock": FOR UPDATE USING (true)
-- WITH CHECK (false) -> the row can be LOCKED by anyone but never CHANGED
-- by a non-supervisor (an UPDATE needs some policy's WITH CHECK to pass).
--
-- "customer delivery addresses": 042's read / insert / update policies are
-- replaced the same way; it still has no DELETE grant (042) -- unchanged.
--
-- Not touched: transaction tables (logs, receipts, DCs, stock, quality /
-- maintenance logs, maintenance plan, orders), views, grants, anon (039:
-- no anon privileges; no policy here names anon).
--
-- Every statement stands alone (Supabase SQL editor commits each one):
-- no begin/commit, no temp tables, no DO blocks, no security definer.
-- Re-runnable (drop policy if exists before every create).
--
-- Master tables (20):
--   customers master, customer delivery addresses, suppliers master,
--   vendors master, vendor job work types, job work master,
--   employees master, shifts master, machines master, machine operations,
--   operations master, products master, product raw materials,
--   raw materials master, rm suppliers, cycle time master,
--   production batch master, quality master, maintenance master,
--   maintenance schedule
-- =====================================================================


-- ---------------------------------------------------------------- PREVIEW
-- P1. Current policies on the 20 tables (expect "authenticated full access"
--     ALL / true on most; 042's three on delivery addresses).
select tablename, policyname, cmd, roles, permissive, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('customers master', 'customer delivery addresses', 'suppliers master', 'vendors master',
                    'vendor job work types', 'job work master', 'employees master', 'shifts master',
                    'machines master', 'machine operations', 'operations master', 'products master',
                    'product raw materials', 'raw materials master', 'rm suppliers', 'cycle time master',
                    'production batch master', 'quality master', 'maintenance master', 'maintenance schedule')
order by tablename, policyname;

-- P2. RLS on? (rls_enabled false -> policies do nothing; CHANGE turns it on)
select c.relname as tablename, c.relrowsecurity as rls_enabled, c.relforcerowsecurity as rls_forced
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
  and c.relname in ('customers master', 'customer delivery addresses', 'suppliers master', 'vendors master',
                    'vendor job work types', 'job work master', 'employees master', 'shifts master',
                    'machines master', 'machine operations', 'operations master', 'products master',
                    'product raw materials', 'raw materials master', 'rm suppliers', 'cycle time master',
                    'production batch master', 'quality master', 'maintenance master', 'maintenance schedule')
order by 1;

-- P3. is_app_supervisor() covers admin: expect the body to contain
--     role in ('supervisor', 'admin').
select pg_get_functiondef('public.is_app_supervisor()'::regprocedure) as definition;

-- P4. Live functions (incl. trigger functions) that mention a master table
--     together with a write or a row lock. Expected: guard_rm_transaction_qty
--     (036, FOR UPDATE -> covered by the lock policy), void_entry (034,
--     security definer -> not subject to RLS), cleanup/reset helpers if any.
--     Anything else: stop and report before running CHANGE.
select p.proname, p.prosecdef as security_definer
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prokind = 'f'
  and p.prosrc ~* '"(customers master|customer delivery addresses|suppliers master|vendors master|vendor job work types|job work master|employees master|shifts master|machines master|machine operations|operations master|products master|product raw materials|raw materials master|rm suppliers|cycle time master|production batch master|quality master|maintenance master|maintenance schedule)"'
  and p.prosrc ~* '(insert\s+into|update\s+(public\.)?"|delete\s+from|for\s+update)'
order by 1;

-- P5. Table grants (unchanged by this migration; expect no anon rows -- 039).
select table_name, grantee, string_agg(privilege_type, ', ' order by privilege_type) as privileges
from information_schema.role_table_grants
where table_schema = 'public' and grantee in ('authenticated', 'anon')
  and table_name in ('customers master', 'customer delivery addresses', 'suppliers master', 'vendors master',
                     'vendor job work types', 'job work master', 'employees master', 'shifts master',
                     'machines master', 'machine operations', 'operations master', 'products master',
                     'product raw materials', 'raw materials master', 'rm suppliers', 'cycle time master',
                     'production batch master', 'quality master', 'maintenance master', 'maintenance schedule')
group by table_name, grantee
order by 1, 2;


-- ---------------------------------------------------------------- CHANGE
-- customers master
alter table public."customers master" enable row level security;
drop policy if exists "authenticated full access" on public."customers master";
drop policy if exists "customers master read" on public."customers master";
drop policy if exists "customers master write" on public."customers master";
create policy "customers master read" on public."customers master" for select to authenticated using (true);
create policy "customers master write" on public."customers master" for all to authenticated using (public.is_app_supervisor()) with check (public.is_app_supervisor());

-- customer delivery addresses (042's policies replaced; still no DELETE grant)
alter table public."customer delivery addresses" enable row level security;
drop policy if exists "authenticated full access" on public."customer delivery addresses";
drop policy if exists "authenticated read customer delivery addresses" on public."customer delivery addresses";
drop policy if exists "authenticated insert customer delivery addresses" on public."customer delivery addresses";
drop policy if exists "authenticated update customer delivery addresses" on public."customer delivery addresses";
drop policy if exists "customer delivery addresses read" on public."customer delivery addresses";
drop policy if exists "customer delivery addresses write" on public."customer delivery addresses";
create policy "customer delivery addresses read" on public."customer delivery addresses" for select to authenticated using (true);
create policy "customer delivery addresses write" on public."customer delivery addresses" for all to authenticated using (public.is_app_supervisor()) with check (public.is_app_supervisor());

-- suppliers master
alter table public."suppliers master" enable row level security;
drop policy if exists "authenticated full access" on public."suppliers master";
drop policy if exists "suppliers master read" on public."suppliers master";
drop policy if exists "suppliers master write" on public."suppliers master";
create policy "suppliers master read" on public."suppliers master" for select to authenticated using (true);
create policy "suppliers master write" on public."suppliers master" for all to authenticated using (public.is_app_supervisor()) with check (public.is_app_supervisor());

-- vendors master
alter table public."vendors master" enable row level security;
drop policy if exists "authenticated full access" on public."vendors master";
drop policy if exists "vendors master read" on public."vendors master";
drop policy if exists "vendors master write" on public."vendors master";
create policy "vendors master read" on public."vendors master" for select to authenticated using (true);
create policy "vendors master write" on public."vendors master" for all to authenticated using (public.is_app_supervisor()) with check (public.is_app_supervisor());

-- vendor job work types
alter table public."vendor job work types" enable row level security;
drop policy if exists "authenticated full access" on public."vendor job work types";
drop policy if exists "vendor job work types read" on public."vendor job work types";
drop policy if exists "vendor job work types write" on public."vendor job work types";
create policy "vendor job work types read" on public."vendor job work types" for select to authenticated using (true);
create policy "vendor job work types write" on public."vendor job work types" for all to authenticated using (public.is_app_supervisor()) with check (public.is_app_supervisor());

-- job work master
alter table public."job work master" enable row level security;
drop policy if exists "authenticated full access" on public."job work master";
drop policy if exists "job work master read" on public."job work master";
drop policy if exists "job work master write" on public."job work master";
create policy "job work master read" on public."job work master" for select to authenticated using (true);
create policy "job work master write" on public."job work master" for all to authenticated using (public.is_app_supervisor()) with check (public.is_app_supervisor());

-- employees master
alter table public."employees master" enable row level security;
drop policy if exists "authenticated full access" on public."employees master";
drop policy if exists "employees master read" on public."employees master";
drop policy if exists "employees master write" on public."employees master";
create policy "employees master read" on public."employees master" for select to authenticated using (true);
create policy "employees master write" on public."employees master" for all to authenticated using (public.is_app_supervisor()) with check (public.is_app_supervisor());

-- shifts master
alter table public."shifts master" enable row level security;
drop policy if exists "authenticated full access" on public."shifts master";
drop policy if exists "shifts master read" on public."shifts master";
drop policy if exists "shifts master write" on public."shifts master";
create policy "shifts master read" on public."shifts master" for select to authenticated using (true);
create policy "shifts master write" on public."shifts master" for all to authenticated using (public.is_app_supervisor()) with check (public.is_app_supervisor());

-- machines master
alter table public."machines master" enable row level security;
drop policy if exists "authenticated full access" on public."machines master";
drop policy if exists "machines master read" on public."machines master";
drop policy if exists "machines master write" on public."machines master";
create policy "machines master read" on public."machines master" for select to authenticated using (true);
create policy "machines master write" on public."machines master" for all to authenticated using (public.is_app_supervisor()) with check (public.is_app_supervisor());

-- machine operations
alter table public."machine operations" enable row level security;
drop policy if exists "authenticated full access" on public."machine operations";
drop policy if exists "machine operations read" on public."machine operations";
drop policy if exists "machine operations write" on public."machine operations";
create policy "machine operations read" on public."machine operations" for select to authenticated using (true);
create policy "machine operations write" on public."machine operations" for all to authenticated using (public.is_app_supervisor()) with check (public.is_app_supervisor());

-- operations master
alter table public."operations master" enable row level security;
drop policy if exists "authenticated full access" on public."operations master";
drop policy if exists "operations master read" on public."operations master";
drop policy if exists "operations master write" on public."operations master";
create policy "operations master read" on public."operations master" for select to authenticated using (true);
create policy "operations master write" on public."operations master" for all to authenticated using (public.is_app_supervisor()) with check (public.is_app_supervisor());

-- products master
alter table public."products master" enable row level security;
drop policy if exists "authenticated full access" on public."products master";
drop policy if exists "products master read" on public."products master";
drop policy if exists "products master write" on public."products master";
create policy "products master read" on public."products master" for select to authenticated using (true);
create policy "products master write" on public."products master" for all to authenticated using (public.is_app_supervisor()) with check (public.is_app_supervisor());

-- product raw materials (BOM)
alter table public."product raw materials" enable row level security;
drop policy if exists "authenticated full access" on public."product raw materials";
drop policy if exists "product raw materials read" on public."product raw materials";
drop policy if exists "product raw materials write" on public."product raw materials";
create policy "product raw materials read" on public."product raw materials" for select to authenticated using (true);
create policy "product raw materials write" on public."product raw materials" for all to authenticated using (public.is_app_supervisor()) with check (public.is_app_supervisor());

-- raw materials master (+ lock policy for 036's FOR UPDATE, see header)
alter table public."raw materials master" enable row level security;
drop policy if exists "authenticated full access" on public."raw materials master";
drop policy if exists "raw materials master read" on public."raw materials master";
drop policy if exists "raw materials master write" on public."raw materials master";
drop policy if exists "raw materials master lock" on public."raw materials master";
create policy "raw materials master read" on public."raw materials master" for select to authenticated using (true);
create policy "raw materials master write" on public."raw materials master" for all to authenticated using (public.is_app_supervisor()) with check (public.is_app_supervisor());
create policy "raw materials master lock" on public."raw materials master" for update to authenticated using (true) with check (false);

-- rm suppliers
alter table public."rm suppliers" enable row level security;
drop policy if exists "authenticated full access" on public."rm suppliers";
drop policy if exists "rm suppliers read" on public."rm suppliers";
drop policy if exists "rm suppliers write" on public."rm suppliers";
create policy "rm suppliers read" on public."rm suppliers" for select to authenticated using (true);
create policy "rm suppliers write" on public."rm suppliers" for all to authenticated using (public.is_app_supervisor()) with check (public.is_app_supervisor());

-- cycle time master
alter table public."cycle time master" enable row level security;
drop policy if exists "authenticated full access" on public."cycle time master";
drop policy if exists "cycle time master read" on public."cycle time master";
drop policy if exists "cycle time master write" on public."cycle time master";
create policy "cycle time master read" on public."cycle time master" for select to authenticated using (true);
create policy "cycle time master write" on public."cycle time master" for all to authenticated using (public.is_app_supervisor()) with check (public.is_app_supervisor());

-- production batch master
alter table public."production batch master" enable row level security;
drop policy if exists "authenticated full access" on public."production batch master";
drop policy if exists "production batch master read" on public."production batch master";
drop policy if exists "production batch master write" on public."production batch master";
create policy "production batch master read" on public."production batch master" for select to authenticated using (true);
create policy "production batch master write" on public."production batch master" for all to authenticated using (public.is_app_supervisor()) with check (public.is_app_supervisor());

-- quality master
alter table public."quality master" enable row level security;
drop policy if exists "authenticated full access" on public."quality master";
drop policy if exists "quality master read" on public."quality master";
drop policy if exists "quality master write" on public."quality master";
create policy "quality master read" on public."quality master" for select to authenticated using (true);
create policy "quality master write" on public."quality master" for all to authenticated using (public.is_app_supervisor()) with check (public.is_app_supervisor());

-- maintenance master
alter table public."maintenance master" enable row level security;
drop policy if exists "authenticated full access" on public."maintenance master";
drop policy if exists "maintenance master read" on public."maintenance master";
drop policy if exists "maintenance master write" on public."maintenance master";
create policy "maintenance master read" on public."maintenance master" for select to authenticated using (true);
create policy "maintenance master write" on public."maintenance master" for all to authenticated using (public.is_app_supervisor()) with check (public.is_app_supervisor());

-- maintenance schedule
alter table public."maintenance schedule" enable row level security;
drop policy if exists "authenticated full access" on public."maintenance schedule";
drop policy if exists "maintenance schedule read" on public."maintenance schedule";
drop policy if exists "maintenance schedule write" on public."maintenance schedule";
create policy "maintenance schedule read" on public."maintenance schedule" for select to authenticated using (true);
create policy "maintenance schedule write" on public."maintenance schedule" for all to authenticated using (public.is_app_supervisor()) with check (public.is_app_supervisor());

notify pgrst, 'reload schema';


-- ---------------------------------------------------------------- VERIFICATION
-- V1. Policies per table: expect exactly "<t> read" (SELECT, true) and
--     "<t> write" (ALL, is_app_supervisor()); raw materials master also
--     "raw materials master lock" (UPDATE, qual true, with_check false).
select tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('customers master', 'customer delivery addresses', 'suppliers master', 'vendors master',
                    'vendor job work types', 'job work master', 'employees master', 'shifts master',
                    'machines master', 'machine operations', 'operations master', 'products master',
                    'product raw materials', 'raw materials master', 'rm suppliers', 'cycle time master',
                    'production batch master', 'quality master', 'maintenance master', 'maintenance schedule')
order by tablename, policyname;

-- V2. Problems (expect 0 rows): any policy on these tables that is not one
--     of ours, names anon, or lets a write through with true.
select tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('customers master', 'customer delivery addresses', 'suppliers master', 'vendors master',
                    'vendor job work types', 'job work master', 'employees master', 'shifts master',
                    'machines master', 'machine operations', 'operations master', 'products master',
                    'product raw materials', 'raw materials master', 'rm suppliers', 'cycle time master',
                    'production batch master', 'quality master', 'maintenance master', 'maintenance schedule')
  and (
    policyname not in (tablename || ' read', tablename || ' write', 'raw materials master lock')
    or 'anon' = any(roles) or 'public' = any(roles)
    or (cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL') and coalesce(with_check, qual) = 'true')
    or (policyname = tablename || ' read' and (cmd <> 'SELECT' or qual <> 'true'))
    or (policyname = tablename || ' write' and (cmd <> 'ALL' or qual not like '%is_app_supervisor()%' or with_check not like '%is_app_supervisor()%'))
    or (policyname = 'raw materials master lock' and (tablename <> 'raw materials master' or cmd <> 'UPDATE' or qual <> 'true' or with_check <> 'false'))
  );

-- V3. Policy count per table (expect 2 each, 3 on raw materials master; 20 rows).
select tablename, count(*) as policies
from pg_policies
where schemaname = 'public'
  and tablename in ('customers master', 'customer delivery addresses', 'suppliers master', 'vendors master',
                    'vendor job work types', 'job work master', 'employees master', 'shifts master',
                    'machines master', 'machine operations', 'operations master', 'products master',
                    'product raw materials', 'raw materials master', 'rm suppliers', 'cycle time master',
                    'production batch master', 'quality master', 'maintenance master', 'maintenance schedule')
group by tablename
order by 1;

-- V4. RLS on for all 20 (expect 0 rows).
select c.relname
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
  and c.relname in ('customers master', 'customer delivery addresses', 'suppliers master', 'vendors master',
                    'vendor job work types', 'job work master', 'employees master', 'shifts master',
                    'machines master', 'machine operations', 'operations master', 'products master',
                    'product raw materials', 'raw materials master', 'rm suppliers', 'cycle time master',
                    'production batch master', 'quality master', 'maintenance master', 'maintenance schedule');


-- ---------------------------------------------------------------- ROLLBACK
-- Run only to undo 058 (uncomment). Puts back "authenticated full access"
-- (ALL, true) and, on delivery addresses, 042's three policies.
-- Each statement stands alone; re-runnable.
--   drop policy if exists "customers master read" on public."customers master";
--   drop policy if exists "customers master write" on public."customers master";
--   drop policy if exists "authenticated full access" on public."customers master";
--   create policy "authenticated full access" on public."customers master" for all to authenticated using (true) with check (true);
--   drop policy if exists "suppliers master read" on public."suppliers master";
--   drop policy if exists "suppliers master write" on public."suppliers master";
--   drop policy if exists "authenticated full access" on public."suppliers master";
--   create policy "authenticated full access" on public."suppliers master" for all to authenticated using (true) with check (true);
--   drop policy if exists "vendors master read" on public."vendors master";
--   drop policy if exists "vendors master write" on public."vendors master";
--   drop policy if exists "authenticated full access" on public."vendors master";
--   create policy "authenticated full access" on public."vendors master" for all to authenticated using (true) with check (true);
--   drop policy if exists "vendor job work types read" on public."vendor job work types";
--   drop policy if exists "vendor job work types write" on public."vendor job work types";
--   drop policy if exists "authenticated full access" on public."vendor job work types";
--   create policy "authenticated full access" on public."vendor job work types" for all to authenticated using (true) with check (true);
--   drop policy if exists "job work master read" on public."job work master";
--   drop policy if exists "job work master write" on public."job work master";
--   drop policy if exists "authenticated full access" on public."job work master";
--   create policy "authenticated full access" on public."job work master" for all to authenticated using (true) with check (true);
--   drop policy if exists "employees master read" on public."employees master";
--   drop policy if exists "employees master write" on public."employees master";
--   drop policy if exists "authenticated full access" on public."employees master";
--   create policy "authenticated full access" on public."employees master" for all to authenticated using (true) with check (true);
--   drop policy if exists "shifts master read" on public."shifts master";
--   drop policy if exists "shifts master write" on public."shifts master";
--   drop policy if exists "authenticated full access" on public."shifts master";
--   create policy "authenticated full access" on public."shifts master" for all to authenticated using (true) with check (true);
--   drop policy if exists "machines master read" on public."machines master";
--   drop policy if exists "machines master write" on public."machines master";
--   drop policy if exists "authenticated full access" on public."machines master";
--   create policy "authenticated full access" on public."machines master" for all to authenticated using (true) with check (true);
--   drop policy if exists "machine operations read" on public."machine operations";
--   drop policy if exists "machine operations write" on public."machine operations";
--   drop policy if exists "authenticated full access" on public."machine operations";
--   create policy "authenticated full access" on public."machine operations" for all to authenticated using (true) with check (true);
--   drop policy if exists "operations master read" on public."operations master";
--   drop policy if exists "operations master write" on public."operations master";
--   drop policy if exists "authenticated full access" on public."operations master";
--   create policy "authenticated full access" on public."operations master" for all to authenticated using (true) with check (true);
--   drop policy if exists "products master read" on public."products master";
--   drop policy if exists "products master write" on public."products master";
--   drop policy if exists "authenticated full access" on public."products master";
--   create policy "authenticated full access" on public."products master" for all to authenticated using (true) with check (true);
--   drop policy if exists "product raw materials read" on public."product raw materials";
--   drop policy if exists "product raw materials write" on public."product raw materials";
--   drop policy if exists "authenticated full access" on public."product raw materials";
--   create policy "authenticated full access" on public."product raw materials" for all to authenticated using (true) with check (true);
--   drop policy if exists "raw materials master read" on public."raw materials master";
--   drop policy if exists "raw materials master write" on public."raw materials master";
--   drop policy if exists "raw materials master lock" on public."raw materials master";
--   drop policy if exists "authenticated full access" on public."raw materials master";
--   create policy "authenticated full access" on public."raw materials master" for all to authenticated using (true) with check (true);
--   drop policy if exists "rm suppliers read" on public."rm suppliers";
--   drop policy if exists "rm suppliers write" on public."rm suppliers";
--   drop policy if exists "authenticated full access" on public."rm suppliers";
--   create policy "authenticated full access" on public."rm suppliers" for all to authenticated using (true) with check (true);
--   drop policy if exists "cycle time master read" on public."cycle time master";
--   drop policy if exists "cycle time master write" on public."cycle time master";
--   drop policy if exists "authenticated full access" on public."cycle time master";
--   create policy "authenticated full access" on public."cycle time master" for all to authenticated using (true) with check (true);
--   drop policy if exists "production batch master read" on public."production batch master";
--   drop policy if exists "production batch master write" on public."production batch master";
--   drop policy if exists "authenticated full access" on public."production batch master";
--   create policy "authenticated full access" on public."production batch master" for all to authenticated using (true) with check (true);
--   drop policy if exists "quality master read" on public."quality master";
--   drop policy if exists "quality master write" on public."quality master";
--   drop policy if exists "authenticated full access" on public."quality master";
--   create policy "authenticated full access" on public."quality master" for all to authenticated using (true) with check (true);
--   drop policy if exists "maintenance master read" on public."maintenance master";
--   drop policy if exists "maintenance master write" on public."maintenance master";
--   drop policy if exists "authenticated full access" on public."maintenance master";
--   create policy "authenticated full access" on public."maintenance master" for all to authenticated using (true) with check (true);
--   drop policy if exists "maintenance schedule read" on public."maintenance schedule";
--   drop policy if exists "maintenance schedule write" on public."maintenance schedule";
--   drop policy if exists "authenticated full access" on public."maintenance schedule";
--   create policy "authenticated full access" on public."maintenance schedule" for all to authenticated using (true) with check (true);
-- customer delivery addresses (042):
--   drop policy if exists "customer delivery addresses read" on public."customer delivery addresses";
--   drop policy if exists "customer delivery addresses write" on public."customer delivery addresses";
--   create policy "authenticated read customer delivery addresses" on public."customer delivery addresses" for select to authenticated using (true);
--   create policy "authenticated insert customer delivery addresses" on public."customer delivery addresses" for insert to authenticated with check (true);
--   create policy "authenticated update customer delivery addresses" on public."customer delivery addresses" for update to authenticated using (true) with check (true);
--   notify pgrst, 'reload schema';
-- RLS stays enabled (it was the dashboard default; turning it off would
-- open the tables with NO policies needed).
