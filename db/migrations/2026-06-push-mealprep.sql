-- ============================================================
-- PROD MIGRATION — 2026-06  (push notifications + meal-prep batch logging)
--
-- Run this ONCE against the PRODUCTION Supabase project (yfyujglzcefxgkwduhrk,
-- us-east-1) via the SQL editor. It is the new tail of db/schema.sql, extracted
-- as a standalone migration. Every statement is idempotent (IF NOT EXISTS /
-- DROP POLICY IF EXISTS), so re-running is safe.
--
-- NOTE: local/dev currently points at STAGING (ggofnndjlyipkrirdewj). Make sure
-- you are connected to PROD before running this.
-- ============================================================

-- ---------- PUSH NOTIFICATIONS (Web Push / VAPID reminders) ----------

create table if not exists push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  endpoint    text not null,
  p256dh      text not null,   -- base64url, UA public key (65 bytes uncompressed)
  auth        text not null,   -- base64url, auth secret (16 bytes)
  user_agent  text,
  created_at  timestamptz not null default now(),
  unique (user_id, endpoint)   -- same device does not duplicate
);
create index if not exists idx_push_subs_user on push_subscriptions (user_id);

create table if not exists notification_prefs (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  enabled        boolean not null default true,           -- master toggle
  timezone       text    not null default 'America/Sao_Paulo',
  weekdays       smallint not null default 127,           -- bitmask: bit0=Sun..bit6=Sat (127 = every day)
  skip_if_logged boolean not null default true,           -- do not remind a meal already logged today
  quiet_start    time,                                    -- quiet-hours start (nullable = off)
  quiet_end      time,                                    -- quiet-hours end (nullable = off)
  cafe_enabled   boolean not null default true,
  cafe_time      time    not null default '08:00',
  almoco_enabled boolean not null default true,
  almoco_time    time    not null default '12:00',
  lanche_enabled boolean not null default false,
  lanche_time    time    not null default '16:00',
  jantar_enabled boolean not null default true,
  jantar_time    time    not null default '20:00',
  updated_at     timestamptz not null default now()
);

alter table push_subscriptions enable row level security;
alter table notification_prefs enable row level security;
drop policy if exists "own push_subs"  on push_subscriptions;
drop policy if exists "own notif_prefs" on notification_prefs;
create policy "own push_subs"   on push_subscriptions for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own notif_prefs" on notification_prefs  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------- MEAL-PREP BATCH LOGGING (cooked-batch yield + marmita templates) ----------

alter table comidas    add column if not exists yield_grams double precision;
alter table meal_items add column if not exists unit text;
alter table meal_items add column if not exists carbs double precision;
alter table meal_items add column if not exists fat   double precision;

create table if not exists meal_templates (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_meal_templates_user on meal_templates (user_id);

create table if not exists meal_template_items (
  id          uuid primary key default gen_random_uuid(),
  template_id uuid not null references meal_templates(id) on delete cascade,
  produto_id  uuid references produtos(id),
  comida_id   uuid references comidas(id),
  quantity    double precision not null,
  unit        text not null default 'g',   -- 'g' | 'porcao'
  check ((produto_id is not null) or (comida_id is not null))
);
create index if not exists idx_meal_template_items_template on meal_template_items (template_id);

alter table meal_templates      enable row level security;
alter table meal_template_items enable row level security;
drop policy if exists "own meal_templates"      on meal_templates;
drop policy if exists "own meal_template_items" on meal_template_items;
create policy "own meal_templates" on meal_templates for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own meal_template_items" on meal_template_items for all using (
  exists (select 1 from meal_templates t where t.id = meal_template_items.template_id and t.user_id = auth.uid())
) with check (
  exists (select 1 from meal_templates t where t.id = meal_template_items.template_id and t.user_id = auth.uid())
);

-- inline "grupo" (sub-receita) inside a marmita item
alter table meal_template_items add column if not exists group_name        text;
alter table meal_template_items add column if not exists group_yield_grams double precision;

alter table meal_template_items drop constraint if exists meal_template_items_check;
alter table meal_template_items drop constraint if exists meal_template_items_kind_chk;
alter table meal_template_items add constraint meal_template_items_kind_chk
  check (produto_id is not null or comida_id is not null or group_name is not null);

create table if not exists meal_template_item_produtos (
  id         uuid primary key default gen_random_uuid(),
  item_id    uuid not null references meal_template_items(id) on delete cascade,
  produto_id uuid not null references produtos(id),
  grams      double precision not null
);
create index if not exists idx_mtip_item on meal_template_item_produtos (item_id);

alter table meal_template_item_produtos enable row level security;
drop policy if exists "own meal_template_item_produtos" on meal_template_item_produtos;
create policy "own meal_template_item_produtos" on meal_template_item_produtos for all using (
  exists (
    select 1 from meal_template_items ti
      join meal_templates t on t.id = ti.template_id
     where ti.id = meal_template_item_produtos.item_id and t.user_id = auth.uid()
  )
) with check (
  exists (
    select 1 from meal_template_items ti
      join meal_templates t on t.id = ti.template_id
     where ti.id = meal_template_item_produtos.item_id and t.user_id = auth.uid()
  )
);
