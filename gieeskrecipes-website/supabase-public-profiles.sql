-- ═══════════════════════════════════════════════════════════════
--  GieesK — public profiles
--  Run once in Supabase → SQL Editor → New query → paste → Run.
--  Safe to run more than once. Run supabase-public-usernames-and-uploads.sql
--  first if you haven't already.
-- ═══════════════════════════════════════════════════════════════
--
-- Profiles stay private (row-level security only lets you read your own
-- row). These two functions expose the public part only: username,
-- photo, bio, join date and counts. Never full name, email, country,
-- premium status or billing fields.


-- ── 1. Current username + photo for a list of users ───────────────
-- Used by every feed to show each author's CURRENT username, instead of
-- whatever name was saved on the post when it was written.
create or replace function public.get_public_profiles(ids uuid[])
returns table (id uuid, username text, avatar_url text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.username, p.avatar_url
  from profiles p
  where p.id = any(ids[1:500]);
$$;

revoke all on function public.get_public_profiles(uuid[]) from public;
grant execute on function public.get_public_profiles(uuid[]) to anon, authenticated;


-- ── 2. One public profile page ────────────────────────────────────
create or replace function public.get_public_profile(p_user uuid)
returns table (
  id uuid,
  username text,
  avatar_url text,
  bio text,
  joined_at timestamptz,
  videos bigint,
  likes bigint,
  followers bigint,
  following bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p.username,
    p.avatar_url,
    p.bio,
    p.created_at,
    (select count(*) from community_posts c
      where c.user_id = p.id and c.status = 'published' and c.video_url is not null),
    (select count(*) from post_likes l
      join community_posts c on c.id = l.post_id
      where c.user_id = p.id and c.status = 'published'),
    (select count(*) from chef_follows f
      where p.username is not null and f.chef_name = p.username),
    (select count(*) from chef_follows f
      where f.user_id = p.id)
  from profiles p
  where p.id = p_user;
$$;

revoke all on function public.get_public_profile(uuid) from public;
grant execute on function public.get_public_profile(uuid) to anon, authenticated;


-- ── 3. Let users keep their public photo in sync ──────────────────
-- Profile photos were only saved to the sign-in account, never to the
-- profiles table, so nobody else could see an updated photo. The app
-- now writes avatar_url on your own profile row (allowed by the existing
-- "Users can update own profile" policy). Nothing to change here; this
-- note is just so the column's purpose is recorded.
comment on column public.profiles.avatar_url is 'Public profile photo URL (kept in sync by the app).';
