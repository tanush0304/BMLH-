-- Finished Goods and WIP master views.
-- Transaction totals remain derived from their transaction tables.
begin;

-- Adding prd_no changes this view's output signature. PostgreSQL cannot use
-- CREATE OR REPLACE VIEW to insert a column into an existing signature, so
-- replace it explicitly after checking that no database view depends on it.
-- The guard names dependent views (including finished goods order status) and
-- aborts the transaction rather than dropping them or changing their meaning.
do $replace_fg_stock_balance$
declare
  v_view_oid oid;
  v_owner_oid oid;
  v_owner_name text;
  v_relacl pg_class.relacl%type;
  v_comment text;
  v_columns text[];
  v_dependent_views text;
  v_acl_grants text[];
  v_grant text;
begin
  select c.oid, c.relowner, c.relacl, obj_description(c.oid, 'pg_class')
    into v_view_oid, v_owner_oid, v_relacl, v_comment
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'finished goods stock balance'
    and c.relkind = 'v';

  if v_view_oid is null then
    raise exception 'Expected public view "finished goods stock balance" was not found';
  end if;

  select array_agg(a.attname::text order by a.attnum)
    into v_columns
  from pg_attribute a
  where a.attrelid = v_view_oid
    and a.attnum > 0
    and not a.attisdropped;

  if v_columns is distinct from array['part_serial_number', 'current_stock']::text[] then
    raise exception 'Unexpected "finished goods stock balance" columns: %', v_columns;
  end if;

  select string_agg(distinct format('%I.%I', n.nspname, c.relname), ', ')
    into v_dependent_views
  from pg_depend d
  join pg_rewrite r
    on d.classid = 'pg_rewrite'::regclass
   and d.objid = r.oid
  join pg_class c on c.oid = r.ev_class
  join pg_namespace n on n.oid = c.relnamespace
  where d.refclassid = 'pg_class'::regclass
    and d.refobjid = v_view_oid
    and r.ev_class <> v_view_oid;

  if v_dependent_views is not null then
    raise exception 'Cannot replace "finished goods stock balance": dependent views exist: %. No views were dropped.', v_dependent_views;
  end if;

  if exists (
    select 1 from pg_class c
    where c.oid = v_view_oid
      and (c.reloptions is not null)
  ) then
    raise exception 'Cannot replace "finished goods stock balance": the existing view has reloptions that need explicit preservation';
  end if;

  if exists (
    select 1 from pg_trigger t
    where t.tgrelid = v_view_oid and not t.tgisinternal
  ) or exists (
    select 1 from pg_rewrite r
    where r.ev_class = v_view_oid and r.rulename <> '_RETURN'
  ) then
    raise exception 'Cannot replace "finished goods stock balance": the existing view has custom triggers or rules';
  end if;

  v_owner_name := pg_get_userbyid(v_owner_oid);

  if v_relacl is not null then
    select array_agg(
             format(
               'GRANT %s ON TABLE %I.%I TO %s%s',
               grants.privileges,
               'public',
               'finished goods stock balance',
               grants.grantee_sql,
               case when grants.is_grantable then ' WITH GRANT OPTION' else '' end
             )
           )
      into v_acl_grants
    from (
      select
        e.grantee,
        e.is_grantable,
        string_agg(e.privilege_type, ', ' order by e.privilege_type) as privileges,
        case when e.grantee = 0 then 'PUBLIC'
             else quote_ident(pg_get_userbyid(e.grantee))
        end as grantee_sql
      from aclexplode(v_relacl) e
      group by e.grantee, e.is_grantable
    ) grants;
  end if;

  -- Intentionally omit CASCADE. PostgreSQL itself will also reject this drop
  -- if any dependency not covered by the view preflight exists.
  drop view public."finished goods stock balance";

  create view public."finished goods stock balance" as
  select
    prd_no,
    part_serial_number,
    coalesce(
      sum(qty) filter (where transaction_type = 'Production Receipt'), 0
    ) - coalesce(
      sum(qty) filter (where transaction_type = 'Dispatch'), 0
    ) as current_stock
  from public."finished goods transactions"
  group by prd_no, part_serial_number;

  execute format('alter view public.%I owner to %I', 'finished goods stock balance', v_owner_name);

  if v_acl_grants is not null then
    foreach v_grant in array v_acl_grants loop
      execute v_grant;
    end loop;
  end if;

  if v_comment is not null then
    execute format(
      'comment on view public.%I is %L',
      'finished goods stock balance',
      v_comment
    );
  end if;
end
$replace_fg_stock_balance$;

create or replace view "finished goods master" as
with transaction_totals as (
  select
    prd_no,
    coalesce(sum(qty) filter (where transaction_type = 'Production Receipt'), 0) as receipts,
    coalesce(sum(qty) filter (where transaction_type = 'Dispatch'), 0) as quantity_despatched
  from "finished goods transactions"
  group by prd_no
)
select
  co.prd_no,
  co.part_serial_number,
  p.part_name,
  c.customer_name,
  p.unit_of_measurement,
  co.order_type,
  co.order_qty as order_quantity,
  0::numeric as opening_stock,
  coalesce(tt.receipts, 0) as receipts,
  0::numeric + coalesce(tt.receipts, 0) as units_ready_to_despatch,
  coalesce(tt.quantity_despatched, 0) as quantity_despatched,
  co.order_qty - coalesce(tt.quantity_despatched, 0) as balance_to_be_despatched
from "customer orders" co
left join "products master" p
  on p.part_serial_number = co.part_serial_number
left join "customers master" c
  on c.customer_id = co.customer_id
left join transaction_totals tt
  on tt.prd_no = co.prd_no;

create or replace view "wip master" as
with transaction_totals as (
  select
    prd_no,
    nature_of_operation_stage_id,
    coalesce(sum(qty) filter (where transaction_type = 'Receipt'), 0) as wip_receipts,
    coalesce(sum(qty) filter (where transaction_type = 'Issue'), 0) as wip_issued
  from "wip transactions"
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
  coalesce(tt.wip_receipts, 0) as wip_receipts,
  coalesce(tt.wip_issued, 0) as wip_issued,
  0::numeric + coalesce(tt.wip_receipts, 0) - coalesce(tt.wip_issued, 0)
    as total_available_wip_quantity
from "production route card stages" s
join "customer orders" co
  on co.prd_no = s.prd_no
left join "products master" p
  on p.part_serial_number = co.part_serial_number
left join "customers master" c
  on c.customer_id = co.customer_id
left join transaction_totals tt
  on tt.prd_no = s.prd_no
  and tt.nature_of_operation_stage_id = s.id;

commit;

notify pgrst, 'reload schema';
