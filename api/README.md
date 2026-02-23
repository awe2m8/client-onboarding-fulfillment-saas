# Client Onboarding Ops API

Express API for Render + Supabase.

## Endpoints
- `GET /health`
- `GET /transactions` (legacy)
- `POST /transactions/bulk` (legacy)
- `GET /ops/workspaces/:workspaceKey/records?app=onboarding|project-management`
- `POST /ops/workspaces/:workspaceKey/sync?app=onboarding|project-management`

## Local run
```bash
cd api
npm install
cp .env.example .env
npm run dev
```

## Supabase setup
Run `/supabase/schema.sql` in Supabase SQL editor.

Re-run the schema when upgrading existing deployments so `ops_client_records.app_key` is added for module-isolated sync.

## Render setup
Use the root `/render.yaml` Blueprint or create a Node Web Service from `api/`.

Required env vars:
- `DATABASE_URL` = Supabase Postgres connection string
- `CORS_ORIGIN` = allowed frontend origins (comma-separated)
  - Example: `https://client-onboarding-fulfillment-saas.vercel.app,https://client-onboarding-fulfillment-saas-git-main-awe2m8.vercel.app`
