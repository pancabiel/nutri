---
description: Scaffold a new multi-tenant table the Nutri way — schema + user_id + index + RLS policy in schema.sql, plus a JDBC repository where every method takes userId and filters by it.
argument-hint: "<table_name> [columns / purpose]"
allowed-tools: Read, Edit, Write, Grep, Glob
---

Add a new multi-tenant table. Requested: **$ARGUMENTS**

Nutri is multi-tenant by `user_id` with raw JDBC (no ORM/Panache) and RLS as a second line of
defense. Follow these patterns exactly — `ComidaRepository` and the bottom of `db/schema.sql`
are the canonical references. Read them first if unsure.

### 1. `db/schema.sql` — append at the bottom (the file is also the migration log)
Use idempotent DDL so re-running on an existing DB is safe:
```sql
create table if not exists <table> (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  -- ... domain columns ...
  created_at timestamptz not null default now()
);
create index if not exists idx_<table>_user on <table> (user_id);

alter table <table> enable row level security;
create policy "own <table>" on <table>
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
```
For a **child** table (rows owned via a parent, not a direct `user_id`), scope the policy
through a subquery on the parent — copy the `own comida_produtos` / `own meal_sections` shape
instead of a direct `user_id` column.

Remember: there is no migration tool. Tell me to paste the new DDL into the Supabase SQL editor
— and ask **which environment** (local points at staging `ggofnndjlyipkrirdewj`; prod is
separate) before assuming.

### 2. `backend/src/main/java/com/nutri/repository/<Name>Repository.java`
- `@ApplicationScoped`, inject `AgroalDataSource`.
- **Every** public method takes `UUID userId` as its first parameter.
- **Every** SQL statement includes `where user_id = ?` (or, for child tables, joins/filters
  through the owned parent). Bind `userId` with `s.setObject(n, userId)`.
- `byId(UUID userId, UUID id)` filters on BOTH id and user_id. Inserts set `user_id` from the
  parameter, never from request data.
- If this table is referenced by AI/chat output, add `validateOwned...` checks before trusting
  any incoming UUID (mirror `MealRepository.validateOwnedProduto`).

### 3. Model + resource (if requested)
- Add a record DTO under `model/` (records, no setters — match `Produto` / `Comida`).
- If exposing an endpoint, add a JAX-RS resource under `resource/`; it reads the tenant from
  the `@RequestScoped CurrentUser` bean and passes `currentUser.id()` as `userId` to the repo.
  No extra auth wiring needed — `AuthFilter` already gates everything but the documented bypass
  paths.

After scaffolding, summarize the files touched and explicitly confirm: every repo method has
`userId` first + `where user_id = ?`, the table has its RLS policy, and remind me to apply the
DDL to the right Supabase environment.
