-- =====================================================================
-- 030 (DRAFT, updated for the live schema after 031) -- PRDs created at
-- Production Planning, one PRD per batch.  NOT RUN.
-- Becomes 030_prd_at_planning.sql once 030_preflight.sql output is in:
-- the spots marked [PRE-FLIGHT n] are checked/filled from it.
--
-- Model:
--   "customer orders"   = PO LINE (name unchanged). New key order_line_id.
--                         prd_no stays as a nullable LEGACY column (old rows
--                         keep it; new lines leave it null).
--   "production orders" = NEW, one row per PRD (batch): prd_no PK,
--                         order_line_id, batch_no (1..n per line), prd_qty.
--   Every FK onto "customer orders"(prd_no) is re-pointed to "production
--   orders"(prd_no). Route card, stages, logs, quality, DCs, WIP, FG are
--   keyed by prd_no already and do not change.
--
-- Defaults (senior answers pending -- easy to change later):
--   * suggested split = max batch per PRD from Production Batch Master,
--     last batch = remainder (frontend); planner may edit; a batch above the
--     master size only warns (frontend); no batch size -> one PRD.
--   * the planner may plan only some batches now; the rest later.
--   * batches run in parallel (each PRD has its own stages).
--   * Cancel PRD only if nothing has started on it; its qty returns to the
--     PO line; the number is never re-used.
--   * unplanned legacy PRDs (no route card) go back to planning.
--
-- Stage 1's available qty is now the PRD qty (was the line's order qty):
-- stage_dispatch_remaining() below + computeStageAvailability (frontend,
-- after 030 is live) -- re-run scripts/compareStageAvailability.mjs.
-- =====================================================================
begin;

-- 1. PO line key --------------------------------------------------------
alter table "customer orders"
  add column order_line_id bigint generated always as identity;
alter table "customer orders"
  add constraint customer_orders_order_line_id_key unique (order_line_id);

-- 2. Production orders (PRDs) + cancellation log -------------------------
create table "production orders" (
  prd_no        text primary key,
  order_line_id bigint not null references "customer orders" (order_line_id),
  batch_no      integer not null,
  prd_qty       numeric not null check (prd_qty > 0),
  created_by    uuid default auth.uid(),
  created_at    timestamptz not null default now(),
  unique (order_line_id, batch_no)
);
create index production_orders_order_line_idx on "production orders" (order_line_id);

-- A cancelled PRD's row is deleted from "production orders" (its qty goes
-- back to the line); this keeps who/when/why and blocks re-use of the number.
create table "production order cancellations" (
  prd_no        text primary key,
  order_line_id bigint not null references "customer orders" (order_line_id),
  batch_no      integer not null,
  prd_qty       numeric not null,
  reason        text not null,
  cancelled_by  uuid,
  cancelled_at  timestamptz not null default now()
);

alter table "production orders" enable row level security;
create policy production_orders_select on "production orders" for select to authenticated using (true);
alter table "production order cancellations" enable row level security;
create policy production_order_cancellations_select on "production order cancellations" for select to authenticated using (true);
-- Written only by the security-definer RPCs below.
revoke insert, update, delete, truncate on "production orders" from anon, authenticated;
revoke insert, update, delete, truncate on "production order cancellations" from anon, authenticated;
revoke all on "production orders", "production order cancellations" from anon;

-- 3. Backfill: every existing PRD = batch 1 of its own line, prd_qty =
--    order qty (what stage 1 was capped at until now -- nothing in
--    progress changes). [PRE-FLIGHT 13: no order_qty null/<= 0]
insert into "production orders" (prd_no, order_line_id, batch_no, prd_qty, created_at)
select prd_no, order_line_id, 1, order_qty, created_at
from "customer orders";

-- 4. Re-point every FK onto "customer orders"(prd_no) to "production
--    orders"(prd_no), keeping name and ON DELETE. [PRE-FLIGHT 3]
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

-- 5. "customer orders" key -> order_line_id; prd_no becomes legacy.
alter table "customer orders" drop constraint "customer orders_pkey";   -- [PRE-FLIGHT 2: name]
alter table "customer orders" add primary key (order_line_id);
alter table "customer orders" alter column prd_no drop not null;
alter table "customer orders" add constraint customer_orders_prd_no_key unique (prd_no);
comment on column "customer orders".prd_no is
  'Legacy (pre-030) PRD number. New PO lines leave it null; PRDs live in "production orders".';

-- 6. Unplanned legacy PRDs (no route card) go back to planning: their
--    production order is removed. [PRE-FLIGHT 14/15: all reference counts 0;
--    otherwise the FK stops the whole migration.]
delete from "production orders" po
where not exists (select 1 from "production route cards" rc where rc.prd_no = po.prd_no);

-- 7. PO line guard: once a line has PRDs, customer / part / PO number and
--    the legacy prd_no cannot change, and order_qty >= planned qty.
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
     or new.po_number is distinct from old.po_number
     or new.prd_no is distinct from old.prd_no then
    raise exception 'This PO line already has PRDs -- customer, part and PO number cannot change'
      using errcode = '23514';
  end if;
  if new.order_qty < v_planned then
    raise exception 'Order qty (%) cannot be less than the qty already planned (%)', new.order_qty, v_planned
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_customer_order_line_guard on "customer orders";
create trigger trg_customer_order_line_guard
  before update on "customer orders"
  for each row execute function guard_customer_order_line();

-- 8. Next PRD number: highest of production orders, cancellations and
--    legacy line numbers + 1 (never re-issued). Call under the lock.
create or replace function next_prd_number() returns int
language sql stable set search_path = public as $$
  select greatest(
    coalesce((select max(substring(prd_no from '^PRD-(\d+)$')::int) from "production orders"), 0),
    coalesce((select max(substring(prd_no from '^PRD-(\d+)$')::int) from "production order cancellations"), 0),
    coalesce((select max(substring(prd_no from '^PRD-(\d+)$')::int) from "customer orders"), 0)) + 1;
$$;

-- 9. Planning RPC: one transaction creates the PRDs + a route card and its
--    stages per PRD. p_batches = the batches planned NOW (may be fewer than
--    the full split); p_stages = the app's Cycle Time Master snapshot
--    [{seq, operation, type, machine_id, job_work_code, cycle_time_min}],
--    the same for every PRD.
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
  if p_stages is null or jsonb_typeof(p_stages) <> 'array' or jsonb_array_length(p_stages) = 0 then
    raise exception 'No route stages for this part (Cycle Time Master)' using errcode = '23514';
  end if;

  -- Lock the PO line so two planners cannot over-plan it.
  select order_qty into v_order_qty
  from "customer orders" where order_line_id = p_order_line_id for update;
  if not found then
    raise exception 'PO line % not found', p_order_line_id using errcode = 'P0002';
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
  select coalesce(max(substring(jc_no from '^JC-(\d+)$')::int), 0) into v_jc_n from "production route cards";

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
revoke all on function plan_production_orders(bigint, numeric[], numeric, jsonb, numeric, numeric) from public;
grant execute on function plan_production_orders(bigint, numeric[], numeric, jsonb, numeric, numeric) to authenticated;

-- 10. Cancel a PRD: supervisor/admin, reason required, only if NOTHING has
--     started on it -- no row in any table with a prd_no column other than
--     the PRD's own order / route card / stages (logs, DCs, WIP, FG, quality,
--     RM requisitions, ...), and every stage still Pending. Its stages,
--     route card and production order are deleted; the qty is free on the
--     line again; the cancellation row keeps the number from re-use.
create or replace function cancel_production_order(p_prd_no text, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prd "production orders";
  t record;
  v_n bigint;
begin
  if not is_app_supervisor() then
    raise exception 'Only a supervisor or admin can cancel a PRD' using errcode = '42501';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'A reason is required to cancel a PRD' using errcode = '23514';
  end if;

  select * into v_prd from "production orders" where prd_no = p_prd_no for update;
  if not found then
    raise exception 'PRD % not found', p_prd_no using errcode = 'P0002';
  end if;
  if exists (select 1 from "production route card stages" where prd_no = p_prd_no and status <> 'Pending') then
    raise exception 'PRD % has started (a stage is no longer Pending) and cannot be cancelled', p_prd_no using errcode = '23514';
  end if;

  for t in
    select c.table_name
    from information_schema.columns c
    join information_schema.tables tb on tb.table_schema = c.table_schema and tb.table_name = c.table_name and tb.table_type = 'BASE TABLE'
    where c.table_schema = 'public' and c.column_name = 'prd_no'
      and c.table_name not in ('production orders', 'production order cancellations', 'customer orders',
                               'production route cards', 'production route card stages')
  loop
    execute format('select count(*) from public.%I where prd_no = $1', t.table_name) into v_n using p_prd_no;
    if v_n > 0 then
      raise exception 'PRD % has started (% row(s) in "%") and cannot be cancelled', p_prd_no, v_n, t.table_name
        using errcode = '23514';
    end if;
  end loop;

  insert into "production order cancellations" (prd_no, order_line_id, batch_no, prd_qty, reason, cancelled_by)
  values (v_prd.prd_no, v_prd.order_line_id, v_prd.batch_no, v_prd.prd_qty, trim(p_reason), auth.uid());

  delete from "production route card stages" where prd_no = p_prd_no;
  delete from "production route cards" where prd_no = p_prd_no;
  delete from "production orders" where prd_no = p_prd_no;
end;
$$;
revoke all on function cancel_production_order(text, text) from public;
grant execute on function cancel_production_order(text, text) to authenticated;

-- Route cards are now created only by plan_production_orders.
revoke insert on "production route cards" from anon, authenticated;

-- 11. Stage 1's available qty = PRD qty (031's function, one line changed).
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
    -- 030: the PRD (batch) qty, not the PO line's order qty
    select coalesce(prd_qty, 0) into v_upstream
    from "production orders" where prd_no = v_stage.prd_no;
    v_upstream := coalesce(v_upstream, 0);
  elsif v_prev.type = 'Outsourced' then
    select coalesce(sum(r.qty_received), 0) into v_upstream
    from "job order dispatch" d join "job order receipt" r on r.dc_no = d.dc_no
    where d.stage_id = v_prev.id;
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
    select coalesce(sum(qty), 0) into v_consumed from "job order dispatch" where stage_id = p_stage_id;
  else
    select coalesce(sum(planned_qty), 0) into v_consumed from "production logs" where stage_id = p_stage_id;
  end if;

  return greatest(0, v_upstream - v_receipted_away + v_issued_in - v_consumed);
end;
$$;

-- 12. Views: one row per PRD; order figures per PO LINE (summed over the
--     line's PRDs). Live columns kept in order; new ones appended.
--     [PRE-FLIGHT 7: compare with the live definitions before running]
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
  co.order_qty                                  as order_quantity,
  0::numeric                                    as opening_stock,
  coalesce(fg.receipts, 0)                      as receipts,
  0::numeric + coalesce(fg.receipts, 0)         as units_ready_to_despatch,
  coalesce(fg.dispatched, 0)                    as quantity_despatched,
  co.order_qty - coalesce(l.line_dispatched, 0) as balance_to_be_despatched,   -- now per PO line
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

-- [PRE-FLIGHT 7/8] Rewritten from the live definitions once known:
--   "finished goods order status"  -> per PO line: order qty, dispatched
--                                     (sum over the line's PRDs), balance, status
--   "order material requirement"   -> per PRD: BOM x prd_qty (was x order_qty)
--   "order material shortfall"     -> same basis as requirement
--   + any other view in pre-flight 7 that joins "customer orders" by prd_no.
-- "job order status" and "jobwork stage status" (031) do not read
-- "customer orders" -- no change; their stage 1 figures change through
-- stage_dispatch_remaining above.

commit;

notify pgrst, 'reload schema';

-- VERIFY (after run) -- one result set, in the final file.
