-- Make WIP Master show only PRD/stage combinations with WIP transactions.
-- nature_of_operation_stage_id remains the source/current stage for both
-- Receipt and Issue quantities; target_stage_id remains the Issue destination.
begin;

create or replace view "wip master" as
with transaction_totals as (
  select
    prd_no,
    nature_of_operation_stage_id,
    coalesce(sum(qty) filter (where transaction_type = 'Receipt'), 0) as wip_receipts,
    coalesce(sum(qty) filter (where transaction_type = 'Issue'), 0) as wip_issued
  from "wip transactions"
  where transaction_type in ('Receipt', 'Issue')
  group by prd_no, nature_of_operation_stage_id
)
select
  co.prd_no,
  co.part_serial_number,
  p.part_name,
  c.customer_name,
  p.unit_of_measurement,
  co.order_type,
  co.order_qty as order_quantity,
  s.seq as stage_seq,
  s.operation as nature_of_operation_completed,
  0::numeric as wip_opening_stock,
  tt.wip_receipts,
  tt.wip_issued,
  0::numeric + tt.wip_receipts - tt.wip_issued
    as total_available_wip_quantity
from transaction_totals tt
join "production route card stages" s
  on s.prd_no = tt.prd_no
  and s.id = tt.nature_of_operation_stage_id
join "customer orders" co
  on co.prd_no = tt.prd_no
left join "products master" p
  on p.part_serial_number = co.part_serial_number
left join "customers master" c
  on c.customer_id = co.customer_id;

commit;

notify pgrst, 'reload schema';
