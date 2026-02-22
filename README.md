# Client Onboarding Ops (MVP)

A lightweight internal SaaS workspace to track clients from onboarding through delivery fulfillment.

## What this app does
- Add client records directly in-app
- Track onboarding and fulfillment with Kanban boards
- Drag and drop clients across stages
- Track onboarding form status and payment status manually
- Manage per-client tasks and notes
- Keep an activity timeline for each client
- Filter by owner, product, payment/form status, pipeline, and idle age
- Export/import all workspace data as JSON
- Optional team sync through the API + shared workspace key

## Stripe decision for MVP
Stripe is intentionally **not integrated** in this version.

Use manual payment status updates in the app:
- `Not Sent`
- `Sent`
- `Paid`
- `Issue`

## Run frontend locally
```bash
python3 -m http.server 8081
```
Then open:
- http://localhost:8081
- http://localhost:8081/onboarding.html (direct onboarding app)
- http://localhost:8081/project-management.html (project management app)

## Team sync setup (for shared data)
If you want both partners to use the same live dataset:

1. Deploy the API (`/api`) to Render.
2. Run `/supabase/schema.sql` in Supabase SQL Editor.
3. Set Render env vars:
- `DATABASE_URL` = Supabase Postgres connection string
- `CORS_ORIGIN` = your frontend URL(s), comma-separated if needed
4. In the app UI, set:
- `API URL` to your Render API URL
- `Workspace Key` to a shared key like `acme-onboarding`
5. Click `Save Connection`, then `Pull Shared Data`.
6. Keep `Auto sync` on for near-real-time collaboration.

## Files
- `/index.html`: launcher page with app badges
- `/onboarding.html`: onboarding + fulfillment app UI
- `/project-management.html`: project management app UI
- `/launcher.css`: launcher page styling
- `/styles.css`: styling and responsive layout
- `/app.js`: app logic (state, kanban, tasks, notes, local storage, team sync)
- `/project-management.css`: project management styling
- `/project-management.js`: project management logic
- `/api/*`: Render-ready API
- `/supabase/schema.sql`: DB bootstrap
- `/render.yaml`: optional Render blueprint

## Data storage modes
- Local-only mode: browser `localStorage`
- Shared mode: API + Postgres table `ops_client_records`

## Default pipelines
### Onboarding
- New Client
- Form Sent
- Form Completed
- Payment Sent
- Paid
- Kickoff Scheduled
- Ready for Delivery

### Fulfillment
- In Progress
- Waiting on Client
- Internal Review
- Revision
- Completed

## Notes
- Moving to fulfillment requires:
  - Onboarding form = `Completed`
  - Payment status = `Paid`
- The `Clear All Data` button only clears the current browser copy.
