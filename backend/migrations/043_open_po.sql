-- 043_open_po.sql
-- Phase D: annual / open PO.
--
--   * "customer po headers": valid_from, valid_to, po_status (Open/Closed),
--     closed_by/closed_at. valid_from backfilled from po_date.
--   * "customer orders" (PO lines): line_status (Open/Closed/Cancelled;
--     the app stores only Open/Cancelled -- Closed is DERIVED, see view),
--     cancelled_by/at/reason, edited_by/edited_at/previous_order_qty
--     (trigger-owned).
--   * "customer order line edits": one row per order_qty change (full
--     history; read-only for app users, no delete).
--   * View "customer order line status": per line planned / despatched
--     (voided FG excluded) and the effective status:
--       Cancelled  -- line_status = 'Cancelled'
--       Closed     -- despatched >= order_qty (> 0)
--       Open       -- otherwise
--     A void or a qty increase reopens a line automatically.
--   * Guards (app callers only; SQL editor / service role bypass):
--       line UPDATE   -- qty / status changes supervisor/admin; qty down only
--                        to planned (message names unstarted PRDs); no qty /
--                        part / customer change on a Cancelled line, no part /
--                        customer change on a line Closed by despatch; a
--                        Cancelled line can't be reopened; cancel needs a
--                        reason, refused while a PRD is unstarted (cancel it
--                        first) or still in production.
--       line INSERT   -- refused on a Closed PO; status forced to Open.
--       header UPDATE -- po_status / validity supervisor/admin; closed_by/at
--                        stamped.
--       PRD INSERT    -- planning refused on a Cancelled / Closed line or a
--                        Closed PO (checked for any logged-in caller, so the
--                        security-definer planning RPC is covered too).
--   * "customer po summary" (030) gains po_status, valid_from, valid_to and
--     Open / Closed / Cancelled line counts (columns appended).
--
-- Re-runnable: every step is idempotent (the SQL editor commits statement by
-- statement). The frontend works BEFORE this is run (new parts hidden).
-- Run PREVIEW first, then CHANGE, then VERIFICATION.

-- ---------------------------------------------------------------- PREVIEW
-- a) Already run? (null / 0 rows = not yet)
select to_regclass('public."customer order line edits"') as edits_table,
       to_regclass('public."customer order line status"') as status_view;
select table_name, column_name from information_schema.columns
where table_schema = 'public'
  and ((table_name = 'customer po headers' and column_name in ('valid_from', 'valid_to', 'po_status', 'closed_by', 'closed_at'))
    or (table_name = 'customer orders' and column_name in ('line_status', 'cancelled_by', 'cancelled_at', 'cancel_reason',
                                                           'edited_by', 'edited_at', 'previous_order_qty')))
order by 1, 2;

-- b) Headers whose valid_from will be filled from po_date.
select count(*) as headers, count(*) filter (where po_date is not null) as with_po_date
from public."customer po headers";

-- c) Lines (with / without a PO header).
select count(*) as lines, count(*) filter (where parent_po_id is null) as lines_without_po
from public."customer orders";

-- d) Lines already below planned (expect 0 rows -- the 030 guard prevents it).
select co.order_line_id, co.po_number, co.order_qty, sum(po.prd_qty) as planned
from public."customer orders" co
join public."production orders" po on po.order_line_id = co.order_line_id
group by co.order_line_id, co.po_number, co.order_qty
having co.order_qty < sum(po.prd_qty);

-- e) Current definition of "customer po summary" (must start with
--    po_header_id, customer_id, po_number, po_date, line_item_count,
--    total_order_qty -- CHANGE 8 appends columns after these).
select pg_get_viewdef('public."customer po summary"'::regclass, true);

-- ----------------------------------------------------------------- CHANGE
-- 1. Columns ---------------------------------------------------------------
alter table public."customer po headers" add column if not exists valid_from date;
alter table public."customer po headers" add column if not exists valid_to date;
alter table public."customer po headers" add column if not exists po_status text not null default 'Open';
alter table public."customer po headers" add column if not exists closed_by uuid;
alter table public."customer po headers" add column if not exists closed_at timestamptz;

alter table public."customer po headers" drop constraint if exists customer_po_headers_po_status_check;
alter table public."customer po headers" add constraint customer_po_headers_po_status_check
  check (po_status in ('Open', 'Closed'));
alter table public."customer po headers" drop constraint if exists customer_po_headers_valid_range_check;
alter table public."customer po headers" add constraint customer_po_headers_valid_range_check
  check (valid_to is null or valid_from is null or valid_to >= valid_from);

update public."customer po headers" set valid_from = po_date
where valid_from is null and po_date is not null;

alter table public."customer orders" add column if not exists line_status text not null default 'Open';
alter table public."customer orders" add column if not exists cancelled_by uuid;
alter table public."customer orders" add column if not exists cancelled_at timestamptz;
alter table public."customer orders" add column if not exists cancel_reason text;
alter table public."customer orders" add column if not exists edited_by uuid;
alter table public."customer orders" add column if not exists edited_at timestamptz;
alter table public."customer orders" add column if not exists previous_order_qty numeric;

alter table public."customer orders" drop constraint if exists customer_orders_line_status_check;
alter table public."customer orders" add constraint customer_orders_line_status_check
  check (line_status in ('Open', 'Closed', 'Cancelled'));

-- 2. Qty history table -----------------------------------------------------
create table if not exists public."customer order line edits" (
  id            bigint generated always as identity primary key,
  order_line_id bigint not null,
  old_qty       numeric,
  new_qty       numeric,
  edited_by     uuid,
  edited_at     timestamptz not null default now()
);
-- FK with ON DELETE CASCADE (a deleted, never-planned line takes its history
-- with it). Dropped by name first so a re-run -- including one over an older
-- run that created the default-named inline FK -- ends with exactly this one.
alter table public."customer order line edits"
  drop constraint if exists "customer order line edits_order_line_id_fkey";
alter table public."customer order line edits"
  drop constraint if exists customer_order_line_edits_order_line_id_fkey;
alter table public."customer order line edits"
  add constraint customer_order_line_edits_order_line_id_fkey
  foreign key (order_line_id) references public."customer orders"(order_line_id) on delete cascade;

create index if not exists customer_order_line_edits_line_idx
  on public."customer order line edits" (order_line_id, edited_at);

alter table public."customer order line edits" enable row level security;
drop policy if exists "authenticated read customer order line edits" on public."customer order line edits";
create policy "authenticated read customer order line edits"
  on public."customer order line edits" for select to authenticated using (true);
revoke all on public."customer order line edits" from anon, authenticated;
grant select on public."customer order line edits" to authenticated;
grant all on public."customer order line edits" to service_role;

-- 3. Helpers -----------------------------------------------------------------
-- Indian digit grouping for messages: 100000 -> '1,00,000'.
create or replace function public.fmt_qty_in(p numeric) returns text
language sql immutable as $$
  select case
    when p is null then ''
    when length(trunc(abs(p))::text) <= 3 then trim(to_char(p, 'FM999999999990.###'), '.')
    else (case when p < 0 then '-' else '' end)
         || regexp_replace(left(trunc(abs(p))::text, length(trunc(abs(p))::text) - 3), '(\d)(?=(\d\d)+$)', '\1,', 'g')
         || ',' || right(trunc(abs(p))::text, 3)
         || coalesce(nullif(rtrim(substr(to_char(abs(p) - trunc(abs(p)), 'FM0.###'), 2), '.'), ''), '')
  end;
$$;

-- Despatched qty of a PO line (FG Despatch over its PRDs, voided excluded).
create or replace function public.line_despatched_qty(p_line bigint) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(sum(fgt.qty), 0)
  from "production orders" po
  join "finished goods transactions" fgt on fgt.prd_no = po.prd_no
  where po.order_line_id = p_line and fgt.transaction_type = 'Dispatch' and fgt.voided_at is null;
$$;

-- PRDs of a line by state: unstarted = every stage Pending and no production
-- log (same as Cancel PRD); in production = started and a stage not yet
-- Completed / Received.
create or replace function public.line_prd_states(p_line bigint)
returns table (prd_no text, state text)
language sql stable security definer set search_path = public as $$
  select po.prd_no,
         case
           when not exists (select 1 from "production route card stages" s where s.prd_no = po.prd_no and s.status <> 'Pending')
            and not exists (select 1 from "production logs" l where l.prd_no = po.prd_no) then 'unstarted'
           when exists (select 1 from "production route card stages" s where s.prd_no = po.prd_no and s.status not in ('Completed', 'Received'))
             then 'in_production'
           else 'finished'
         end
  from "production orders" po
  where po.order_line_id = p_line
  order by po.prd_no;
$$;

-- 4. Line guard (replaces 030's guard_customer_order_line, same trigger) ----
create or replace function public.guard_customer_order_line() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_planned    numeric;
  v_despatched numeric;
  v_unstarted  text;
  v_running    text;
begin
  if not is_app_caller() then
    return new;
  end if;

  select coalesce(sum(prd_qty), 0) into v_planned
  from "production orders" where order_line_id = old.order_line_id;

  -- 030: once a line has PRDs, customer / part / PO number / legacy prd_no are fixed.
  if v_planned > 0 and (new.customer_id is distinct from old.customer_id
     or new.part_serial_number is distinct from old.part_serial_number
     or new.po_number is distinct from old.po_number
     or new.prd_no is distinct from old.prd_no) then
    raise exception 'This PO line already has PRDs -- customer, part and PO number cannot change'
      using errcode = '23514';
  end if;

  -- supervisor / admin for qty and status changes
  if (new.order_qty is distinct from old.order_qty
      or new.line_status is distinct from old.line_status
      or new.cancel_reason is distinct from old.cancel_reason)
     and not is_app_supervisor() then
    raise exception 'Only a supervisor or admin can change the order qty or cancel a PO line'
      using errcode = '42501';
  end if;

  -- Cancelled lines are final
  if old.line_status = 'Cancelled' then
    if new.line_status is distinct from 'Cancelled' then
      raise exception 'This PO line is cancelled and cannot be reopened' using errcode = '23514';
    end if;
    if new.order_qty is distinct from old.order_qty
       or new.part_serial_number is distinct from old.part_serial_number
       or new.customer_id is distinct from old.customer_id then
      raise exception 'This PO line is cancelled -- qty, part and customer cannot change' using errcode = '23514';
    end if;
  end if;

  -- 'Closed' is derived (view), never stored by the app
  if new.line_status = 'Closed' and old.line_status is distinct from 'Closed' then
    raise exception 'A PO line closes by itself when fully despatched' using errcode = '23514';
  end if;

  -- Closed by despatch: qty may go up (reopens it), part / customer fixed
  if old.line_status = 'Open' and old.order_qty > 0 then
    v_despatched := line_despatched_qty(old.order_line_id);
    if v_despatched >= old.order_qty
       and (new.part_serial_number is distinct from old.part_serial_number
            or new.customer_id is distinct from old.customer_id) then
      raise exception 'This PO line is closed (fully despatched) -- part and customer cannot change'
        using errcode = '23514';
    end if;
  end if;

  -- qty down only to what is planned
  if new.order_qty is distinct from old.order_qty and new.order_qty < v_planned then
    select string_agg(prd_no, ', ' order by prd_no) into v_unstarted
    from line_prd_states(old.order_line_id) where state = 'unstarted';
    raise exception '%', format('Already planned %s -- reduce to at least %s%s',
      fmt_qty_in(v_planned), fmt_qty_in(v_planned),
      case when v_unstarted is not null
           then format(', or cancel unstarted PRDs (%s) first.', v_unstarted) else '.' end)
      using errcode = '23514';
  end if;

  -- cancel
  if new.line_status = 'Cancelled' and old.line_status is distinct from 'Cancelled' then
    if coalesce(btrim(new.cancel_reason), '') = '' then
      raise exception 'A reason is required to cancel a PO line' using errcode = '23514';
    end if;
    select string_agg(prd_no, ', ' order by prd_no) filter (where state = 'unstarted'),
           string_agg(prd_no, ', ' order by prd_no) filter (where state = 'in_production')
      into v_unstarted, v_running
    from line_prd_states(old.order_line_id);
    if v_unstarted is not null or v_running is not null then
      raise exception 'Cannot cancel this PO line: %',
        concat_ws('; ',
          case when v_unstarted is not null then format('cancel unstarted PRDs (%s) in Production Planning first', v_unstarted) end,
          case when v_running is not null then format('PRDs still in production (%s) -- finish them first', v_running) end)
        using errcode = '23514';
    end if;
    new.cancel_reason := btrim(new.cancel_reason);
    new.cancelled_by := auth.uid();
    new.cancelled_at := now();
  elsif new.line_status is not distinct from old.line_status then
    -- cancel stamps are trigger-owned
    new.cancelled_by := old.cancelled_by;
    new.cancelled_at := old.cancelled_at;
    new.cancel_reason := old.cancel_reason;
  end if;

  -- edit audit (trigger-owned)
  if new.order_qty is distinct from old.order_qty then
    new.edited_by := auth.uid();
    new.edited_at := now();
    new.previous_order_qty := old.order_qty;
  else
    new.edited_by := old.edited_by;
    new.edited_at := old.edited_at;
    new.previous_order_qty := old.previous_order_qty;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_customer_order_line_guard on public."customer orders";
create trigger trg_customer_order_line_guard
  before update on public."customer orders"
  for each row execute function public.guard_customer_order_line();

-- qty history row (after the guards passed)
create or replace function public.log_customer_order_line_edit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.order_qty is distinct from old.order_qty then
    insert into "customer order line edits" (order_line_id, old_qty, new_qty, edited_by)
    values (new.order_line_id, old.order_qty, new.order_qty, auth.uid());
  end if;
  return null;
end;
$$;

drop trigger if exists trg_customer_order_line_edit_log on public."customer orders";
create trigger trg_customer_order_line_edit_log
  after update of order_qty on public."customer orders"
  for each row execute function public.log_customer_order_line_edit();

-- 5. Line insert guard ------------------------------------------------------
create or replace function public.guard_customer_order_line_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_status text;
  v_po     text;
begin
  if not is_app_caller() then
    return new;
  end if;
  if new.parent_po_id is not null then
    select po_status, po_number into v_status, v_po
    from "customer po headers" where id = new.parent_po_id;
    if v_status = 'Closed' then
      raise exception 'PO % is closed -- reopen it to add lines', v_po using errcode = '23514';
    end if;
  end if;
  new.line_status := 'Open';
  new.cancelled_by := null;
  new.cancelled_at := null;
  new.cancel_reason := null;
  new.edited_by := null;
  new.edited_at := null;
  new.previous_order_qty := null;
  return new;
end;
$$;

drop trigger if exists trg_customer_order_line_insert_guard on public."customer orders";
create trigger trg_customer_order_line_insert_guard
  before insert on public."customer orders"
  for each row execute function public.guard_customer_order_line_insert();

-- 6. Header guard -------------------------------------------------------------
create or replace function public.guard_customer_po_header() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not is_app_caller() then
    return new;
  end if;
  if (new.po_status is distinct from old.po_status
      or new.valid_from is distinct from old.valid_from
      or new.valid_to is distinct from old.valid_to)
     and not is_app_supervisor() then
    raise exception 'Only a supervisor or admin can close / reopen a PO or change its validity'
      using errcode = '42501';
  end if;
  if new.po_status is distinct from old.po_status then
    if new.po_status = 'Closed' then
      new.closed_by := auth.uid();
      new.closed_at := now();
    else
      new.closed_by := null;
      new.closed_at := null;
    end if;
  else
    new.closed_by := old.closed_by;
    new.closed_at := old.closed_at;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_customer_po_header_guard on public."customer po headers";
create trigger trg_customer_po_header_guard
  before update on public."customer po headers"
  for each row execute function public.guard_customer_po_header();

-- new headers start Open with no close stamps
create or replace function public.guard_customer_po_header_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not is_app_caller() then
    return new;
  end if;
  new.po_status := 'Open';
  new.closed_by := null;
  new.closed_at := null;
  new.valid_from := coalesce(new.valid_from, new.po_date);
  return new;
end;
$$;

drop trigger if exists trg_customer_po_header_insert_guard on public."customer po headers";
create trigger trg_customer_po_header_insert_guard
  before insert on public."customer po headers"
  for each row execute function public.guard_customer_po_header_insert();

-- 7. Planning guard on "production orders" ------------------------------------
-- Checked for every logged-in caller (auth.uid() set) -- the planning RPC is
-- security definer, so is_app_caller() would be false inside it.
create or replace function public.guard_production_order_line_open() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_line   "customer orders";
  v_status text;
  v_po     text;
begin
  if auth.uid() is null then
    return new;
  end if;
  select * into v_line from "customer orders" where order_line_id = new.order_line_id;
  if not found then
    return new;
  end if;
  if v_line.line_status = 'Cancelled' then
    raise exception 'This PO line is cancelled -- it cannot be planned' using errcode = '23514';
  end if;
  if v_line.order_qty > 0 and line_despatched_qty(v_line.order_line_id) >= v_line.order_qty then
    raise exception 'This PO line is closed (fully despatched) -- increase its qty to plan more'
      using errcode = '23514';
  end if;
  if v_line.parent_po_id is not null then
    select po_status, po_number into v_status, v_po from "customer po headers" where id = v_line.parent_po_id;
    if v_status = 'Closed' then
      raise exception 'PO % is closed -- reopen it to plan', v_po using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_production_order_line_open on public."production orders";
create trigger trg_production_order_line_open
  before insert on public."production orders"
  for each row execute function public.guard_production_order_line_open();

-- 8. Views -----------------------------------------------------------------------
create or replace view public."customer order line status" with (security_invoker = true) as
with planned as (
  select order_line_id, sum(prd_qty) as planned_qty, count(*) as prd_count
  from "production orders" group by order_line_id
),
desp as (
  select po.order_line_id, sum(fgt.qty) as despatched_qty
  from "production orders" po
  join "finished goods transactions" fgt on fgt.prd_no = po.prd_no
  where fgt.transaction_type = 'Dispatch' and fgt.voided_at is null
  group by po.order_line_id
)
select
  co.order_line_id,
  co.parent_po_id,
  co.customer_id,
  co.po_number,
  co.po_date,
  co.part_serial_number,
  co.order_qty,
  coalesce(p.planned_qty, 0)     as planned_qty,
  coalesce(p.prd_count, 0)       as prd_count,
  coalesce(d.despatched_qty, 0)  as despatched_qty,
  co.line_status                 as stored_status,
  case
    when co.line_status = 'Cancelled' then 'Cancelled'
    when co.order_qty > 0 and coalesce(d.despatched_qty, 0) >= co.order_qty then 'Closed'
    else 'Open'
  end                            as line_status,
  h.po_status,
  h.valid_from,
  h.valid_to
from "customer orders" co
left join planned p on p.order_line_id = co.order_line_id
left join desp d on d.order_line_id = co.order_line_id
left join "customer po headers" h on h.id = co.parent_po_id;

revoke all on public."customer order line status" from anon;
grant select on public."customer order line status" to authenticated, service_role;

-- First 6 columns keep 030's names / types / order (CREATE OR REPLACE VIEW
-- needs that): po_header_id (bigint), customer_id (text), po_number (text),
-- po_date (date) straight from the header; line_item_count = count() ->
-- bigint; total_order_qty = sum("customer orders".order_qty) -- the line
-- view passes co.order_qty through unchanged, so the sum type is the same.
-- New columns are appended after them. security_invoker: base-table RLS
-- applies to the caller (as 029's report views).
create or replace view public."customer po summary" with (security_invoker = true) as
select
  h.id                       as po_header_id,
  h.customer_id,
  h.po_number,
  h.po_date,
  count(ls.order_line_id)    as line_item_count,
  sum(ls.order_qty)          as total_order_qty,
  h.po_status,
  h.valid_from,
  h.valid_to,
  count(*) filter (where ls.line_status = 'Open')      as open_lines,
  count(*) filter (where ls.line_status = 'Closed')    as closed_lines,
  count(*) filter (where ls.line_status = 'Cancelled') as cancelled_lines
from "customer po headers" h
left join "customer order line status" ls on ls.parent_po_id = h.id
group by h.id, h.customer_id, h.po_number, h.po_date, h.po_status, h.valid_from, h.valid_to;

revoke all on public."customer po summary" from anon;
grant select on public."customer po summary" to authenticated, service_role;

-- 9. Function privileges ------------------------------------------------------------
revoke all on function public.line_despatched_qty(bigint) from public, anon;
revoke all on function public.line_prd_states(bigint) from public, anon;
revoke all on function public.guard_customer_order_line() from public, anon;
revoke all on function public.log_customer_order_line_edit() from public, anon;
revoke all on function public.guard_customer_order_line_insert() from public, anon;
revoke all on function public.guard_customer_po_header() from public, anon;
revoke all on function public.guard_customer_po_header_insert() from public, anon;
revoke all on function public.guard_production_order_line_open() from public, anon;
grant execute on function public.line_despatched_qty(bigint) to authenticated, service_role;
grant execute on function public.line_prd_states(bigint) to authenticated, service_role;
grant execute on function public.fmt_qty_in(numeric) to authenticated, service_role;

notify pgrst, 'reload schema';

-- ----------------------------------------------------------- VERIFICATION
-- 1. Columns: expect 5 header + 7 line columns.
select table_name, column_name, data_type, column_default
from information_schema.columns
where table_schema = 'public'
  and ((table_name = 'customer po headers' and column_name in ('valid_from', 'valid_to', 'po_status', 'closed_by', 'closed_at'))
    or (table_name = 'customer orders' and column_name in ('line_status', 'cancelled_by', 'cancelled_at', 'cancel_reason',
                                                           'edited_by', 'edited_at', 'previous_order_qty')))
order by 1, 2;

-- 2. Backfill: expect missing_valid_from = 0 (unless a header has no po_date), all Open.
select count(*) as headers,
       count(*) filter (where valid_from is null and po_date is not null) as missing_valid_from,
       count(*) filter (where po_status = 'Open') as open_headers
from public."customer po headers";

-- 3. View: rows = line count (PREVIEW c); status mix.
select line_status, count(*) from public."customer order line status" group by 1 order by 1;

-- 4. Triggers: expect 6 rows (line guard, line insert guard, edit log,
--    header guard, header insert guard, production order guard) + 042's.
select event_object_table, trigger_name, string_agg(event_manipulation, ', ') as events
from information_schema.triggers
where trigger_name in ('trg_customer_order_line_guard', 'trg_customer_order_line_insert_guard',
                       'trg_customer_order_line_edit_log', 'trg_customer_po_header_guard',
                       'trg_customer_po_header_insert_guard', 'trg_production_order_line_open',
                       'trg_order_line_delivery_address_guard')
group by 1, 2 order by 1, 2;

-- 5. Edits table: authenticated SELECT only, no anon; 1 select policy.
select grantee, string_agg(privilege_type, ', ' order by privilege_type) as privileges
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'customer order line edits'
  and grantee in ('anon', 'authenticated')
group by grantee;
select policyname, cmd from pg_policies where tablename = 'customer order line edits';

-- 6. View security: expect {security_invoker=true} on BOTH views.
select relname, reloptions from pg_class
where relname in ('customer order line status', 'customer po summary');

-- 6b. "customer po summary" columns: the first 6 must still be
--     po_header_id bigint, customer_id text, po_number text, po_date date,
--     line_item_count bigint, total_order_qty <same type as before>.
select ordinal_position, column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'customer po summary'
order by ordinal_position;

-- 6c. History FK: expect one row, confdeltype = 'c' (cascade).
select conname, confdeltype
from pg_constraint
where conrelid = 'public."customer order line edits"'::regclass and contype = 'f';

-- 6d. Exactly ONE trigger on "customer orders" runs guard_customer_order_line():
--     expect n = 1 (trg_customer_order_line_guard).
select count(*) as n, string_agg(t.tgname, ', ') as triggers
from pg_trigger t
join pg_proc p on p.oid = t.tgfoid
where t.tgrelid = 'public."customer orders"'::regclass
  and not t.tgisinternal
  and p.proname = 'guard_customer_order_line';

-- 7. Message helper: expect 8,000 | 1,00,000 | 12,34,567 | 250
select fmt_qty_in(8000), fmt_qty_in(100000), fmt_qty_in(1234567), fmt_qty_in(250);

-- ------------------------------------------------------------ ROLLBACK
-- (only before app data uses it; column drops lose cancel / edit data)
--   drop trigger if exists trg_production_order_line_open on public."production orders";
--   drop trigger if exists trg_customer_po_header_guard on public."customer po headers";
--   drop trigger if exists trg_customer_po_header_insert_guard on public."customer po headers";
--   drop trigger if exists trg_customer_order_line_insert_guard on public."customer orders";
--   drop trigger if exists trg_customer_order_line_edit_log on public."customer orders";
--   -- then re-run 030 step 7 to restore the old guard_customer_order_line body
--   drop view if exists public."customer order line status" cascade;  -- also drops "customer po summary": re-run 030's view
--   drop table if exists public."customer order line edits";
--   notify pgrst, 'reload schema';
