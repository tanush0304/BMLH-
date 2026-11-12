-- =====================================================================
-- 049_reopen_stage.sql                                 written 2026-11-12
-- Reopen a Completed stage (Completed -> Pending), supervisor / admin, with
-- a reason, only while nothing downstream depends on it.
--
-- App flow (Job Route Card, "Reopen" on a Completed row): the app calls
-- stage_reopen_blockers(stage_id) first and shows what blocks it; else it
-- updates the stage { status: 'Pending', reopen_reason }. This file:
--
--   * "production route card stages": reopened_by uuid, reopened_at
--     timestamptz, reopen_reason text = the LATEST reopen (trigger-owned for
--     app callers).
--   * "production stage reopens": one row per reopen (history; no FK to the
--     stage so cancelling a PRD later never trips over it). App users may
--     read it; rows are written only by the reopen trigger.
--   * stage_reopen_blockers(stage_id) -> text[] (invoker, stable; '{}' =
--     can reopen). Blocks when:
--       - the stage is not Completed;
--       - the NEXT stage (next seq of the PRD) has production logs, a DC
--         that isn't voided, WIP issued into it, or is not Pending;
--       - WIP was received FROM this stage;
--       - this is the LAST stage and the PRD has an FG receipt (not voided).
--   * trg_stage_reopen (BEFORE INSERT / UPDATE on stages, app callers only):
--       Completed -> anything else: must be Pending, reason required, the
--       blockers re-checked (23514 "Can't reopen this stage: ..."); clears
--       actual_date, stamps reopened_by = auth.uid(), reopened_at = now().
--       Any other insert / update: reopen columns can't be set or changed.
--     Role: 047's trg_stage_complete_supervisor already refuses non-
--     supervisors leaving Completed (42501); it fires first (name order).
--   * trg_stage_reopen_history (AFTER UPDATE): Completed -> not Completed
--     adds a history row (also for a change made in the SQL editor, reason
--     "(changed outside the app)").
--
-- No security definer. is_app_caller() bypass (SQL editor / service role),
-- as 026-047. 031's trg_stage_finished_refresh_next is untouched: the next
-- stage must be untouched (no DC, Pending) to reopen, so nothing changes there.
--
-- Every statement stands alone (Supabase SQL editor commits each one): no
-- temp tables, no session state, no begin/commit. Re-runnable.
-- Frontend: the Reopen button stays hidden until this is run (probe on
-- reopened_at; one expected 400 in the console before).
-- Run PREVIEW alone first, then CHANGE, then VERIFICATION.
-- =====================================================================


-- ---------------------------------------------------------------- PREVIEW
-- P1. Helpers this relies on (expect 2 rows: is_app_caller, is_app_supervisor).
select proname from pg_proc
where proname in ('is_app_caller', 'is_app_supervisor') and pronamespace = 'public'::regnamespace
order by 1;

-- P2. 047's guard is there (expect trg_stage_complete_supervisor BEFORE INSERT, UPDATE).
select trigger_name, action_timing, string_agg(event_manipulation, ', ' order by event_manipulation) as events
from information_schema.triggers
where event_object_table = 'production route card stages'
group by 1, 2 order by 1;

-- P3. Stage status mix + Completed stages that could be reopened (blockers
--     are computed after CHANGE -- see VERIFICATION V5).
select status, count(*) from public."production route card stages" group by 1 order by 1;

-- P4. Column names / types this file uses (expect 7 rows).
select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and ((table_name = 'production route card stages' and column_name in ('status', 'actual_date', 'seq'))
    or (table_name = 'wip transactions' and column_name in ('nature_of_operation_stage_id', 'target_stage_id'))
    or (table_name = 'job order dispatch' and column_name = 'voided_at')
    or (table_name = 'finished goods transactions' and column_name = 'voided_at'))
order by 1, 2;


-- ----------------------------------------------------------------- CHANGE
-- 1. Latest-reopen columns on the stage.
alter table public."production route card stages"
  add column if not exists reopened_by   uuid,
  add column if not exists reopened_at   timestamptz,
  add column if not exists reopen_reason text;

-- 2. History table.
create table if not exists public."production stage reopens" (
  id                   bigint generated always as identity primary key,
  stage_id             bigint      not null,
  prd_no               text        not null,
  seq                  integer,
  operation            text,
  reopened_by          uuid,
  reopened_at          timestamptz not null default now(),
  reason               text        not null,
  previous_actual_date date
);

create index if not exists production_stage_reopens_stage_idx
  on public."production stage reopens" (stage_id, reopened_at desc);

-- 3. Grants + RLS on the history (Supabase gives new tables to anon /
--    authenticated by default -- take that back, then grant only what the
--    trigger needs: the app reads, the reopen trigger inserts as the caller).
revoke all on table public."production stage reopens" from public, anon, authenticated;

grant select, insert on table public."production stage reopens" to authenticated;

grant all on table public."production stage reopens" to service_role;

alter table public."production stage reopens" enable row level security;

drop policy if exists "stage reopens read" on public."production stage reopens";

create policy "stage reopens read" on public."production stage reopens"
  for select to authenticated using (true);

drop policy if exists "stage reopens insert by trigger" on public."production stage reopens";

create policy "stage reopens insert by trigger" on public."production stage reopens"
  for insert to authenticated with check (true);  -- direct inserts refused by trg_stage_reopens_insert_guard

do $$
begin
  execute format('revoke all on sequence %s from public, anon', pg_get_serial_sequence('public."production stage reopens"', 'id'));
  execute format('grant usage, select on sequence %s to authenticated, service_role', pg_get_serial_sequence('public."production stage reopens"', 'id'));
end;
$$;

-- 4. History rows only from the reopen trigger (pg_trigger_depth() >= 2:
--    stages AFTER trigger -> this BEFORE INSERT trigger).
create or replace function public.guard_stage_reopens_insert() returns trigger
language plpgsql set search_path = public as $$  -- invoker
begin
  if is_app_caller() and pg_trigger_depth() < 2 then
    raise exception 'Reopen history is written by the reopen itself.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_stage_reopens_insert_guard on public."production stage reopens";

create trigger trg_stage_reopens_insert_guard
  before insert on public."production stage reopens"
  for each row execute function public.guard_stage_reopens_insert();

-- 5. What blocks a reopen ('{}' = nothing). Used by the app (RPC) and the trigger.
create or replace function public.stage_reopen_blockers(p_stage_id bigint) returns text[]
language plpgsql stable set search_path = public as $$  -- invoker: base-table RLS applies
declare
  v_stage "production route card stages";
  v_next  "production route card stages";
  v_label text;
  v_list  text;
  v_out   text[] := '{}';
begin
  select * into v_stage from "production route card stages" where id = p_stage_id;
  if not found then
    return array['Stage not found.'];
  end if;
  if v_stage.status is distinct from 'Completed' then
    v_out := v_out || format('the stage is %s, not Completed', coalesce(v_stage.status, 'blank'));
  end if;

  select * into v_next from "production route card stages"
  where prd_no = v_stage.prd_no and seq > v_stage.seq
  order by seq, id limit 1;

  if found then
    -- "Stage N – operation": N = route position (distinct seqs up to it), as the app shows it
    v_label := format('Stage %s – %s',
      (select count(distinct s.seq) from "production route card stages" s where s.prd_no = v_next.prd_no and s.seq <= v_next.seq),
      coalesce(v_next.operation, ''));

    select string_agg('#' || id, ', ' order by id) into v_list from "production logs" where stage_id = v_next.id;
    if v_list is not null then
      v_out := v_out || format('%s has production logs (log %s)', v_label, v_list);
    end if;

    select string_agg(dc_no, ', ' order by dc_no) into v_list
    from "job order dispatch" where stage_id = v_next.id and voided_at is null;
    if v_list is not null then
      v_out := v_out || format('%s has jobwork DCs (%s)', v_label, v_list);
    end if;

    select string_agg(coalesce(doc_no, '#' || id), ', ' order by id) into v_list
    from "wip transactions" where transaction_type = 'Issue' and target_stage_id = v_next.id;
    if v_list is not null then
      v_out := v_out || format('WIP was issued into %s (%s)', v_label, v_list);
    end if;

    if v_next.status is distinct from 'Pending' then
      v_out := v_out || format('%s is already %s', v_label, coalesce(v_next.status, 'blank'));
    end if;
  else
    -- last stage: FG received for the PRD depends on it
    select string_agg(coalesce(doc_no, '#' || id), ', ' order by id) into v_list
    from "finished goods transactions"
    where prd_no = v_stage.prd_no and transaction_type = 'Production Receipt' and voided_at is null;
    if v_list is not null then
      v_out := v_out || format('FG was received for %s (%s)', v_stage.prd_no, v_list);
    end if;
  end if;

  select string_agg(coalesce(doc_no, '#' || id), ', ' order by id) into v_list
  from "wip transactions" where transaction_type = 'Receipt' and nature_of_operation_stage_id = v_stage.id;
  if v_list is not null then
    v_out := v_out || format('WIP was received from this stage (%s)', v_list);
  end if;

  return v_out;
end;
$$;

revoke all on function public.stage_reopen_blockers(bigint) from public, anon;

grant execute on function public.stage_reopen_blockers(bigint) to authenticated, service_role;

-- 6. Reopen guard + stamps (BEFORE INSERT / UPDATE).
create or replace function public.guard_stage_reopen() returns trigger
language plpgsql set search_path = public as $$  -- invoker (is_app_caller needs current_user)
declare
  v_blockers text[];
begin
  if not is_app_caller() then
    return new;  -- SQL editor / service role
  end if;
  if tg_op = 'INSERT' then
    new.reopened_by := null;
    new.reopened_at := null;
    new.reopen_reason := null;
    return new;
  end if;

  if old.status = 'Completed' and new.status is distinct from 'Completed' then
    -- 047 (fires first) has already refused non-supervisors.
    if new.status is distinct from 'Pending' then
      raise exception 'A completed stage can only be reopened to Pending.' using errcode = '23514';
    end if;
    if nullif(btrim(coalesce(new.reopen_reason, '')), '') is null then
      raise exception 'Enter a reason to reopen the stage.' using errcode = '23514';
    end if;
    v_blockers := stage_reopen_blockers(old.id);  -- the table still holds OLD here
    if cardinality(v_blockers) > 0 then
      raise exception 'Can''t reopen this stage: %.', array_to_string(v_blockers, '; ') using errcode = '23514';
    end if;
    new.reopen_reason := btrim(new.reopen_reason);
    new.actual_date := null;
    new.reopened_by := auth.uid();
    new.reopened_at := now();
    return new;
  end if;

  -- any other update: the reopen columns are trigger-owned
  new.reopened_by := old.reopened_by;
  new.reopened_at := old.reopened_at;
  new.reopen_reason := old.reopen_reason;
  return new;
end;
$$;

revoke all on function public.guard_stage_reopen() from public, anon;

drop trigger if exists trg_stage_reopen on public."production route card stages";

create trigger trg_stage_reopen
  before insert or update on public."production route card stages"
  for each row execute function public.guard_stage_reopen();

-- 7. History row on every reopen (AFTER UPDATE).
create or replace function public.log_stage_reopen() returns trigger
language plpgsql set search_path = public as $$  -- invoker
begin
  if old.status = 'Completed' and new.status is distinct from 'Completed' then
    insert into "production stage reopens" (stage_id, prd_no, seq, operation, reopened_by, reopened_at, reason, previous_actual_date)
    values (
      new.id, new.prd_no, new.seq, new.operation,
      coalesce(new.reopened_by, auth.uid()),
      coalesce(new.reopened_at, now()),
      case when new.reopened_at is distinct from old.reopened_at and nullif(btrim(coalesce(new.reopen_reason, '')), '') is not null
           then new.reopen_reason else '(changed outside the app)' end,
      old.actual_date
    );
  end if;
  return null;
end;
$$;

revoke all on function public.log_stage_reopen() from public, anon;

drop trigger if exists trg_stage_reopen_history on public."production route card stages";

create trigger trg_stage_reopen_history
  after update on public."production route card stages"
  for each row execute function public.log_stage_reopen();

notify pgrst, 'reload schema';


-- ----------------------------------------------------------- VERIFICATION
-- V1. Triggers on stages: expect trg_stage_complete_supervisor (BEFORE INSERT, UPDATE),
--     trg_stage_reopen (BEFORE INSERT, UPDATE), trg_stage_reopen_history (AFTER UPDATE),
--     031's trg_stage_finished_refresh_next still there.
select trigger_name, action_timing, string_agg(event_manipulation, ', ' order by event_manipulation) as events
from information_schema.triggers
where event_object_table in ('production route card stages', 'production stage reopens')
group by 1, 2 order by 1;

-- V2. New columns (expect 3) + history table columns (expect 9).
select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and ((table_name = 'production route card stages' and column_name in ('reopened_by', 'reopened_at', 'reopen_reason'))
    or table_name = 'production stage reopens')
order by 1, ordinal_position;

-- V3. Functions are invoker (prosecdef = false); anon can't execute.
select p.proname, p.prosecdef, has_function_privilege('anon', p.oid, 'EXECUTE') as anon_exec,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_exec
from pg_proc p
where p.pronamespace = 'public'::regnamespace
  and p.proname in ('stage_reopen_blockers', 'guard_stage_reopen', 'log_stage_reopen', 'guard_stage_reopens_insert')
order by 1;

-- V4. History grants: authenticated SELECT + INSERT only; anon nothing. RLS on.
select grantee, string_agg(privilege_type, ', ' order by privilege_type) as privileges
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'production stage reopens' and grantee in ('anon', 'authenticated')
group by 1 order by 1;
select relrowsecurity from pg_class where oid = 'public."production stage reopens"'::regclass;

-- V5. Read-only dry run: blockers for every Completed stage today.
select s.prd_no, s.seq, s.operation, public.stage_reopen_blockers(s.id) as blockers
from public."production route card stages" s
where s.status = 'Completed'
order by s.prd_no, s.seq;

-- V6. Nothing changed in the data: same status counts as P3; history empty.
select status, count(*) from public."production route card stages" group by 1 order by 1;
select count(*) as reopen_rows from public."production stage reopens";

-- V7. Behaviour (in the app, TEST data -- the SQL editor bypasses the guard):
--     supervisor reopens a Completed stage whose next stage is untouched ->
--     Pending, date cleared, "Reopened by ..." on the card, 1 history row;
--     next stage has a log -> 23514 "Can't reopen this stage: Stage 3 – ...
--     has production logs (log #..)."; operator via API -> 42501 (047);
--     direct API insert into the history -> 42501.


-- ------------------------------------------------------------ ROLLBACK
-- (only if needed; the history table holds the reopen record -- export first)
--   drop trigger if exists trg_stage_reopen_history on public."production route card stages";
--   drop trigger if exists trg_stage_reopen on public."production route card stages";
--   drop function if exists public.log_stage_reopen();
--   drop function if exists public.guard_stage_reopen();
--   drop function if exists public.stage_reopen_blockers(bigint);
--   drop table if exists public."production stage reopens";
--   drop function if exists public.guard_stage_reopens_insert();
--   alter table public."production route card stages"
--     drop column if exists reopened_by, drop column if exists reopened_at, drop column if exists reopen_reason;
--   notify pgrst, 'reload schema';
