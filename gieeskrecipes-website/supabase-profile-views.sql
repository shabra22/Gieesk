-- ═══════════════════════════════════════════════════════════════
--  GieesK — profile views
--  Run once in Supabase → SQL Editor → New query → paste → Run.
--  Safe to run more than once. Needs supabase-public-profiles.sql first.
-- ═══════════════════════════════════════════════════════════════
--
-- How it works (same idea as TikTok's profile view history):
--  • Visiting someone's profile records one view per visitor per day.
--    Opening it ten times in a day is still one view. Your own visits to
--    your own profile never count.
--  • The owner sees who viewed their profile in the last 30 days, and
--    gets a notification for each new visitor.
--  • It's reciprocal and switchable: "Profile view history" in Account.
--    Turn it off and your visits aren't recorded AND you can't see who
--    viewed you. It's on by default.
--  • Nobody can read the views table directly. Only the two functions
--    below touch it, and they only ever return your own viewers.


-- ── 1. Setting ────────────────────────────────────────────────────
alter table public.profiles
  add column if not exists profile_view_history boolean not null default true;


-- ── 2. Views table (locked: no direct access) ─────────────────────
create table if not exists public.profile_views (
  profile_id uuid not null references auth.users(id) on delete cascade,
  viewer_id  uuid not null references auth.users(id) on delete cascade,
  view_day   date not null default ((now() at time zone 'utc')::date),
  viewed_at  timestamptz not null default now(),
  primary key (profile_id, viewer_id, view_day)
);

create index if not exists profile_views_profile_recent_idx
  on public.profile_views (profile_id, viewed_at desc);

alter table public.profile_views enable row level security;
-- Deliberately no policies: the API can't read or write this table.
revoke all on public.profile_views from anon, authenticated;


-- ── 3. Record a visit ─────────────────────────────────────────────
create or replace function public.record_profile_view(p_profile uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null or p_profile is null or uid = p_profile then
    return;
  end if;
  if not exists (select 1 from profiles where id = p_profile) then
    return;
  end if;
  -- Visitors who turned view history off aren't recorded.
  if coalesce((select profile_view_history from profiles where id = uid), true) = false then
    return;
  end if;

  insert into profile_views (profile_id, viewer_id)
  values (p_profile, uid)
  on conflict (profile_id, viewer_id, view_day)
  do update set viewed_at = now();

  -- Keep only the last 30 days.
  delete from profile_views
  where profile_id = p_profile
    and viewed_at < now() - interval '30 days';
end;
$$;

revoke all on function public.record_profile_view(uuid) from public, anon;
grant execute on function public.record_profile_view(uuid) to authenticated;


-- ── 4. Who viewed my profile ──────────────────────────────────────
-- Latest visit per person in the last 30 days, newest first. Empty if
-- your own view history is off. Visitors who have since turned their
-- history off are left out.
create or replace function public.get_my_profile_views(p_limit int default 50)
returns table (viewer_id uuid, username text, avatar_url text, viewed_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    return;
  end if;
  if coalesce((select profile_view_history from profiles where id = uid), true) = false then
    return;
  end if;

  return query
  select v.viewer_id, p.username, p.avatar_url, v.last_view
  from (
    select pv.viewer_id, max(pv.viewed_at) as last_view
    from profile_views pv
    where pv.profile_id = uid
      and pv.viewed_at >= now() - interval '30 days'
    group by pv.viewer_id
  ) v
  join profiles p on p.id = v.viewer_id
  where coalesce(p.profile_view_history, true) = true
  order by v.last_view desc
  limit greatest(1, least(coalesce(p_limit, 50), 200));
end;
$$;

revoke all on function public.get_my_profile_views(int) from public, anon;
grant execute on function public.get_my_profile_views(int) to authenticated;


-- ── 5. Follow times (for "started following you" notifications) ───
-- Harmless if the column is already there. Existing follows are left
-- without a time, so they don't all show up as brand-new notifications.
alter table public.chef_follows
  add column if not exists created_at timestamptz;
alter table public.chef_follows
  alter column created_at set default now();
