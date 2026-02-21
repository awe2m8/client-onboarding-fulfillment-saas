# Private Business Finance OS

MVP stack now aligned to:
- Frontend: Vercel
- API: Render
- Database: Supabase (Postgres)

## Live Frontend
- https://private-business-finance-os.vercel.app

## Current App (frontend)
- CSV import for transactions
- Auto-category tagging (keyword rules)
- Partner split percentage editing per transaction
- Needs-review status queue
- Basic recurring charge detection
- Local persistence in browser storage

## Files
- `/index.html`, `/styles.css`, `/app.js`: deployed frontend UI
- `/api/*`: Render-ready Node API
- `/supabase/schema.sql`: DB schema bootstrap
- `/render.yaml`: Render Blueprint

## Deploy Flow
1. Supabase
- Create a Supabase project.
- Run `/supabase/schema.sql` in SQL Editor.
- Copy your Postgres connection string into `DATABASE_URL`.

2. Render
- Create Blueprint from this repo using `/render.yaml`, or create a web service from `/api`.
- Set env vars:
  - `DATABASE_URL` = Supabase Postgres URL
  - `CORS_ORIGIN` = `https://private-business-finance-os.vercel.app`

3. Vercel
- Frontend already deployed at:
  - https://private-business-finance-os.vercel.app

## Local frontend run
```bash
python3 -m http.server 8080
```
Open http://localhost:8080

## CSV format
Required columns:
- `date`
- `description`
- `amount`

Optional columns:
- `account`
- `category`
- `partner_split_pct`
