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
- http://localhost:8081/sprints.html (sprint planning + retro app)

## Theme controls (global + per-app)
Every app now includes a Theme dock (bottom-right):
- `Global`: sets light/dark for all apps
- `This App`: `Use Global`, `Light`, or `Dark` override for the current app only

Theme preferences persist in browser local storage.

## Accessibility smoke check
Run this from the repo root before pushing UI changes:

```bash
node scripts/a11y-smoke.mjs
```

What it checks:
- Page-level metadata (`lang`, `title`, `viewport`)
- Safe external links (`target="_blank"` with safe `rel`)
- Button accessible naming
- Basic form-control labeling heuristics

## Playwright + axe (CI-ready)
Install dependencies once, then run the suite:

```bash
npm install
npx playwright install chromium
npm run test:a11y
```

CI automation:
- Workflow: `/.github/workflows/ui-a11y.yml`
- Runs smoke checks + Playwright/axe on push to `main` and pull requests.

## Team sync setup (for shared data)
If you want both partners to use the same live dataset:

1. Deploy the API (`/api`) to Render.
2. Run `/supabase/schema.sql` in Supabase SQL Editor.
  - If you already deployed earlier, re-run it now to apply the `app_key` migration for multi-app sync isolation.
3. Set Render env vars:
- `DATABASE_URL` = Supabase Postgres connection string
- `CORS_ORIGIN` = your frontend URL(s), comma-separated if needed
4. In the app UI, set:
- `API URL` to your Render API URL
- `Workspace Key` to a shared key like `acme-onboarding`
5. Click `Save Connection`, then `Pull Shared Data`.
6. Keep `Auto sync` on for near-real-time collaboration.

Both app modules use the same sync service with app isolation:
- `onboarding.html` syncs with app key `onboarding`
- `project-management.html` syncs with app key `project-management`
- `sprints.html` syncs with app key `sprints`

## Files
- `/index.html`: launcher page with app badges
- `/onboarding.html`: onboarding + fulfillment app UI
- `/project-management.html`: project management app UI
- `/sprints.html`: two-week sprint planning + retro app UI
- `/launcher.css`: launcher page styling
- `/styles.css`: styling and responsive layout
- `/ui-tokens.css`: shared design tokens and interaction primitives
- `/ui-components.css`: shared component-level visual polish
- `/app.js`: app logic (state, kanban, tasks, notes, local storage, team sync)
- `/project-management.css`: project management styling
- `/project-management.js`: project management logic
- `/sprints.css`: sprint app styling
- `/sprints.js`: sprint app logic
- `/scripts/a11y-smoke.mjs`: lightweight accessibility smoke checks for local pages
- `/UIUX_AUDIT_PHASE1.md`: UI audit + scorecard
- `/ACCESSIBILITY_MATRIX_PHASE2.md`: accessibility matrix baseline
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
