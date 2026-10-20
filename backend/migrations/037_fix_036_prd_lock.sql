-- =====================================================================
-- 037 -- FIX for 036: app saves refused with
--   42501 "permission denied for table production orders".  NOT RUN.
--
-- Cause: 036's FG, WIP and production-log guards lock the PRD row with
-- SELECT ... FOR UPDATE inside an INVOKER trigger. FOR UPDATE needs the
-- UPDATE privilege on the table, and app users have no UPDATE on
-- "production orders" (030: PRDs change only through security-definer RPCs).
-- So since 036, every FG Receipt / FG Dispatch / WIP Receipt / WIP Issue
-- insert or qty edit and every production log start (Data Entry, Manual
-- Operations) is refused for every app user. RM saves are not affected
-- (app users can update "raw materials master"); "customer orders" and
-- "production route card stages" locks work (UPDATE granted).
--
-- Fix: one security-definer helper takes the same row lock as the table
-- owner; the guards call it instead of locking the row themselves. Same
-- lock, same order (PO line -> PRD -> stages), same checks and messages --
-- only the "perform 1 ... for update" on "production orders" changes.
-- The helper only locks (returns nothing, changes nothing), so granting it
-- to authenticated exposes no data and no write.
--
-- STEP 1 -- confirm the cause (expect UPDATE false for production orders,
-- true for customer orders and production route card stages):
--   select t, has_table_privilege('authenticated', t, 'UPDATE')
--   from unnest(array['"production orders"', '"customer orders"', '"production route card stages"',
--                     '"raw materials master"']) t;
--
-- STEP 2 -- the fix.

begin;

create or replace function lock_production_order(p_prd_no text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform 1 from "production orders" where prd_no = p_prd_no for update;
end;
$$;
revoke all on function lock_production_order(text) from public, anon;
grant execute on function lock_production_order(text) to authenticated;

-- WIP guard (036 section 3): only the PRD lock line changes.
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
  perform lock_production_order(new.prd_no);
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

-- FG guard (036 section 4): only the PRD lock line changes.
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
  perform lock_production_order(new.prd_no);

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

-- Production log start (036 section 5): only the PRD lock line changes.
create or replace function guard_production_log_planned_qty() returns trigger
language plpgsql set search_path = public as $$  -- invoker
declare
  v_avail numeric;
begin
  if not is_app_caller() then
    return new;
  end if;
  perform lock_production_order(new.prd_no);
  perform 1 from "production route card stages" where id = new.stage_id for update;
  v_avail := stage_dispatch_remaining(new.stage_id);
  if coalesce(new.planned_qty, 0) > v_avail then
    raise exception 'Planned qty (%) is more than the quantity available for this stage (%)', new.planned_qty, v_avail
      using errcode = '23514';
  end if;
  return new;
end;
$$;

commit;

notify pgrst, 'reload schema';

-- =====================================================================
-- STEP 3 -- verify after the run:
--   select proname, prosecdef from pg_proc where proname in
--     ('lock_production_order', 'guard_wip_transaction_qty', 'guard_fg_transaction_qty',
--      'guard_production_log_planned_qty');
--   -- expect lock_production_order = true (definer), the three guards = false (invoker).
--   select pg_get_functiondef('guard_fg_transaction_qty'::regproc) ilike '%"production orders" where prd_no = new.prd_no for update%';
--   -- expect false (the direct lock is gone; same for the WIP / log guards).
-- Then in the app (no writes needed): an over-limit FG Dispatch / WIP Receipt /
-- log start must now be refused with 23514 and the max, not 42501.
-- =====================================================================
