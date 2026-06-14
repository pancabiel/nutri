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

-- ============================================================
-- BILLING HARDENING (2026-05 — Sprint 2 review follow-ups)
--
-- 1. A Stripe customer must map to at most one user. We already only set
--    stripe_customer_id once (setStripeCustomerId WHERE stripe_customer_id IS
--    NULL), but enforce it at the DB layer too so byStripeCustomerId can't
--    silently resolve to one of multiple rows if the invariant ever breaks.
-- 2. stripe_event_at: latest event.created timestamp we've processed for the
--    user's current subscription. Stripe does NOT guarantee event delivery
--    order; without this gate a stale customer.subscription.updated
--    (status=active) arriving after customer.subscription.deleted would
--    revive a canceled subscription. handleSubscriptionUpsert /
--    handleSubscriptionDeleted skip the write when the incoming event is
--    older than what we already applied.
-- ============================================================

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_stripe_customer_id_key'
  ) then
    alter table profiles add constraint profiles_stripe_customer_id_key unique (stripe_customer_id);
  end if;
end $$;

alter table profiles add column if not exists stripe_event_at timestamptz;

-- ============================================================
-- PUSH NOTIFICATIONS (2026-06 — Sprint 3 growth: lembretes)
--
-- Web Push (VAPID) reminders to eat / log meals. Two tables:
--   push_subscriptions — one row per installed device (browser PushManager
--     subscription). Holds the endpoint + the two keys (p256dh, auth) the
--     server needs to encrypt the payload per RFC 8291.
--   notification_prefs — one row per user, the reminder schedule + toggles.
-- Both cascade on auth.users delete (LGPD delete wipes them automatically).
-- ============================================================

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

-- ============================================================
-- MEAL-PREP BATCH LOGGING (2026-06 — cooked-batch yield + marmita templates)
-- ============================================================
-- A "comida" can now be a cooked batch with a finished weight (yield_grams).
-- macros-per-gram of the batch = (sum of ingredient macros) / yield_grams,
-- so a meal_item can portion it by grams (ex: 130g of the cooked sauce).
-- yield_grams nullable: when absent the comida is logged by portions (legacy).
alter table comidas    add column if not exists yield_grams double precision;

-- meal_items gain a unit so the UI can render '130g' vs '1.5×'. Nutrition stays
-- in the calories/protein snapshot computed by the frontend; unit is cosmetic.
-- null/'porcao' = portions (legacy comida), 'g' = grams (produto or batch comida).
alter table meal_items add column if not exists unit text;

-- Carbs/fat snapshot per item (totals, like calories/protein). Nullable: legacy
-- rows and produto/comida-picked items leave them unset ("unknown"), while the
-- chat parser fills them so an item logged by text can be registered as a produto
-- without losing its carb/fat estimate.
alter table meal_items add column if not exists carbs double precision;
alter table meal_items add column if not exists fat   double precision;

-- A "marmita" = a reusable template: a named set of items (produtos and/or
-- comidas, each with a quantity + unit) that gets copied into a day's section
-- by POST /meals/batch. Trampoline for Fase 2 recurring plans + notifications.
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

-- An inline "grupo" inside a marmita: a sub-recipe (ex: molho branco) that lives
-- ONLY inside that template item, never saved to the comidas list. The item holds
-- the group's name + estimated finished weight (group_yield_grams, which the user
-- overrides since cooking reduces weight), and meal_template_item_produtos holds the
-- batch ingredients in grams. Per-gram macro = sum(produto macros) / group_yield_grams;
-- the item's `quantity` is the grams served in this marmita. Computed client-side at
-- apply time into a free-text meal_item, exactly like comidaPerGram.
alter table meal_template_items add column if not exists group_name        text;
alter table meal_template_items add column if not exists group_yield_grams double precision;

-- Relax the old "produto_id or comida_id" check to also allow a group item.
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

-- ============================================================
-- SOCIAL FEED (2026-06 — compartilhar pratos/marmitas/comidas/produtos)
--
-- Introduces social identity, durable image storage and the ONE sanctioned
-- cross-tenant read in the whole app: the feed reads posts of authors the
-- viewer follows. Every post is self-contained (denormalized `snapshot`), so
-- viewing/saving someone else's recipe never reads their private library.
-- ============================================================

-- 1. Social identity on profiles. Public read goes ONLY through the backend
--    (GET /users/{username}, /users/search) which selects just these columns.
--    DO NOT add a "public profile read" RLS policy — RLS is row-level, so
--    `using (true)` would expose stripe_customer_id / is_pro / LGPD-sensitive
--    columns to the browser (which uses supabase-js directly). Keep "own profile".
alter table profiles add column if not exists username     text;
alter table profiles add column if not exists display_name text;
alter table profiles add column if not exists avatar_url   text;
alter table profiles add column if not exists bio          text;
create unique index if not exists idx_profiles_username on profiles (lower(username));

-- 2. follows — assimétrico (seguir), sem aprovação. Tabela de junção: em vez do
--    `user_id` único do resto do schema, usa o par (follower_id, followee_id) — ambos
--    referenciam auth.users on delete cascade e ambos são indexados, então o invariante
--    de tenant (cascata no delete LGPD + RLS por dono) é mantido.
create table if not exists follows (
  follower_id uuid not null references auth.users(id) on delete cascade,
  followee_id uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);
create index if not exists idx_follows_follower on follows (follower_id);
create index if not exists idx_follows_followee on follows (followee_id);

alter table follows enable row level security;
drop policy if exists "read own follows"  on follows;
drop policy if exists "write own follows" on follows;
-- I can see relations I'm part of; I can only create/delete rows where I'm the follower.
create policy "read own follows" on follows for select using (
  follower_id = auth.uid() or followee_id = auth.uid()
);
create policy "write own follows" on follows for all using (follower_id = auth.uid())
                                              with check (follower_id = auth.uid());

-- 3. feed_posts — autor-owned; o snapshot é uma cópia congelada da receita.
create table if not exists feed_posts (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,  -- autor
  caption    text,
  image_url  text,                 -- URL pública no Supabase Storage (null = post de texto)
  ref_type   text,                 -- null | 'produto' | 'comida' | 'marmita' | 'prato'
  snapshot   jsonb,                -- cópia congelada da receita p/ exibir + salvar
  created_at timestamptz not null default now()
);
create index if not exists idx_feed_posts_user_created on feed_posts (user_id, created_at desc);
-- id no índice global p/ casar com o cursor keyset (created_at, id).
create index if not exists idx_feed_posts_created on feed_posts (created_at desc, id desc);

alter table feed_posts enable row level security;
drop policy if exists "feed read"  on feed_posts;
drop policy if exists "feed write" on feed_posts;
-- LEITURA CROSS-FOLLOW: a exceção sancionada. auth.uid() embrulhado em (select ...)
-- p/ ser avaliado uma vez (cacheado) e não por linha.
create policy "feed read" on feed_posts for select using (
  user_id = (select auth.uid())
  or exists (select 1 from follows f
              where f.followee_id = feed_posts.user_id
                and f.follower_id = (select auth.uid()))
);
create policy "feed write" on feed_posts for all using (user_id = (select auth.uid()))
                                         with check (user_id = (select auth.uid()));

-- 4. post_likes — sinal leve de engajamento.
create table if not exists post_likes (
  post_id uuid not null references feed_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
-- NÃO indexar post_id sozinho: a PK (post_id, user_id) já o cobre como prefixo.
-- O FK sem índice é user_id → sem ele o delete-cascade LGPD varre post_likes inteira.
create index if not exists idx_post_likes_user on post_likes (user_id);

alter table post_likes enable row level security;
drop policy if exists "read likes"  on post_likes;
drop policy if exists "write own likes" on post_likes;
-- Posso ler likes de posts que eu poderia ler (dono do post ou sigo o autor);
-- só escrevo meus próprios likes.
create policy "read likes" on post_likes for select using (
  exists (select 1 from feed_posts p
           where p.id = post_likes.post_id
             and (p.user_id = (select auth.uid())
                  or exists (select 1 from follows f
                              where f.followee_id = p.user_id
                                and f.follower_id = (select auth.uid()))))
);
create policy "write own likes" on post_likes for all using (user_id = (select auth.uid()))
                                            with check (user_id = (select auth.uid()));

-- 5. Supabase Storage (passo de painel — documentar no deploy):
--    Buckets PÚBLICOS `avatars` e `posts`. Upload direto do frontend via
--    supabase-js (anon key + JWT). Storage RLS exige prefixo "{auth.uid()}/...":
--
--    insert into storage.buckets (id, name, public) values
--      ('avatars','avatars',true), ('posts','posts',true)
--      on conflict (id) do nothing;
--
--    create policy "own avatar upload" on storage.objects for insert to authenticated
--      with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
--    create policy "own post upload" on storage.objects for insert to authenticated
--      with check (bucket_id = 'posts'   and (storage.foldername(name))[1] = auth.uid()::text);
--    create policy "public avatar read" on storage.objects for select using (bucket_id = 'avatars');
--    create policy "public post read"   on storage.objects for select using (bucket_id = 'posts');
--
--    Tradeoff: bucket público = imagem legível por URL mesmo que a linha do post
--    seja gated por follow. OK pro MVP (path com UUID não-adivinhável). Migrar p/
--    bucket privado + signed URLs se virar requisito.
