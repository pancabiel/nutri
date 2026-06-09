# Release runbook — 2026-06 (push notifications + meal-prep)

What ships in this release:

- **Meal-prep batch logging** — cooked-batch comidas with `yield_grams`, gram-portioned
  meal items (`unit`/`carbs`/`fat`), reusable marmita templates, inline "grupo" sub-recipes.
- **Comida sub-receitas por texto** — create comidas from free text, ratear grams in marmitas.
- **Web Push reminders** — `push_subscriptions` + `notification_prefs`, `WebPushSender`
  (hand-rolled VAPID, native-friendly), `ReminderService`, `POST /cron/send-reminders`
  on a new `nutri-send-reminders` EventBridge schedule (rate 15 min).
- **Landing page** — standalone `landing/` Vite site (separate Cloudflare Pages project).
- **E2E** — Playwright specs under `frontend/tests/e2e` (staging-real, AI stubbed).

Build gate: `mvn test` (backend) and `vite build` (frontend) both green as of this branch.

---

## Deploy order

Push sending **no-ops cleanly when VAPID keys are blank** (`WebPushSender` logs and disables,
`ReminderService.runDue` returns 0). So the code can ship before secrets are set — reminders
simply stay dark until the keys land. The DB migration is idempotent. Recommended order:

### 1. DB migration (PROD Supabase — `yfyujglzcefxgkwduhrk`, us-east-1)

> ⚠️ Local/dev points at **staging** (`ggofnndjlyipkrirdewj`). Connect to **prod** first.

Open the prod Supabase SQL editor and run `db/migrations/2026-06-push-mealprep.sql`
(idempotent; safe to re-run). Verify the new tables exist:

```sql
select count(*) from push_subscriptions;     -- 0
select count(*) from notification_prefs;      -- 0
select count(*) from meal_templates;          -- 0
\d meal_template_item_produtos
```

### 2. GitHub Secrets / Variables (backend Lambda)

Repo → Settings → Secrets and variables → Actions:

| Name | Type | Value |
|------|------|-------|
| `VAPID_PUBLIC_KEY`  | Secret   | `BMVE9turaqQvyrVElpXHyZPNgTcuAJvJYEKbUC-415fC-v_CtrYQUKs2u2YUaSIvcfnR8brg6_LrFHQNsjj4U_k` |
| `VAPID_PRIVATE_KEY` | Secret   | *(given separately — never commit)* |
| `VAPID_SUBJECT`     | Variable | `mailto:pancabiel@gmail.com` (optional; default already set) |

These are wired through `deploy-backend.yml` → `sam.native.yaml` (`VapidPublicKey`/
`VapidPrivateKey`/`VapidSubject`) → `application.properties`. No further edits needed.

### 3. Merge to `main` → backend auto-deploys

Merging the PR triggers `.github/workflows/deploy-backend.yml` (paths `backend/**`).
It builds the native image and `sam deploy`s, which **creates the `nutri-send-reminders`
EventBridge schedule** (rate 15 min, `X-Cron-Secret` from `CronSecret`). Confirm after deploy:

```bash
aws scheduler list-schedules    # or check the CloudFormation stack — nutri-send-reminders present
curl -X POST -H "X-Cron-Secret: $CRON_SECRET" "$API/cron/send-reminders"   # -> {"sent":0} early on
```

### 4. Frontend — Cloudflare Pages (`nutri`)

Dashboard → Pages → `nutri` → Settings → Variables and Secrets, add (baked at build time):

| Name | Value |
|------|-------|
| `VITE_VAPID_PUBLIC_KEY` | `BMVE9turaqQvyrVElpXHyZPNgTcuAJvJYEKbUC-415fC-v_CtrYQUKs2u2YUaSIvcfnR8brg6_LrFHQNsjj4U_k` |

Then trigger a redeploy (push or "Retry deployment") so the new bundle picks up the key.
The public key **must match** the backend's `VAPID_PUBLIC_KEY` exactly, or the browser
subscription will be rejected at send time.

### 5. Landing page — Cloudflare Pages (separate project)

`landing/` is its own Vite + wrangler project. Create/point a Cloudflare Pages project at it
(`landing/wrangler.jsonc`), `npm install && npm run build` in `landing/`, deploy. No env vars
required (static marketing site; `landing/.env.example` is a placeholder).

### 6. Local `.env` (optional, for local push testing)

Add to `backend/.env` and `frontend/.env.local` if you want push working locally against staging:

```
# backend/.env
VAPID_PUBLIC_KEY=BMVE9turaqQvyrVElpXHyZPNgTcuAJvJYEKbUC-415fC-v_CtrYQUKs2u2YUaSIvcfnR8brg6_LrFHQNsjj4U_k
VAPID_PRIVATE_KEY=<private key>
VAPID_SUBJECT=mailto:pancabiel@gmail.com

# frontend/.env.local
VITE_VAPID_PUBLIC_KEY=BMVE9turaqQvyrVElpXHyZPNgTcuAJvJYEKbUC-415fC-v_CtrYQUKs2u2YUaSIvcfnR8brg6_LrFHQNsjj4U_k
```

---

## Post-deploy smoke

1. App loads, sign in, Settings → enable notifications → browser permission prompt → a
   `push_subscriptions` row appears for the user.
2. Create a marmita template, apply it to a day, confirm meal items land with correct grams.
3. Wait for (or manually curl) `/cron/send-reminders` in a due slot → device receives a push.
4. Two-account isolation spot check still holds for the new tables (RLS + `where user_id = ?`).
