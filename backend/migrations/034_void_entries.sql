-- =====================================================================
-- 034 -- Void entry for RM Receipt (GRN), Jobwork Dispatch (DC) and
-- FG Dispatch (FGD).  NOT RUN.
--
-- A void KEEPS the row and stamps voided_at / voided_by / void_reason.
-- The number is never reused (doc_no / dc_no stay on the row; 022's
-- max()+1 and the DC numbering both still see it). A void cannot be undone
-- and a voided row is fully locked (no edit, no un-void, no DELETE).
--
-- Who / how: supervisor/admin only, reason mandatory, through ONE
-- security-definer RPC  void_entry(doc_type, doc_no, reason)  with
-- doc_type 'GRN' | 'DC' | 'FGD'. The void columns cannot be written by a
-- direct UPDATE from the app (guard below, 42501).
--
-- Blocks (23514):
--   GRN  refused if the material's closing stock - this GRN's qty < 0
--        (pieces of it have already been issued).
--   DC   only an OPEN DC with NO receipts; otherwise "use Close Short".
--        The void closes it (is_open = false) -> refresh_outsourced_stage.
--   FGD  always allowed; the qty returns to FG stock / the order balance
--        (both views below simply stop counting it).
--
-- A voided row counts NOWHERE in the database objects below (each one
-- filters voided_at is null):
--   "raw material stock balance"   (023)  -> "raw material stock master",
--                                            "order material shortfall" follow
--   "finished goods stock balance" (015)
--   "finished goods master"        (030)
--   "finished goods order status"  (030)
--   "job order status"             (031)  voided DCs are left out entirely
--   "jobwork stage status"         (031)
--   stage_dispatch_remaining()     (030)
--   refresh_outsourced_stage()     (031)
-- Edit guards refuse a voided row: audit_stock_transaction_edit (025) and
-- guard_job_order_dispatch_edit (033). 033's messages also lose the doubled
-- "DC DC-002" wording.
--
-- Lock order (same as 031/033): the entry row first (DC before its stage),
-- then the stage / material row.
--
-- 025 change: audit_stock_transaction_edit now skips non-app callers (SQL
-- editor / the security-definer void RPC), as 026/032/033 already do -- so
-- a void does not stamp edited_by / edited_at.
--
-- =====================================================================
-- STEP 1 -- pre-checks. Run on its own; send me the output.
--
-- 1a. Columns (no voided_* yet; doc_no / dc_no / qty / transaction_type /
--     raw_material_code / prd_no / is_open / stage_id present):
--   select table_name, column_name, data_type
--   from information_schema.columns
--   where table_schema = 'public'
--     and table_name in ('raw material transactions', 'finished goods transactions', 'job order dispatch')
--   order by table_name, ordinal_position;
--
-- 1b. Current definitions + options of every view replaced here. Each must
--     match the "as" text below in COLUMNS (names, order, types); if any
--     differs from what is below, send it to me before running STEP 2.
--     reloptions: expect {security_invoker=true} on the two jobwork views and
--     null on the rest (CREATE OR REPLACE VIEW resets options to what it says).
--   select c.relname, c.reloptions, pg_get_viewdef(c.oid, true) as def
--   from pg_class c join pg_namespace n on n.oid = c.relnamespace
--   where n.nspname = 'public' and c.relkind = 'v'
--     and c.relname in ('raw material stock balance', 'finished goods stock balance',
--                       'finished goods master', 'finished goods order status',
--                       'job order status', 'jobwork stage status')
--   order by 1;
--
-- 1c. Views built on those (they follow automatically; nothing to change --
--     check none of them reads the three tables directly):
--   select distinct src.relname as source, dep.relname as dependent
--   from pg_depend d
--   join pg_rewrite r on r.oid = d.objid
--   join pg_class dep on dep.oid = r.ev_class
--   join pg_class src on src.oid = d.refobjid
--   where src.relname in ('raw material transactions', 'finished goods transactions', 'job order dispatch',
--                         'raw material stock balance', 'finished goods stock balance',
--                         'finished goods master', 'finished goods order status',
--                         'job order status', 'jobwork stage status')
--     and dep.relname <> src.relname
--   order by 1, 2;
--   Expect only the 6 views above + "raw material stock master" and
--   "order material shortfall" (both via "raw material stock balance").
--
-- 1d. Triggers on the 3 tables (025 edit_audit x2, 022 doc_no x2, 031/033
--     dispatch guards, updated_at ones; none named *void*):
--   select event_object_table, trigger_name, action_timing, event_manipulation
--   from information_schema.triggers
--   where event_object_table in ('raw material transactions', 'finished goods transactions', 'job order dispatch')
--   order by 1, 2;
--
-- 1e. Helpers + functions replaced here exist (expect 7 rows):
--   select proname, prosecdef from pg_proc
--   where proname in ('is_app_caller', 'is_app_supervisor', 'stage_dispatch_remaining',
--                     'refresh_outsourced_stage', 'audit_stock_transaction_edit',
--                     'guard_job_order_dispatch_edit', 'guard_job_order_receipt_edit');
--
-- =====================================================================
-- STEP 2 -- the migration.

begin;

-- 1. Void columns --------------------------------------------------------
alter table "raw material transactions"
  add column if not exists voided_at   timestamptz,
  add column if not exists voided_by   uuid,
  add column if not exists void_reason text;

alter table "finished goods transactions"
  add column if not exists voided_at   timestamptz,
  add column if not exists voided_by   uuid,
  add column if not exists void_reason text;

alter table "job order dispatch"
  add column if not exists voided_at   timestamptz,
  add column if not exists voided_by   uuid,
  add column if not exists void_reason text;

-- 2. Insert: never born voided ------------------------------------------
create or replace function clear_void_on_insert() returns trigger
language plpgsql set search_path = public as $$
begin
  new.voided_at := null;
  new.voided_by := null;
  new.void_reason := null;
  return new;
end;
$$;

drop trigger if exists trg_raw_material_transactions_void_insert on "raw material transactions";
create trigger trg_raw_material_transactions_void_insert
  before insert on "raw material transactions"
  for each row execute function clear_void_on_insert();

drop trigger if exists trg_finished_goods_transactions_void_insert on "finished goods transactions";
create trigger trg_finished_goods_transactions_void_insert
  before insert on "finished goods transactions"
  for each row execute function clear_void_on_insert();

drop trigger if exists trg_job_order_dispatch_void_insert on "job order dispatch";
create trigger trg_job_order_dispatch_void_insert
  before insert on "job order dispatch"
  for each row execute function clear_void_on_insert();

-- 3. Direct-update guard: an app caller can never write the void columns,
--    and a voided row can never change. void_entry() is security definer
--    (not an app caller) and passes. Named *_a_void_guard so it fires before
--    the other BEFORE UPDATE triggers (name order) and its message wins.
--    TG_ARGV[0] = the document number column (doc_no / dc_no).
create or replace function guard_void_columns() returns trigger
language plpgsql set search_path = public as $$  -- invoker (is_app_caller needs current_user)
begin
  if not is_app_caller() then
    return new;
  end if;
  if old.voided_at is not null then
    raise exception '% is void and cannot be changed', to_jsonb(old) ->> TG_ARGV[0]
      using errcode = '42501';
  end if;
  if (new.voided_at, new.voided_by, new.void_reason)
     is distinct from (old.voided_at, old.voided_by, old.void_reason) then
    raise exception 'An entry can only be voided with Void (supervisor or admin, reason required)'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_raw_material_transactions_a_void_guard on "raw material transactions";
create trigger trg_raw_material_transactions_a_void_guard
  before update on "raw material transactions"
  for each row execute function guard_void_columns('doc_no');

drop trigger if exists trg_finished_goods_transactions_a_void_guard on "finished goods transactions";
create trigger trg_finished_goods_transactions_a_void_guard
  before update on "finished goods transactions"
  for each row execute function guard_void_columns('doc_no');

drop trigger if exists trg_job_order_dispatch_a_void_guard on "job order dispatch";
create trigger trg_job_order_dispatch_a_void_guard
  before update on "job order dispatch"
  for each row execute function guard_void_columns('dc_no');

-- 4. 025 edit audit: non-app callers skip it (void RPC / SQL editor); a
--    voided row is refused. Same trigger arguments as 025 (unchanged).
create or replace function audit_stock_transaction_edit()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_col text;
begin
  if not is_app_caller() then
    return new;
  end if;

  if not exists (
    select 1 from "app users"
    where user_id = auth.uid() and role in ('supervisor', 'admin')
  ) then
    raise exception 'Only a supervisor or admin can edit a stock transaction'
      using errcode = '42501';
  end if;

  -- "wip transactions" has no void columns: ->> gives null there.
  if (to_jsonb(old) ->> 'voided_at') is not null then
    raise exception '% is void and cannot be edited', old.doc_no using errcode = '42501';
  end if;

  foreach v_col in array TG_ARGV loop
    if (to_jsonb(new) -> v_col) is distinct from (to_jsonb(old) -> v_col) then
      raise exception '% cannot be changed on an existing transaction', v_col
        using errcode = '42501';
    end if;
  end loop;

  new.edited_by := auth.uid();
  new.edited_at := now();
  if new.qty is distinct from old.qty then
    new.previous_qty := old.qty;
  else
    new.previous_qty := old.previous_qty;
  end if;
  return new;
end;
$$;

-- 5. Stage availability (030 version): voided DCs neither consume the
--    stage nor feed the next one.
create or replace function stage_dispatch_remaining(p_stage_id bigint)
returns numeric
language plpgsql stable set search_path = public as $$
declare
  v_stage "production route card stages";
  v_prev  "production route card stages";
  v_upstream numeric;
  v_receipted_away numeric := 0;
  v_issued_in numeric;
  v_consumed numeric;
begin
  select * into v_stage from "production route card stages" where id = p_stage_id;
  if not found then
    return 0;
  end if;

  select * into v_prev from "production route card stages"
  where prd_no = v_stage.prd_no and seq < v_stage.seq
  order by seq desc limit 1;

  if v_prev.id is null then
    select coalesce(prd_qty, 0) into v_upstream
    from "production orders" where prd_no = v_stage.prd_no;
    v_upstream := coalesce(v_upstream, 0);
  elsif v_prev.type = 'Outsourced' then
    select coalesce(sum(r.qty_received), 0) into v_upstream
    from "job order dispatch" d join "job order receipt" r on r.dc_no = d.dc_no
    where d.stage_id = v_prev.id and d.voided_at is null;
  else
    select coalesce(sum(greatest(0, coalesce(h.qty_produced, 0) - coalesce(h.qty_rejected, 0) - coalesce(h.qty_rework, 0))), 0)
    into v_upstream
    from "production logs" l join "production log hours" h on h.log_id = l.id
    where l.stage_id = v_prev.id;
  end if;

  if v_prev.id is not null then
    select coalesce(sum(qty), 0) into v_receipted_away
    from "wip transactions"
    where transaction_type = 'Receipt' and nature_of_operation_stage_id = v_prev.id;
  end if;

  select coalesce(sum(qty), 0) into v_issued_in
  from "wip transactions"
  where transaction_type = 'Issue' and target_stage_id = p_stage_id;

  if v_stage.type = 'Outsourced' then
    select coalesce(sum(qty), 0) into v_consumed
    from "job order dispatch" where stage_id = p_stage_id and voided_at is null;
  else
    select coalesce(sum(planned_qty), 0) into v_consumed from "production logs" where stage_id = p_stage_id;
  end if;

  return greatest(0, v_upstream - v_receipted_away + v_issued_in - v_consumed);
end;
$$;

-- 6. Stage completion check (031 version): voided DCs do not count as
--    "a DC was sent" (a stage whose only DC was voided is Not Sent again).
create or replace function refresh_outsourced_stage(p_stage_id bigint)
returns boolean
language plpgsql set search_path = public as $$
declare
  v_stage "production route card stages";
  v_prev_status text;
  v_last date;
begin
  select * into v_stage from "production route card stages" where id = p_stage_id for update;
  if not found or v_stage.type <> 'Outsourced' or v_stage.status <> 'Pending' then
    return false;
  end if;
  if not exists (select 1 from "job order dispatch" where stage_id = p_stage_id and voided_at is null) then
    return false;                                   -- nothing sent yet
  end if;
  if exists (select 1 from "job order dispatch" where stage_id = p_stage_id and is_open and voided_at is null) then
    return false;                                   -- a DC is still out
  end if;
  select status into v_prev_status from "production route card stages"
  where prd_no = v_stage.prd_no and seq < v_stage.seq
  order by seq desc limit 1;
  if v_prev_status is not null and v_prev_status not in ('Completed', 'Received') then
    return false;                                   -- upstream still producing
  end if;
  if stage_dispatch_remaining(p_stage_id) > 0 then
    return false;                                   -- pieces left to send
  end if;

  select max(r.receipt_date) into v_last
  from "job order dispatch" d join "job order receipt" r on r.dc_no = d.dc_no
  where d.stage_id = p_stage_id and d.voided_at is null;

  update "production route card stages"
  set status = 'Received', actual_date = coalesce(v_last, current_date)
  where id = p_stage_id;
  return true;
end;
$$;

-- 7. 033 dispatch edit guard: voided DC refused (the a_void_guard above
--    fires first; this keeps the guard right on its own); void columns are
--    not in any allowed list, so a direct write to them is refused here too.
--    Messages: "% ..." instead of "DC % ..." (dc_no already reads DC-NNN).
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

  if old.voided_at is not null then
    raise exception '% is void and cannot be changed', old.dc_no using errcode = '42501';
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
    raise exception '% is closed (Received or Closed Short) and cannot be edited', old.dc_no
      using errcode = '42501';
  end if;

  -- Serialise with new DCs / receipts on the same stage.
  select * into v_stage from "production route card stages" where id = old.stage_id for update;
  if not found or v_stage.status <> 'Pending' then
    raise exception 'The stage of % is no longer pending', old.dc_no using errcode = '42501';
  end if;

  select coalesce(sum(qty_received), 0), min(receipt_date)
  into v_received, v_first_receipt
  from "job order receipt" where dc_no = old.dc_no;

  if new.vendor_id is distinct from old.vendor_id and v_received > 0 then
    raise exception 'Vendor cannot be changed: % pieces have already been received on %', v_received, old.dc_no
      using errcode = '23514';
  end if;

  if new.qty is null or new.qty <= 0 then
    raise exception 'Dispatch qty must be greater than 0' using errcode = '23514';
  end if;
  if new.qty < v_received then
    raise exception 'Dispatch qty (%) cannot be less than the qty already received on % (%)',
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
    raise exception 'Dispatch date cannot be after the first receipt on % (%)', old.dc_no, v_first_receipt
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

-- 8. 033 receipt edit guard: wording only ("% is closed" for "DC % is closed").
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
  if not v_dc.is_open or v_dc.closed_short_at is not null or v_dc.voided_at is not null then
    raise exception '% is closed (Received, Closed Short or Void); its receipts cannot be edited', old.dc_no
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

-- 9. The void RPC -------------------------------------------------------
create or replace function void_entry(p_doc_type text, p_doc_no text, p_reason text)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_rm "raw material transactions";
  v_fg "finished goods transactions";
  v_dc "job order dispatch";
  v_closing numeric;
  v_receipts integer;
begin
  if not is_app_supervisor() then
    raise exception 'Only a supervisor or admin can void an entry' using errcode = '42501';
  end if;
  if v_reason is null then
    raise exception 'A reason is required to void an entry' using errcode = '23514';
  end if;

  if p_doc_type = 'GRN' then
    select * into v_rm from "raw material transactions"
    where doc_no = p_doc_no and transaction_type = 'Receipt' for update;
    if not found then
      raise exception 'RM receipt % not found', p_doc_no using errcode = 'P0002';
    end if;
    if v_rm.voided_at is not null then
      raise exception '% is already void', p_doc_no using errcode = '23514';
    end if;
    -- Serialise voids on the same material, then: closing - this GRN >= 0.
    perform 1 from "raw materials master" where raw_material_code = v_rm.raw_material_code for update;
    select current_stock into v_closing from "raw material stock balance"
    where raw_material_code = v_rm.raw_material_code;
    if coalesce(v_closing, 0) - v_rm.qty < 0 then
      raise exception 'Cannot void %: closing stock of % is %, and % of this receipt has already been issued',
        p_doc_no, v_rm.raw_material_code, coalesce(v_closing, 0), v_rm.qty - coalesce(v_closing, 0)
        using errcode = '23514';
    end if;
    update "raw material transactions"
    set voided_at = now(), voided_by = auth.uid(), void_reason = v_reason
    where id = v_rm.id;

  elsif p_doc_type = 'FGD' then
    select * into v_fg from "finished goods transactions"
    where doc_no = p_doc_no and transaction_type = 'Dispatch' for update;
    if not found then
      raise exception 'FG dispatch % not found', p_doc_no using errcode = 'P0002';
    end if;
    if v_fg.voided_at is not null then
      raise exception '% is already void', p_doc_no using errcode = '23514';
    end if;
    update "finished goods transactions"
    set voided_at = now(), voided_by = auth.uid(), void_reason = v_reason
    where id = v_fg.id;

  elsif p_doc_type = 'DC' then
    -- DC row first (receipts lock it too), then the stage via the refresh.
    select * into v_dc from "job order dispatch" where dc_no = p_doc_no for update;
    if not found then
      raise exception 'Dispatch % not found', p_doc_no using errcode = 'P0002';
    end if;
    if v_dc.voided_at is not null then
      raise exception '% is already void', p_doc_no using errcode = '23514';
    end if;
    select count(*) into v_receipts from "job order receipt" where dc_no = p_doc_no;
    if not v_dc.is_open or v_dc.closed_short_at is not null or v_receipts > 0 then
      raise exception 'Cannot void %: it is closed or has receipts -- use Close Short instead', p_doc_no
        using errcode = '23514';
    end if;
    update "job order dispatch"
    set voided_at = now(), voided_by = auth.uid(), void_reason = v_reason, is_open = false
    where dc_no = p_doc_no;
    -- (033's AFTER trigger also runs it on is_open -> false; harmless twice)
    perform refresh_outsourced_stage(v_dc.stage_id);

  else
    raise exception 'Unknown document type % (GRN, DC or FGD)', p_doc_type using errcode = '22023';
  end if;

  return p_doc_no;
end;
$$;
revoke all on function void_entry(text, text, text) from public, anon;
grant execute on function void_entry(text, text, text) to authenticated;

-- 10. Views: same names, columns and options; voided rows filtered. -----
create or replace view "raw material stock balance" as
select
  rm.raw_material_code,
  rm.opening_stock
    + coalesce(t.receipts, 0)
    - coalesce(t.issued, 0) as current_stock,
  coalesce(t.receipts, 0) as receipts,
  coalesce(t.issued, 0) as issued
from "raw materials master" rm
left join (
  select
    raw_material_code,
    sum(qty) filter (where transaction_type = 'Receipt') as receipts,
    sum(qty) filter (where transaction_type = 'Issue') as issued
  from "raw material transactions"
  where voided_at is null
  group by raw_material_code
) t on t.raw_material_code = rm.raw_material_code;

create or replace view "finished goods stock balance" as
select
  prd_no,
  part_serial_number,
  coalesce(
    sum(qty) filter (where transaction_type = 'Production Receipt'), 0
  ) - coalesce(
    sum(qty) filter (where transaction_type = 'Dispatch'), 0
  ) as current_stock
from "finished goods transactions"
where voided_at is null
group by prd_no, part_serial_number;

create or replace view "finished goods master" as
with fg as (
  select prd_no,
         coalesce(sum(qty) filter (where transaction_type = 'Production Receipt'), 0) as receipts,
         coalesce(sum(qty) filter (where transaction_type = 'Dispatch'), 0)           as dispatched
  from "finished goods transactions"
  where voided_at is null
  group by prd_no
),
line as (
  select po.order_line_id, coalesce(sum(fg.dispatched), 0) as line_dispatched
  from "production orders" po
  left join fg on fg.prd_no = po.prd_no
  group by po.order_line_id
)
select
  po.prd_no,
  co.part_serial_number,
  p.part_name,
  c.customer_name,
  p.unit_of_measurement,
  co.order_type,
  co.order_qty                                  as order_quantity,
  0::numeric                                    as opening_stock,
  coalesce(fg.receipts, 0)                      as receipts,
  0::numeric + coalesce(fg.receipts, 0)         as units_ready_to_despatch,
  coalesce(fg.dispatched, 0)                    as quantity_despatched,
  co.order_qty - coalesce(l.line_dispatched, 0) as balance_to_be_despatched,
  po.order_line_id,
  po.batch_no,
  po.prd_qty,
  co.po_number
from "production orders" po
join "customer orders" co on co.order_line_id = po.order_line_id
left join fg on fg.prd_no = po.prd_no
left join line l on l.order_line_id = po.order_line_id
left join "products master" p on p.part_serial_number = co.part_serial_number
left join "customers master" c on c.customer_id = co.customer_id;

create or replace view "finished goods order status" as
with prd_disp as (
  select po.prd_no, po.order_line_id, po.prd_qty,
         coalesce(sum(fgt.qty) filter (where fgt.transaction_type = 'Dispatch'), 0) as dispatched
  from "production orders" po
  left join "finished goods transactions" fgt on fgt.prd_no = po.prd_no and fgt.voided_at is null
  group by po.prd_no, po.order_line_id, po.prd_qty
),
line_disp as (
  select order_line_id, sum(dispatched) as dispatched from prd_disp group by order_line_id
)
select
  pd.prd_no,
  co.part_serial_number,
  co.order_qty,
  ld.dispatched                    as dispatched_qty,
  co.order_qty - ld.dispatched     as balance_to_dispatch,
  case when ld.dispatched >= co.order_qty then 'Completed' else 'Not Completed' end as order_status,
  pd.order_line_id,
  pd.prd_qty,
  pd.dispatched                    as prd_dispatched_qty
from prd_disp pd
join line_disp ld on ld.order_line_id = pd.order_line_id
join "customer orders" co on co.order_line_id = pd.order_line_id;

-- Voided DCs are left out entirely (status, reports, route card,
-- traceability); the Dispatch screen lists them from the table.
create or replace view "job order status" with (security_invoker = true) as
with r as (
  select dc_no,
         sum(qty_received) as qty_received,
         max(receipt_date) as receipt_date,
         count(*)          as receipt_count,
         string_agg(receipt_no, ', ' order by receipt_date, id) as receipt_nos
  from "job order receipt"
  group by dc_no
)
select
  d.dc_no,
  d.prd_no,
  d.job_work_code,
  d.vendor_id,
  d.qty,
  d.dispatch_date,
  d.expected_receipt_date,
  r.qty_received,
  r.receipt_date,
  case when not d.is_open and r.receipt_date is not null
       then r.receipt_date - d.dispatch_date
       else null::integer end                             as actual_lead_time_days,
  case
    when coalesce(r.qty_received, 0) >= d.qty then 'Received'
    when d.closed_short_at is not null       then 'Closed Short'
    when coalesce(r.qty_received, 0) > 0     then 'Partially Received'
    else 'Sent'
  end                                                     as status,
  d.stage_id,
  d.is_open,
  coalesce(r.receipt_count, 0)::integer                   as receipt_count,
  r.receipt_nos,
  d.qty - coalesce(r.qty_received, 0)                     as balance_qty,
  case when d.closed_short_at is not null
       then d.qty - coalesce(r.qty_received, 0) else 0 end as short_qty,
  (d.is_open and d.expected_receipt_date is not null
     and d.expected_receipt_date < current_date)          as is_overdue,
  d.closed_short_at,
  d.closed_short_reason
from "job order dispatch" d
left join r on r.dc_no = d.dc_no
where d.voided_at is null;

create or replace view "jobwork stage status" with (security_invoker = true) as
with dc as (
  select d.stage_id,
         count(*)                                 as dc_count,
         count(*) filter (where d.is_open)        as open_dc_count,
         sum(d.qty)                               as sent_qty,
         coalesce(sum(r.received), 0)             as received_qty,
         coalesce(sum(d.qty - coalesce(r.received, 0)) filter (where d.closed_short_at is not null), 0) as short_qty
  from "job order dispatch" d
  left join (select dc_no, sum(qty_received) as received from "job order receipt" group by dc_no) r
    on r.dc_no = d.dc_no
  where d.voided_at is null
  group by d.stage_id
)
select
  s.id                          as stage_id,
  s.prd_no,
  s.seq,
  s.operation,
  s.job_work_code,
  s.status                      as stage_record_status,
  coalesce(dc.dc_count, 0)      as dc_count,
  coalesce(dc.open_dc_count, 0) as open_dc_count,
  coalesce(dc.sent_qty, 0)      as sent_qty,
  coalesce(dc.received_qty, 0)  as received_qty,
  coalesce(dc.short_qty, 0)     as short_qty,
  case when s.status = 'Pending' then stage_dispatch_remaining(s.id) else 0 end as remaining_to_dispatch,
  case
    when s.status = 'Received'            then 'Received'
    when coalesce(dc.dc_count, 0) = 0     then 'Not Sent'
    when coalesce(dc.received_qty, 0) = 0 then 'Sent'
    else 'Partially Received'
  end                           as stage_status
from "production route card stages" s
left join dc on dc.stage_id = s.id
where s.type = 'Outsourced';

-- No DELETE (026; kept).
revoke delete on "raw material transactions"   from anon, authenticated;
revoke delete on "finished goods transactions" from anon, authenticated;
revoke delete on "job order dispatch"          from anon, authenticated;

commit;

notify pgrst, 'reload schema';

-- =====================================================================
-- STEP 3 -- verify after the run (SQL editor), one result set:
--
-- select 'void columns' as chk, jsonb_agg(table_name || '.' || column_name order by 1) as result
-- from information_schema.columns
-- where table_schema = 'public'
--   and table_name in ('raw material transactions', 'finished goods transactions', 'job order dispatch')
--   and column_name in ('voided_at', 'voided_by', 'void_reason')
-- union all
-- select 'void triggers', jsonb_agg(distinct event_object_table || ': ' || trigger_name)
-- from information_schema.triggers where trigger_name like '%void%'
-- union all
-- select 'void_entry definer', jsonb_agg(prosecdef) from pg_proc where proname = 'void_entry'
-- union all
-- select 'void_entry grants', jsonb_agg(grantee order by grantee)
-- from information_schema.routine_privileges
-- where routine_name = 'void_entry' and privilege_type = 'EXECUTE'
-- union all
-- select 'view options', jsonb_agg(c.relname || '=' || coalesce(array_to_string(c.reloptions, ','), '-') order by 1)
-- from pg_class c
-- where c.relname in ('raw material stock balance', 'finished goods stock balance', 'finished goods master',
--                     'finished goods order status', 'job order status', 'jobwork stage status')
-- union all
-- select 'nothing voided yet', to_jsonb(
--   (select count(*) from "raw material transactions" where voided_at is not null)
-- + (select count(*) from "finished goods transactions" where voided_at is not null)
-- + (select count(*) from "job order dispatch" where voided_at is not null))
-- union all
-- select 'rm balance unchanged', to_jsonb((select count(*) from "raw material stock balance" b
--   join "raw materials master" rm using (raw_material_code)
--   where b.current_stock <> rm.opening_stock + b.receipts - b.issued))
-- union all
-- select 'delete grants', jsonb_agg(table_name || ':' || grantee)
-- from information_schema.role_table_grants
-- where table_schema = 'public' and privilege_type = 'DELETE' and grantee in ('anon', 'authenticated')
--   and table_name in ('raw material transactions', 'finished goods transactions', 'job order dispatch');
--
-- Expect: 9 void columns; 6 void triggers (3 *_void_insert + 3 *_a_void_guard);
-- definer [true]; grants include authenticated (+ postgres / service_role),
-- not anon or PUBLIC; view options: the two jobwork views
-- security_invoker=true, the other four '-'; nothing voided yet = 0;
-- rm balance unchanged = 0; delete grants = null.
--
-- Compare with the counts from before the run (should be identical while
-- nothing is voided):
--   select (select count(*) from "job order status"), (select count(*) from "jobwork stage status"),
--          (select sum(current_stock) from "finished goods stock balance"),
--          (select sum(balance_to_dispatch) from "finished goods order status");
--
-- If PostgREST still complains about unknown columns: notify pgrst, 'reload schema';
-- =====================================================================
