-- Nutri MVP schema for Supabase (PostgreSQL)
-- Run in the Supabase SQL editor.
--
-- This file is BOTH the initial schema and the historical migration log.
-- New columns / tables go at the bottom as `ALTER ... IF NOT EXISTS` /
-- `CREATE TABLE IF NOT EXISTS` so re-running on an existing DB is safe.

create extension if not exists "pgcrypto";
create extension if not exists vector;

-- ============================================================
-- PRODUTOS (raw items)
-- ============================================================
create table if not exists produtos (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  brand              text,
  calories_per_gram  double precision not null default 0,
  protein_per_gram   double precision not null default 0,
  carbs_per_gram     double precision,
  fat_per_gram       double precision,
  serving_grams      double precision,
  serving_label      text,
  embedding          vector(1024),
  created_at         timestamptz not null default now()
);
-- migration: add serving columns to existing tables
alter table produtos add column if not exists serving_grams double precision;
alter table produtos add column if not exists serving_label text;
create index if not exists idx_produtos_name on produtos (lower(name));

-- ============================================================
-- COMIDAS (composed foods)
-- ============================================================
create table if not exists comidas (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  embedding  vector(1024),
  created_at timestamptz not null default now()
);
create index if not exists idx_comidas_name on comidas (lower(name));

create table if not exists comida_produtos (
  id             uuid primary key default gen_random_uuid(),
  comida_id      uuid not null references comidas(id) on delete cascade,
  produto_id     uuid not null references produtos(id) on delete restrict,
  quantity_grams double precision not null
);
create index if not exists idx_comida_produtos_comida on comida_produtos (comida_id);

-- ============================================================
-- MEAL TRACKING
-- ============================================================
create table if not exists meal_days (
  id   uuid primary key default gen_random_uuid(),
  date date not null unique
);

create table if not exists meal_sections (
  id          uuid primary key default gen_random_uuid(),
  meal_day_id uuid not null references meal_days(id) on delete cascade,
  name        text not null,
  order_index int  not null default 0
);
create index if not exists idx_meal_sections_day on meal_sections (meal_day_id);

create table if not exists meal_items (
  id              uuid primary key default gen_random_uuid(),
  meal_section_id uuid not null references meal_sections(id) on delete cascade,
  produto_id      uuid references produtos(id),
  comida_id       uuid references comidas(id),
  name            text not null,
  quantity        double precision not null default 1,
  calories        int  not null default 0,
  protein         double precision not null default 0,
  created_at      timestamptz not null default now(),
  check ((produto_id is not null) or (comida_id is not null) or true)
);
create index if not exists idx_meal_items_section on meal_items (meal_section_id);

-- ============================================================
-- MULTI-TENANT MIGRATION (2026-05 — SaaS launch prep)
--
-- Single-tenant era used a global APP_PASSWORD header and one shared dataset.
-- Now every row is owned by an auth.users row. RLS is the second layer of
-- defense (backend already filters by user_id in WHERE clauses).
--
-- IMPORTANT (one-time): before applying this section in the dev project,
-- wipe the existing test data so we don't have to backfill NULL user_id:
--
--   truncate produtos, comidas, comida_produtos, meal_days,
--            meal_sections, meal_items restart identity cascade;
--
-- After the wipe, run the rest of this section.
-- ============================================================

-- 1. user_id columns
alter table produtos  add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table comidas   add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table meal_days add column if not exists user_id uuid references auth.users(id) on delete cascade;

create index if not exists idx_produtos_user  on produtos  (user_id);
create index if not exists idx_comidas_user   on comidas   (user_id);
create index if not exists idx_meal_days_user on meal_days (user_id);

-- 2. unique(date) on meal_days → unique(user_id, date)
alter table meal_days drop constraint if exists meal_days_date_key;
do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'meal_days_user_date_key'
  ) then
    alter table meal_days add constraint meal_days_user_date_key unique (user_id, date);
  end if;
end $$;

-- 3. profiles table (1:1 with auth.users)
create table if not exists profiles (
  user_id              uuid primary key references auth.users(id) on delete cascade,
  is_pro               boolean not null default false,
  stripe_customer_id   text,
  stripe_subscription_id text,
  subscription_status  text,                        -- 'active' | 'past_due' | 'canceled' | null
  pro_until            timestamptz,                 -- moment Pro access ends (cancel-at-period-end)
  weight_kg            double precision,
  target_weight_kg     double precision,
  height_cm            double precision,
  birth_year           int,
  sex                  text,                        -- 'M' | 'F' | 'O'
  activity_multiplier  double precision,            -- 1.2 sedentary → 1.9 very active
  calorie_goal         int,
  protein_goal         double precision,
  onboarding_complete  boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create or replace function profiles_touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists profiles_touch_updated_at on profiles;
create trigger profiles_touch_updated_at before update on profiles
  for each row execute function profiles_touch_updated_at();

-- 4. Auto-create empty profile on signup
-- NOTE: must be schema-qualified + explicit search_path. The trigger fires under
-- the supabase_auth_admin role whose search_path does NOT include public, so an
-- unqualified `profiles` reference errors with "relation does not exist" and the
-- entire auth.users INSERT rolls back ("Database error saving new user").
create or replace function profiles_create_on_signup() returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id) values (new.id) on conflict do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function profiles_create_on_signup();

-- 5. Row Level Security
alter table produtos        enable row level security;
alter table comidas         enable row level security;
alter table comida_produtos enable row level security;
alter table meal_days       enable row level security;
alter table meal_sections   enable row level security;
alter table meal_items      enable row level security;
alter table profiles        enable row level security;

drop policy if exists "own produtos"          on produtos;
drop policy if exists "own comidas"           on comidas;
drop policy if exists "own comida_produtos"   on comida_produtos;
drop policy if exists "own meal_days"         on meal_days;
drop policy if exists "own meal_sections"     on meal_sections;
drop policy if exists "own meal_items"        on meal_items;
drop policy if exists "own profile"           on profiles;

create policy "own produtos"  on produtos  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own comidas"   on comidas   for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own meal_days" on meal_days for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own profile"   on profiles  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Child rows: own iff parent row is owned.
create policy "own comida_produtos" on comida_produtos for all using (
  exists (select 1 from comidas c where c.id = comida_produtos.comida_id and c.user_id = auth.uid())
) with check (
  exists (select 1 from comidas c where c.id = comida_produtos.comida_id and c.user_id = auth.uid())
);

create policy "own meal_sections" on meal_sections for all using (
  exists (select 1 from meal_days d where d.id = meal_sections.meal_day_id and d.user_id = auth.uid())
) with check (
  exists (select 1 from meal_days d where d.id = meal_sections.meal_day_id and d.user_id = auth.uid())
);

create policy "own meal_items" on meal_items for all using (
  exists (
    select 1 from meal_sections s
      join meal_days d on d.id = s.meal_day_id
     where s.id = meal_items.meal_section_id and d.user_id = auth.uid()
  )
) with check (
  exists (
    select 1 from meal_sections s
      join meal_days d on d.id = s.meal_day_id
     where s.id = meal_items.meal_section_id and d.user_id = auth.uid()
  )
);

-- Note: our backend uses JDBC with the connection-pooled `postgres.<ref>` role
-- (acts as the table owner, BYPASSes RLS). We still rely on `where user_id = ?`
-- filters in every query — RLS is the second line of defense if a query is
-- ever issued via the `anon` / `authenticated` role (e.g., a future PostgREST
-- or supabase-js path).

-- ============================================================
-- USAGE METERING (2026-05 — Sprint 1)
--
-- One row per Anthropic API call, attributed to the authenticated user. Powers
-- cap enforcement (free = lifetime, Pro = per-day), per-user cost dashboard,
-- and the kill-switch cron that pauses everything if 24h spend exceeds the
-- safety threshold.
--
-- cost_micro_usd = USD × 1_000_000 (sub-cent precision; a single Haiku chat
-- can cost well under 1 cent so we don't want to round).
-- ============================================================

create table if not exists usage_events (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references auth.users(id) on delete cascade,
  kind                 text not null,                 -- 'chat' | 'photo' | 'label'
  model                text not null,
  input_tokens         int  not null default 0,
  cached_read_tokens   int  not null default 0,
  cached_write_tokens  int  not null default 0,
  output_tokens        int  not null default 0,
  cost_micro_usd       bigint not null default 0,
  created_at           timestamptz not null default now()
);

create index if not exists idx_usage_events_user_kind_created
  on usage_events (user_id, kind, created_at desc);
create index if not exists idx_usage_events_created
  on usage_events (created_at desc);

alter table usage_events enable row level security;
drop policy if exists "own usage" on usage_events;
create policy "own usage" on usage_events for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ============================================================
-- KILL SWITCH (2026-05 — Sprint 1)
--
-- Single-row table holding the global circuit breaker. The cron Lambda flips
-- `tripped=true` if 24h spend exceeds a configured threshold; AiService reads
-- it on every Claude call and refuses with 503 when tripped. Un-tripping is
-- manual on purpose (operator must acknowledge the spike before resuming).
-- ============================================================

create table if not exists kill_switch (
  id              text primary key,                   -- always 'global'
  tripped         boolean not null default false,
  tripped_at      timestamptz,
  reason          text,
  cost_micro_usd  bigint                              -- 24h spend at trip time, for audit
);

insert into kill_switch (id, tripped) values ('global', false) on conflict (id) do nothing;

-- Backend connects with the table-owner role and bypasses RLS, but we still
-- lock the row from any client that comes in via PostgREST / supabase-js.
alter table kill_switch enable row level security;
-- No policies = nobody outside the owner role can read or write. That's the goal.
