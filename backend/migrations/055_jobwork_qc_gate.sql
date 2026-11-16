-- 055_jobwork_qc_gate.sql
-- Quality gate after jobwork: material back from an outsourced stage must pass
-- an incoming quality inspection before the NEXT stage goes ahead.
--
-- Rule (per receipt): every receipt (JR) of a non-void DC of the jobwork stage
-- needs its own inspection ("quality logs".receipt_id, 054) whose LATEST result
-- is Accepted ("report quality inspections".inspection_result), or a supervisor
-- override. Partial receipts / several DCs: each receipt on its own. Closed
-- short: the short part has no receipt, so nothing to inspect. Latest Rejected
-- (or no inspection) blocks; a new Accepted inspection or an override clears it.
-- The stage checked is the one right before the target (max seq < target seq,
-- every Outsourced stage at that seq).
--
--   1. "app settings" keys (051 table):
--        jobwork_qc_gate_mode  'on' / 'off'   -- seeded 'off'; missing / anything else = off
--        jobwork_qc_gate_from  timestamptz text -- seeded now() at the first run; receipts
--                                              created BEFORE it are grandfathered;
--                                              missing / unreadable = every receipt checked
--      guard_app_settings (051) is re-created with its 051 body unchanged plus
--      value checks for these two keys (app callers only; the SQL editor can
--      set anything). Change them in the SQL editor:
--        update public."app settings" set value = 'on' where key = 'jobwork_qc_gate_mode';
--   2. Table "jobwork qc overrides" (id, receipt_id, reason, overridden_by,
--      overridden_at): RLS on, authenticated SELECT + INSERT only (insert:
--      supervisor / admin), nothing for anon, no update / delete.
--      trg_jobwork_qc_override_guard stamps who / when, trims + requires the
--      reason, refuses non-supervisors (42501).
--   3. jobwork_qc_receipt_blockers(jobwork_stage_id, target_stage_id) text[] and
--      jobwork_qc_blockers(target_stage_id) text[]: invoker, stable, one
--      message per blocking receipt, e.g.
--        "PRD-012: Toughening (DC-008, JR-008) was received on 15-11-2026 but has
--         no quality inspection yet. Ask Quality to inspect it before starting Stage 5."
--      Stage N = the stage's position (distinct seqs up to it), as on screen.
--   4. BEFORE INSERT triggers (guard_jobwork_qc_gate, invoker, is_app_caller()
--      bypass, 23514 with the messages joined):
--        "production logs"     -> stage_id               (Data Entry + Manual Ops Start)
--        "job order dispatch"  -> stage_id               (a DC for the next stage)
--        "wip transactions"    -> Issue: target_stage_id, plus the source stage
--                                 when it is itself a jobwork stage further back
--      Inserts only: resuming / editing existing rows is never blocked.
--
-- JS twin: frontend/src/utils/jobworkQc.js (qcBlockers) -- change both together.
-- No security definer anywhere. EXECUTE revoked from public and anon.
-- Needs 026 is_app_caller, 028 is_app_supervisor, 029 view, 051 "app settings",
-- 054. Every statement stands alone (no begin/commit, no temp tables).
-- Re-runnable: the seed never overwrites existing values.
-- The frontend hides the gate, the Pending incoming QC panel and the bell
-- source until this is run (probe on "jobwork qc overrides").
-- Run PREVIEW first, then CHANGE top to bottom, then VERIFICATION.

-- ---------------------------------------------------------------- PREVIEW
-- P1. Prerequisites: expect 3 functions, "app settings" present, 054 run (receipt_id).
select proname from pg_proc
where pronamespace = 'public'::regnamespace and proname in ('is_app_caller', 'is_app_supervisor', 'guard_app_settings')
order by 1;
select table_name from information_schema.tables where table_schema = 'public' and table_name = 'app settings';
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'quality logs' and column_name = 'receipt_id';

-- P2. Not run yet? (0 rows on the first run)
select table_name from information_schema.tables where table_schema = 'public' and table_name = 'jobwork qc overrides';
select key, value from public."app settings" where key like 'jobwork_qc_gate_%';

-- P3. The functions are invoker: operators must be able to READ these, or the
--     gate can't see the receipts for them. Expect SELECT for authenticated on
--     each, and an RLS select policy (or RLS off) that lets every app user read.
select table_name, string_agg(privilege_type, ', ' order by privilege_type) as authenticated_privileges
from information_schema.role_table_grants
where table_schema = 'public' and grantee = 'authenticated'
  and table_name in ('job order receipt', 'job order dispatch', 'production route card stages', 'quality logs',
                     'quality log readings', 'quality master', 'report quality inspections', 'app settings')
  and privilege_type = 'SELECT'
group by 1 order by 1;
select c.relname, c.relrowsecurity,
       (select string_agg(p.policyname || ' (' || p.cmd || ')', '; ') from pg_policies p
        where p.schemaname = 'public' and p.tablename = c.relname) as policies
from pg_class c
where c.relnamespace = 'public'::regnamespace
  and c.relname in ('job order receipt', 'job order dispatch', 'production route card stages', 'quality logs', 'app settings')
order by 1;

-- P4. Existing receipts (all would be grandfathered by jobwork_qc_gate_from = run time):
--     one row per receipt, its jobwork stage, the next stage and what has already
--     happened there. Without grandfathering every row with activity would freeze.
select d.prd_no, js.seq as jobwork_seq, js.operation as jobwork_stage, d.dc_no, r.receipt_no,
       r.qty_received, r.receipt_date, r.created_at,
       ns.seq as next_seq, ns.operation as next_stage,
       (select count(*) from public."production logs" l where l.stage_id = ns.id) as next_logs,
       (select count(*) from public."job order dispatch" x where x.stage_id = ns.id and x.voided_at is null) as next_dcs,
       (select count(*) from public."quality logs" q where q.receipt_id = r.id) as inspections
from public."job order receipt" r
join public."job order dispatch" d on d.dc_no = r.dc_no and d.voided_at is null
join public."production route card stages" js on js.id = d.stage_id
left join lateral (
  select s.* from public."production route card stages" s
  where s.prd_no = js.prd_no and s.seq > js.seq order by s.seq, s.id limit 1
) ns on true
order by d.prd_no, js.seq, r.receipt_no;

-- P5. Triggers on the 3 gated tables today (names must not clash).
select tgrelid::regclass as table_name, tgname from pg_trigger
where tgrelid in ('public."production logs"'::regclass, 'public."job order dispatch"'::regclass, 'public."wip transactions"'::regclass)
  and not tgisinternal
order by 1, 2;

-- ----------------------------------------------------------------- CHANGE
-- 1. "app settings": value checks for the two new keys (051 body unchanged above them)
create or replace function public.guard_app_settings() returns trigger
language plpgsql set search_path = public as $$  -- invoker
begin
  new.updated_at := now();
  if not is_app_caller() then
    return new;
  end if;
  new.updated_by := auth.uid();
  if tg_op = 'UPDATE' and new.key is distinct from old.key then
    raise exception 'A setting''s key can''t be changed.' using errcode = '23514';
  end if;
  if new.key = 'hour_qty_cap_mode' and new.value not in ('strict', 'supervisor_override', 'off') then
    raise exception 'Hourly cap mode must be strict, supervisor_override or off.' using errcode = '23514';
  end if;
  if new.key = 'hour_qty_cap_tolerance_pct' then
    -- regex first, cast only a valid number (no short-circuit guarantee in SQL)
    if new.value !~ '^[0-9]+(\.[0-9]+)?$' then
      raise exception 'Hourly cap tolerance must be a number from 0 to 100.' using errcode = '23514';
    end if;
    if new.value::numeric > 100 then
      raise exception 'Hourly cap tolerance must be a number from 0 to 100.' using errcode = '23514';
    end if;
  end if;
  -- 055
  if new.key = 'jobwork_qc_gate_mode' and new.value is distinct from 'on' and new.value is distinct from 'off' then
    raise exception 'Jobwork QC gate mode must be on or off.' using errcode = '23514';
  end if;
  if new.key = 'jobwork_qc_gate_from' then
    begin
      perform new.value::timestamptz;
    exception when others then
      raise exception 'Jobwork QC gate start must be a date and time, e.g. 2026-11-16 10:00+05:30.' using errcode = '23514';
    end;
  end if;
  return new;
end;
$$;

revoke all on function public.guard_app_settings() from public, anon;

insert into public."app settings" (key, value) values
  ('jobwork_qc_gate_mode', 'off'),
  ('jobwork_qc_gate_from', now()::text)
on conflict (key) do nothing;

-- 2. Overrides table
create table if not exists public."jobwork qc overrides" (
  id            bigint generated always as identity primary key,
  receipt_id    bigint not null references public."job order receipt"(id),
  reason        text not null check (btrim(reason) <> ''),
  overridden_by uuid default auth.uid(),
  overridden_at timestamptz not null default now()
);

create index if not exists jobwork_qc_overrides_receipt_idx on public."jobwork qc overrides" (receipt_id);

comment on table public."jobwork qc overrides" is
  'Supervisor / admin override of the incoming quality check for one jobwork receipt, with reason (055). Insert-only.';

revoke all on table public."jobwork qc overrides" from public, anon, authenticated;

grant select, insert on table public."jobwork qc overrides" to authenticated;

grant all on table public."jobwork qc overrides" to service_role;

alter table public."jobwork qc overrides" enable row level security;

drop policy if exists "jobwork qc overrides read" on public."jobwork qc overrides";

create policy "jobwork qc overrides read" on public."jobwork qc overrides"
  for select to authenticated using (true);

drop policy if exists "jobwork qc overrides supervisor insert" on public."jobwork qc overrides";

create policy "jobwork qc overrides supervisor insert" on public."jobwork qc overrides"
  for insert to authenticated with check (is_app_supervisor());

create or replace function public.guard_jobwork_qc_override() returns trigger
language plpgsql set search_path = public as $$  -- invoker
begin
  new.reason := btrim(coalesce(new.reason, ''));
  if new.reason = '' then
    raise exception 'A reason is required to override the incoming quality check.' using errcode = '23514';
  end if;
  if not is_app_caller() then
    return new;  -- SQL editor / service role
  end if;
  if not is_app_supervisor() then
    raise exception 'Only a supervisor or admin can override the incoming quality check.' using errcode = '42501';
  end if;
  new.overridden_by := auth.uid();
  new.overridden_at := now();
  return new;
end;
$$;

revoke all on function public.guard_jobwork_qc_override() from public, anon;

drop trigger if exists trg_jobwork_qc_override_guard on public."jobwork qc overrides";

create trigger trg_jobwork_qc_override_guard
  before insert on public."jobwork qc overrides"
  for each row execute function public.guard_jobwork_qc_override();

-- 3. Blockers
create or replace function public.jobwork_qc_receipt_blockers(p_jobwork_stage_id bigint, p_target_stage_id bigint)
returns text[]
language plpgsql stable set search_path = public as $$  -- invoker
declare
  v_mode     text;
  v_from_txt text;
  v_from     timestamptz;
  v_js       "production route card stages";
  v_target   "production route card stages";
  v_label    text := 'the next stage';
  v_out      text[] := '{}';
  v_res      text;
  v_date     date;
  r          record;
begin
  select value into v_mode from "app settings" where key = 'jobwork_qc_gate_mode';
  if v_mode is distinct from 'on' then
    return v_out;  -- missing / off / anything else = gate off
  end if;
  select value into v_from_txt from "app settings" where key = 'jobwork_qc_gate_from';
  begin
    v_from := v_from_txt::timestamptz;
  exception when others then
    v_from := null;  -- unreadable = every receipt checked
  end;

  select * into v_js from "production route card stages" where id = p_jobwork_stage_id;
  if not found or v_js.type is distinct from 'Outsourced' then
    return v_out;
  end if;
  select * into v_target from "production route card stages" where id = p_target_stage_id;
  if found then
    select 'Stage ' || count(distinct s.seq) into v_label
    from "production route card stages" s where s.prd_no = v_target.prd_no and s.seq <= v_target.seq;
  end if;

  for r in
    select rc.id, rc.receipt_no, rc.receipt_date, d.dc_no
    from "job order receipt" rc
    join "job order dispatch" d on d.dc_no = rc.dc_no
    where d.stage_id = v_js.id and d.voided_at is null
      and (v_from is null or rc.created_at >= v_from)
    order by rc.receipt_date, rc.id
  loop
    if exists (select 1 from "jobwork qc overrides" o where o.receipt_id = r.id) then
      continue;
    end if;
    v_res := null;
    v_date := null;
    select ri.inspection_result, q.log_date into v_res, v_date
    from "quality logs" q
    join "report quality inspections" ri on ri.quality_log_id = q.id
    where q.receipt_id = r.id
    order by q.log_date desc, q.id desc
    limit 1;
    if v_res = 'Accepted' then
      continue;
    end if;
    if v_res = 'Rejected' then
      v_out := v_out || format('%s: %s (%s, %s) received on %s was Rejected at inspection on %s. Ask Quality to re-inspect it, or a supervisor to override, before starting %s.',
        v_js.prd_no, v_js.operation, r.dc_no, r.receipt_no, to_char(r.receipt_date, 'DD-MM-YYYY'), to_char(v_date, 'DD-MM-YYYY'), v_label);
    else
      v_out := v_out || format('%s: %s (%s, %s) was received on %s but has no quality inspection yet. Ask Quality to inspect it before starting %s.',
        v_js.prd_no, v_js.operation, r.dc_no, r.receipt_no, to_char(r.receipt_date, 'DD-MM-YYYY'), v_label);
    end if;
  end loop;
  return v_out;
end;
$$;

revoke all on function public.jobwork_qc_receipt_blockers(bigint, bigint) from public, anon;

grant execute on function public.jobwork_qc_receipt_blockers(bigint, bigint) to authenticated, service_role;

create or replace function public.jobwork_qc_blockers(p_stage_id bigint)
returns text[]
language plpgsql stable set search_path = public as $$  -- invoker
declare
  v_t    "production route card stages";
  v_prev integer;
  v_out  text[] := '{}';
  s      record;
begin
  select * into v_t from "production route card stages" where id = p_stage_id;
  if not found then
    return v_out;
  end if;
  select max(seq) into v_prev from "production route card stages" where prd_no = v_t.prd_no and seq < v_t.seq;
  if v_prev is null then
    return v_out;  -- first stage
  end if;
  for s in
    select id from "production route card stages"
    where prd_no = v_t.prd_no and seq = v_prev and type = 'Outsourced'
    order by id
  loop
    v_out := v_out || jobwork_qc_receipt_blockers(s.id, p_stage_id);
  end loop;
  return v_out;
end;
$$;

revoke all on function public.jobwork_qc_blockers(bigint) from public, anon;

grant execute on function public.jobwork_qc_blockers(bigint) to authenticated, service_role;

-- 4. Gate triggers (one function, three tables; columns read through to_jsonb so
--    each table only needs its own columns)
create or replace function public.guard_jobwork_qc_gate() returns trigger
language plpgsql set search_path = public as $$  -- invoker
declare
  v_row      jsonb := to_jsonb(new);
  v_target   bigint;
  v_source   bigint;
  v_tgt_seq  integer;
  v_src_seq  integer;
  v_prev     integer;
  v_prd      text;
  v_out      text[];
begin
  if not is_app_caller() then
    return new;  -- SQL editor / service role / definer RPCs
  end if;
  if tg_table_name = 'wip transactions' then
    if v_row->>'transaction_type' is distinct from 'Issue' or v_row->>'target_stage_id' is null then
      return new;
    end if;
    v_target := (v_row->>'target_stage_id')::bigint;
  else
    if v_row->>'stage_id' is null then
      return new;
    end if;
    v_target := (v_row->>'stage_id')::bigint;
  end if;

  v_out := jobwork_qc_blockers(v_target);

  -- WIP Issue straight from a jobwork stage's WIP to a later (not the next) stage
  if tg_table_name = 'wip transactions' and v_row->>'nature_of_operation_stage_id' is not null then
    v_source := (v_row->>'nature_of_operation_stage_id')::bigint;
    select prd_no, seq into v_prd, v_tgt_seq from "production route card stages" where id = v_target;
    select seq into v_src_seq from "production route card stages" where id = v_source;
    select max(seq) into v_prev from "production route card stages" where prd_no = v_prd and seq < v_tgt_seq;
    if v_src_seq is distinct from v_prev then
      v_out := v_out || jobwork_qc_receipt_blockers(v_source, v_target);
    end if;
  end if;

  if cardinality(v_out) > 0 then
    raise exception '%', array_to_string(v_out, ' ') using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_jobwork_qc_gate() from public, anon;

drop trigger if exists trg_production_logs_jobwork_qc_gate on public."production logs";

create trigger trg_production_logs_jobwork_qc_gate
  before insert on public."production logs"
  for each row execute function public.guard_jobwork_qc_gate();

drop trigger if exists trg_job_order_dispatch_jobwork_qc_gate on public."job order dispatch";

create trigger trg_job_order_dispatch_jobwork_qc_gate
  before insert on public."job order dispatch"
  for each row execute function public.guard_jobwork_qc_gate();

drop trigger if exists trg_wip_transactions_jobwork_qc_gate on public."wip transactions";

create trigger trg_wip_transactions_jobwork_qc_gate
  before insert on public."wip transactions"
  for each row execute function public.guard_jobwork_qc_gate();

notify pgrst, 'reload schema';

-- ----------------------------------------------------------- VERIFICATION
-- 1. Settings: jobwork_qc_gate_mode = off, jobwork_qc_gate_from = the run time
--    (hour_qty_cap_* rows unchanged).
select key, value, updated_at from public."app settings" order by key;

-- 2. Overrides table: RLS true; policies "... read" (SELECT) + "... supervisor insert"
--    (INSERT); authenticated INSERT, SELECT only; nothing for anon (0 rows).
select relrowsecurity from pg_class where oid = 'public."jobwork qc overrides"'::regclass;
select policyname, cmd from pg_policies where schemaname = 'public' and tablename = 'jobwork qc overrides' order by 1;
select grantee, string_agg(privilege_type, ', ' order by privilege_type) as privileges
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'jobwork qc overrides' and grantee in ('anon', 'authenticated', 'public')
group by 1 order by 1;

-- 3. Functions: none security definer (prosecdef false); proacl has no anon and
--    no "=X" (public) entry; the two blockers functions stable (provolatile s).
select proname, prosecdef, provolatile, proacl from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in ('guard_app_settings', 'guard_jobwork_qc_override', 'jobwork_qc_receipt_blockers',
                  'jobwork_qc_blockers', 'guard_jobwork_qc_gate')
order by 1;

-- 4. Triggers: 4 rows.
select tgrelid::regclass as table_name, tgname from pg_trigger
where tgname in ('trg_jobwork_qc_override_guard', 'trg_production_logs_jobwork_qc_gate',
                 'trg_job_order_dispatch_jobwork_qc_gate', 'trg_wip_transactions_jobwork_qc_gate')
order by 1;

-- 5. Mode off -> no stage blocked (expect 0 rows).
select s.prd_no, s.seq, s.operation, jobwork_qc_blockers(s.id) as blockers
from public."production route card stages" s
where cardinality(jobwork_qc_blockers(s.id)) > 0;

-- 6. Receipts the gate would check once it is on (created at / after
--    jobwork_qc_gate_from). Expect 0 on the run day: every receipt from P4 is
--    grandfathered.
select r.receipt_no, r.dc_no, r.created_at
from public."job order receipt" r,
     (select value::timestamptz as gate_from from public."app settings" where key = 'jobwork_qc_gate_from') g
where r.created_at >= g.gate_from;

-- 7. After switching on (optional, in the SQL editor):
--      update public."app settings" set value = 'on' where key = 'jobwork_qc_gate_mode';
--    re-run 5 -> still 0 rows until a new receipt arrives.

-- --------------------------------------------------------------- ROLLBACK
-- Run only to undo 055 (054 stays). The overrides history is lost.
--
-- drop trigger if exists trg_production_logs_jobwork_qc_gate on public."production logs";
-- drop trigger if exists trg_job_order_dispatch_jobwork_qc_gate on public."job order dispatch";
-- drop trigger if exists trg_wip_transactions_jobwork_qc_gate on public."wip transactions";
-- drop function if exists public.guard_jobwork_qc_gate();
-- drop function if exists public.jobwork_qc_blockers(bigint);
-- drop function if exists public.jobwork_qc_receipt_blockers(bigint, bigint);
-- drop trigger if exists trg_jobwork_qc_override_guard on public."jobwork qc overrides";
-- drop function if exists public.guard_jobwork_qc_override();
-- drop table if exists public."jobwork qc overrides";
-- delete from public."app settings" where key in ('jobwork_qc_gate_mode', 'jobwork_qc_gate_from');
-- (guard_app_settings: re-run 051's definition to drop the two 055 checks; harmless to keep)
-- notify pgrst, 'reload schema';
