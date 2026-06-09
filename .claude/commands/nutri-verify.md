---
description: Run Nutri's local verification — backend mvn test and a frontend production build — and report pass/fail with the relevant output.
argument-hint: "[backend | frontend]  (default: both)"
allowed-tools: Bash, Read
---

Verify the project builds and tests pass. Target: $ARGUMENTS (default: both).

Run from the right working directories (PowerShell on Windows — no `&&` chaining, use `;`):

**Backend** (`backend/`): `mvn test`
- This runs the unit + RestAssured tests (`AiServiceCapTest`, `JwtValidatorTest`,
  `StripeClientTest`, `WebPushSenderTest`). Requires JDK 25 on PATH and system `mvn`
  (no wrapper checked in).
- Do NOT run the native build (`-Pnative`) as part of verify — it's slow. Only run it if I
  explicitly ask to validate the GraalVM image.

**Frontend** (`frontend/`): `npm run build`
- A clean Vite production build is the unit-level verification. Run `npm install` first only if
  `node_modules` is missing.
- Playwright **E2E is separate** and NOT part of default verify — it needs the backend running
  on :8080 against staging plus `tests/e2e/.env.e2e` configured. Only run `npm run test:e2e`
  if I explicitly ask, or if the stack is already up. See `frontend/tests/e2e/README.md`.

For each target report a one-line PASS/FAIL and, on failure, the relevant error excerpt (not
the whole log) plus the file:line and a suggested fix. If both pass, say so plainly and stop —
don't start changing code unless I ask. Note in passing if the backend touched AI/billing/auth
paths but no corresponding test changed, since those are the covered-by-tests areas.
