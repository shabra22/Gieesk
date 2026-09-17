-- ═══════════════════════════════════════════════════════════════
--  GieesK — private drafts & saves, unique usernames
--  Run once in Supabase → SQL Editor → New query → paste → Run.
--  Safe to run more than once. Run the two earlier files first:
--    1. supabase-public-usernames-and-uploads.sql
--    2. supabase-public-profiles.sql
-- ═══════════════════════════════════════════════════════════════
--
-- The app only ever shows Drafts and Saved on your own profile, and only
-- ever loads your own. This file makes the DATABASE enforce the same
-- thing, so nobody can read them by calling the API directly.


-- ── 1. Drafts: visible only to their owner ────────────────────────
-- Replaces every read (SELECT) policy on community_posts with one rule:
-- published posts are public; anything else (drafts) only for its owner.
-- Insert/update/delete policies are left exactly as they are.
alter table public.community_posts enable row level security;

do $$
declare pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'community_posts' and cmd = 'SELECT'
  loop
    execute format('drop policy %I on public.community_posts', pol.policyname);
  end loop;
end $$;

create policy "Published posts are public; drafts only for their owner"
  on public.community_posts for select
  using (coalesce(status, 'published') = 'published' or auth.uid() = user_id);

-- Safety check: an "ALL" policy that lets everyone read would still expose
-- drafts, because policies add up. This only reports it; it changes nothing.
do $$
declare pol record;
begin
  for pol in
    select policyname, qual from pg_policies
    where schemaname = 'public' and tablename = 'community_posts' and cmd = 'ALL'
  loop
    if pol.qual is null or pol.qual = 'true' then
      raise warning 'Policy "%" on community_posts applies to all commands without an owner check, so drafts may still be readable. Review it in Authentication → Policies.', pol.policyname;
    end if;
  end loop;
end $$;


-- ── 2. Saved videos: private to each user ─────────────────────────
-- saved_videos only ever needs "my own rows", so its policies are
-- rebuilt from scratch: read, add, change collection and remove your own.
alter table public.saved_videos enable row level security;

do $$
declare pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'saved_videos'
  loop
    execute format('drop policy %I on public.saved_videos', pol.policyname);
  end loop;
end $$;

create policy "Users read own saved videos"   on public.saved_videos for select using (auth.uid() = user_id);
create policy "Users save videos"             on public.saved_videos for insert with check (auth.uid() = user_id);
create policy "Users update own saved videos" on public.saved_videos for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users remove own saved videos" on public.saved_videos for delete using (auth.uid() = user_id);

-- Discover's ranking weighs how many times a video was saved. With saves
-- now private, the total comes from this function: a number per video,
-- never who saved it.
create or replace function public.get_video_save_counts(post_ids bigint[])
returns table (post_id bigint, saves bigint)
language sql
stable
security definer
set search_path = public
as $$
  select s.post_id, count(*)::bigint
  from saved_videos s
  join community_posts c on c.id = s.post_id and coalesce(c.status, 'published') = 'published'
  where s.post_id = any(post_ids[1:500])
  group by s.post_id;
$$;

revoke all on function public.get_video_save_counts(bigint[]) from public;
grant execute on function public.get_video_save_counts(bigint[]) to anon, authenticated;


-- ── 3. Unique usernames ───────────────────────────────────────────
-- Before: the column was unique but case-sensitive, so "Shab" and "shab"
-- could both exist, and a profile could be edited directly to any text
-- (spaces, symbols). After: every username is lowercase letters, numbers
-- and _ (3–24), and unique regardless of case, enforced by the database.

-- 3a. Tidy existing usernames so the rules can be switched on:
--     lowercase, drop invalid characters, then settle any clashes by
--     adding a number to the newer account (e.g. shab → shab2).
do $$
declare
  r record;
  base text;
  candidate text;
  n int;
begin
  for r in
    select id, username from profiles
    where username is not null
    order by created_at nulls last, id
  loop
    base := left(regexp_replace(lower(r.username), '[^a-z0-9_]', '', 'g'), 24);
    if length(base) < 3 then
      base := 'chef_' || left(replace(r.id::text, '-', ''), 6);
    end if;
    candidate := base;
    n := 1;
    while exists (select 1 from profiles p where p.id <> r.id and lower(p.username) = candidate) loop
      n := n + 1;
      candidate := left(base, 24 - length(n::text)) || n::text;
    end loop;
    if candidate is distinct from r.username then
      update profiles set username = candidate, updated_at = now() where id = r.id;
    end if;
  end loop;
end $$;

-- 3b. The rules themselves.
create unique index if not exists profiles_username_lower_unique
  on public.profiles (lower(username));

alter table public.profiles drop constraint if exists profiles_username_format;
alter table public.profiles add constraint profiles_username_format
  check (username is null or username ~ '^[a-z0-9_]{3,24}$');


-- ── 4. Reserved usernames ─────────────────────────────────────────
-- Names that could be mistaken for the app or its staff.
create or replace function public.is_reserved_username(name text)
returns boolean
language sql
immutable
as $$
  select lower(coalesce(name, '')) in (
    'admin','administrator','root','system','support','help','helpdesk','official',
    'moderator','mod','mods','staff','team','security','privacy','legal','billing',
    'gieesk','gieeskrecipes','gieesk_recipes','gieeskofficial','gieesk_official',
    'api','www','app','settings','profile','login','signup','register','discover',
    'community','recipes','null','undefined','anonymous','guest','everyone','here'
  ) or lower(coalesce(name, '')) like 'gieesk%';
$$;


-- ── 5. set_my_username: now also blocks reserved names ────────────
create or replace function public.set_my_username(new_username text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  clean text;
  old_names text[];
begin
  if uid is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  clean := lower(regexp_replace(coalesce(new_username, ''), '^@+', ''));
  if clean !~ '^[a-z0-9_]{3,24}$' then
    raise exception 'Usernames can use 3-24 letters, numbers or _' using errcode = '22023';
  end if;
  if is_reserved_username(clean) then
    raise exception 'That username isn''t available' using errcode = '23505';
  end if;
  if exists (select 1 from profiles where lower(username) = clean and id <> uid) then
    raise exception 'That username is already taken' using errcode = '23505';
  end if;

  select array_agg(distinct n) into old_names
  from (
    select author_name as n from community_posts where user_id = uid and author_name is not null
    union
    select author_name from post_comments where user_id = uid and author_name is not null
  ) names
  where n <> clean;

  insert into profiles (id, username, updated_at)
  values (uid, clean, now())
  on conflict (id) do update set username = excluded.username, updated_at = now();

  update community_posts set author_name = clean
  where user_id = uid and author_name is distinct from clean;

  update post_comments set author_name = clean
  where user_id = uid and author_name is distinct from clean;

  if old_names is not null then
    delete from chef_follows f
    where f.chef_name = any(old_names)
      and not exists (select 1 from community_posts p where p.author_name = f.chef_name and p.user_id <> uid)
      and exists (select 1 from chef_follows d where d.user_id = f.user_id and d.chef_name = clean);

    update chef_follows f set chef_name = clean
    where f.chef_name = any(old_names)
      and not exists (select 1 from community_posts p where p.author_name = f.chef_name and p.user_id <> uid);
  end if;

  return clean;
end;
$$;

revoke all on function public.set_my_username(text) from public, anon;
grant execute on function public.set_my_username(text) to authenticated;


-- ── 6. username_status: live "available / taken" while typing ─────
-- Returns one word: available, yours, taken, reserved or invalid.
-- Says nothing about who has a name, only whether it's free.
create or replace function public.username_status(name text)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  clean text := lower(regexp_replace(coalesce(name, ''), '^@+', ''));
begin
  if clean !~ '^[a-z0-9_]{3,24}$' then return 'invalid'; end if;
  if is_reserved_username(clean) then return 'reserved'; end if;
  if auth.uid() is not null and exists (select 1 from profiles where id = auth.uid() and lower(username) = clean) then
    return 'yours';
  end if;
  if exists (select 1 from profiles where lower(username) = clean) then return 'taken'; end if;
  return 'available';
end;
$$;

revoke all on function public.username_status(text) from public, anon;
grant execute on function public.username_status(text) to authenticated;
