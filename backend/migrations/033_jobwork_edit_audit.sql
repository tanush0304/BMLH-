-- =====================================================================
-- 033 -- supervisor/admin edits on Jobwork Dispatch + Receipt, with an
-- audit trail (same idea as 025 / 032).  NOT RUN.
--
--   table                  editable                         locked
--   "job order dispatch"   qty, dispatch_date, vendor_id    every other column (dc_no, prd_no,
--                          (vendor only while nothing        stage_id, job_work_code, created_at,
--                          has been received)                closed_short_*, ...)
--                          expected_receipt_date is derived: dispatch_date + "job work master".lead_time_days
--   "job order receipt"    qty_received, receipt_date       every other column (receipt_no, dc_no, created_at, ...)
--
-- Rules
--   * App callers (authenticated/anon) must be supervisor/admin (42501).
--     SQL editor / dashboard / service_role skip every check (026 is_app_caller()).
--   * Only OPEN DCs (Sent / Partially Received) -- Received or Closed Short
--     refuse (42501). A receipt is editable only while its DC is open.
--     A DC never reopens (031 guard unchanged).
--   * Dispatch qty:  > 0, >= received on the DC, <= stage_dispatch_remaining
--     (stage) + this DC's current qty  (23514). The stage row is locked, as in
--     the 031 insert guard, so a concurrent new DC cannot slip past.
--   * Receipt qty:   > 0, <= DC balance + this receipt's current qty (23514).
--   * Dates: dispatch date may not be after the DC's first receipt; a receipt
--     date may not be before the DC's dispatch date (23514).
--   * Lowering a receipt may not take back pieces the NEXT stage has already
--     drawn (its stage_dispatch_remaining must cover the decrease) (23514).
--     The last stage has no DB check here: FG Receipt ceilings are still
--     frontend-only (open item 2).
--   * An edit that makes a DC fully received (dispatch qty lowered to the
--     received qty, or a receipt raised to the balance) closes the DC
--     (is_open = false -> "job order status" = Received) and runs
--     refresh_outsourced_stage, as create_job_order_receipt does.
--   * edited_by / edited_at / previous_qty are trigger-owned: stamped on an
--     edit, null on insert. On a non-edit update a dispatch may change only
--     is_open / closed_short_* (anything else 42501); a receipt keeps them.
--     previous_qty = qty just before the LATEST qty change.
--   * Non-edit updates (receipt RPC / close-short setting is_open and
--     closed_short_*) still go through the 031 guard, unchanged, for every role.
--   * No DELETE grants.
--
-- =====================================================================
-- STEP 1 -- pre-checks. Run on its own; send me the output.
--
-- 1a. Columns of both tables (I need every column name: anything not in
--     the editable list above is locked):
--   select table_name, column_name, data_type, is_nullable, column_default
--   from information_schema.columns
--   where table_schema = 'public' and table_name in ('job order dispatch', 'job order receipt', 'job work master')
--   order by table_name, ordinal_position;
--   Expect: dispatch has qty, dispatch_date, vendor_id, expected_receipt_date,
--   stage_id, is_open, closed_short_*; receipt has qty_received, receipt_date,
--   dc_no, receipt_no; job work master has job_work_code, lead_time_days
--   (integer). None of edited_by / edited_at / previous_qty yet. qty /
--   qty_received numeric or integer (previous_qty below is numeric).
--
-- 1b. Grants:
--   select table_name, grantee, privilege_type
--   from information_schema.role_table_grants
--   where table_schema = 'public' and grantee in ('anon', 'authenticated')
--     and table_name in ('job order dispatch', 'job order receipt')
--   order by 1, 2, 3;
--   select table_name, grantee, column_name, privilege_type
--   from information_schema.column_privileges
--   where table_schema = 'public' and grantee in ('anon', 'authenticated')
--     and table_name = 'job order receipt' and privilege_type = 'UPDATE';
--   Expect: authenticated UPDATE on dispatch; no UPDATE on receipt; no DELETE on either.
--
-- 1c. RLS + policies:
--   select relname, relrowsecurity from pg_class
--   where relname in ('job order dispatch', 'job order receipt');
--   select tablename, policyname, cmd, roles, qual, with_check from pg_policies
--   where tablename in ('job order dispatch', 'job order receipt');
--
-- 1d. Triggers (expect the 031 ones: dispatch insert + update guard,
--     receipt insert guard; none named *_edit_audit):
--   select event_object_table, trigger_name, action_timing, event_manipulation
--   from information_schema.triggers
--   where event_object_table in ('job order dispatch', 'job order receipt')
--   order by 1, 2;
--
-- 1e. Helpers exist (expect 5 rows):
--   select proname from pg_proc
--   where proname in ('is_app_caller', 'is_app_supervisor', 'is_app_admin',
--                     'stage_dispatch_remaining', 'refresh_outsourced_stage');
--
-- =====================================================================
-- STEP 2 -- the migration.

begin;

-- 1. Audit columns ------------------------------------------------------
alter table "job order dispatch"
  add column if not exists edited_by    uuid,
  add column if not exists edited_at    timestamptz,
  add column if not exists previous_qty numeric;

alter table "job order receipt"
  add column if not exists edited_by    uuid,
  add column if not exists edited_at    timestamptz,
  add column if not exists previous_qty numeric;

-- 2. Insert: audit columns always start empty --------------------------
create or replace function clear_jobwork_audit_on_insert() returns trigger
language plpgsql set search_path = public as $$
begin
  new.edited_by := null;
  new.edited_at := null;
  new.previous_qty := null;
  return new;
end;
$$;

drop trigger if exists trg_job_order_dispatch_audit_insert on "job order dispatch";
create trigger trg_job_order_dispatch_audit_insert
  before insert on "job order dispatch"
  for each row execute function clear_jobwork_audit_on_insert();

drop trigger if exists trg_job_order_receipt_audit_insert on "job order receipt";
create trigger trg_job_order_receipt_audit_insert
  before insert on "job order receipt"
  for each row execute function clear_jobwork_audit_on_insert();

-- 3. Dispatch edit guard --------------------------------------------------
-- Named *_edit_audit so it fires BEFORE 031's trg_job_order_dispatch_update_guard
-- (same-event BEFORE triggers run in name order); that guard still refuses
-- a reopen / closed-short change afterwards.
create or replace function guard_job_order_dispatch_edit() returns trigger
language plpgsql set search_path = public as $$  -- invoker (is_app_caller needs current_user)
declare
  v_editable constant text[] := array['qty', 'dispatch_date', 'vendor_id'];
  v_owned    constant text[] := array['edited_by', 'edited_at', 'previous_qty', 'expected_receipt_date'];
  -- Not-an-edit updates (receipt RPC / Close Short) may change only these;
  -- 031's guard checks them.
  v_closing  constant text[] := array['is_open', 'closed_short_at', 'closed_short_by', 'closed_short_reason'];
  v_old jsonb := to_jsonb(old);
  v_new jsonb := to_jsonb(new);
  v_is_edit boolean;
  v_key text;
  v_stage "production route card stages";
  v_received numeric;
  v_first_receipt date;
  v_max numeric;
  v_lead integer;
begin
  if not is_app_caller() then
    return new;
  end if;

  v_is_edit := (new.qty, new.dispatch_date, new.vendor_id)
               is distinct from (old.qty, old.dispatch_date, old.vendor_id);

  -- Locked columns, checked for every app update before anything else.
  --   edit:     editable + trigger-owned (overwritten below); is_open locked
  --             (the trigger decides it).
  --   not edit: only the closing columns; trigger-owned ones are refused too.
  for v_key in select jsonb_object_keys(v_new) loop
    if (v_new -> v_key) is distinct from (v_old -> v_key)
       and v_key <> all (case when v_is_edit then v_editable || v_owned else v_closing end) then
      raise exception '% cannot be changed on a saved dispatch', v_key using errcode = '42501';
    end if;
  end loop;

  if not v_is_edit then
    return new;
  end if;

  if not is_app_supervisor() then
    raise exception 'Only a supervisor or admin can edit a dispatch' using errcode = '42501';
  end if;

  if not old.is_open or old.closed_short_at is not null then
    raise exception 'DC % is closed (Received or Closed Short) and cannot be edited', old.dc_no
      using errcode = '42501';
  end if;

  -- Serialise with new DCs / receipts on the same stage.
  select * into v_stage from "production route card stages" where id = old.stage_id for update;
  if not found or v_stage.status <> 'Pending' then
    raise exception 'The stage of DC % is no longer pending', old.dc_no using errcode = '42501';
  end if;

  select coalesce(sum(qty_received), 0), min(receipt_date)
  into v_received, v_first_receipt
  from "job order receipt" where dc_no = old.dc_no;

  if new.vendor_id is distinct from old.vendor_id and v_received > 0 then
    raise exception 'Vendor cannot be changed: % pieces have already been received on DC %', v_received, old.dc_no
      using errcode = '23514';
  end if;

  if new.qty is null or new.qty <= 0 then
    raise exception 'Dispatch qty must be greater than 0' using errcode = '23514';
  end if;
  if new.qty < v_received then
    raise exception 'Dispatch qty (%) cannot be less than the qty already received on DC % (%)',
      new.qty, old.dc_no, v_received using errcode = '23514';
  end if;
  -- old.qty is still counted in stage_dispatch_remaining (BEFORE trigger).
  v_max := stage_dispatch_remaining(old.stage_id) + old.qty;
  if new.qty > v_max then
    raise exception 'Dispatch qty (%) is more than the qty available for this stage (max %)', new.qty, v_max
      using errcode = '23514';
  end if;

  if new.dispatch_date is null then
    raise exception 'Dispatch date is required' using errcode = '23514';
  end if;
  if v_first_receipt is not null and new.dispatch_date > v_first_receipt then
    raise exception 'Dispatch date cannot be after the first receipt on DC % (%)', old.dc_no, v_first_receipt
      using errcode = '23514';
  end if;

  -- Expected receipt date: recomputed from the Job Work Master lead time
  -- (same as the Dispatch screen: blank when no lead time).
  if new.dispatch_date is distinct from old.dispatch_date then
    select lead_time_days into v_lead from "job work master" where job_work_code = old.job_work_code;
    new.expected_receipt_date := case when coalesce(v_lead, 0) > 0 then new.dispatch_date + v_lead end;
  else
    new.expected_receipt_date := old.expected_receipt_date;
  end if;

  -- Lowered to exactly what has come back -> the DC is fully received.
  new.is_open := new.qty > v_received;

  new.edited_by := auth.uid();
  new.edited_at := now();
  new.previous_qty := case when new.qty is distinct from old.qty then old.qty else old.previous_qty end;
  return new;
end;
$$;

drop trigger if exists trg_job_order_dispatch_edit_audit on "job order dispatch";
create trigger trg_job_order_dispatch_edit_audit
  before update on "job order dispatch"
  for each row execute function guard_job_order_dispatch_edit();

-- A DC that closes (by an edit, a receipt edit, or the existing RPCs) ->
-- stage completion check. Harmless when the RPC already ran it.
create or replace function trg_job_order_dispatch_closed_refresh() returns trigger
language plpgsql set search_path = public as $$
begin
  perform refresh_outsourced_stage(new.stage_id);
  return null;
end;
$$;

drop trigger if exists trg_job_order_dispatch_closed_refresh on "job order dispatch";
create trigger trg_job_order_dispatch_closed_refresh
  after update of is_open on "job order dispatch"
  for each row
  when (old.is_open and not new.is_open)
  execute function trg_job_order_dispatch_closed_refresh();

-- 4. Receipt edit guard ---------------------------------------------------
create or replace function guard_job_order_receipt_edit() returns trigger
language plpgsql set search_path = public as $$  -- invoker
declare
  v_editable constant text[] := array['qty_received', 'receipt_date'];
  v_owned    constant text[] := array['edited_by', 'edited_at', 'previous_qty'];
  v_old jsonb := to_jsonb(old);
  v_new jsonb := to_jsonb(new);
  v_key text;
  v_dc "job order dispatch";
  v_others numeric;
  v_next_stage bigint;
  v_next_room numeric;
begin
  if not is_app_caller() then
    return new;
  end if;

  if not is_app_supervisor() then
    raise exception 'Only a supervisor or admin can edit a receipt' using errcode = '42501';
  end if;

  for v_key in select jsonb_object_keys(v_new) loop
    if v_key <> all (v_editable || v_owned)
       and (v_new -> v_key) is distinct from (v_old -> v_key) then
      raise exception '% cannot be changed on a saved receipt', v_key using errcode = '42501';
    end if;
  end loop;

  if (new.qty_received, new.receipt_date) is not distinct from (old.qty_received, old.receipt_date) then
    new.edited_by := old.edited_by;
    new.edited_at := old.edited_at;
    new.previous_qty := old.previous_qty;
    return new;
  end if;

  -- Lock the DC (serialises with new receipts / close short / dispatch edits).
  select * into v_dc from "job order dispatch" where dc_no = old.dc_no for update;
  if not found then
    raise exception 'Dispatch % not found', old.dc_no using errcode = 'P0002';
  end if;
  if not v_dc.is_open or v_dc.closed_short_at is not null then
    raise exception 'DC % is closed (Received or Closed Short); its receipts cannot be edited', old.dc_no
      using errcode = '42501';
  end if;

  if new.qty_received is null or new.qty_received <= 0 then
    raise exception 'Received qty must be greater than 0' using errcode = '23514';
  end if;
  select coalesce(sum(qty_received), 0) into v_others
  from "job order receipt" where dc_no = old.dc_no and id <> old.id;
  if new.qty_received > v_dc.qty - v_others then
    raise exception 'Received qty (%) is more than the balance on % (max %)',
      new.qty_received, old.dc_no, v_dc.qty - v_others using errcode = '23514';
  end if;

  if new.receipt_date is null then
    raise exception 'Receipt date is required' using errcode = '23514';
  end if;
  if new.receipt_date < v_dc.dispatch_date then
    raise exception 'Receipt date cannot be before the dispatch date of % (%)', old.dc_no, v_dc.dispatch_date
      using errcode = '23514';
  end if;

  -- Lowering: the next stage may already have drawn these pieces.
  if new.qty_received < old.qty_received then
    select n.id into v_next_stage
    from "production route card stages" s
    join "production route card stages" n on n.prd_no = s.prd_no and n.seq > s.seq
    where s.id = v_dc.stage_id
    order by n.seq limit 1;
    if v_next_stage is not null then
      v_next_room := stage_dispatch_remaining(v_next_stage);
      if old.qty_received - new.qty_received > v_next_room then
        raise exception 'Received qty can be lowered by at most % -- the next stage has already taken the rest',
          v_next_room using errcode = '23514';
      end if;
    end if;
  end if;

  new.edited_by := auth.uid();
  new.edited_at := now();
  new.previous_qty := case when new.qty_received is distinct from old.qty_received
                           then old.qty_received else old.previous_qty end;
  return new;
end;
$$;

drop trigger if exists trg_job_order_receipt_edit_audit on "job order receipt";
create trigger trg_job_order_receipt_edit_audit
  before update on "job order receipt"
  for each row execute function guard_job_order_receipt_edit();

-- Receipt raised to the balance -> DC Received (the dispatch AFTER trigger
-- then runs the stage completion check).
create or replace function trg_job_order_receipt_close_dc() returns trigger
language plpgsql set search_path = public as $$
declare
  v_qty numeric;
  v_received numeric;
begin
  select qty into v_qty from "job order dispatch" where dc_no = new.dc_no and is_open;
  if not found then
    return null;
  end if;
  select coalesce(sum(qty_received), 0) into v_received from "job order receipt" where dc_no = new.dc_no;
  if v_received >= v_qty then
    update "job order dispatch" set is_open = false where dc_no = new.dc_no;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_job_order_receipt_close_dc on "job order receipt";
create trigger trg_job_order_receipt_close_dc
  after update of qty_received on "job order receipt"
  for each row
  when (new.qty_received is distinct from old.qty_received)
  execute function trg_job_order_receipt_close_dc();

-- 5. Grants ------------------------------------------------------------
-- 031 revoked UPDATE on receipts; give it back for the two editable
-- columns only (the trigger above is the role / limit guard).
grant update (qty_received, receipt_date) on "job order receipt" to authenticated;

-- RLS: if it is on and there is no UPDATE / ALL policy for authenticated,
-- add one (the trigger does the checking). Dispatch already updates today.
do $$
begin
  if (select relrowsecurity from pg_class where oid = '"job order receipt"'::regclass)
     and not exists (
       select 1 from pg_policies
       where schemaname = 'public' and tablename = 'job order receipt'
         and cmd in ('UPDATE', 'ALL')
         and ('authenticated' = any (roles) or 'public' = any (roles))
     ) then
    execute 'create policy job_order_receipt_update on "job order receipt"
             for update to authenticated using (true) with check (true)';
  end if;
end;
$$;

-- No DELETE (026 revoked it; kept).
revoke delete on "job order dispatch" from anon, authenticated;
revoke delete on "job order receipt"  from anon, authenticated;

commit;

notify pgrst, 'reload schema';

-- =====================================================================
-- STEP 3 -- verify after the run (SQL editor), one result set:
--
-- select 'columns' as chk, jsonb_agg(table_name || '.' || column_name order by 1) as result
-- from information_schema.columns
-- where table_schema = 'public' and table_name in ('job order dispatch', 'job order receipt')
--   and column_name in ('edited_by', 'edited_at', 'previous_qty')
-- union all
-- select 'triggers', jsonb_agg(event_object_table || ': ' || trigger_name order by 1)
-- from information_schema.triggers
-- where trigger_name in ('trg_job_order_dispatch_audit_insert', 'trg_job_order_receipt_audit_insert',
--                        'trg_job_order_dispatch_edit_audit', 'trg_job_order_dispatch_closed_refresh',
--                        'trg_job_order_receipt_edit_audit', 'trg_job_order_receipt_close_dc')
-- union all
-- select 'receipt update cols', jsonb_agg(column_name order by 1)
-- from information_schema.column_privileges
-- where table_schema = 'public' and table_name = 'job order receipt'
--   and grantee = 'authenticated' and privilege_type = 'UPDATE'
-- union all
-- select 'delete grants', jsonb_agg(table_name || ':' || grantee)
-- from information_schema.role_table_grants
-- where table_schema = 'public' and privilege_type = 'DELETE' and grantee in ('anon', 'authenticated')
--   and table_name in ('job order dispatch', 'job order receipt')
-- union all
-- select 'receipt policies', jsonb_agg(policyname || ' ' || cmd) from pg_policies where tablename = 'job order receipt';
--
-- Expect: 6 columns; 6 triggers (each listed once per event); receipt
-- update cols = [qty_received, receipt_date]; delete grants = null;
-- receipt policies include an UPDATE (or ALL) one if RLS is on.
--
-- If PostgREST still complains about unknown columns: notify pgrst, 'reload schema';
--
-- App test after the frontend change (TEST data only, with approval):
-- supervisor edits an open DC qty (below received refused, above available
-- refused), vendor locked once received; lowers DC qty to received -> DC
-- Received, stage re-checked; edits a receipt up to the balance -> DC
-- Received; edit on a Closed Short DC refused; TEST operator edit refused (42501).
-- =====================================================================
