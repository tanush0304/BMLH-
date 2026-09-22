# backend/

## schema/

`BMLH_All_SQL_Combined.sql` is a **reference copy** of the schema as already
applied to the live Supabase project (`rxqpiibhispjnqsrbwdw`). Do not edit it
in place and do not re-run it against the live project — it's there so the
full history of how the schema got to its current state is in the repo.

Verified against the live project via the PostgREST API (`GET /rest/v1/<table>`):
every table live uses the `"space separated master"` quoted-identifier naming
from Section 2 onward, **not** the plain snake_case names from Section 1 (e.g.
the live table is `"products master"`, not `products`). Section 1's names never
made it to production as written.

One known gap: Section 11 (`"quality logs"` / `"quality log readings"`) is
**not** applied live — those tables don't exist, even though the view
`"quality log results"` (which depends on them) does. The Quality module is
left out of the frontend nav until this is resolved.

## migrations/

Any new schema change from here on goes here as a numbered file, e.g.
`001_add_quality_logs.sql`. Never edit `schema/` in place once something is
live — a migration file is the record of what changed and why.

### Applying a migration

1. Open the Supabase project's SQL Editor (rxqpiibhispjnqsrbwdw).
2. Paste the migration file's contents and run it.
3. Once confirmed applied, append the same section to the bottom of
   `schema/BMLH_All_SQL_Combined.sql` (as a new numbered section, same
   convention as the existing ones) so the reference copy stays in sync.
