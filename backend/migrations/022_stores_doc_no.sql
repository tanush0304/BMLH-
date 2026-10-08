-- 022: Document numbers on all Stores transactions.
--
--   "raw material transactions"    Receipt            -> GRN-NNN
--                                  Issue              -> RMI-NNN
--   "wip transactions"             Receipt            -> WIR-NNN
--                                  Issue              -> WII-NNN
--   "finished goods transactions"  Production Receipt -> FGR-NNN
--                                  Dispatch           -> FGD-NNN
--
-- Same scheme as JC/DC/JR: highest numeric part for the prefix + 1, at least
-- 3 digits, compared as numbers. Numbers are assigned by a BEFORE INSERT
-- trigger, so the screens never send one.
--
-- STEP 1 -- run first, on its own. Every row must be one of the six mapped
-- pairs above; anything else must be sorted out before STEP 2 (the not-null
-- step would fail and roll the whole migration back):
--
--   select 'raw material transactions' as tbl, transaction_type, count(*)
--   from "raw material transactions" group by transaction_type
--   union all
--   select 'wip transactions', transaction_type, count(*)
--   from "wip transactions" group by transaction_type
--   union all
--   select 'finished goods transactions', transaction_type, count(*)
--   from "finished goods transactions" group by transaction_type
--   order by 1, 2;
--
-- STEP 2 -- the migration.

begin;

-- Table + transaction_type -> prefix. Null for anything unmapped.
create or replace function stores_doc_prefix(p_table text, p_type text)
returns text
language sql
immutable
as $$
  select case
    when p_table = 'raw material transactions'   and p_type = 'Receipt'            then 'GRN'
    when p_table = 'raw material transactions'   and p_type = 'Issue'              then 'RMI'
    when p_table = 'wip transactions'            and p_type = 'Receipt'            then 'WIR'
    when p_table = 'wip transactions'            and p_type = 'Issue'              then 'WII'
    when p_table = 'finished goods transactions' and p_type = 'Production Receipt' then 'FGR'
    when p_table = 'finished goods transactions' and p_type = 'Dispatch'           then 'FGD'
  end
$$;

alter table "raw material transactions"   add column if not exists doc_no text;
alter table "wip transactions"            add column if not exists doc_no text;
alter table "finished goods transactions" add column if not exists doc_no text;

-- Backfill: per table and prefix, in transaction_date, id order, continuing
-- after any number already present (so a re-run never renumbers anything).
do $$
declare
  t text;
begin
  foreach t in array array['raw material transactions', 'wip transactions', 'finished goods transactions'] loop
    execute format($f$
      with pref as (
        select id, stores_doc_prefix(%1$L, transaction_type) as prefix, transaction_date
        from %1$I
      ),
      base as (
        select stores_doc_prefix(%1$L, transaction_type) as prefix,
               max(substring(doc_no from '-(\d+)$')::int) as n
        from %1$I
        where doc_no is not null
        group by 1
      ),
      numbered as (
        select p.id, p.prefix,
               row_number() over (partition by p.prefix order by p.transaction_date nulls last, p.id) as rn
        from pref p
        join %1$I x on x.id = p.id
        where x.doc_no is null and p.prefix is not null
      )
      update %1$I x
      set doc_no = n.prefix || '-' || lpad((coalesce(b.n, 0) + n.rn)::text, 3, '0')
      from numbered n
      left join base b on b.prefix = n.prefix
      where x.id = n.id
    $f$, t);
  end loop;
end;
$$;

alter table "raw material transactions"   alter column doc_no set not null;
alter table "wip transactions"            alter column doc_no set not null;
alter table "finished goods transactions" alter column doc_no set not null;

alter table "raw material transactions"   drop constraint if exists raw_material_transactions_doc_no_key;
alter table "raw material transactions"   add constraint raw_material_transactions_doc_no_key unique (doc_no);
alter table "wip transactions"            drop constraint if exists wip_transactions_doc_no_key;
alter table "wip transactions"            add constraint wip_transactions_doc_no_key unique (doc_no);
alter table "finished goods transactions" drop constraint if exists finished_goods_transactions_doc_no_key;
alter table "finished goods transactions" add constraint finished_goods_transactions_doc_no_key unique (doc_no);

-- BEFORE INSERT: always assigns the number (any value sent by a client is
-- replaced). A transaction-level advisory lock per prefix (like 021)
-- serialises numbering so two simultaneous inserts can't pick the same
-- number; the unique constraint is the backstop.
create or replace function assign_stores_doc_no()
returns trigger
language plpgsql
as $$
declare
  v_prefix text := stores_doc_prefix(TG_TABLE_NAME, new.transaction_type);
  v_next int;
begin
  if v_prefix is null then
    raise exception 'No document prefix for % / %', TG_TABLE_NAME, new.transaction_type;
  end if;

  perform pg_advisory_xact_lock(hashtext('stores doc_no ' || v_prefix));

  execute format(
    'select coalesce(max(substring(doc_no from %L)::int), 0) + 1 from %I where doc_no like %L',
    '^' || v_prefix || '-(\d+)$', TG_TABLE_NAME, v_prefix || '-%'
  ) into v_next;

  new.doc_no := v_prefix || '-' || lpad(v_next::text, 3, '0');
  return new;
end;
$$;

drop trigger if exists trg_raw_material_transactions_doc_no on "raw material transactions";
create trigger trg_raw_material_transactions_doc_no
  before insert on "raw material transactions"
  for each row execute function assign_stores_doc_no();

drop trigger if exists trg_wip_transactions_doc_no on "wip transactions";
create trigger trg_wip_transactions_doc_no
  before insert on "wip transactions"
  for each row execute function assign_stores_doc_no();

drop trigger if exists trg_finished_goods_transactions_doc_no on "finished goods transactions";
create trigger trg_finished_goods_transactions_doc_no
  before insert on "finished goods transactions"
  for each row execute function assign_stores_doc_no();

commit;

-- After running:
--   select 'rm' t, count(*) filter (where doc_no is null) missing, count(*) - count(distinct doc_no) dupes from "raw material transactions"
--   union all select 'wip', count(*) filter (where doc_no is null), count(*) - count(distinct doc_no) from "wip transactions"
--   union all select 'fg',  count(*) filter (where doc_no is null), count(*) - count(distinct doc_no) from "finished goods transactions";   -- all 0, 0
--   select split_part(doc_no, '-', 1) prefix, count(*), max(doc_no) from "raw material transactions" group by 1
--   union all select split_part(doc_no, '-', 1), count(*), max(doc_no) from "wip transactions" group by 1
--   union all select split_part(doc_no, '-', 1), count(*), max(doc_no) from "finished goods transactions" group by 1;
--   notify pgrst, 'reload schema';
