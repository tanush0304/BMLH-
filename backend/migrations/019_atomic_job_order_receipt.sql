-- 019: atomic jobwork receipt + allowed values for route card stage status.
--
-- STEP 1 -- run this first, on its own. It must return zero rows before the
-- migration below is run (otherwise the check constraint fails and the
-- whole transaction rolls back, function included):
--
--   select status, count(*) as rows, min(prd_no) as example_prd
--   from "production route card stages"
--   where status is null or status not in ('Pending', 'Completed', 'Received')
--   group by status;
--
-- STEP 2 -- the migration.

begin;

-- One transaction for a jobwork receipt: insert the receipt, set the
-- dispatch's route card stage to Received (actual_date = receipt date), and
-- close the dispatch. Replaces three separate frontend calls in
-- createReceipt (jobOrders.js), any of which could fail after the others
-- had succeeded. Existing rules still apply: unique (dc_no) on the receipt
-- table blocks a second receipt for the same DC (23505).
-- security invoker (the default): runs with the caller's own permissions/RLS.
create or replace function create_job_order_receipt(
  p_dc_no text,
  p_qty_received numeric,
  p_receipt_date date default null
)
returns "job order receipt"
language plpgsql
as $$
declare
  v_stage_id bigint;
  v_receipt_date date := coalesce(p_receipt_date, current_date);
  v_receipt "job order receipt";
begin
  -- Lock the dispatch row so two simultaneous receipts for the same DC queue
  -- up rather than interleave.
  select stage_id into v_stage_id
  from "job order dispatch"
  where dc_no = p_dc_no
  for update;

  if not found then
    raise exception 'Dispatch % not found', p_dc_no using errcode = 'P0002';
  end if;

  insert into "job order receipt" (dc_no, qty_received, receipt_date)
  values (p_dc_no, p_qty_received, v_receipt_date)
  returning * into v_receipt;

  update "production route card stages"
  set status = 'Received', actual_date = v_receipt_date
  where id = v_stage_id;

  update "job order dispatch"
  set is_open = false
  where dc_no = p_dc_no;

  return v_receipt;
end;
$$;

grant execute on function create_job_order_receipt(text, numeric, date) to authenticated;

-- Only the three statuses the app uses. Re-runnable: drops the constraint
-- first if a previous attempt created it.
alter table "production route card stages"
  drop constraint if exists production_route_card_stages_status_check;

alter table "production route card stages"
  add constraint production_route_card_stages_status_check
  check (status in ('Pending', 'Completed', 'Received'));

commit;

-- After running:
--   select proname from pg_proc where proname = 'create_job_order_receipt';      -- 1 row
--   select conname from pg_constraint
--   where conname = 'production_route_card_stages_status_check';                  -- 1 row
--   notify pgrst, 'reload schema';
