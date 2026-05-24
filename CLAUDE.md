# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Nutri is a Brazilian-Portuguese food-tracking MVP. Three pieces:

- `backend/` — Quarkus 3.17 + Java 25 service. Compiles to a GraalVM native image and runs on AWS Lambda via API Gateway HTTP (`quarkus-amazon-lambda-http`). All resources are plain JAX-RS — the Lambda integration is transparent.
- `frontend/` — React 18 + Vite PWA. Mobile-first, talks to the backend via `/api/*` (proxied to `:8080` in dev). Auth via `@supabase/supabase-js`; the JWT is attached to every backend request.
- `db/schema.sql` — Postgres schema for Supabase. The bottom half of the file is the multi-tenant migration (idempotent `ALTER ... IF NOT EXISTS`). `pgvector` is enabled but currently unused (embedding columns exist on `produtos` / `comidas` but are not populated).
- `index.html` (repo root) — a standalone, build-free UI mockup of the full app. Open directly in a browser. Not part of the build.

## Common commands

Backend (run from `backend/`). No Maven wrapper is checked in — use the system `mvn` (install via Chocolatey/Scoop on Windows, or `mvn wrapper:wrapper` once to generate `mvnw`):

```bash
mvn quarkus:dev                            # JVM dev mode w/ live reload, API on :8080
mvn test                                   # unit + RestAssured tests
mvn package                                # JVM jar in target/quarkus-app/
mvn package -Pnative                       # GraalVM native build → target/function.zip + sam.*.yaml
mvn package -Pnative \                     # native build via container (no local GraalVM needed)
  -Dquarkus.native.container-build=true \
  -Dquarkus.native.builder-image=quay.io/quarkus/ubi9-quarkus-mandrel-builder-image:jdk-25
```

Frontend (run from `frontend/`):

```bash
npm install
npm run dev        # Vite on :5173, proxies /api → :8080
npm run build      # production build (VITE_API_BASE optional)
npm run preview
```

DB: paste `db/schema.sql` into the Supabase SQL editor. There is no migration tool wired up.

## Required env

**Backend** (`backend/.env` — loaded by Quarkus dev mode; see `backend/.env.example`):

- `ANTHROPIC_API_KEY`
- `SUPABASE_DB_URL` — JDBC URL pointing at Supabase's **transaction pooler** on port `6543`, e.g. `jdbc:postgresql://aws-0-…pooler.supabase.com:6543/postgres?sslmode=require`
- `SUPABASE_DB_USER` (form: `postgres.<project-ref>`)
- `SUPABASE_DB_PASSWORD`
- `SUPABASE_JWT_ISSUER` — `https://<ref>.supabase.co/auth/v1`. **Required**: the backend derives the JWKS URL from it (`<issuer>/.well-known/jwks.json`) to fetch the ES256 public key.
- `SUPABASE_JWKS_URL` — optional override of the JWKS endpoint (set only if self-hosting or proxying).
- `CORS_ORIGINS` — `*` in dev, frontend domain in prod.

The backend still has a code path for the legacy HS256 symmetric secret (set `SUPABASE_JWT_SECRET` to activate it) — kept for projects that haven't migrated to ES256 signing keys. Not configured in production; leave unset unless you fork onto a pre-2025 Supabase project.

**Frontend** (`frontend/.env.local`; see `frontend/.env.example`):

- `VITE_SUPABASE_URL` — `https://<ref>.supabase.co`
- `VITE_SUPABASE_ANON_KEY` — anon (public) key from Project Settings → API
- `VITE_API_BASE` — leave empty in dev (Vite proxies `/api` to `:8080`); set to API Gateway URL in prod

Anthropic model and token budget live in `application.properties`. Models are split by call type so cheap calls go to the cheap model:
- `anthropic.model.chat` (default `claude-haiku-4-5`) — used by the chat parser.
- `anthropic.model.vision` (default `claude-sonnet-4-6`) — used by `/analyze-meal-image` and `/scan-nutrition-label`.
- `anthropic.max-tokens` — output cap shared by all calls.

Stripe billing (Sprint 2): set these in the backend env (see `backend/.env.example`):
- `STRIPE_SECRET_KEY` — `sk_test_...` or `sk_live_...`. Empty disables `/billing/*`.
- `STRIPE_WEBHOOK_SECRET` — `whsec_...` from dashboard → Developers → Webhooks → [endpoint]. Required for `/billing/webhook` to accept anything.
- `STRIPE_PRICE_MONTHLY` / `STRIPE_PRICE_YEARLY` — `price_...` IDs created in the Stripe dashboard for the "Nutri Pro" product.
- `APP_FRONTEND_URL` — base URL used to build Checkout success/cancel and Portal return URLs.

## Architecture

### Backend layering (`com.nutri.*`)

```
auth/        CurrentUser (@RequestScoped) + JwtValidator (HS256 manual verification)
resource/    JAX-RS endpoints (ChatResource, MealResource, ProdutoResource, ComidaResource,
             AnalyzeResource, ProfileResource, AccountResource, BillingResource, CronResource)
             + AuthFilter (ContainerRequestFilter) + exception mappers
service/     ChatService — orchestrates AI + repos, reads CurrentUser
ai/          AiService (prompts + JSON extraction) + AnthropicClient (MicroProfile RestClient)
             + Pricing (per-model USD/1M-token rates, computes micro-USD per call)
billing/     StripeClient (raw HTTP — no Stripe SDK, native-image friendly; HMAC-SHA256
             webhook verification) + BillingService (Checkout, Portal, webhook dispatch)
repository/  Plain JDBC via Agroal datasource (no ORM, no Panache); every method takes userId.
             Includes UsageRepository for metering (insert event, lifetime/window counts,
             per-user and global cost sums for caps + kill switch).
model/       Record-based DTOs (Produto, Comida, MealDay + nested MealItem/Section, Profile)
```

Key things to know when working here:

- **Multi-tenant by user_id.** Every row in `produtos`, `comidas`, `meal_days` (and their children via FK chains) is owned by a `user_id` referencing `auth.users`. Every repository method takes `UUID userId` as the first parameter and includes `where user_id = ?` in every query. RLS policies enforce the same at the DB layer as a second line of defense. The current user is extracted from the Supabase JWT by `AuthFilter` and exposed via the `@RequestScoped CurrentUser` bean.
- **AuthFilter rejects everything without a valid `Authorization: Bearer <jwt>`** except OPTIONS preflight, `q/health*` endpoints, `billing/webhook` (Stripe-signed; verified inside the handler) and `cron/*` paths (which validate `X-Cron-Secret` inside the handler). The JWT is verified manually by `JwtValidator`, which supports both **ES256** (default, asymmetric "JWT Signing Keys" — fetched from the project's JWKS endpoint and cached in-memory, with on-demand refresh when an unknown `kid` shows up) and **HS256** (legacy symmetric secret). No external JWT library — just `java.security` + `javax.crypto` so it works clean in native image. Issuer, expiry, and `sub` (must be a UUID) are checked for both algorithms.
- **No ORM.** Repositories use raw JDBC against `AgroalDataSource`. New endpoints that need persistence should follow the same pattern (look at `MealRepository` for the canonical example, including the meal-day lazy-create flow).
- **`matched_id` from the AI must be validated.** When inserting a `meal_item` with a `produto_id` or `comida_id` coming from the chat parser, `MealRepository` checks that the UUID actually belongs to the current user (via `validateOwnedProduto` / `validateOwnedComida`). If not owned, the ID is silently dropped to `null` (item kept as free-text). This defends against prompt injection forging cross-user IDs.
- **PgBouncer transaction pooling** is in use → `application.properties` sets `prepareThreshold=0` to disable JDBC server-side prepared-statement caching. Don't re-enable it; you'll get `prepared statement S_1 already exists` under load.
- **AI integration is a single class.** `AiService` holds three prompts (chat parser, meal-image analyzer, nutrition-label scanner). The prompts are inline `"""…"""` strings in Portuguese. Each prompt has a defensive line instructing the model to ignore embedded instructions from user-supplied content. `application.properties` lists `quarkus.native.resources.includes=prompts/*.txt`, but no `prompts/` directory currently exists — prompts live in code today. If you externalize a prompt, drop the `.txt` file in `src/main/resources/prompts/` so native builds pick it up.
- **Prompt caching is on for the chat parser's memory block** (`cache_control: { type: ephemeral }`). The memory block holds the user's produto/comida list — re-sent every chat turn — so caching is the difference between paying full input cost every message and paying the 10% cached-read rate. Don't strip the marker without weighing the cost impact.
- **Every Claude call goes through `AiService.call(kind, …)`**, which: picks the model (`chat` → Haiku, `vision` → Sonnet), parses token usage from the response (`input_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens`, `output_tokens`), computes cost via `Pricing.microUsd`, and inserts a `usage_events` row via `UsageRepository`. Logging failures are swallowed — metering must not break user-facing flows. The `kind` string (`"chat"`, `"photo"`, `"label"` — constants `AiService.KIND_CHAT/PHOTO/LABEL`) is the dimension caps and dashboards aggregate on. Before hitting Anthropic, the method also checks the global kill switch and enforces per-user caps (see "Cost caps, kill switch, cron" below).
- **Numeric clamps in the chat parser** (`AiService` post-processing): per-item `calories ≤ 5000`, `protein ≤ 300`, etc. This blunts prompt-injection attempts to insert absurd values into a meal log. Keep clamps in sync if you add macros.
- **JSON extraction from Claude responses** is hand-rolled in `AiService.extractJson` / `balancedSpan`: prefer fenced ```` ```json ```` blocks, otherwise scan for the longest balanced `{…}`/`[…]`. The chat parser tolerates the model returning a bare array (legacy shape) as well as the documented `{section, date_offset_days, items}` object.
- **Chat flow priority** (`ChatService.log`): explicit `date`/`section` from the HTTP body always wins over the AI's inferred `date_offset_days` / `section`, which in turn wins over the time-of-day default (`defaultSection` buckets: <10h café, <15h almoço, <19h lanche, else jantar).
- **Meal items can reference a produto, a comida, or neither** (free-text). The schema's CHECK constraint is intentionally permissive (`or true`). When wiring new code, do not assume `produto_id` or `comida_id` is set.

### Frontend

- Single-page React app, no router — `App.jsx` is the top-level gate: subscribes to `supabase.auth.onAuthStateChange`, fetches `/profile`, then routes between `LoginScreen` (no session) → `OnboardingScreen` (session but `onboarding_complete = false`) → `Shell` (main app). `Shell` keeps a `screen` state and swaps between `chat | calendar | day | produtos | comidas`. Settings is a full-screen overlay.
- Global state is one tiny context (`state/store.jsx`) that caches the produto/comida lists and a transient toast. No Redux / Zustand / react-query.
- All API calls go through `src/lib/api.js`. Each request grabs the current Supabase JWT (via `currentToken()` in `lib/supabase.js`) and sends it as `Authorization: Bearer <jwt>`. On 401 the client signs out and reloads. `BASE = "/api"`; Vite rewrites `/api/*` → `http://localhost:8080/*` in dev (the rewrite strips the `/api` prefix — backend routes are bare, e.g. `/produtos`, not `/api/produtos`).
- PWA is set up via `vite-plugin-pwa` with `NetworkFirst` caching for `/api/*` (5s timeout).
- Photo capture (`pickPhoto` in `lib/api.js`) uses an `<input type=file capture=environment>` then resizes to max 1024px on the longest side and re-encodes as JPEG quality 0.85 in a canvas before base64. This cuts Sonnet vision-call cost roughly 4-6×; don't bypass without that tradeoff in mind. The base64 payload is what goes to `/analyze-meal-image` and `/scan-nutrition-label`.
- `OnboardingScreen` collects age/sex/weight/height/goal/activity and computes BMR via Mifflin–St Jeor + a protein target of 1.8 g/kg. The user can leave the calorie/protein goal blank — onboarding only requires the inputs needed for the suggestion. On submit it PUTs `/profile` with `onboarding_complete = true` so `App.jsx` routes them into the main `Shell`.
- `SettingsScreen` is a full-screen overlay reachable from `Shell`. Holds sign-out and the LGPD "Excluir conta" button → `DELETE /account` → `supabase.auth.signOut()` → reload.

### Database conventions

- All PKs are `uuid` with `gen_random_uuid()` defaults.
- Every domain table has `user_id uuid references auth.users(id) on delete cascade` plus an index on it. The `MULTI-TENANT MIGRATION` section at the bottom of `db/schema.sql` is the canonical record of how the move from single-tenant happened.
- RLS is enabled on every domain table with `using (user_id = auth.uid())` policies. The backend connects with the `postgres.<ref>` role which bypasses RLS, but every query still includes `where user_id = ?` — RLS is the second line of defense.
- A trigger on `auth.users` (`profiles_create_on_signup`) auto-creates an empty `profiles` row on signup; `ProfileRepository.getOrCreate` also handles lazy creation in case the trigger ever fails.
- Nutrition is stored **per gram** on `produtos` (`calories_per_gram`, `protein_per_gram`, …). The AI prompt converts to/from per-100g for human-readable values — keep this division of labor when adding macros.
- `serving_grams` / `serving_label` on `produtos` are the optional "1 fatia = 25g" hint used by the chat parser to convert user-stated portions ("2 fatias") into grams. The schema file includes `ALTER TABLE ADD COLUMN IF NOT EXISTS` for these — treat `schema.sql` as both initial schema and historical migrations; append new columns the same way.
- `usage_events` is the metering table — one row per Anthropic call, with `kind`, `model`, four token counters (`input_tokens`, `cached_read_tokens`, `cached_write_tokens`, `output_tokens`), and `cost_micro_usd` (USD × 1_000_000 — sub-cent precision matters because a Haiku chat is often well under 1¢). Indexed on `(user_id, kind, created_at desc)` and on `created_at desc` for the global kill-switch query. RLS policy `own usage` restricts reads to the owner.
- `profiles` is 1:1 with `auth.users`. Holds subscription state (`is_pro`, plus Stripe customer/sub IDs, ready for Sprint 2), onboarding inputs (`age`, `sex`, `weight_kg`, `height_cm`, `activity_level`, `goal`), computed targets (`calorie_target`, `protein_target_g`), and `onboarding_complete` — the boolean `App.jsx` reads to decide whether to show `OnboardingScreen`.

### Cost caps, kill switch, cron

- **`AiService.call` is the choke point** — it (1) checks the global kill switch, (2) enforces per-user caps via `enforceCap`, (3) hits Anthropic, (4) records usage. Any new Claude call must go through it, not direct to `AnthropicClient`, or it bypasses all three guards.
- **Caps → HTTP 402** (`CapExceededException` → `CapExceededMapper`). Free is **lifetime** (3 chat / 1 photo / 1 label); Pro is **daily** (20 / 10 / 10), day boundary in `America/Sao_Paulo`. The 402 body carries `{kind, tier, window, limit, used, message}` for the frontend's upgrade modal.
- **Kill switch → HTTP 503** (`KillSwitchTrippedException`). Single-row `kill_switch` table — auto-tripped by `POST /cron/kill-switch-check` when rolling-24h Claude spend exceeds `KILLSWITCH_DAILY_USD` (default `50`). **Auto-reset doesn't exist** — clear manually with `update kill_switch set tripped = false where id = 'global';`.
- **`/cron/*` bypasses `AuthFilter`** and authenticates via the `X-Cron-Secret` header (constant-time compare; fails closed if unset). Invoked by an EventBridge schedule — wiring commands are in `CronResource`'s javadoc. New cron endpoints belong under `CronResource` so they inherit this auth.

### Billing (Stripe)

- **No Stripe SDK** — `StripeClient` calls the REST API directly with `java.net.http.HttpClient` and form-encoded bodies. Reasons: the official SDK is GSON+reflection-heavy and painful to make native-image friendly, and our surface is only three calls (Customer create, Checkout Session create, Billing Portal Session create). JSON responses are parsed with a small ad-hoc string extractor (`extractField`) — fine for `{id, url}` shapes. Don't grow this; for richer responses switch to Jackson.
- **`/billing/webhook` bypasses `AuthFilter`** and authenticates via the `Stripe-Signature` header. `StripeClient.verifySignature` does HMAC-SHA256 over `<timestamp>.<rawBody>` and enforces Stripe's documented 5-minute timestamp tolerance. The signed-payload check is what stops anyone from POSTing fake "is_pro=true" events. Always returns 200 on a valid signature even if we ignore the event type — Stripe retries 5xx for 3 days, which is noisy.
- **Events handled**: `checkout.session.completed` (initial activation, persists customer+sub IDs, flips `is_pro`), `customer.subscription.created/updated` (refreshes status + `pro_until` from `current_period_end`), `customer.subscription.deleted` (clears `is_pro`). `invoice.payment_failed` is logged but no-op — Stripe Smart Retries handles dunning.
- **User mapping** uses `profiles.stripe_customer_id`. Created lazily on first checkout (`BillingService.ensureCustomer`) and persisted via `setStripeCustomerId` so subsequent webhooks and Portal sessions resolve cleanly. `client_reference_id` on the Checkout Session also carries the user UUID as a belt-and-suspenders mapping for the very first event.
- **Frontend trigger paths**: any 402 from any API call dispatches `nutri:cap-exceeded` (see `frontend/src/lib/api.js`), which `App.jsx` listens for and pops `UpgradeModal`. Explicit "Assinar" CTAs dispatch `nutri:open-upgrade`. Successful Checkout returns to `?billing=success` and `App.jsx` refreshes the profile so the UI flips immediately (the webhook usually fires first).

## Platform notes

- Primary OS for dev is Windows 11 / PowerShell. The npm scripts and Quarkus dev mode all work from PowerShell. PowerShell-specific: use `$env:VAR`, no `&&` chaining (use `;` or `if ($?) { }`), no `2>&1` on native exes.
- Java 25 is required (see `<maven.compiler.release>21</maven.compiler.release>` — this targets bytecode 21 but the build still requires JDK 25 for `quarkus.platform.version=3.17.2`'s native image).
- No Maven wrapper. The user runs `mvn` from PATH. If you generate `mvnw`/`mvnw.cmd` via `mvn wrapper:wrapper`, update this file's command list to use them.

## Production deployment

- **Backend** deploys via `.github/workflows/deploy-backend.yml` on push to `main` (paths: `backend/**`). It builds the GraalVM native image, then runs `sam deploy -t backend/sam.native.yaml --parameter-overrides …` with values from GitHub Secrets. **Adding a new env var requires three coordinated edits**: `application.properties` (read it), `sam.native.yaml` (declare a `Parameter` and add to `Environment.Variables`), and `deploy-backend.yml` (pass it via `--parameter-overrides`). Skip any of these and the var silently won't reach the Lambda.
- **Frontend** deploys to **Cloudflare Pages** (project `nutri`, prod URL `https://nutri.pancabiel.workers.dev`). `VITE_*` env vars are set in Cloudflare Dashboard → Pages → Settings → Variables and Secrets, baked into the bundle at build time. `wrangler.jsonc` is the asset-server runtime config, not env config.
- **Three places must share the same prod origin**: `CORS_ORIGINS` (backend env), Supabase Auth → URL Configuration (Site URL + Redirect URLs allowlist), and Google OAuth → Authorized JavaScript origins. Forgetting any one breaks sign-in or every API call.

## SaaS-launch state (branch `saas-changes`)

The project is mid-way through a single-tenant → multi-tenant SaaS conversion. Roughly:

- **Sprint 0 (foundation) — done in code.** Multi-tenant schema + RLS, JWT auth, Profile/Account endpoints, frontend login/onboarding/settings, LGPD delete. One manual item remains: a two-account isolation smoke test.
- **Sprint 1 (cost + AI safety) — done.** `usage_events` + per-call metering, per-call-type model selection, prompt caching, numeric clamps, defensive prompt lines, frontend image resize, pre-call cap enforcement (402), nightly kill-switch cron (503). Remaining: Anthropic console spend alerts (manual).
- **Sprint 2 (billing) — code done, dashboard setup pending.** `BillingResource` + `BillingService` + `StripeClient` (raw HTTP, native-friendly), webhook signature verification (`StripeClientTest` covers tamper / replay / rotation), `UpgradeModal` on 402 + Settings Pro panel + portal redirect. Pending: create Stripe account/product/prices in dashboard, configure GitHub Secrets (`STRIPE_*`), point Stripe webhook at `<api>/billing/webhook` and copy the `whsec_...` to env.
- **Sprint 3 (growth) — not started.** Landing page, email drip, referral.

When adding new endpoints or call paths during Sprint 1+: any new Claude call must go through `AiService.call(kind, …)` (so it's metered), and any new user-data table must include `user_id` + RLS + `where user_id = ?` in the repository, matching the patterns above.
