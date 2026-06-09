---
description: Add a new backend environment variable correctly — the three coordinated edits (application.properties, sam.native.yaml, deploy-backend.yml) plus .env.example, so it actually reaches the Lambda.
argument-hint: "<VAR_NAME> [short description of what it's for]"
allowed-tools: Read, Edit, Grep
---

Wire up a new backend env var end-to-end. Requested: **$ARGUMENTS**

Adding a backend env var in Nutri requires **three coordinated edits** — skip any one and the
variable silently never reaches the deployed Lambda. Do all of them, in order, and confirm.

1. **`backend/src/main/resources/application.properties`** — read the env var into a config
   property, e.g. `some.feature.token=${SOME_VAR:}` (provide a sensible default after the colon
   when the feature should degrade gracefully when unset — follow how `stripe`/`vapid` keys do it).
   Inject it in code with `@ConfigProperty(name = "some.feature.token")`.

2. **`backend/sam.native.yaml`** — TWO additions:
   - Under `Parameters:` declare a parameter (PascalCase of the var), with `Type: String`,
     `NoEcho: true` for secrets, and a `Default: ''` if it's optional. Add a `Description:`.
   - Under `Resources → NutriBackendNative → Environment → Variables:` map it:
     `SOME_VAR: !Ref SomeVar`.

3. **`.github/workflows/deploy-backend.yml`** — add the parameter to the `sam deploy ...
   --parameter-overrides` list: `"SomeVar=${{ secrets.SOME_VAR }}"` (use `secrets.` for
   sensitive values, `vars.` for non-sensitive config; mirror the existing Stripe/VAPID lines).

4. **`backend/.env.example`** — document the var with a one-line comment so local dev knows to
   set it (and add to your real `backend/.env`, which is gitignored).

Naming convention: env var `SCREAMING_SNAKE_CASE`, CloudFormation parameter `PascalCase`,
config property `dotted.lower.case`. Keep all three consistent.

After editing, show me a short summary table mapping the four locations and remind me that the
GitHub Secret/Variable (`SOME_VAR`) must be created in the repo settings, plus the CLAUDE.md
"Production deployment" note. If this var also has a frontend counterpart (`VITE_*`), that's a
separate path (Cloudflare Pages env) — flag it but don't touch it here.
