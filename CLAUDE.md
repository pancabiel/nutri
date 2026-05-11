# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Nutri is a Brazilian-Portuguese food-tracking MVP. Three pieces:

- `backend/` — Quarkus 3.17 + Java 25 service. Compiles to a GraalVM native image and runs on AWS Lambda via API Gateway HTTP (`quarkus-amazon-lambda-http`). All resources are plain JAX-RS — the Lambda integration is transparent.
- `frontend/` — React 18 + Vite PWA. Mobile-first, talks to the backend via `/api/*` (proxied to `:8080` in dev).
- `db/schema.sql` — Postgres schema for Supabase. `pgvector` is enabled but currently unused (embedding columns exist on `produtos` / `comidas` but are not populated).
- `index.html` (repo root) — a standalone, build-free UI mockup of the full app. Open directly in a browser. Not part of the build.

## Common commands

Backend (run from `backend/`):

```bash
./mvnw quarkus:dev                        # JVM dev mode w/ live reload, API on :8080
./mvnw test                                # unit + RestAssured tests
./mvnw package                             # JVM jar in target/quarkus-app/
./mvnw package -Pnative                    # GraalVM native build → target/function.zip + sam.*.yaml
./mvnw package -Pnative \                  # native build via container (no local GraalVM needed)
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

Deployment walkthrough (SAM / Lambda / API Gateway): `backend/DEPLOY.md`.

## Required env (backend)

`backend/.env` is loaded by Quarkus dev mode. Required keys:

- `ANTHROPIC_API_KEY`
- `SUPABASE_DB_URL` — JDBC URL pointing at Supabase's **transaction pooler** on port `6543`, e.g. `jdbc:postgresql://aws-0-…pooler.supabase.com:6543/postgres?sslmode=require`
- `SUPABASE_DB_USER` (form: `postgres.<project-ref>`)
- `SUPABASE_DB_PASSWORD`

The Anthropic model and token budget are in `application.properties` (`anthropic.model`, `anthropic.max-tokens`).

## Architecture

### Backend layering (`com.nutri.*`)

```
resource/    JAX-RS endpoints (ChatResource, MealResource, ProdutoResource, ComidaResource, AnalyzeResource)
service/     ChatService — orchestrates AI + repos
ai/          AiService (prompts + JSON extraction) + AnthropicClient (MicroProfile RestClient)
repository/  Plain JDBC via Agroal datasource (no ORM, no Panache)
model/       Record-based DTOs (Produto, Comida, MealDay + nested MealItem/Section)
```

Key things to know when working here:

- **No ORM.** Repositories use raw JDBC against `AgroalDataSource`. New endpoints that need persistence should follow the same pattern (look at `MealRepository` for the canonical example, including the meal-day lazy-create flow).
- **PgBouncer transaction pooling** is in use → `application.properties` sets `prepareThreshold=0` to disable JDBC server-side prepared-statement caching. Don't re-enable it; you'll get `prepared statement S_1 already exists` under load.
- **AI integration is a single class.** `AiService` holds three prompts (chat parser, meal-image analyzer, nutrition-label scanner). The prompts are inline `"""…"""` strings in Portuguese. `application.properties` lists `quarkus.native.resources.includes=prompts/*.txt`, but no `prompts/` directory currently exists — prompts live in code today. If you externalize a prompt, drop the `.txt` file in `src/main/resources/prompts/` so native builds pick it up.
- **JSON extraction from Claude responses** is hand-rolled in `AiService.extractJson` / `balancedSpan`: prefer fenced ```` ```json ```` blocks, otherwise scan for the longest balanced `{…}`/`[…]`. The chat parser tolerates the model returning a bare array (legacy shape) as well as the documented `{section, date_offset_days, items}` object.
- **Chat flow priority** (`ChatService.log`): explicit `date`/`section` from the HTTP body always wins over the AI's inferred `date_offset_days` / `section`, which in turn wins over the time-of-day default (`defaultSection` buckets: <10h café, <15h almoço, <19h lanche, else jantar).
- **Meal items can reference a produto, a comida, or neither** (free-text). The schema's CHECK constraint is intentionally permissive (`or true`). When wiring new code, do not assume `produto_id` or `comida_id` is set.

### Frontend

- Single-page React app, no router — `App.jsx` keeps `screen` state and swaps between `chat | calendar | day | produtos | comidas`.
- Global state is one tiny context (`state/store.jsx`) that caches the produto/comida lists and a transient toast. No Redux / Zustand / react-query.
- All API calls go through `src/lib/api.js`, which uses a `BASE = "/api"` constant. Vite rewrites `/api/*` → `http://localhost:8080/*` in dev (the rewrite strips the `/api` prefix — backend routes are bare, e.g. `/produtos`, not `/api/produtos`).
- PWA is set up via `vite-plugin-pwa` with `NetworkFirst` caching for `/api/*` (5s timeout).
- Photo capture (`pickPhoto` in `lib/api.js`) uses an `<input type=file capture=environment>` then base64-encodes for the `/analyze-meal-image` and `/scan-nutrition-label` endpoints.

### Database conventions

- All PKs are `uuid` with `gen_random_uuid()` defaults.
- Nutrition is stored **per gram** on `produtos` (`calories_per_gram`, `protein_per_gram`, …). The AI prompt converts to/from per-100g for human-readable values — keep this division of labor when adding macros.
- `serving_grams` / `serving_label` on `produtos` are the optional "1 fatia = 25g" hint used by the chat parser to convert user-stated portions ("2 fatias") into grams. The schema file includes `ALTER TABLE ADD COLUMN IF NOT EXISTS` for these — treat `schema.sql` as both initial schema and historical migrations; append new columns the same way.

## Platform notes

- Primary OS for dev is Windows 11 / PowerShell. The Maven wrapper, npm scripts, and Quarkus dev mode all work from PowerShell; only the deployment commands in `DEPLOY.md` assume bash.
- Java 25 is required (see `<maven.compiler.release>21</maven.compiler.release>` — this targets bytecode 21 but the build still requires JDK 25 for `quarkus.platform.version=3.17.2`'s native image).
