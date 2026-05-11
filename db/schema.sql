-- Nutri MVP schema for Supabase (PostgreSQL)
-- Run in the Supabase SQL editor.

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
