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
