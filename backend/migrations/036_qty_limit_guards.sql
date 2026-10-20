-- =====================================================================
-- 036 -- DB-enforced quantity ceilings (open item 2).  NOT RUN.
--
-- Every ceiling the screens check (utils/qtyLimits.js, rmStock.js,
-- wipValidation.js, finishedGoodsValidation.js, stockEdit.js,
-- computeStageAvailability for a new production log) is now also checked in
-- the database, inside a BEFORE trigger that first locks the row the
-- ceiling depends on -- concurrent saves serialise and the second one sees
-- the first. Same pattern as 031 (stage_dispatch_remaining + insert guard).
--
--   ceiling (SQL function)                     JS twin                           guarded on
--   rm_issue_available(code)                   "raw material stock balance"      RM Issue insert / edit,
--                                              .current_stock (validateRmIssue*) RM Receipt edit (stock >= 0)
--   wip_receipt_available(prd, stage)          wipReceiptAvailable               WIP Receipt insert / edit
--   wip_issue_available(prd, stage)            "wip stock balance".current_stock WIP Issue insert / edit,
--                                              (validateWipIssue*)               WIP Receipt edit (pool >= 0)
--   fg_receipt_by_production(prd) /            fgReceiptLimits                   FG Production Receipt insert / edit
--   fg_receipt_by_order(prd) / fg_receipt_available(prd)
--   fg_stock(prd), fg_line_balance(prd),       validateDispatchQuantity /        FG Dispatch insert / edit,
--   fg_dispatch_available(prd)                 validateFgDispatchEdit            FG Receipt edit (stock >= 0)
--   stage_dispatch_remaining(stage) (031/034)  computeStageAvailability          production log insert (planned_qty)
--
-- On UPDATE (supervisor edit, 025) the row's own old qty is added back
-- first, exactly as utils/stockEdit.js does. Voided rows (034) count nowhere.
-- App callers only (026 is_app_caller(); the 034 void RPC and 035 planned
-- sync are security definer and pass). Errors 23514 with the max in the text.
--
-- Lock order (entry -> PO line -> PRD -> stages in seq order; material row
-- for RM), consistent with 030/031/033/035:
--   RM:   "raw materials master" row
--   WIP:  "production orders" row -> route card stages (seq order)
--   FG:   "customer orders" line row -> "production orders" row
--   logs: "production orders" row -> the log's stage
--
-- Not changed: 022 doc_no, 025 edit audit, 026/028 locks, 031/033 jobwork
-- guards, 034 void guards, 035 hour guards.
--
-- Final BEFORE order per table (PostgreSQL fires same-event BEFORE ROW
-- triggers in name order; updated_at triggers from the old schema, if any,
-- slot in by name too -- see STEP 1b):
--   "raw material transactions":   trg_raw_material_transactions_a_void_guard (U),
--                                   trg_raw_material_transactions_doc_no (I),
--                                   trg_raw_material_transactions_edit_audit (U),
--                                   trg_raw_material_transactions_qty_guard (I,U)  <- new
--                                   trg_raw_material_transactions_void_insert (I)
--   "wip transactions":             trg_wip_transactions_doc_no (I),
--                                   trg_wip_transactions_edit_audit (U),
--                                   trg_wip_transactions_qty_guard (I,U)            <- new
--   "finished goods transactions":  trg_finished_goods_transactions_a_void_guard (U),
--                                   trg_finished_goods_transactions_doc_no (I),
--                                   trg_finished_goods_transactions_edit_audit (U),
--                                   trg_finished_goods_transactions_qty_guard (I,U) <- new
--                                   trg_finished_goods_transactions_void_insert (I)
--   "production logs":              trg_production_logs_qty_guard (I)              <- new
--                                   trg_production_logs_verification (017),
--                                   trg_production_logs_verified_lock (026/028)
--   So a non-supervisor edit is refused by 025 (role) before any qty check,
--   and a voided row by 034 before anything else.
--
-- Left frontend-only (structural / not quantities), see the report:
--   * WIP Receipt only from a Completed / Received stage.
--   * Lowering a WIP Issue (the target stage may already have used it) and
--     lowering an RM Issue / FG Dispatch: no ceiling in the screens either.
--   * RM Requisition: a request, qty > 0 only.
--   * FG Receipt on the LAST stage after a 035 correction lowers it.
--
-- =====================================================================
-- STEP 1 -- pre-checks. Run on its own; send me the output.
--
-- 1a. Columns used here:
--   select table_name, column_name, data_type from information_schema.columns
--   where table_schema = 'public' and (
--        (table_name = 'raw material transactions'   and column_name in ('raw_material_code','transaction_type','qty','voided_at'))
--     or (table_name = 'wip transactions'            and column_name in ('prd_no','transaction_type','nature_of_operation_stage_id','target_stage_id','qty'))
--     or (table_name = 'finished goods transactions' and column_name in ('prd_no','transaction_type','qty','voided_at'))
--     or (table_name = 'production logs'             and column_name in ('prd_no','stage_id','planned_qty'))
--     or (table_name = 'production orders'           and column_name in ('prd_no','order_line_id','prd_qty'))
--     or (table_name = 'customer orders'             and column_name in ('order_line_id','order_qty'))
--     or (table_name = 'raw materials master'        and column_name in ('raw_material_code','opening_stock')))
--   order by 1, 2;                                   -- 23 rows
--
-- 1b. Current triggers (expect the list in the header, nothing named *qty_guard*):
--   select event_object_table, trigger_name, action_timing, event_manipulation
--   from information_schema.triggers
--   where event_object_table in ('raw material transactions', 'wip transactions',
--                                'finished goods transactions', 'production logs')
--   order by 1, 2, 4;
--
-- 1c. The WIP balance view (wip_issue_available must equal its current_stock;
--     it is not in the repo -- send me the definition):
--   select pg_get_viewdef('"wip stock balance"', true);
--
-- 1d. Functions used / replaced (expect hour_accepted, stage_dispatch_remaining,
--     is_app_caller; none of the new names yet):
--   select proname from pg_proc where proname in ('hour_accepted', 'stage_dispatch_remaining',
--     'is_app_caller', 'stage_accepted_qty', 'stage_consumed_qty', 'rm_issue_available',
--     'wip_receipt_available', 'wip_issue_available', 'fg_receipt_available', 'fg_dispatch_available');
--
-- 1e. Does any existing row already break a ceiling? (Guards only check new
--     inserts / qty edits, so this is for information.)
--   select 'rm negative' as chk, count(*) from "raw material stock balance" where current_stock < 0
--   union all select 'fg negative', count(*) from "finished goods stock balance" where current_stock < 0
--   union all select 'line over-dispatched', count(*) from "finished goods order status" where balance_to_dispatch < 0;
--
-- =====================================================================
-- STEP 2 -- the migration.

begin;

-- 1. Building blocks (invoker; every table is readable by app users) ----

-- Accepted output of a stage: log hours' accepted (035 hour_accepted) +
-- jobwork received on non-void DCs. = getStageAggregatesForPrd .accepted
create or replace function stage_accepted_qty(p_stage_id bigint)
returns numeric language sql stable set search_path = public as $$
  select coalesce((select sum(hour_accepted(h.qty_produced, h.qty_rejected, h.qty_rework))
                   from "production logs" l join "production log hours" h on h.log_id = l.id
                   where l.stage_id = p_stage_id), 0)
       + coalesce((select sum(r.qty_received)
                   from "job order dispatch" d join "job order receipt" r on r.dc_no = d.dc_no
                   where d.stage_id = p_stage_id and d.voided_at is null), 0);
$$;

-- Drawn by a stage: logs' planned_qty + non-void DCs' qty. = .consumed
create or replace function stage_consumed_qty(p_stage_id bigint)
returns numeric language sql stable set search_path = public as $$
  select coalesce((select sum(planned_qty) from "production logs" where stage_id = p_stage_id), 0)
       + coalesce((select sum(qty) from "job order dispatch" where stage_id = p_stage_id and voided_at is null), 0);
$$;

-- RM: closing stock = the 023/034 balance view (voided rows excluded there).
create or replace function rm_issue_available(p_code text)
returns numeric language sql stable set search_path = public as $$
  select coalesce((select current_stock from "raw material stock balance" where raw_material_code = p_code), 0);
$$;

-- WIP pool of (prd, source stage): receipts from it - issues out of it.
-- = "wip stock balance".current_stock (STEP 1c / compare script).
create or replace function wip_issue_available(p_prd_no text, p_stage_id bigint)
returns numeric language sql stable set search_path = public as $$
  select coalesce(sum(qty) filter (where transaction_type = 'Receipt'), 0)
       - coalesce(sum(qty) filter (where transaction_type = 'Issue'), 0)
  from "wip transactions"
  where prd_no = p_prd_no and nature_of_operation_stage_id = p_stage_id;
$$;

-- WIP Receipt ceiling = wipReceiptAvailable: accepted(stage) - already
-- received into WIP from it - max(0, next stage's consumption - WIP issued
-- into the next stage), never below 0. "Next" = next seq on the PRD's card.
create or replace function wip_receipt_available(p_prd_no text, p_stage_id bigint)
returns numeric language plpgsql stable set search_path = public as $$
declare
  v_stage "production route card stages";
  v_next_id bigint;
  v_received numeric;
  v_issued_next numeric := 0;
  v_next_consumed numeric := 0;
begin
  select * into v_stage from "production route card stages" where id = p_stage_id and prd_no = p_prd_no;
  if not found then
    return 0;
  end if;
  select id into v_next_id from "production route card stages"
  where prd_no = p_prd_no and seq > v_stage.seq order by seq limit 1;

  select coalesce(sum(qty), 0) into v_received from "wip transactions"
  where prd_no = p_prd_no and transaction_type = 'Receipt' and nature_of_operation_stage_id = p_stage_id;
  if v_next_id is not null then
    select coalesce(sum(qty), 0) into v_issued_next from "wip transactions"
    where prd_no = p_prd_no and transaction_type = 'Issue' and target_stage_id = v_next_id;
    v_next_consumed := stage_consumed_qty(v_next_id);
  end if;

  return greatest(0, stage_accepted_qty(p_stage_id) - v_received - greatest(0, v_next_consumed - v_issued_next));
end;
$$;

-- FG received (Production Receipt, non-void) for one PRD / across its PO line.
create or replace function fg_received(p_prd_no text)
returns numeric language sql stable set search_path = public as $$
  select coalesce(sum(qty), 0) from "finished goods transactions"
  where prd_no = p_prd_no and transaction_type = 'Production Receipt' and voided_at is null;
$$;

-- fgReceiptLimits.fromProduction: last stage (highest seq) accepted - FG received for the PRD.
create or replace function fg_receipt_by_production(p_prd_no text)
returns numeric language sql stable set search_path = public as $$
  select greatest(0,
           coalesce((select stage_accepted_qty(id) from "production route card stages"
                     where prd_no = p_prd_no order by seq desc limit 1), 0)
         - fg_received(p_prd_no));
$$;

-- fgReceiptLimits.fromOrder: the PO line's order qty - FG received across all its PRDs.
create or replace function fg_receipt_by_order(p_prd_no text)
returns numeric language sql stable set search_path = public as $$
  select greatest(0,
           coalesce((select co.order_qty from "production orders" po
                     join "customer orders" co on co.order_line_id = po.order_line_id
                     where po.prd_no = p_prd_no), 0)
         - coalesce((select sum(fg_received(p2.prd_no)) from "production orders" po
                     join "production orders" p2 on p2.order_line_id = po.order_line_id
                     where po.prd_no = p_prd_no), 0));
$$;

create or replace function fg_receipt_available(p_prd_no text)
returns numeric language sql stable set search_path = public as $$
  select least(fg_receipt_by_production(p_prd_no), fg_receipt_by_order(p_prd_no));
$$;

-- FG stock of a PRD (receipts - dispatches, non-void) = "finished goods stock balance".
create or replace function fg_stock(p_prd_no text)
returns numeric language sql stable set search_path = public as $$
  select coalesce(sum(qty) filter (where transaction_type = 'Production Receipt'), 0)
       - coalesce(sum(qty) filter (where transaction_type = 'Dispatch'), 0)
  from "finished goods transactions" where prd_no = p_prd_no and voided_at is null;
$$;

-- Order balance of the PRD's PO line = "finished goods order status".balance_to_dispatch.
create or replace function fg_line_balance(p_prd_no text)
returns numeric language sql stable set search_path = public as $$
  select coalesce((select balance_to_dispatch from "finished goods order status" where prd_no = p_prd_no), 0);
$$;

-- validateDispatchQuantity: min(PRD stock, line balance), never below 0.
create or replace function fg_dispatch_available(p_prd_no text)
returns numeric language sql stable set search_path = public as $$
  select greatest(0, least(fg_stock(p_prd_no), fg_line_balance(p_prd_no)));
$$;

grant execute on function stage_accepted_qty(bigint), stage_consumed_qty(bigint),
  rm_issue_available(text), wip_issue_available(text, bigint), wip_receipt_available(text, bigint),
  fg_received(text), fg_receipt_by_production(text), fg_receipt_by_order(text), fg_receipt_available(text),
  fg_stock(text), fg_line_balance(text), fg_dispatch_available(text)
  to authenticated;

-- 2. RM guard -------------------------------------------------------------
create or replace function guard_rm_transaction_qty() returns trigger
language plpgsql set search_path = public as $$  -- invoker (is_app_caller needs current_user)
declare
  v_avail numeric;
begin
  if not is_app_caller() then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.qty is not distinct from old.qty then
    return new;
  end if;
  if new.qty is null or new.qty <= 0 then
    raise exception 'Quantity must be greater than 0' using errcode = '23514';
  end if;

  perform 1 from "raw materials master" where raw_material_code = new.raw_material_code for update;
  v_avail := rm_issue_available(new.raw_material_code);   -- includes this row's old qty on UPDATE

  if new.transaction_type = 'Issue' then
    if tg_op = 'UPDATE' then
      v_avail := v_avail + coalesce(old.qty, 0);
    end if;
    if new.qty > v_avail then
      raise exception 'Quantity issued (%) is more than the current stock of % (%)', new.qty, new.raw_material_code, v_avail
        using errcode = '23514';
    end if;
  elsif new.transaction_type = 'Receipt' and tg_op = 'UPDATE' then
    -- validateReceiptEdit: closing - old + new >= 0.
    if v_avail - coalesce(old.qty, 0) + new.qty < 0 then
      raise exception 'Quantity received can be lowered to at least % -- the rest of % has already been issued',
        coalesce(old.qty, 0) - v_avail, new.raw_material_code using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_raw_material_transactions_qty_guard on "raw material transactions";
create trigger trg_raw_material_transactions_qty_guard
  before insert or update of qty on "raw material transactions"
  for each row execute function guard_rm_transaction_qty();

-- 3. WIP guard ------------------------------------------------------------
create or replace function guard_wip_transaction_qty() returns trigger
language plpgsql set search_path = public as $$  -- invoker
declare
  v_source "production route card stages";
  v_target "production route card stages";
  v_next_id bigint;
  v_pool numeric;
  v_avail numeric;
  v_old numeric := case when tg_op = 'UPDATE' then coalesce(old.qty, 0) else 0 end;
begin
  if not is_app_caller() then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.qty is not distinct from old.qty then
    return new;
  end if;
  if new.qty is null or new.qty <= 0 then
    raise exception 'Quantity must be greater than 0' using errcode = '23514';
  end if;

  -- PRD first, then the stages in seq order.
  perform 1 from "production orders" where prd_no = new.prd_no for update;
  select * into v_source from "production route card stages"
  where id = new.nature_of_operation_stage_id and prd_no = new.prd_no;
  if not found then
    raise exception 'The WIP stage does not belong to %', new.prd_no using errcode = '23514';
  end if;

  if new.transaction_type = 'Receipt' then
    select id into v_next_id from "production route card stages"
    where prd_no = new.prd_no and seq > v_source.seq order by seq limit 1;
    perform 1 from "production route card stages"
    where id in (v_source.id, v_next_id) order by seq for update;

    v_avail := wip_receipt_available(new.prd_no, v_source.id) + v_old;   -- validateCeilingEdit adds old back
    if new.qty > v_avail then
      raise exception 'WIP receipt qty (%) is more than the quantity available to receive from this stage (%)', new.qty, v_avail
        using errcode = '23514';
    end if;
    if tg_op = 'UPDATE' then
      v_pool := wip_issue_available(new.prd_no, v_source.id);            -- includes old qty
      if v_pool - v_old + new.qty < 0 then
        raise exception 'WIP receipt qty can be lowered to at least % -- the rest has already been issued from WIP',
          v_old - v_pool using errcode = '23514';
      end if;
    end if;

  elsif new.transaction_type = 'Issue' then
    select * into v_target from "production route card stages"
    where id = new.target_stage_id and prd_no = new.prd_no;
    if not found or v_target.type = 'Manual' or v_target.seq <= v_source.seq then
      raise exception 'The destination must be a later, non-Manual stage of %', new.prd_no using errcode = '23514';
    end if;
    perform 1 from "production route card stages"
    where id in (v_source.id, v_target.id) order by seq for update;

    v_avail := wip_issue_available(new.prd_no, v_source.id) + v_old;
    if new.qty > v_avail then
      raise exception 'WIP issue qty (%) is more than the WIP balance of this stage (%)', new.qty, v_avail
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_wip_transactions_qty_guard on "wip transactions";
create trigger trg_wip_transactions_qty_guard
  before insert or update of qty on "wip transactions"
  for each row execute function guard_wip_transaction_qty();

-- 4. FG guard -------------------------------------------------------------
create or replace function guard_fg_transaction_qty() returns trigger
language plpgsql set search_path = public as $$  -- invoker
declare
  v_line bigint;
  v_old numeric := case when tg_op = 'UPDATE' then coalesce(old.qty, 0) else 0 end;
  v_by_prod numeric;
  v_by_order numeric;
  v_stock numeric;
  v_balance numeric;
  v_max numeric;
begin
  if not is_app_caller() then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.qty is not distinct from old.qty then
    return new;
  end if;
  if new.qty is null or new.qty <= 0 then
    raise exception 'Quantity must be greater than 0' using errcode = '23514';
  end if;

  -- PO line first, then the PRD (several PRDs of a line share the order ceiling).
  select order_line_id into v_line from "production orders" where prd_no = new.prd_no;
  perform 1 from "customer orders" where order_line_id = v_line for update;
  perform 1 from "production orders" where prd_no = new.prd_no for update;

  if new.transaction_type = 'Production Receipt' then
    v_by_prod := fg_receipt_by_production(new.prd_no);
    v_by_order := fg_receipt_by_order(new.prd_no);
    v_max := greatest(0, least(v_by_prod, v_by_order)) + v_old;          -- validateCeilingEdit
    if new.qty > v_max then
      raise exception 'FG receipt qty (%) is more than the quantity that can be received (%): % by production (last stage accepted - FG received), % by order (order qty - FG received)',
        new.qty, v_max, v_by_prod + v_old, v_by_order + v_old using errcode = '23514';
    end if;
    if tg_op = 'UPDATE' and fg_stock(new.prd_no) - v_old + new.qty < 0 then
      raise exception 'FG receipt qty can be lowered to at least % -- the rest has already been dispatched',
        v_old - fg_stock(new.prd_no) using errcode = '23514';
    end if;

  elsif new.transaction_type = 'Dispatch' then
    v_stock := fg_stock(new.prd_no) + v_old;
    v_balance := fg_line_balance(new.prd_no) + v_old;
    if new.qty > v_stock then
      raise exception 'Dispatch qty (%) is more than the FG stock of % (%)', new.qty, new.prd_no, v_stock
        using errcode = '23514';
    end if;
    if new.qty > v_balance then
      raise exception 'Dispatch qty (%) is more than the remaining order quantity (%)', new.qty, v_balance
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_finished_goods_transactions_qty_guard on "finished goods transactions";
create trigger trg_finished_goods_transactions_qty_guard
  before insert or update of qty on "finished goods transactions"
  for each row execute function guard_fg_transaction_qty();

-- 5. Production log start: planned_qty <= the stage's availability -------
create or replace function guard_production_log_planned_qty() returns trigger
language plpgsql set search_path = public as $$  -- invoker
declare
  v_avail numeric;
begin
  if not is_app_caller() then
    return new;
  end if;
  perform 1 from "production orders" where prd_no = new.prd_no for update;
  perform 1 from "production route card stages" where id = new.stage_id for update;
  v_avail := stage_dispatch_remaining(new.stage_id);
  if coalesce(new.planned_qty, 0) > v_avail then
    raise exception 'Planned qty (%) is more than the quantity available for this stage (%)', new.planned_qty, v_avail
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_production_logs_qty_guard on "production logs";
create trigger trg_production_logs_qty_guard
  before insert on "production logs"
  for each row execute function guard_production_log_planned_qty();

commit;

notify pgrst, 'reload schema';

-- =====================================================================
-- STEP 3 -- verify after the run (SQL editor), one result set:
--
-- select 'functions' as chk, jsonb_agg(proname order by proname) as result
-- from pg_proc where proname in ('stage_accepted_qty', 'stage_consumed_qty', 'rm_issue_available',
--   'wip_issue_available', 'wip_receipt_available', 'fg_received', 'fg_receipt_by_production',
--   'fg_receipt_by_order', 'fg_receipt_available', 'fg_stock', 'fg_line_balance', 'fg_dispatch_available',
--   'guard_rm_transaction_qty', 'guard_wip_transaction_qty', 'guard_fg_transaction_qty',
--   'guard_production_log_planned_qty')
-- union all
-- select 'triggers', jsonb_agg(distinct event_object_table || ': ' || trigger_name)
-- from information_schema.triggers where trigger_name like '%qty_guard'
-- union all
-- select 'rm = view', to_jsonb((select count(*) from "raw material stock balance" b
--   where rm_issue_available(b.raw_material_code) <> b.current_stock))
-- union all
-- select 'fg stock = view', to_jsonb((select count(*) from "finished goods stock balance" b
--   where fg_stock(b.prd_no) <> b.current_stock))
-- union all
-- select 'wip pool = view', to_jsonb((select count(*) from "wip stock balance" b
--   where wip_issue_available(b.prd_no, b.nature_of_operation_stage_id) <> b.current_stock));
--
-- Expect: 16 functions; 4 triggers; the three "= view" counts 0.
-- Then (with approval) run frontend/scripts/compareQtyLimits.mjs: 0 differences.
-- =====================================================================
