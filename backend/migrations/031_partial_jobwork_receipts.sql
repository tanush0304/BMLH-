-- =====================================================================
-- 031 -- partial jobwork receipts + split DCs per stage.  NOT RUN.
-- Written against the 031 pre-flight output (2026-10-15).
--
-- DC level ("job order dispatch" + its receipts), derived in "job order status":
--   Sent -> Partially Received -> Received      (sum received >= sent)
--                              \-> Closed Short (supervisor/admin, reason;
--                                                allowed with 0 received)
--   Overdue is a separate flag (open DC, expected receipt date < today).
--
-- Stage level (Outsourced route card stage), derived in "jobwork stage status":
--   Not Sent / Sent (nothing back) / Partially Received (some back, not
--   complete) / Received (stage closed).
--   A stage may have several DCs open at once (e.g. 300 to vendor A and
--   200 to vendor B); the one-open-DC-per-stage index is dropped and the
--   total dispatched is limited by the stage's available qty instead.
--
-- Stage completion (stored status 'Received'), checked by
-- refresh_outsourced_stage() after every receipt / close-short / upstream
-- stage completion. ALL of:
--   * the stage has at least one DC, and every DC is closed
--     (fully received or Closed Short);
--   * nothing is left to dispatch (stage_dispatch_remaining = 0);
--   * the upstream stage is finished (Completed/Received) or this is the
--     first stage -- otherwise more pieces can still arrive to dispatch.
-- Received pieces move on to the next stage immediately (stage
-- availability already sums receipts); the stage status does not gate it.
--
-- Other rules: over-receipt blocked; a closed DC never reopens; DC-001
-- (42 sent, 40 received) migrates to Closed Short.
--
-- stage_dispatch_remaining() is the SQL twin of computeStageAvailability
-- (frontend utils/calculations.js). 030 changes stage 1's cap from the
-- order qty to the PRD (batch) qty -- update both together then.
--
-- NOT here (separate migration later): revoke TRUNCATE from anon /
-- authenticated on all public tables; review anon's write grants.
-- =====================================================================
begin;

-- 1. Many receipts per DC, many open DCs per stage ---------------------
alter table "job order receipt" drop constraint "job order receipt_dc_no_key";
create index if not exists job_order_receipt_dc_no_idx on "job order receipt" (dc_no);

drop index if exists job_order_dispatch_one_open_per_stage;
create index if not exists job_order_dispatch_stage_idx on "job order dispatch" (stage_id);

-- 2. Closed Short stamp on the DC -------------------------------------
alter table "job order dispatch"
  add column closed_short_at     timestamptz,
  add column closed_short_by     uuid,
  add column closed_short_reason text;

-- 3. Backfill (before the guards exist): DC-001, closed by one short
--    receipt, keeps its meaning -> Closed Short. Its stage is already
--    'Received' and stays so.
update "job order dispatch" d
set closed_short_at     = r.last_date::timestamptz,
    closed_short_reason = 'Closed at a single receipt before partial receipts (migration 031)'
from (
  select dc_no, sum(qty_received) as received, max(receipt_date) as last_date
  from "job order receipt" group by dc_no
) r
where r.dc_no = d.dc_no
  and r.received < d.qty
  and not d.is_open
  and d.closed_short_at is null;

-- 4. Available qty for a stage = upstream accepted (stage 1: order qty)
--    - upstream pieces receipted into WIP + WIP issued into this stage
--    - already drawn by this stage (logs' planned_qty, or DCs' qty).
--    Same formula as computeStageAvailability. Invoker: reads with the
--    caller's rights (every table here is readable by app users).
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
    select coalesce(order_qty, 0) into v_upstream
    from "customer orders" where prd_no = v_stage.prd_no;
    v_upstream := coalesce(v_upstream, 0);
  elsif v_prev.type = 'Outsourced' then
    select coalesce(sum(r.qty_received), 0) into v_upstream
    from "job order dispatch" d join "job order receipt" r on r.dc_no = d.dc_no
    where d.stage_id = v_prev.id;
  else
    -- accepted per hour row = produced - rejected - rework, never below 0
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
grant execute on function stage_dispatch_remaining(bigint) to authenticated;

-- 5. Stage completion check (see header). Locks the stage row so it
--    serialises with new dispatches on the same stage.
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
  if not exists (select 1 from "job order dispatch" where stage_id = p_stage_id) then
    return false;                                   -- nothing sent yet
  end if;
  if exists (select 1 from "job order dispatch" where stage_id = p_stage_id and is_open) then
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
  where d.stage_id = p_stage_id;

  update "production route card stages"
  set status = 'Received', actual_date = coalesce(v_last, current_date)
  where id = p_stage_id;
  return true;
end;
$$;

-- When a stage finishes (Mark Stage Complete, or an outsourced stage
-- closing), the next stage may now be complete too (its upstream is final).
create or replace function trg_stage_finished_refresh_next() returns trigger
language plpgsql set search_path = public as $$
declare
  v_next bigint;
begin
  select id into v_next from "production route card stages"
  where prd_no = new.prd_no and seq > new.seq
  order by seq limit 1;
  if v_next is not null then
    perform refresh_outsourced_stage(v_next);
  end if;
  return null;
end;
$$;

drop trigger if exists trg_stage_finished_refresh_next on "production route card stages";
create trigger trg_stage_finished_refresh_next
  after update of status on "production route card stages"
  for each row
  when (new.status in ('Completed', 'Received') and old.status is distinct from new.status)
  execute function trg_stage_finished_refresh_next();

-- 6. Dispatch guard: qty > 0, stage Outsourced + Pending, qty <= what the
--    stage still has to send. Locks the stage row (replaces the dropped
--    one-open-DC index as the concurrency guard). New DCs start open.
create or replace function guard_job_order_dispatch_insert() returns trigger
language plpgsql set search_path = public as $$
declare
  v_stage "production route card stages";
  v_remaining numeric;
begin
  if not is_app_caller() then
    return new;
  end if;
  select * into v_stage from "production route card stages" where id = new.stage_id for update;
  if not found or v_stage.type <> 'Outsourced' then
    raise exception 'Stage % is not an outsourced stage', new.stage_id using errcode = '23514';
  end if;
  if v_stage.status <> 'Pending' then
    raise exception 'This stage is already %', v_stage.status using errcode = '23514';
  end if;
  if new.qty is null or new.qty <= 0 then
    raise exception 'Dispatch qty must be greater than 0' using errcode = '23514';
  end if;
  v_remaining := stage_dispatch_remaining(new.stage_id);
  if new.qty > v_remaining then
    raise exception 'Dispatch qty (%) is more than the qty available for this stage (%)', new.qty, v_remaining
      using errcode = '23514';
  end if;
  new.is_open := true;
  new.closed_short_at := null;
  new.closed_short_by := null;
  new.closed_short_reason := null;
  return new;
end;
$$;

drop trigger if exists trg_job_order_dispatch_insert_guard on "job order dispatch";
create trigger trg_job_order_dispatch_insert_guard
  before insert on "job order dispatch"
  for each row execute function guard_job_order_dispatch_insert();

-- 7. DC update guard: a closed DC never reopens; Closed Short columns
--    change only via close_job_order_short (supervisor/admin, once).
create or replace function guard_job_order_dispatch_update() returns trigger
language plpgsql set search_path = public as $$
begin
  if not is_app_caller() then
    return new;
  end if;
  if not old.is_open and new.is_open then
    raise exception 'DC % is closed and cannot be reopened', old.dc_no using errcode = '42501';
  end if;
  if (new.closed_short_at, new.closed_short_by, new.closed_short_reason)
     is distinct from (old.closed_short_at, old.closed_short_by, old.closed_short_reason) then
    if old.closed_short_at is not null then
      raise exception 'A Closed Short DC cannot be changed' using errcode = '42501';
    end if;
    if not is_app_supervisor() then
      raise exception 'Only a supervisor or admin can close a DC short' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_job_order_dispatch_update_guard on "job order dispatch";
create trigger trg_job_order_dispatch_update_guard
  before update on "job order dispatch"
  for each row execute function guard_job_order_dispatch_update();

-- 8. Receipt guard: DC open, qty > 0, qty <= sent - already received.
--    Locks the DC row so two receipts at once cannot both pass.
create or replace function guard_job_order_receipt() returns trigger
language plpgsql set search_path = public as $$
declare
  v_qty numeric;
  v_open boolean;
  v_received numeric;
begin
  if not is_app_caller() then
    return new;
  end if;
  select qty, is_open into v_qty, v_open
  from "job order dispatch" where dc_no = new.dc_no for update;
  if not found then
    raise exception 'Dispatch % not found', new.dc_no using errcode = 'P0002';
  end if;
  if not v_open then
    raise exception 'DC % is already closed', new.dc_no using errcode = '23514';
  end if;
  if new.qty_received is null or new.qty_received <= 0 then
    raise exception 'Received qty must be greater than 0' using errcode = '23514';
  end if;
  select coalesce(sum(qty_received), 0) into v_received
  from "job order receipt" where dc_no = new.dc_no;
  if new.qty_received > v_qty - v_received then
    raise exception 'Received qty (%) is more than the balance on % (%)',
      new.qty_received, new.dc_no, v_qty - v_received using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_job_order_receipt_guard on "job order receipt";
create trigger trg_job_order_receipt_guard
  before insert on "job order receipt"
  for each row execute function guard_job_order_receipt();

-- Receipts are never edited in the app.
revoke update on "job order receipt" from anon, authenticated;

-- 9. Receipt RPC (019/021, same signature -> grants kept). The DC closes
--    when its receipts reach the sent qty; the STAGE closes only via
--    refresh_outsourced_stage (all DCs closed + nothing left to send).
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
  v_qty numeric;
  v_received numeric;
  v_receipt_date date := coalesce(p_receipt_date, current_date);
  v_receipt_no text;
  v_receipt "job order receipt";
begin
  select stage_id, qty into v_stage_id, v_qty
  from "job order dispatch" where dc_no = p_dc_no for update;
  if not found then
    raise exception 'Dispatch % not found', p_dc_no using errcode = 'P0002';
  end if;

  perform pg_advisory_xact_lock(hashtext('job order receipt.receipt_no'));
  select 'JR-' || lpad((coalesce(max(substring(receipt_no from '^JR-(\d+)$')::int), 0) + 1)::text, 3, '0')
  into v_receipt_no from "job order receipt";

  -- trg_job_order_receipt_guard: open / > 0 / <= balance.
  insert into "job order receipt" (receipt_no, dc_no, qty_received, receipt_date)
  values (v_receipt_no, p_dc_no, p_qty_received, v_receipt_date)
  returning * into v_receipt;

  select coalesce(sum(qty_received), 0) into v_received
  from "job order receipt" where dc_no = p_dc_no;

  if v_received >= v_qty then
    update "job order dispatch" set is_open = false where dc_no = p_dc_no;
    perform refresh_outsourced_stage(v_stage_id);
  end if;

  return v_receipt;
end;
$$;

-- 10. Close Short (new RPC): supervisor/admin, reason required, DC open;
--     allowed with nothing received. Then the stage completion check.
create or replace function close_job_order_short(p_dc_no text, p_reason text)
returns "job order dispatch"
language plpgsql
as $$
declare
  v_dc "job order dispatch";
begin
  if not is_app_supervisor() then
    raise exception 'Only a supervisor or admin can close a DC short' using errcode = '42501';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'A reason is required to close a DC short' using errcode = '23514';
  end if;

  select * into v_dc from "job order dispatch" where dc_no = p_dc_no for update;
  if not found then
    raise exception 'Dispatch % not found', p_dc_no using errcode = 'P0002';
  end if;
  if not v_dc.is_open then
    raise exception 'DC % is already closed', p_dc_no using errcode = '23514';
  end if;

  update "job order dispatch"
  set is_open = false,
      closed_short_at = now(),
      closed_short_by = auth.uid(),
      closed_short_reason = trim(p_reason)
  where dc_no = p_dc_no
  returning * into v_dc;

  perform refresh_outsourced_stage(v_dc.stage_id);
  return v_dc;
end;
$$;
revoke all on function close_job_order_short(text, text) from public;
grant execute on function close_job_order_short(text, text) to authenticated;

-- 11. "job order status": ONE ROW PER DC (two vendors on a stage = two
--     rows). Live columns 1-11 kept in order and type; status values are
--     now Sent / Partially Received / Received / Closed Short (Overdue
--     moved to is_overdue). New columns appended.
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
  -- appended
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
left join r on r.dc_no = d.dc_no;

-- 12. "jobwork stage status" (new): one row per Outsourced stage, from its
--     DCs. "300 of 500 back" = received_qty of sent_qty.
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

grant select on "jobwork stage status" to authenticated;

commit;

notify pgrst, 'reload schema';

-- =====================================================================
-- VERIFY (after run, SQL editor) -- one result set:
-- select 'dc status' as chk, jsonb_agg(jsonb_build_object('dc', dc_no, 'status', status, 'sent', qty, 'received', qty_received, 'short', short_qty)) as result from "job order status"
-- union all
-- select 'stage status', jsonb_agg(to_jsonb(s)) from "jobwork stage status" s
-- union all
-- select 'unique on receipt', jsonb_agg(conname) from pg_constraint where conrelid = '"job order receipt"'::regclass and contype = 'u'
-- union all
-- select 'one-open index gone', to_jsonb(not exists (select 1 from pg_indexes where indexname = 'job_order_dispatch_one_open_per_stage'))
-- union all
-- select 'triggers', jsonb_agg(tgname) from pg_trigger where tgname in ('trg_job_order_receipt_guard', 'trg_job_order_dispatch_insert_guard', 'trg_job_order_dispatch_update_guard', 'trg_stage_finished_refresh_next');
--
-- Expect: DC-001 Closed Short (short 2); the open DC Sent; unique on
-- receipt = receipt_no only; index gone = true; 4 triggers.
--
-- App test after the frontend change (TEST data): stage with 500 available
-- -> DC A 300 (vendor A) + DC B 200 (vendor B), both open -> a third DC of
-- 1 refused (nothing left); receive 100 on A (stage Partially Received,
-- 100 move on) -> receive 250 on A refused (balance 200) -> receive 200 on A
-- (A Received, stage still Partially Received: B open) -> close B short with
-- reason as supervisor (stage Received, 300 of 500 back); TEST operator
-- close-short refused (42501); receipt on a closed DC refused.
-- =====================================================================
