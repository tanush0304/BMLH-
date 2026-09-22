# BMLH Operations Console

Shop-floor operations app for BMLH Engineering Pvt. Ltd. — production
logging, job-order (outsourcing) tracking, quality inspection, maintenance,
and stores, backed by Supabase (Postgres).

## Structure

- [`frontend/`](frontend/) — React (Vite) + Tailwind CSS app. See below to run it.
- [`backend/`](backend/) — Supabase schema reference and migrations. See [backend/README.md](backend/README.md).

## Running the frontend

```
cd frontend
npm install
cp .env.example .env   # fill in your Supabase project URL + anon key
npm run dev
```

## Notes

- The database schema is fixed and lives in Supabase directly; `backend/schema/`
  is a reference copy, not something you apply. New schema changes go through
  `backend/migrations/` — see [backend/README.md](backend/README.md).
- The Quality module is currently left out of the app nav — see
  [backend/README.md](backend/README.md) for why.
