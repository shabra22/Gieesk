-- ═══════════════════════════════════════════════════════════════
--  GieesK — make the verified tick visible to everyone
--  Run in Supabase → SQL Editor. Safe to run more than once, and
--  safe to run in any order relative to the other files.
-- ═══════════════════════════════════════════════════════════════
--
-- Your own Account screen reads your profile row directly, which is why
-- it says "Verified". Everyone else — your public profile, your videos,
-- your comments — reads the two functions below, and they only started
-- returning is_verified in supabase-discover-feed.sql. If that file
-- wasn't run (or was run before the badge file), the tick has nowhere to
-- come from. This file sets both functions right on their own.


-- ── 1. The column, if it isn't there yet ──────────────────────────
alter table public.profiles
  add column if not exists is_verified boolean not null default false;


-- ── 2. Current username, photo and verified flag for a list of ids ─
-- Every feed uses this to show each author's CURRENT username.
drop function if exists public.get_public_profiles(uuid[]);
create function public.get_public_profiles(ids uuid[])
returns table (id uuid, username text, avatar_url text, is_verified boolean)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.username, p.avatar_url, coalesce(p.is_verified, false)
  from profiles p
  where p.id = any(ids[1:500]);
$$;
revoke all on function public.get_public_profiles(uuid[]) from public;
grant execute on function public.get_public_profiles(uuid[]) to anon, authenticated;


-- ── 3. One public profile page ────────────────────────────────────
drop function if exists public.get_public_profile(uuid);
create function public.get_public_profile(p_user uuid)
returns table (
  id uuid, username text, avatar_url text, bio text, joined_at timestamptz,
  videos bigint, likes bigint, followers bigint, following bigint, is_verified boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id, p.username, p.avatar_url, p.bio, p.created_at,
    (select count(*) from community_posts c
      where c.user_id = p.id and c.status = 'published' and c.video_url is not null),
    (select count(*) from post_likes l
      join community_posts c on c.id = l.post_id
      where c.user_id = p.id and c.status = 'published'),
    (select count(*) from chef_follows f
      where p.username is not null and f.chef_name = p.username),
    (select count(*) from chef_follows f where f.user_id = p.id),
    coalesce(p.is_verified, false)
  from profiles p
  where p.id = p_user;
$$;
revoke all on function public.get_public_profile(uuid) from public;
grant execute on function public.get_public_profile(uuid) to anon, authenticated;


-- ── 4. Re-apply the full column lock ──────────────────────────────
-- supabase-discover-feed.sql carries an earlier, narrower version of
-- this trigger function. Running that file after the badge file would
-- quietly unlock the subscription fields, so the complete version is
-- restated here and this file can be run last, always.
create or replace function public.protect_profile_verified()
returns trigger
language plpgsql
as $$
begin
  if coalesce(auth.role(), '') in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      new.is_verified := false;
      new.verification_status := 'none';
      new.verified_since := null;
      new.verification_paid_until := null;
      new.verification_note := null;
      new.verification_session_id := null;
      new.stripe_customer_id := null;
      new.is_premium := false;
      new.premium_until := null;
    else
      new.is_verified := old.is_verified;
      new.verification_status := old.verification_status;
      new.verified_since := old.verified_since;
      new.verification_paid_until := old.verification_paid_until;
      new.verification_note := old.verification_note;
      new.verification_session_id := old.verification_session_id;
      new.stripe_customer_id := old.stripe_customer_id;
      new.is_premium := old.is_premium;
      new.premium_until := old.premium_until;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_verified on public.profiles;
create trigger profiles_protect_verified
  before insert or update on public.profiles
  for each row execute function public.protect_profile_verified();


-- ── 5. What the app now sees ──────────────────────────────────────
-- Both rows should show is_verified in the result columns.
select p.proname, pg_get_function_result(p.oid) as returns
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('get_public_profile', 'get_public_profiles');
