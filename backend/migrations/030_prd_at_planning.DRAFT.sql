-- =====================================================================
-- 030 (DRAFT -- NOT APPROVED, DO NOT RUN) -- PRDs created at Production
-- Planning, one PRD per batch.
--
-- Model:
--   "customer orders"   = PO LINE (unchanged name). New key order_line_id.
--                         prd_no stays as a nullable legacy column (old
--                         rows keep their number; new lines leave it null).
--   "production orders" = NEW, one row per PRD (batch):
--                         prd_no PK, order_line_id, batch_no, prd_qty.
--   "production route cards".prd_no -> FK to "production orders" (was
--                         "customer orders"); everything below the route
--                         card (stages, logs, quality, DC, WIP, FG) is
--                         keyed by prd_no already and does not change.
--
-- PRE-FLIGHT (run first, send me the output -- several steps below are
-- written against the stale schema and must be checked):
--   -- a) FKs that reference "customer orders":
--   select conrelid::regclass as tbl, conname, pg_get_constraintdef(oid)
--     from pg_constraint where confrelid = '"customer orders"'::regclass;
--   -- b) its own constraints (PK name):
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--    where conrelid = '"customer orders"'::regclass;
--   -- c) views that read it:
--   select distinct v.relname from pg_depend d
--     join pg_rewrite rw on rw.oid = d.objid
--     join pg_class v on v.oid = rw.ev_class
--    where d.refobjid = '"customer orders"'::regclass and v.relname <> 'customer orders';
--   -- d) live definitions of views NOT in the repo:
--   select pg_get_viewdef('"finished goods order status"'::regclass, true);
--   select pg_get_viewdef('"order material requirement"'::regclass, true);
--   select pg_get_viewdef('"order material shortfall"'::regclass, true);
--   -- e) rows that would fail prd_qty > 0:
--   select prd_no, order_qty from "customer orders" where order_qty is null or order_qty <= 0;
--   -- f) unplanned PRDs (no route card) -- these lose their PRD below:
--   select co.prd_no, co.po_number, co.order_qty from "customer orders" co
--    where not exists (select 1 from "production route cards" rc where rc.prd_no = co.prd_no);
-- =====================================================================
begin;

-- 1. PO line key -------------------------------------------------------
alter table "customer orders"
  add column if not exists order_line_id bigint generated always as identity;
alter table "customer orders"
  add constraint customer_orders_order_line_id_key unique (order_line_id);

-- 2. Production orders (PRDs) ------------------------------------------
create table "production orders" (
  prd_no        text primary key,
  order_line_id bigint not null references "customer orders" (order_line_id),
  batch_no      integer not null,                    -- 1..n within the PO line
  prd_qty       numeric not null check (prd_qty > 0),
  created_by    uuid default auth.uid(),
  created_at    timestamptz not null default now(),
  unique (order_line_id, batch_no)
);
create index production_orders_order_line_idx on "production orders" (order_line_id);

alter table "production orders" enable row level security;
create policy production_orders_select on "production orders"
  for select to authenticated using (true);
-- No insert/update/delete for app users: PRDs are created only by
-- plan_production_orders (security definer) below.
revoke insert, update, delete on "production orders" from anon, authenticated;

-- 3. Backfill: every existing PRD = batch 1 of its own line, qty = order
--    qty (that is what stage 1 was capped at until now).
insert into "production orders" (prd_no, order_line_id, batch_no, prd_qty, created_at)
select prd_no, order_line_id, 1, order_qty, created_at
from "customer orders";

-- 4. Re-point every FK on "customer orders"(prd_no) to "production orders".
--    Generic so the live constraint names do not matter (pre-flight a).
do $repoint$
declare
  c record;
begin
  for c in
    select con.conrelid::regclass as tbl, con.conname,
           (select string_agg(quote_ident(a.attname), ', ')
              from unnest(con.conkey) k(n)
              join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.n) as cols,
           con.confdeltype
    from pg_constraint con
    where con.confrelid = '"customer orders"'::regclass
      and con.contype = 'f'
      -- only FKs onto prd_no (not the new production orders -> order_line_id)
      and con.confkey = array[(select attnum from pg_attribute
                               where attrelid = '"customer orders"'::regclass and attname = 'prd_no')]
  loop
    execute format('alter table %s drop constraint %I', c.tbl, c.conname);
    execute format('alter table %s add constraint %I foreign key (%s) references "production orders" (prd_no)%s',
                   c.tbl, c.conname, c.cols,
                   case c.confdeltype when 'c' then ' on delete cascade' else '' end);
  end loop;
end
$repoint$;

-- 5. "customer orders" key moves to order_line_id; prd_no becomes legacy.
alter table "customer orders" drop constraint customer_orders_pkey;   -- name from pre-flight b
alter table "customer orders" add primary key (order_line_id);
alter table "customer orders" alter column prd_no drop not null;
alter table "customer orders" add constraint customer_orders_prd_no_key unique (prd_no);
comment on column "customer orders".prd_no is
  'Legacy (pre-030) PRD number. New PO lines leave it null; PRDs live in "production orders".';

-- 6. Unplanned PRDs (no route card) go back to the planning pool: their
--    production order is removed so the line is planned in batches.
--    If any other table references one of them, the FK stops the whole
--    migration (nothing is half-done) and we look at that row first.
delete from "production orders" po
where not exists (select 1 from "production route cards" rc where rc.prd_no = po.prd_no);

-- 7. PO line guards ----------------------------------------------------
--    Once a line has PRDs: customer / part / PO cannot change, and
--    order_qty cannot drop below what is already planned.
create or replace function guard_customer_order_line() returns trigger
language plpgsql set search_path = public as $$
declare
  v_planned numeric;
begin
  if not is_app_caller() then
    return new;
  end if;
  select coalesce(sum(prd_qty), 0) into v_planned
  from "production orders" where order_line_id = old.order_line_id;
  if v_planned = 0 then
    return new;
  end if;
  if new.customer_id is distinct from old.customer_id
     or new.part_serial_number is distinct from old.part_serial_number
     or new.po_number is distinct from old.po_number then
    raise exception 'This PO line already has PRDs -- customer, part and PO number cannot change'
      using errcode = '23514';
  end if;
  if new.order_qty < v_planned then
    raise exception 'Order qty (%) cannot be less than the qty already planned (%)', new.order_qty, v_planned
      using errcode = '23514';
  end if;
  if new.prd_no is distinct from old.prd_no then
    raise exception 'The legacy PRD number cannot change' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_customer_order_line_guard on "customer orders";
create trigger trg_customer_order_line_guard
  before update on "customer orders"
  for each row execute function guard_customer_order_line();

-- 8. Planning RPC: one transaction creates the PRDs + a route card and its
--    stages per PRD. The stage rows are built by the app exactly as today
--    (Cycle Time Master snapshot, one machine per seq) and passed in once;
--    every PRD gets the same stages.
--    p_batches: the batches planned NOW (may be fewer than the full split).
--    p_stages:  [{seq, operation, type, machine_id, job_work_code, cycle_time_min}, ...]
create or replace function plan_production_orders(
  p_order_line_id   bigint,
  p_batches         numeric[],
  p_shift_hours     numeric,
  p_stages          jsonb,
  p_rm_snapshot     numeric default null,
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
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '42501';
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
  if p_stages is null or jsonb_array_length(p_stages) = 0 then
    raise exception 'No route stages for this part (Cycle Time Master)' using errcode = '23514';
  end if;

  -- Lock the PO line so two planners cannot over-plan it.
  select order_qty into v_order_qty
  from "customer orders" where order_line_id = p_order_line_id for update;
  if not found then
    raise exception 'PO line % not found', p_order_line_id using errcode = 'P0002';
  end if;

  select coalesce(sum(prd_qty), 0), coalesce(max(batch_no), 0)
  into v_planned, v_batch_no
  from "production orders" where order_line_id = p_order_line_id;

  select sum(b) into v_total from unnest(p_batches) b;
  if v_total > v_order_qty - v_planned then
    raise exception 'Batches total % but only % of this PO line is left to plan',
      v_total, v_order_qty - v_planned using errcode = '23514';
  end if;

  -- PRD-NNN / JC-NNN: highest existing + 1, same format as today. Legacy
  -- prd_no values on "customer orders" count too, so a removed unplanned
  -- PRD number is never re-issued to a different batch.
  perform pg_advisory_xact_lock(hashtext('production orders.prd_no'));
  select greatest(
           coalesce((select max(substring(prd_no from '^PRD-(\d+)$')::int) from "production orders"), 0),
           coalesce((select max(substring(prd_no from '^PRD-(\d+)$')::int) from "customer orders"), 0))
  into v_prd_n;
  perform pg_advisory_xact_lock(hashtext('production route cards.jc_no'));
  select coalesce(max(substring(jc_no from '^JC-(\d+)$')::int), 0)
  into v_jc_n from "production route cards";

  foreach v_qty in array p_batches loop
    v_prd_n := v_prd_n + 1;
    v_jc_n := v_jc_n + 1;
    v_batch_no := v_batch_no + 1;

    insert into "production orders" (prd_no, order_line_id, batch_no, prd_qty)
    values ('PRD-' || lpad(v_prd_n::text, 3, '0'), p_order_line_id, v_batch_no, v_qty)
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
revoke all on function plan_production_orders(bigint, numeric[], numeric, jsonb, numeric, numeric) from public;
grant execute on function plan_production_orders(bigint, numeric[], numeric, jsonb, numeric, numeric) to authenticated;

-- Route cards are now created only by the RPC.
revoke insert on "production route cards" from anon, authenticated;
-- (stages keep insert for now; revoke too once nothing else inserts them.)

-- 9. Views: one row per PRD, order figures per PO LINE (summed across the
--    line's PRDs). Existing columns kept in order; new ones appended.
create or replace view "finished goods master" as
with fg as (
  select prd_no,
         coalesce(sum(qty) filter (where transaction_type = 'Production Receipt'), 0) as receipts,
         coalesce(sum(qty) filter (where transaction_type = 'Dispatch'), 0)           as dispatched
  from "finished goods transactions"
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
  co.order_qty                                         as order_quantity,
  0::numeric                                           as opening_stock,
  coalesce(fg.receipts, 0)                             as receipts,
  coalesce(fg.receipts, 0)                             as units_ready_to_despatch,
  coalesce(fg.dispatched, 0)                           as quantity_despatched,
  co.order_qty - coalesce(l.line_dispatched, 0)        as balance_to_be_despatched,   -- now per PO line
  -- appended
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

create or replace view "wip master" as
with transaction_totals as (
  select prd_no, nature_of_operation_stage_id,
         coalesce(sum(qty) filter (where transaction_type = 'Receipt'), 0) as wip_receipts,
         coalesce(sum(qty) filter (where transaction_type = 'Issue'), 0)   as wip_issued
  from "wip transactions"
  where transaction_type in ('Receipt', 'Issue')
  group by prd_no, nature_of_operation_stage_id
)
select
  po.prd_no,
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
  0::numeric + tt.wip_receipts - tt.wip_issued as total_available_wip_quantity,
  -- appended
  po.order_line_id,
  po.prd_qty
from transaction_totals tt
join "production route card stages" s on s.prd_no = tt.prd_no and s.id = tt.nature_of_operation_stage_id
join "production orders" po on po.prd_no = tt.prd_no
join "customer orders" co on co.order_line_id = po.order_line_id
left join "products master" p on p.part_serial_number = co.part_serial_number
left join "customers master" c on c.customer_id = co.customer_id;

-- TODO after pre-flight d): rewrite
--   "finished goods order status"  -> per PO line: order_qty, dispatched (sum over PRDs), balance, status
--   "order material requirement"   -> per PRD: BOM x prd_qty (was x order_qty)
--   "order material shortfall"     -> same basis as requirement
-- and any other view from pre-flight c) that joins "customer orders" on prd_no.

commit;

notify pgrst, 'reload schema';

-- VERIFY (after run):
--   select count(*) from "production orders";                       -- = planned legacy PRDs
--   select co.order_line_id, co.prd_no, po.prd_no from "customer orders" co
--     left join "production orders" po on po.order_line_id = co.order_line_id;
--   select conrelid::regclass, conname from pg_constraint
--    where confrelid = '"customer orders"'::regclass;               -- only "production orders"
--   -- FG master totals unchanged for legacy PRDs:
--   select sum(receipts), sum(quantity_despatched) from "finished goods master";
