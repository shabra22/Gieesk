-- ═══════════════════════════════════════════════════════════════
--  GieesK — public usernames + video upload upgrade
--  Run once in Supabase → SQL Editor → New query → paste → Run.
--  Safe to run more than once. Includes supabase-profile-fix.sql,
--  so you don't need to run that one separately.
-- ═══════════════════════════════════════════════════════════════


-- ── 1. Profiles: let a user create their own missing profile row ──
drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);


-- ── 2. Video cover images ─────────────────────────────────────────
-- The upload page now captures a cover frame. Without a cover, Android
-- shows a big grey "play" graphic while a video loads.
alter table public.community_posts
  add column if not exists poster_url text;


-- ── 3. set_my_username: one call that makes the username public ───
-- Posts and comments store the author's name at the time they were
-- written, so changing your username used to leave your real name on
-- everything you'd already posted. This sets the username and rewrites
-- your name on your own posts and comments, in one transaction.
--
-- Followers are stored by name too. They're moved to the new username,
-- but only for names that no other account has posted under, so nobody
-- can take over someone else's followers by renaming.
--
-- SECURITY DEFINER: runs with the owner's rights so it can update the
-- follow rows (which belong to the followers), but only ever touches the
-- caller's own posts, comments and profile.
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
    -- Someone already following the new name: drop the duplicate old row.
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


-- ── 4. search_usernames: @mention suggestions ─────────────────────
-- Profiles are private (you can only read your own row), so @mention
-- autocomplete could only ever find yourself. This returns usernames
-- and nothing else: no names, emails, premium or billing fields.
create or replace function public.search_usernames(prefix text)
returns table (username text)
language sql
stable
security definer
set search_path = public
as $$
  select p.username
  from profiles p
  where p.username is not null
    and length(coalesce(prefix, '')) <= 24
    and left(p.username, length(coalesce(prefix, ''))) = lower(coalesce(prefix, ''))
  order by p.username
  limit 5;
$$;

revoke all on function public.search_usernames(text) from public, anon;
grant execute on function public.search_usernames(text) to authenticated;
