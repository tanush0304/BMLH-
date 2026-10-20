-- =====================================================================
-- 038 -- Production Planning: a batch ABOVE the Production Batch Master
-- size is BLOCKED (was: warning only, frontend).  NOT RUN.
--
-- Senior decision 2026-10-20: if a lot is bigger, the planner adds another
-- batch / PRD or edits the Production Batch Master. No override for any role
-- (admin included). Parts with no batch size (no row, or size null / <= 0)
-- are unchanged: no limit.
--
-- Change: plan_production_orders (030) gets ONE new check, right after the
-- PO line lock (the part comes from the locked line): every batch in
-- p_batches (= the ticked batches) must be <= the part's
-- "production batch master".production_batch_quantity. Refused with 23514:
--   Batch 600 for PKH2-0266 is above the Production Batch Master size (500)
--   -- split it into another batch or update the Production Batch Master
-- Everything else is identical to 030: signature, returns, security
-- definer, search_path, supervisor check, all other checks + messages,
-- locks, numbering, inserts, revoke / grant.
-- If a part has more than one batch master row, the SMALLEST positive size
-- applies (STEP 1 b shows whether that case exists).
--
-- STEP 1 -- pre-check (read-only):
-- a) the live function is still 030's (expect: 1 row, is_definer true,
--    has_030_marker true, has_batch_check false):
--   select p.oid::regprocedure, p.prosecdef as is_definer,
--          pg_get_functiondef(p.oid) like '%Batches total % but only % of this PO line is left to plan%' as has_030_marker,
--          pg_get_functiondef(p.oid) ilike '%production batch master%' as has_batch_check
--   from pg_proc p where p.proname = 'plan_production_orders';
-- b) parts with more than one batch master row (expect 0 rows):
--   select part_serial_number, count(*), array_agg(production_batch_quantity)
--   from "production batch master" group by 1 having count(*) > 1;
-- c) existing PRDs already above their master size (informational only --
--    038 does not touch existing PRDs):
--   select po.prd_no, co.part_serial_number, po.prd_qty, b.size
--   from "production orders" po
--   join "customer orders" co on co.order_line_id = po.order_line_id
--   join (select part_serial_number, min(production_batch_quantity) as size
--         from "production batch master" where production_batch_quantity > 0 group by 1) b
--     on b.part_serial_number = co.part_serial_number
--   where po.prd_qty > b.size;
--
-- STEP 2 -- the change.
-- =====================================================================

begin;

create or replace function plan_production_orders(
  p_order_line_id    bigint,
  p_batches          numeric[],
  p_shift_hours      numeric,
  p_stages           jsonb,
  p_rm_snapshot      numeric default null,
  p_units_producible numeric default null
)
returns setof "production orders"
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_qty numeric;
  v_planned   numeric;
  v_total     numeric;
  v_prd_n     int;
  v_jc_n      int;
  v_batch_no  int;
  v_qty       numeric;
  v_prd       "production orders";
  v_part      text;     -- 038
  v_max_batch numeric;  -- 038
  v_over      numeric;  -- 038
begin
  -- Production Planning is supervisor/admin only (UI + here).
  if not is_app_supervisor() then
    raise exception 'Only a supervisor or admin can plan production orders' using errcode = '42501';
  end if;
  if p_batches is null or cardinality(p_batches) = 0 then
    raise exception 'Plan at least one batch' using errcode = '23514';
  end if;
  if exists (select 1 from unnest(p_batches) b where b is null or b <= 0) then
    raise exception 'Every batch qty must be greater than 0' using errcode = '23514';
  end if;
  if p_shift_hours is null or p_shift_hours <= 0 then
    raise exception 'Shift hours must be greater than 0' using errcode = '23514';
  end if;
  if p_stages is null or jsonb_typeof(p_stages) <> 'array' or jsonb_array_length(p_stages) = 0 then
    raise exception 'No route stages for this part (Cycle Time Master)' using errcode = '23514';
  end if;

  -- Lock the PO line so two planners cannot over-plan it.
  select order_qty, part_serial_number into v_order_qty, v_part
  from "customer orders" where order_line_id = p_order_line_id for update;
  if not found then
    raise exception 'PO line % not found', p_order_line_id using errcode = 'P0002';
  end if;

  -- 038: no batch above the Production Batch Master size (no override).
  -- No batch size for the part -> no limit.
  select min(production_batch_quantity) into v_max_batch
  from "production batch master"
  where part_serial_number = v_part and production_batch_quantity > 0;
  if v_max_batch is not null then
    select max(b) into v_over from unnest(p_batches) b where b > v_max_batch;
    if v_over is not null then
      raise exception 'Batch % for % is above the Production Batch Master size (%) -- split it into another batch or update the Production Batch Master',
        v_over, v_part, v_max_batch using errcode = '23514';
    end if;
  end if;

  select coalesce(sum(prd_qty), 0) into v_planned
  from "production orders" where order_line_id = p_order_line_id;
  select greatest(
           coalesce((select max(batch_no) from "production orders" where order_line_id = p_order_line_id), 0),
           coalesce((select max(batch_no) from "production order cancellations" where order_line_id = p_order_line_id), 0))
  into v_batch_no;

  select sum(b) into v_total from unnest(p_batches) b;
  if v_total > v_order_qty - v_planned then
    raise exception 'Batches total % but only % of this PO line is left to plan',
      v_total, v_order_qty - v_planned using errcode = '23514';
  end if;

  perform pg_advisory_xact_lock(hashtext('production orders.prd_no'));
  v_prd_n := next_prd_number() - 1;
  perform pg_advisory_xact_lock(hashtext('production route cards.jc_no'));
  -- JC numbers of cancelled PRDs count too, so a JC is never re-issued.
  select greatest(
           coalesce((select max(substring(jc_no from '^JC-(\d+)$')::int) from "production route cards"), 0),
           coalesce((select max(substring(jc_no from '^JC-(\d+)$')::int) from "production order cancellations"), 0))
  into v_jc_n;

  foreach v_qty in array p_batches loop
    v_prd_n := v_prd_n + 1;
    v_jc_n := v_jc_n + 1;
    v_batch_no := v_batch_no + 1;

    insert into "production orders" (prd_no, order_line_id, batch_no, prd_qty, created_by)
    values ('PRD-' || lpad(v_prd_n::text, 3, '0'), p_order_line_id, v_batch_no, v_qty, auth.uid())
    returning * into v_prd;

    insert into "production route cards"
      (jc_no, prd_no, batch_qty, shift_hours, available_rm_qty_snapshot, units_producible)
    values
      ('JC-' || lpad(v_jc_n::text, 3, '0'), v_prd.prd_no, v_qty, p_shift_hours, p_rm_snapshot, p_units_producible);

    insert into "production route card stages"
      (prd_no, seq, operation, type, machine_id, job_work_code, cycle_time_min, status)
    select v_prd.prd_no, s.seq, s.operation, s.type, s.machine_id, s.job_work_code, s.cycle_time_min, 'Pending'
    from jsonb_to_recordset(p_stages) as s(
      seq int, operation text, type text, machine_id text, job_work_code text, cycle_time_min numeric);

    return next v_prd;
  end loop;
end;
$$;
-- create or replace keeps the existing grants; repeated as in 030.
revoke all on function plan_production_orders(bigint, numeric[], numeric, jsonb, numeric, numeric) from public;
grant execute on function plan_production_orders(bigint, numeric[], numeric, jsonb, numeric, numeric) to authenticated;

commit;

notify pgrst, 'reload schema';

-- =====================================================================
-- STEP 3 -- verify after the run (read-only):
--   select p.oid::regprocedure, p.prosecdef as is_definer,
--          pg_get_functiondef(p.oid) ilike '%production batch master%' as has_batch_check,
--          has_function_privilege('authenticated', p.oid, 'execute') as auth_can_execute,
--          has_function_privilege('anon', p.oid, 'execute') as anon_can_execute
--   from pg_proc p where p.proname = 'plan_production_orders';
--   -- expect 1 row: is_definer true, has_batch_check true, auth_can_execute
--   --   true, anon_can_execute = the same value as before 038 (run the two
--   --   has_function_privilege lines with STEP 1 a to note it; anon is
--   --   refused inside anyway by is_app_supervisor()).
-- Then in the app (Part B, supervisor): a ticked batch above the master
-- size must be refused with the 23514 message above; a batch equal to the
-- size, and any batch for a part with no batch size, still plans.
-- No write is needed to check the refusal: the RPC raises before any insert.
-- =====================================================================
