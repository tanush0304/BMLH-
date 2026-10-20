-- =====================================================================
-- 039 -- Lock down the anon role before public hosting.  RUN 2026-10-20.
--
-- STEP 3 results (2026-10-20):
--   1. anon: 0 privileges on tables / views / sequences in public; all 13
--      non-security_invoker views closed to anon (anon_select false).
--   2. anon_exec 0; auth_exec 57 and service_exec 58 -- unchanged from STEP 1.
--   3. Only assign_complaint_no() is not executable by authenticated (as
--      before -- 027 revoked it on purpose).
--   4. Row-lock UPDATE for authenticated: true x3 ("customer orders",
--      "production route card stages", "raw materials master").
--   5. authenticated: SELECT 62 / INSERT 59 / UPDATE 59 / DELETE 52 tables,
--      no TRUNCATE.
--   6-7. In-app checks (reads; GRN save + Void as the TEST supervisor): not
--      recorded here yet.
--
-- Does the app use anon (before login)?  NO table / view / RPC access.
-- Checked in the frontend (2026-10-20): before sign-in the app only calls
-- Supabase Auth (supabase.auth.getSession, signInWithPassword,
-- onAuthStateChange -- GoTrue, not PostgREST). Every .from() / .rpc() /
-- storage call runs after login (App renders LoginScreen until a session
-- exists; the role lookup getMyAppUser/createAppUser is keyed on the
-- signed-in user id). So anon needs no write and no EXECUTE.
-- anon also loses SELECT (2026-10-20): the app never reads as anon, and 13
-- views in public are not security_invoker -- they run as their owner and
-- would hand data to anon past RLS. anon ends with NO privilege at all on
-- tables / views in public (ALL revoked, incl. REFERENCES / TRIGGER).
--
-- Changes:
--  a) anon: ALL privileges (SELECT, INSERT, UPDATE, DELETE, TRUNCATE,
--     REFERENCES, TRIGGER) revoked on every table / view in public;
--     USAGE / SELECT / UPDATE revoked on every sequence in public.
--  b) authenticated: TRUNCATE revoked on every table (nothing else changes --
--     the 036/037 guards need UPDATE for row locks, the app needs its
--     SELECT/INSERT/UPDATE as today).
--  c) functions: EXECUTE revoked from anon. Postgres gives EXECUTE to PUBLIC
--     by default and anon inherits it, so revoking from anon alone would not
--     work: for every public function, authenticated and service_role first
--     get an EXPLICIT grant ONLY IF they can execute it today, then EXECUTE
--     is revoked from PUBLIC and anon. Net effect: authenticated /
--     service_role keep exactly the functions they have now (functions that
--     earlier migrations revoked from authenticated, e.g. assign_complaint_no,
--     stay revoked); anon loses all. Triggers are unaffected (EXECUTE is
--     checked when a trigger is created, not when it fires).
--  d) default privileges (role postgres, schema public): future tables /
--     views give anon nothing, future sequences nothing, future functions no
--     EXECUTE for anon / PUBLIC.
-- Storage (complaint-attachments bucket, private) is outside schema public
-- and not changed here.
--
-- STEP 1 -- pre-check (read-only). Save the outputs; STEP 3 compares.
-- a) table privileges per role (expect anon to have writes today):
--   select grantee, privilege_type, count(*) as tables
--   from information_schema.role_table_grants
--   where table_schema = 'public' and grantee in ('anon', 'authenticated')
--   group by 1, 2 order by 1, 2;
-- b) functions each role can execute today:
--   select count(*) filter (where has_function_privilege('anon', p.oid, 'execute')) as anon_exec,
--          count(*) filter (where has_function_privilege('authenticated', p.oid, 'execute')) as auth_exec,
--          count(*) filter (where has_function_privilege('service_role', p.oid, 'execute')) as service_exec,
--          count(*) as functions
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public';
-- c) the functions authenticated can NOT execute today (must be identical after):
--   select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public' and not has_function_privilege('authenticated', p.oid, 'execute') order by 1;
-- d) authenticated UPDATE on the lock targets (must stay true):
--   select t, has_table_privilege('authenticated', t, 'UPDATE')
--   from unnest(array['"customer orders"', '"production route card stages"', '"raw materials master"']) t;
--
-- STEP 2 -- the change.
-- =====================================================================

begin;

-- a) anon: nothing on tables / views (reads included -- see header), no sequence use
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

-- b) authenticated: no TRUNCATE (other privileges unchanged)
revoke truncate on all tables in schema public from authenticated;

-- c) functions: keep authenticated / service_role exactly as today, drop anon + PUBLIC
do $grants$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig,
           has_function_privilege('authenticated', p.oid, 'execute') as auth_ok,
           has_function_privilege('service_role', p.oid, 'execute') as service_ok
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind in ('f', 'p')
  loop
    if f.auth_ok then
      execute format('grant execute on function %s to authenticated', f.sig);
    end if;
    if f.service_ok then
      execute format('grant execute on function %s to service_role', f.sig);
    end if;
    execute format('revoke execute on function %s from public, anon', f.sig);
  end loop;
end
$grants$;

-- d) future objects created by postgres in public
alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke truncate on tables from authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon;
alter default privileges for role postgres in schema public revoke execute on functions from public, anon;
alter default privileges for role postgres in schema public grant execute on functions to authenticated, service_role;

commit;

notify pgrst, 'reload schema';

-- =====================================================================
-- STEP 3 -- verify (read-only):
-- 1. anon has NO privilege on any table / view / sequence in public, and
--    authenticated no TRUNCATE (expect 0 rows from each):
--   select grantee, privilege_type, count(*) from information_schema.role_table_grants
--   where table_schema = 'public'
--     and (grantee = 'anon' or (grantee = 'authenticated' and privilege_type = 'TRUNCATE'))
--   group by 1, 2;
--   select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
--   where n.nspname = 'public' and c.relkind = 'S'
--     and (has_sequence_privilege('anon', c.oid, 'USAGE') or has_sequence_privilege('anon', c.oid, 'SELECT'));
--   -- and the 13 non-security_invoker views are closed to anon (expect all false):
--   select c.relname, has_table_privilege('anon', c.oid, 'SELECT') as anon_select
--   from pg_class c join pg_namespace n on n.oid = c.relnamespace
--   where n.nspname = 'public' and c.relkind = 'v'
--     and not coalesce('security_invoker=true' = any(c.reloptions), false);
-- 2. Re-run STEP 1 b): expect anon_exec = 0; auth_exec and service_exec
--    EQUAL to the STEP 1 values.
-- 3. Re-run STEP 1 c): the same list as before (nothing newly granted).
-- 4. Re-run STEP 1 d): all true.
-- 5. Re-run STEP 1 a): authenticated SELECT / INSERT / UPDATE / DELETE counts
--    unchanged; only TRUNCATE gone. anon: no rows at all.
-- 6. In the app, reads (TEST logins): log in as operator and as supervisor,
--    open a few screens (lists load); signed out, the login page still works
--    (Auth only -- no table reads before login).
-- 7. In the app, ONE real save as the TEST supervisor -- proves writes, the
--    022 doc_no trigger, the 036 qty guard and an RPC (034 void_entry) still
--    work for authenticated:
--      Stores > Raw Material Receipt > New: Employee DEMO-OP03, material
--      "EN31 Round Bar Ø90 (DEMO-PLAUSIBLE)" (RM 002), Supplier NISHA, Shift A,
--      Qty 1, today -> Save -> expect the next GRN number (GRN-007 on the
--      demo data) in the list; then select it -> Void, reason
--      "039 post-check" -> expect it struck through with VOID.
--    Net stock effect 0 (voided rows are left out of the balances). If the
--    save or the void is refused with 42501 / "permission denied", roll back
--    with the grants above and report the message.
-- Rollback (only if something breaks): grant the revoked privileges back,
--   e.g. grant execute on all functions in schema public to anon;  -- not recommended
-- =====================================================================
