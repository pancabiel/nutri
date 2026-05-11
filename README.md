# Nutri

Smart food tracking MVP with chat-style input, camera-based meal + nutrition-label recognition, and a structured food memory (Produtos & Comidas).

## Stack

| Layer    | Tech |
|----------|------|
| Backend  | **Java 25**, Quarkus 3.17, RESTEasy Reactive, Agroal/JDBC, GraalVM native, AWS Lambda HTTP |
| Frontend | **React 18 + Vite**, Tailwind, PWA (vite-plugin-pwa) |
| DB       | **Supabase Postgres**, pgvector |
| AI       | **Anthropic API** (Claude) — text + vision |

## Structure

```
backend/    Quarkus service (Lambda HTTP)
frontend/   React + Vite PWA (mobile-first)
db/         PostgreSQL schema (run in Supabase)
index.html  Interactive UI mockup (standalone, no build)
```

## Quick start (dev)

### 1. Database
Create a Supabase project, open the SQL editor, paste `db/schema.sql`.

### 2. Backend
```bash
cd backend
cp .env.example .env          # fill in ANTHROPIC_API_KEY + SUPABASE_DB_*
./mvnw quarkus:dev
```
API → http://localhost:8080

### 3. Frontend
```bash
cd frontend
npm install
npm run dev
```
App → http://localhost:5173 (proxies `/api` → 8080)

## API

| Method | Path                                   | Notes |
|--------|----------------------------------------|-------|
| GET    | `/produtos?q=&limit=`                  | List/search raw items |
| POST   | `/produtos`                            | Create |
| PUT    | `/produtos/{id}`                       | Update |
| DELETE | `/produtos/{id}`                       | Delete |
| GET    | `/comidas?q=&limit=`                   | Composed foods |
| POST   | `/comidas`                             | Body includes `items: [{produtoId, quantityGrams}]` |
| PUT/DE | `/comidas/{id}`                        | |
| GET    | `/meal-days/recent?days=30`            | Summary per day |
| GET    | `/meal-days/{YYYY-MM-DD}`              | Day detail (creates day + default sections if missing) |
| POST   | `/meal-days/{date}/sections`           | `{name}` |
| DELETE | `/meal-days/sections/{id}`             | |
| POST   | `/meal-days/sections/{id}/items`       | Add `MealItem` |
| DELETE | `/meal-days/items/{id}`                | |
| POST   | `/chat-log`                            | `{message, date?, section?}` → parses + saves |
| POST   | `/analyze-meal-image`                  | `{imageBase64, mediaType}` |
| POST   | `/scan-nutrition-label`                | `{imageBase64, mediaType}` → macros per 100 g |

Expected AI JSON for chat + meal image (array):
```json
[
  { "type": "produto", "matched_id": "uuid|null", "name": "Ovo",
    "quantity": 2, "estimated_grams": 120, "calories": 186, "protein": 15.6 }
]
```

## Environment variables

| Name                   | Purpose |
|------------------------|---------|
| `ANTHROPIC_API_KEY`    | Claude API |
| `SUPABASE_DB_URL`      | `jdbc:postgresql://...pooler.supabase.com:6543/postgres?sslmode=require` |
| `SUPABASE_DB_USER`     | `postgres.<project-ref>` |
| `SUPABASE_DB_PASSWORD` | DB password |

## Deploy

See `backend/DEPLOY.md` for the AWS Lambda native deployment walkthrough.

## Mockup

`index.html` at the root is a self-contained clickthrough of the full UI. Open it in a browser — no build.
