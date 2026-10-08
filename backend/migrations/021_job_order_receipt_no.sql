-- 021: Jobwork receipt number (JR-NNN) on "job order receipt".
--
-- STEP 1 -- optional check before running: how many rows will be numbered.
--   select count(*) from "job order receipt";
--
-- STEP 2 -- the migration.

begin;

alter table "job order receipt" add column if not exists receipt_no text;

-- Backfill existing receipts JR-001, JR-002 ... in receipt_date, id order.
-- Only rows still without a number, so a re-run doesn't renumber anything.
with numbered as (
  select id,
         row_number() over (order by receipt_date nulls last, id) as rn
  from "job order receipt"
  where receipt_no is null
),
base as (
  select coalesce(max(substring(receipt_no from '^JR-(\d+)$')::int), 0) as n
  from "job order receipt"
)
update "job order receipt" r
set receipt_no = 'JR-' || lpad((base.n + numbered.rn)::text, 3, '0')
from numbered, base
where r.id = numbered.id;

alter table "job order receipt" alter column receipt_no set not null;

alter table "job order receipt"
  drop constraint if exists job_order_receipt_receipt_no_key;
alter table "job order receipt"
  add constraint job_order_receipt_receipt_no_key unique (receipt_no);

-- Same as 019, plus: generate the next JR number inside this transaction
-- (highest numeric JR-NNN + 1, same scheme as JC/DC -- numeric compare, at
-- least 3 digits) and return it with the row. A transaction-level advisory
-- lock serialises numbering so two simultaneous receipts can't pick the
-- same number; the unique constraint above is the backstop.
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
  v_receipt_no text;
  v_receipt "job order receipt";
begin
  select stage_id into v_stage_id
  from "job order dispatch"
  where dc_no = p_dc_no
  for update;

  if not found then
    raise exception 'Dispatch % not found', p_dc_no using errcode = 'P0002';
  end if;

  perform pg_advisory_xact_lock(hashtext('job order receipt.receipt_no'));

  select 'JR-' || lpad((coalesce(max(substring(receipt_no from '^JR-(\d+)$')::int), 0) + 1)::text, 3, '0')
  into v_receipt_no
  from "job order receipt";

  insert into "job order receipt" (receipt_no, dc_no, qty_received, receipt_date)
  values (v_receipt_no, p_dc_no, p_qty_received, v_receipt_date)
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

commit;

-- After running:
--   select count(*) filter (where receipt_no is null) as missing,
--          count(*) - count(distinct receipt_no) as dupes
--   from "job order receipt";                                                    -- 0, 0
--   select receipt_no, receipt_date, dc_no from "job order receipt" order by receipt_no;
--   notify pgrst, 'reload schema';
