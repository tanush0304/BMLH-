-- 025: Supervisor/admin edits on Stores transactions, with an audit trail.
--
-- Until now stock transactions were insert-only from the app. Edit is now
-- allowed on qty / transaction_date / remarks / supplier_id only; this
-- trigger records who changed it, when, and the quantity before the change,
-- and refuses changes to the identifying columns.
--
--   "raw material transactions"   locked: doc_no, transaction_type, raw_material_code, part_serial_number
--   "wip transactions"            locked: doc_no, transaction_type, prd_no, nature_of_operation_stage_id, target_stage_id
--   "finished goods transactions" locked: doc_no, transaction_type, prd_no, part_serial_number
--
-- Only supervisor/admin ("app users".role) may update a row at all -- the
-- same check migration 017 uses for verification. The screens hide Edit for
-- everyone else; this is the database-side guarantee.
--
-- STEP 1 -- run first, on its own. Every column named in the trigger
-- arguments below must exist on its table (a missing one is simply never
-- compared, but check anyway that the names are right):
--
--   select table_name, column_name
--   from information_schema.columns
--   where table_name in ('raw material transactions', 'wip transactions', 'finished goods transactions')
--     and column_name in ('doc_no', 'transaction_type', 'raw_material_code', 'part_serial_number',
--                         'prd_no', 'nature_of_operation_stage_id', 'target_stage_id',
--                         'qty', 'transaction_date', 'remarks', 'supplier_id')
--   order by 1, 2;
--
-- STEP 2 -- the migration.

begin;

alter table "raw material transactions"
  add column if not exists edited_by uuid,
  add column if not exists edited_at timestamptz,
  add column if not exists previous_qty numeric;

alter table "wip transactions"
  add column if not exists edited_by uuid,
  add column if not exists edited_at timestamptz,
  add column if not exists previous_qty numeric;

alter table "finished goods transactions"
  add column if not exists edited_by uuid,
  add column if not exists edited_at timestamptz,
  add column if not exists previous_qty numeric;

-- TG_ARGV = the columns that may never change on this table.
-- previous_qty keeps the qty from just before the LATEST qty change (a second
-- edit that leaves qty alone keeps the earlier previous_qty).
create or replace function audit_stock_transaction_edit()
returns trigger
language plpgsql
as $$
declare
  v_col text;
begin
  if not exists (
    select 1 from "app users"
    where user_id = auth.uid() and role in ('supervisor', 'admin')
  ) then
    raise exception 'Only a supervisor or admin can edit a stock transaction'
      using errcode = '42501';
  end if;

  foreach v_col in array TG_ARGV loop
    if (to_jsonb(new) -> v_col) is distinct from (to_jsonb(old) -> v_col) then
      raise exception '% cannot be changed on an existing transaction', v_col
        using errcode = '42501';
    end if;
  end loop;

  new.edited_by := auth.uid();
  new.edited_at := now();
  if new.qty is distinct from old.qty then
    new.previous_qty := old.qty;
  else
    new.previous_qty := old.previous_qty;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_raw_material_transactions_edit_audit on "raw material transactions";
create trigger trg_raw_material_transactions_edit_audit
  before update on "raw material transactions"
  for each row execute function audit_stock_transaction_edit(
    'doc_no', 'transaction_type', 'raw_material_code', 'part_serial_number');

drop trigger if exists trg_wip_transactions_edit_audit on "wip transactions";
create trigger trg_wip_transactions_edit_audit
  before update on "wip transactions"
  for each row execute function audit_stock_transaction_edit(
    'doc_no', 'transaction_type', 'prd_no', 'nature_of_operation_stage_id', 'target_stage_id');

drop trigger if exists trg_finished_goods_transactions_edit_audit on "finished goods transactions";
create trigger trg_finished_goods_transactions_edit_audit
  before update on "finished goods transactions"
  for each row execute function audit_stock_transaction_edit(
    'doc_no', 'transaction_type', 'prd_no', 'part_serial_number');

commit;

-- After running:
--   select event_object_table, trigger_name from information_schema.triggers
--   where trigger_name like '%edit_audit';                                      -- 3 rows
--   -- as a supervisor, edit a qty from the app, then:
--   select id, doc_no, qty, previous_qty, edited_by, edited_at
--   from "raw material transactions" where edited_at is not null order by edited_at desc limit 5;
--   notify pgrst, 'reload schema';
