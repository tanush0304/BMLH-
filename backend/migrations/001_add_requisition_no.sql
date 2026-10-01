-- Adds a human-readable requisition number to "raw material requisitions",
-- which currently only has an internal bigserial id. Format: REQ-<year>-<seq>,
-- e.g. REQ-2026-001 -- matching the numbering convention requested for this
-- table (QTN/PRD/DC use a plain incrementing suffix with no year; this one
-- was explicitly asked for in the REQ-2026-001 shape, so it's intentionally
-- not identical to those).
--
-- Backfills the two existing rows (id 3 and 4, both order_date 2026-10-01)
-- before making the column NOT NULL + UNIQUE, so the migration is safe to
-- run against the live data as it stands today.

alter table "raw material requisitions"
  add column requisition_no text;

update "raw material requisitions"
set requisition_no = 'REQ-' || extract(year from order_date)::text || '-' || lpad(id::text, 3, '0')
where requisition_no is null;

alter table "raw material requisitions"
  alter column requisition_no set not null;

alter table "raw material requisitions"
  add constraint raw_material_requisitions_requisition_no_key unique (requisition_no);
