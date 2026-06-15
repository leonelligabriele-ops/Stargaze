-- Stargaze — Supabase schema: accounts + per-user data + social graph.
-- Run in your Supabase project: SQL Editor → paste → Run. Safe to re-run
-- (tables use IF NOT EXISTS; policies are dropped-then-created).
--
-- The client profile (watchlist, watched, collections, blocked, notifications,
-- profile) is mirrored into one JSONB row per user (user_state). Public
-- profiles + follows power real accounts following each other.

create table if not exists public.user_state (
  user_id    uuid primary key references auth.users on delete cascade,
  data       jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_state enable row level security;

drop policy if exists "user_state: select own" on public.user_state;
create policy "user_state: select own"
  on public.user_state for select
  using (auth.uid() = user_id);

drop policy if exists "user_state: insert own" on public.user_state;
create policy "user_state: insert own"
  on public.user_state for insert
  with check (auth.uid() = user_id);

drop policy if exists "user_state: update own" on public.user_state;
create policy "user_state: update own"
  on public.user_state for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);


-- ───────────────────────── Admin stats ─────────────────────────
-- Add yourself as an admin (use the email you signed up with):
--   insert into public.admins (email) values ('you@example.com');
create table if not exists public.admins (
  email text primary key
);
alter table public.admins enable row level security;
-- (no policies → only the SQL editor / service role can read or write this table)

-- Aggregate stats for the in-app admin page. SECURITY DEFINER so it can read
-- auth.users, but it returns data only when the caller is in public.admins.
create or replace function public.admin_stats()
returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.admins where email = (auth.jwt() ->> 'email')
  ) then
    raise exception 'not authorized';
  end if;

  return json_build_object(
    'total_users', (select count(*) from auth.users),
    'with_data',   (select count(*) from public.user_state where data <> '{}'::jsonb),
    'signups_7d',  (select count(*) from auth.users where created_at > now() - interval '7 days'),
    'latest', (
      select coalesce(json_agg(row_to_json(t)), '[]'::json)
      from (
        select email, created_at
        from auth.users
        order by created_at desc
        limit 10
      ) t
    )
  );
end;
$$;

revoke all on function public.admin_stats() from public, anon;
grant execute on function public.admin_stats() to authenticated;


-- ───────────────── Public profiles + follows (social graph) ─────────────────
-- Each account has a public profile (unique @username) so people can find and
-- follow each other. Profiles + follows are world-readable (for discovery and
-- counts); a user can only edit their own profile and their own follow rows.

create table if not exists public.profiles (
  id           uuid primary key references auth.users on delete cascade,
  username     text unique not null,
  display_name text,
  bio          text,
  avatar       text,
  films        jsonb not null default '[]'::jsonb,   -- public watched-film snapshots
  updated_at   timestamptz not null default now()
);
-- for projects created before `films` existed:
alter table public.profiles add column if not exists films jsonb not null default '[]'::jsonb;
alter table public.profiles enable row level security;

drop policy if exists "profiles: public read" on public.profiles;
create policy "profiles: public read"  on public.profiles for select using (true);
drop policy if exists "profiles: insert own" on public.profiles;
create policy "profiles: insert own"   on public.profiles for insert with check (auth.uid() = id);
drop policy if exists "profiles: update own" on public.profiles;
create policy "profiles: update own"   on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

create table if not exists public.follows (
  follower_id uuid not null references public.profiles (id) on delete cascade,
  followee_id uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);
alter table public.follows enable row level security;

drop policy if exists "follows: public read" on public.follows;
create policy "follows: public read"   on public.follows for select using (true);
drop policy if exists "follows: follow as me" on public.follows;
create policy "follows: follow as me"  on public.follows for insert with check (auth.uid() = follower_id);
drop policy if exists "follows: unfollow own" on public.follows;
create policy "follows: unfollow own"  on public.follows for delete using (auth.uid() = follower_id);

create index if not exists follows_followee_idx on public.follows (followee_id);
create index if not exists follows_follower_idx on public.follows (follower_id);


-- ───────────────── Notifications (cross-user events) ─────────────────
-- Server-side notifications for things other people do to you (e.g. a follow).
-- Self-actions (created a constellation, etc.) stay client-side; these are the
-- ones that must be delivered from the database.

create table if not exists public.notifications (
  id           bigint generated always as identity primary key,
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  actor_id     uuid references public.profiles (id) on delete set null,
  type         text not null,
  read         boolean not null default false,
  created_at   timestamptz not null default now()
);
alter table public.notifications enable row level security;

drop policy if exists "notifications: read own" on public.notifications;
create policy "notifications: read own"   on public.notifications for select using (auth.uid() = recipient_id);
drop policy if exists "notifications: update own" on public.notifications;
create policy "notifications: update own" on public.notifications for update using (auth.uid() = recipient_id);
drop policy if exists "notifications: delete own" on public.notifications;
create policy "notifications: delete own" on public.notifications for delete using (auth.uid() = recipient_id);
-- inserts happen only via the trigger below (owned by the table owner → bypasses RLS)

create index if not exists notifications_recipient_idx on public.notifications (recipient_id, created_at desc);

-- When someone follows you, drop a notification in your bell.
create or replace function public.notify_on_follow()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (recipient_id, actor_id, type)
  values (NEW.followee_id, NEW.follower_id, 'follow');
  return NEW;
end;
$$;

drop trigger if exists follows_notify on public.follows;
create trigger follows_notify after insert on public.follows
  for each row execute function public.notify_on_follow();
