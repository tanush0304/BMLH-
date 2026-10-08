-- 020: Remarks on Machine Master (client's Machine Master sheet has a
-- Remarks column; "machines master" has no remarks column today).
-- Nullable free text -- no backfill needed.

begin;

alter table "machines master"
  add column remarks text;

commit;

-- After running:
--   select column_name, data_type from information_schema.columns
--   where table_name = 'machines master' and column_name = 'remarks';   -- 1 row, text
--   notify pgrst, 'reload schema';
