-- ═══════════════════════════════════════════════════════════════
--  GieesK — Discover feed: reposts, share counts, verified creators,
--  comment reports, tappable @mentions
--  Run once in Supabase → SQL Editor → New query → paste → Run.
--  Safe to run more than once. Run the earlier files first
--  (public profiles, privacy & unique usernames, discover extras).
-- ═══════════════════════════════════════════════════════════════


-- ── 1. Reposts ────────────────────────────────────────────────────
-- Repost a video to your followers: it shows up in their Following feed
-- with "@you reposted". One repost per person per video; you can't
-- repost your own video or a draft.
create table if not exists public.video_reposts (
  post_id    bigint not null references public.community_posts(id) on delete cascade,
  user_id    uuid   not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
create index if not exists video_reposts_user_recent_idx on public.video_reposts (user_id, created_at desc);

alter table public.video_reposts enable row level security;
drop policy if exists "Users read own reposts"   on public.video_reposts;
drop policy if exists "Users repost videos"      on public.video_reposts;
drop policy if exists "Users remove own reposts" on public.video_reposts;

-- You can read your own rows (to show the Repost button's state). Totals
-- and "who reposted" for followers come from the functions below.
create policy "Users read own reposts"
  on public.video_reposts for select using (auth.uid() = user_id);
create policy "Users repost videos"
  on public.video_reposts for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.community_posts c
      where c.id = video_reposts.post_id
        and coalesce(c.status, 'published') = 'published'
        and c.video_url is not null
        and c.user_id is distinct from auth.uid()
    )
  );
create policy "Users remove own reposts"
  on public.video_reposts for delete using (auth.uid() = user_id);


-- ── 2. Shares ─────────────────────────────────────────────────────
-- Counted when a signed-in person shares a video (share sheet, copy
-- link). Once per person per video per day, so tapping Share ten times
-- is still one share. Nobody can read the table directly.
create table if not exists public.video_shares (
  post_id   bigint not null references public.community_posts(id) on delete cascade,
  user_id   uuid   not null references auth.users(id) on delete cascade,
  share_day date   not null default ((now() at time zone 'utc')::date),
  shared_at timestamptz not null default now(),
  primary key (post_id, user_id, share_day)
);
alter table public.video_shares enable row level security;
revoke all on public.video_shares from anon, authenticated;

create or replace function public.record_video_share(p_post bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or p_post is null then return; end if;
  if not exists (
    select 1 from community_posts
    where id = p_post and coalesce(status, 'published') = 'published' and video_url is not null
  ) then return; end if;
  insert into video_shares (post_id, user_id) values (p_post, auth.uid())
  on conflict do nothing;
end;
$$;
revoke all on function public.record_video_share(bigint) from public, anon;
grant execute on function public.record_video_share(bigint) to authenticated;


-- ── 3. Counts for the feed: saves, shares, reposts ────────────────
-- Numbers only, never who.
create or replace function public.get_video_stats(post_ids bigint[])
returns table (post_id bigint, saves bigint, shares bigint, reposts bigint)
language sql
stable
security definer
set search_path = public
as $$
  select c.id,
    (select count(*) from saved_videos s  where s.post_id = c.id)::bigint,
    (select count(*) from video_shares sh where sh.post_id = c.id)::bigint,
    (select count(*) from video_reposts r where r.post_id = c.id)::bigint
  from community_posts c
  where c.id = any(post_ids[1:500])
    and coalesce(c.status, 'published') = 'published';
$$;
revoke all on function public.get_video_stats(bigint[]) from public;
grant execute on function public.get_video_stats(bigint[]) to anon, authenticated;


-- ── 4. Reposts from people you follow (Following feed) ────────────
create or replace function public.get_following_reposts(p_limit int default 100)
returns table (post_id bigint, reposted_by text, reposted_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select r.post_id, p.username, r.created_at
  from video_reposts r
  join profiles p      on p.id = r.user_id and p.username is not null
  join chef_follows f  on f.chef_name = p.username and f.user_id = auth.uid()
  join community_posts c on c.id = r.post_id and coalesce(c.status, 'published') = 'published'
  where auth.uid() is not null
    and r.user_id <> auth.uid()
    and r.created_at >= now() - interval '30 days'
  order by r.created_at desc
  limit greatest(1, least(coalesce(p_limit, 100), 300));
$$;
revoke all on function public.get_following_reposts(int) from public, anon;
grant execute on function public.get_following_reposts(int) to authenticated;


-- ── 5. Verified creators (✓ next to the name) ─────────────────────
-- Only you (from this SQL editor) can verify someone:
--   update profiles set is_verified = true where username = 'brian_cooks';
-- The app can't change it, even on a person's own profile.
alter table public.profiles
  add column if not exists is_verified boolean not null default false;

create or replace function public.protect_profile_verified()
returns trigger
language plpgsql
as $$
begin
  -- Requests from the app carry the role anon/authenticated. The SQL
  -- editor and the service role don't, so they can still verify people.
  if coalesce(auth.role(), '') in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      new.is_verified := false;
    elsif new.is_verified is distinct from old.is_verified then
      new.is_verified := old.is_verified;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_verified on public.profiles;
create trigger profiles_protect_verified
  before insert or update on public.profiles
  for each row execute function public.protect_profile_verified();

-- get_public_profiles / get_public_profile now also return is_verified.
-- Changing a function's columns needs a drop first.
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


-- ── 6. Tappable @mentions ─────────────────────────────────────────
-- Turns a username into the account id so the app can open that
-- person's profile. Returns nothing else.
create or replace function public.get_profile_id(p_username text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from profiles
  where username is not null
    and lower(username) = lower(regexp_replace(coalesce(p_username, ''), '^@+', ''))
  limit 1;
$$;
revoke all on function public.get_profile_id(text) from public;
grant execute on function public.get_profile_id(text) to anon, authenticated;


-- ── 7. Reporting comments ─────────────────────────────────────────
-- Comment reports go into the same content_reports table as video
-- reports, with the comment's id filled in.
do $$
begin
  if to_regclass('public.content_reports') is not null then
    alter table public.content_reports
      add column if not exists comment_id bigint references public.post_comments(id) on delete cascade;
  else
    raise warning 'content_reports table not found. Video and comment reports need it; create it before reporting will work.';
  end if;
end $$;
