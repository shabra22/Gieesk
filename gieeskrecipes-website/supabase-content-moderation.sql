-- ═══════════════════════════════════════════════════════════════════
-- GieesK — content moderation (server side)            NOT RUN YET
--
-- Read MODERATION-SETUP.md first. Nothing in the app depends on this file:
-- the on-device screening in js/moderation.js works without it. Run it
-- (Supabase → SQL Editor) when you are ready for the lasting protection.
--
-- What it adds
--   1. community_posts.moderation_hold — a post on hold is hidden
--      everywhere and cannot be re-published by its author. It works by
--      turning the post back into a draft, so every existing feed query
--      (which only shows status = 'published') hides it with no changes.
--   2. Hide-on-report — when enough different people report a post, it is
--      put on hold automatically until you decide. Sexual-content reports
--      need fewer people than the rest.
--   3. A review queue (view) and three functions to use from the SQL editor:
--        moderation_restore(post_id)   — it was fine; put it back
--        moderation_remove(post_id)    — remove it for good (row deleted)
--        moderation_hold_post(post_id) — put a post on hold by hand
--   4. A moderation_log table recording what happened and why.
--
-- Safe to run more than once.
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. Hold flag on posts ─────────────────────────────────────────
alter table public.community_posts
  add column if not exists moderation_hold boolean not null default false,
  add column if not exists moderation_reason text,
  add column if not exists moderated_at timestamptz;

-- ── 2. Log ────────────────────────────────────────────────────────
create table if not exists public.moderation_log (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  post_id     bigint,
  action      text not null,          -- hold | restore | remove
  source      text not null,          -- reports | ai | manual
  reason      text
);
alter table public.moderation_log enable row level security;
-- No policies: nobody but the service role / SQL editor can read or write it.

-- ── 3. A held post stays hidden ───────────────────────────────────
-- Whatever the app (or a hand-made request) does, a post on hold cannot
-- be published. Draft is the "hidden" state every feed already respects.
-- Authors also cannot lift their own hold or change the reason.
create or replace function public.moderation_guard()
returns trigger
language plpgsql
as $$
begin
  -- current_user is 'authenticated' / 'anon' for requests from the app, and
  -- the function owner inside the security-definer functions below, so the
  -- SQL editor, the service role and those functions are allowed through.
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      new.moderation_hold := false;
      new.moderation_reason := null;
      new.moderated_at := null;
    else
      new.moderation_hold := old.moderation_hold;
      new.moderation_reason := old.moderation_reason;
      new.moderated_at := old.moderated_at;
    end if;
  end if;

  if new.moderation_hold then
    new.status := 'draft';
  end if;
  return new;
end;
$$;

drop trigger if exists community_posts_keep_hidden on public.community_posts;
drop trigger if exists community_posts_protect_moderation on public.community_posts;
drop function if exists public.moderation_keep_hidden();
drop function if exists public.moderation_protect_columns();
drop trigger if exists community_posts_moderation_guard on public.community_posts;
create trigger community_posts_moderation_guard
  before insert or update on public.community_posts
  for each row execute function public.moderation_guard();

-- ── 4. Hide-on-report ─────────────────────────────────────────────
-- Different people, not different reports: one person reporting five
-- times counts once. Change the numbers to taste.
create or replace function public.moderation_on_report()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_threshold int;
  v_people    int;
begin
  -- Reports of a single comment are not reports of the whole post.
  if new.post_id is null or (to_jsonb(new) ->> 'comment_id') is not null then
    return new;
  end if;

  v_threshold := case
    when new.reason in ('Sexual content') then 2          -- nudity: act fast
    when new.reason in ('Dangerous content') then 3
    else 5
  end;

  select count(distinct r.reporter_id) into v_people
  from public.content_reports r
  where r.post_id = new.post_id
    and r.reason = new.reason
    and (to_jsonb(r) ->> 'comment_id') is null;

  if v_people >= v_threshold then
    update public.community_posts
       set moderation_hold = true,
           moderation_reason = 'Reported: ' || new.reason,
           moderated_at = now(),
           status = 'draft'
     where id = new.post_id
       and moderation_hold = false;
    if found then
      insert into public.moderation_log (post_id, action, source, reason)
      values (new.post_id, 'hold', 'reports', new.reason || ' (' || v_people || ' people)');
    end if;
  end if;
  return new;
end;
$$;

do $$
begin
  if to_regclass('public.content_reports') is null then
    raise warning 'content_reports table not found — hide-on-report was not installed.';
  else
    drop trigger if exists content_reports_moderate on public.content_reports;
    create trigger content_reports_moderate
      after insert on public.content_reports
      for each row execute function public.moderation_on_report();
  end if;
end $$;

-- ── 5. Review queue and the three actions ─────────────────────────
create or replace view public.moderation_queue as
select p.id, p.user_id, p.moderated_at, p.moderation_reason,
       p.video_url, p.poster_url, p.image_url,
       (select count(*) from public.content_reports r where r.post_id = p.id) as reports
from public.community_posts p
where p.moderation_hold
order by p.moderated_at desc nulls last;

revoke all on public.moderation_queue from public, anon, authenticated;

create or replace function public.moderation_restore(p_post bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.community_posts
     set moderation_hold = false, moderation_reason = null, moderated_at = now(), status = 'published'
   where id = p_post;
  insert into public.moderation_log (post_id, action, source) values (p_post, 'restore', 'manual');
end;
$$;

create or replace function public.moderation_hold_post(p_post bigint, p_reason text default 'Held by admin')
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.community_posts
     set moderation_hold = true, moderation_reason = p_reason, moderated_at = now(), status = 'draft'
   where id = p_post;
  insert into public.moderation_log (post_id, action, source, reason) values (p_post, 'hold', 'manual', p_reason);
end;
$$;

create or replace function public.moderation_remove(p_post bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.community_posts where id = p_post;
  insert into public.moderation_log (post_id, action, source) values (p_post, 'remove', 'manual');
end;
$$;
-- Removing a row does not delete the uploaded file from Storage. Delete it
-- from Storage → cooking-videos / post-images (or, if it was illegal, keep a
-- copy only as the law and the police require). See MODERATION-SETUP.md.

revoke all on function public.moderation_restore(bigint)            from public, anon, authenticated;
revoke all on function public.moderation_hold_post(bigint, text)    from public, anon, authenticated;
revoke all on function public.moderation_remove(bigint)             from public, anon, authenticated;
revoke all on function public.moderation_on_report()              from public, anon, authenticated;
