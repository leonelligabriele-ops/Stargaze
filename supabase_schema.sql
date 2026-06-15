-- Stargaze — Supabase schema for accounts (email/password) + per-user data.
-- Run this once in your Supabase project: SQL Editor → paste → Run.
--
-- The whole client profile (watchlist, watched, collections, follows, blocked,
-- notifications, profile) is mirrored into one JSONB row per user. Row-Level
-- Security ensures a signed-in user can only ever touch their own row.

create table if not exists public.user_state (
  user_id    uuid primary key references auth.users on delete cascade,
  data       jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_state enable row level security;

create policy "user_state: select own"
  on public.user_state for select
  using (auth.uid() = user_id);

create policy "user_state: insert own"
  on public.user_state for insert
  with check (auth.uid() = user_id);

create policy "user_state: update own"
  on public.user_state for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
