# E2E tests (Playwright)

End-to-end tests for the Nutri PWA. They run in **staging-real** mode: real Supabase auth and
the real **staging** backend, with the AI endpoints stubbed so runs are free and deterministic.

## One-time setup

1. Install deps + browser (from `frontend/`):
   ```
   npm install
   npx playwright install chromium
   ```
2. Create a dedicated **staging** test user and give it a password:
   - Supabase dashboard → project `ggofnndjlyipkrirdewj` → Authentication → Users → add user,
     set a password.
   - Make sure its `profiles.onboarding_complete = true` (so tests land in the main Shell) and
     ideally `is_pro = true` (so AI caps never block a run, even when an endpoint isn't stubbed).
3. Copy `tests/e2e/.env.e2e.example` → `tests/e2e/.env.e2e` and fill in the staging URL, anon
   key, and the test user's email/password. (`.env.e2e` and `tests/e2e/.auth/` are gitignored.)

## Running

Start the backend against staging first (it's not auto-started):
```
cd backend
mvn quarkus:dev          # serves :8080 against staging — Vite proxies /api → here
```
Then, in another shell:
```
cd frontend
npm run test:e2e         # headless
npm run test:e2e:ui      # interactive UI mode
npm run test:e2e:headed  # watch the browser
npm run test:e2e:report  # open last HTML report
```
`global-setup.js` signs the test user in once and writes `tests/e2e/.auth/state.json`; every
test reuses it, so there's no login UI to drive (the app is OTP/OAuth only).

## Writing tests

- Import `test`, `expect`, `mockAi` from `./fixtures.js` — **not** from `@playwright/test`.
  AI endpoints are stubbed automatically; opt into the real model with `test.use({ realAi: true })`.
- No `data-testid`s — select by role/placeholder/text (Portuguese labels). Read the JSX for
  exact strings.
- CRUD hits the real staging DB → clean up what you create; use unique names. `workers: 1`.
- Or just run `/nutri-test <feature>` and let the **playwright-test-author** subagent write them.
