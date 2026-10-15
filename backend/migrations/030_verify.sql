-- 030 verify (after the run): READ-ONLY, one small result set.
select 'production orders' as chk, jsonb_build_object('rows', count(*), 'prds', jsonb_agg(prd_no order by prd_no)) as result from "production orders"
union all
select 'legacy prd without production order (expect PRD-007 only)',
       coalesce(jsonb_agg(co.prd_no), '[]'::jsonb)
  from "customer orders" co
 where co.prd_no is not null and not exists (select 1 from "production orders" po where po.prd_no = co.prd_no)
union all
select 'prd_qty = order_qty for every backfilled PRD',
       to_jsonb(not exists (select 1 from "production orders" po join "customer orders" co on co.order_line_id = po.order_line_id where po.prd_qty <> co.order_qty))
union all
select 'FKs still on customer orders (expect production orders + production order cancellations)',
       coalesce(jsonb_agg(k.conrelid::regclass::text), '[]'::jsonb)
  from pg_constraint k where k.contype = 'f' and k.confrelid = '"customer orders"'::regclass
union all
select 'customer orders PK', to_jsonb(pg_get_constraintdef(k.oid))
  from pg_constraint k where k.conrelid = '"customer orders"'::regclass and k.contype = 'p'
union all
select 'stage 1 remaining for PRD-009 (expect 0)', to_jsonb(stage_dispatch_remaining(s.id))
  from "production route card stages" s where s.prd_no = 'PRD-009' and s.seq = 1
union all
select 'view row counts', jsonb_build_object(
  'fg master', (select count(*) from "finished goods master"),
  'fg order status', (select count(*) from "finished goods order status"),
  'wip master', (select count(*) from "wip master"),
  'material requirement', (select count(*) from "order material requirement"),
  'material shortfall', (select count(*) from "order material shortfall"),
  'po summary', (select count(*) from "customer po summary"))
union all
select 'new functions', coalesce(jsonb_agg(proname order by proname), '[]'::jsonb)
  from pg_proc where proname in ('plan_production_orders', 'cancel_production_order', 'next_prd_number', 'guard_customer_order_line');
