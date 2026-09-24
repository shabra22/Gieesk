-- ═══════════════════════════════════════════════════════════════
--  GieesK — a real notifications table
--  Supabase → SQL Editor → New query → paste → Run.
--  Safe to run more than once.
-- ═══════════════════════════════════════════════════════════════
--
-- What this replaces. The notification badge was DERIVED on the client
-- every two minutes: fetch your posts (200 rows), your comments (200
-- rows), then likes, comments, comment-likes, follows and profile views
-- across five more queries, join it all in JavaScript, and compare the
-- timestamps against a "seen at" string in localStorage.
--
-- Four things were wrong with that:
--
--   • Cost. Six-plus queries pulling hundreds of rows, per user, every
--     two minutes the app is open, to render one small red dot.
--   • Read state lived in localStorage, so it was per-device. Read your
--     notifications on your phone and they were still unread on the
--     web, and a reinstall marked everything unread again.
--   • It was a single watermark, not per-notification. You could not
--     have read one thing and not another.
--   • There was nothing to push. When push notifications arrive, the
--     server needs a row that says "this happened to this person" —
--     otherwise it has to re-derive the same six-query mess server-side.
--
-- So notifications become rows. Written only by triggers, so no client
-- can forge one; readable only by their owner; and each one carries its
-- own read_at.
--
-- Profile views deliberately stay OUT of this table. They already have
-- their own privacy-controlled RPC (get_my_profile_views), they are
-- high-volume and low-value, and "someone looked at your profile" should
-- not light up a badge. The panel still merges them in for display.


-- ── 1. The table ──────────────────────────────────────────────────
create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,  -- the recipient
  kind        text not null,
  actor_id    uuid references auth.users(id) on delete set null,          -- who did it
  actor_name  text,               -- their username as it was, for display
  -- TEXT, not uuid or bigint, deliberately. community_posts.id is
  -- bigint in this project and post_comments.id follows it, but neither
  -- is guaranteed to stay that way and nothing here needs to do
  -- arithmetic on them — these are opaque handles passed straight back
  -- to the client, which already treats them as strings ("post-<id>" in
  -- the DOM). Text means this file cannot be broken by an id type it
  -- didn't predict. There is no FK either way, because a notification
  -- should survive the post being deleted.
  post_id     text,
  comment_id  text,
  body        text,               -- the comment text, for a comment notification
  subject     text,               -- what it happened to: recipe title or a snippet
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'notifications_kind_check' and conrelid = 'public.notifications'::regclass
  ) then
    alter table public.notifications
      add constraint notifications_kind_check
      check (kind in ('like', 'comment', 'comment_like', 'follow', 'challenge', 'system'));
  end if;
end $$;

-- Never notify yourself about your own action.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'notifications_no_self_check' and conrelid = 'public.notifications'::regclass
  ) then
    alter table public.notifications
      add constraint notifications_no_self_check
      check (actor_id is null or actor_id <> user_id);
  end if;
end $$;

-- The panel reads "my newest first"; the badge counts "my unread".
create index if not exists notifications_user_time_idx
  on public.notifications (user_id, created_at desc);
create index if not exists notifications_unread_idx
  on public.notifications (user_id) where read_at is null;

-- Unliking and re-liking must not stack up two notifications, and a
-- trigger that fires twice must not either. COALESCE because a unique
-- index treats NULLs as distinct, which would defeat the whole point.
create unique index if not exists notifications_dedupe_idx
  on public.notifications (
    user_id, kind,
    coalesce(actor_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(post_id, ''),
    coalesce(comment_id, '')
  );


-- ── 2. Who may see and change what ────────────────────────────────
alter table public.notifications enable row level security;

drop policy if exists "Read my own notifications" on public.notifications;
create policy "Read my own notifications"
  on public.notifications for select
  using (user_id = auth.uid());

-- Marking read is the only change a client may make, and part 3 pins it
-- to the read_at column alone. Without that column grant this policy
-- would let someone rewrite the text of their own notifications —
-- harmless to others, but it would make the history a lie.
drop policy if exists "Mark my own notifications read" on public.notifications;
create policy "Mark my own notifications read"
  on public.notifications for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Clearing your own history is reasonable; writing new rows is not.
drop policy if exists "Delete my own notifications" on public.notifications;
create policy "Delete my own notifications"
  on public.notifications for delete
  using (user_id = auth.uid());


-- ── 3. Column privileges ──────────────────────────────────────────
revoke all on public.notifications from anon, authenticated;
grant select on public.notifications to authenticated;
grant delete on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
-- No INSERT to anyone. Rows come from the triggers below, which run as
-- the table owner.


-- ── 4. The one function that writes a notification ────────────────
-- SECURITY DEFINER so the triggers can insert despite part 3, and
-- search_path pinned like every other definer function in this project.
create or replace function public.push_notification(
  p_user_id uuid,
  p_kind    text,
  p_actor   uuid,
  p_post    text default null,
  p_comment text default null,
  p_body    text default null,
  p_subject text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_username text;
  wants boolean;
begin
  -- Nothing to do if there is no recipient, or it is your own doing.
  if p_user_id is null or (p_actor is not null and p_actor = p_user_id) then
    return;
  end if;

  -- Respect the recipient's per-kind setting.
  select case p_kind
           when 'like'         then notify_likes
           when 'comment'      then notify_comments
           when 'comment_like' then notify_likes
           when 'follow'       then notify_follows
           when 'challenge'    then notify_challenges
           else true
         end
    into wants
  from public.notification_settings where user_id = p_user_id;
  -- No settings row yet means defaults, which are all on.
  if wants is false then return; end if;

  select username into actor_username from public.profiles where id = p_actor;

  insert into public.notifications (user_id, kind, actor_id, actor_name, post_id, comment_id, body, subject)
  values (p_user_id, p_kind, p_actor, actor_username, p_post, p_comment,
          left(coalesce(p_body, ''), 300), left(coalesce(p_subject, ''), 120))
  -- Already notified about exactly this: leave the original alone rather
  -- than resurfacing it as new.
  on conflict do nothing;
end $$;

revoke all on function public.push_notification(uuid, text, uuid, text, text, text, text) from public;


-- ── 5. Per-kind settings ──────────────────────────────────────────
-- A separate table rather than columns on profiles, so the locked-down
-- column grants on profiles don't have to be widened to let people edit
-- their own preferences.
create table if not exists public.notification_settings (
  user_id           uuid primary key references auth.users(id) on delete cascade,
  notify_likes      boolean not null default true,
  notify_comments   boolean not null default true,
  notify_follows    boolean not null default true,
  notify_challenges boolean not null default true,
  -- Read by the push sender later; harmless until then.
  push_enabled      boolean not null default true,
  updated_at        timestamptz not null default now()
);

alter table public.notification_settings enable row level security;
revoke all on public.notification_settings from anon, authenticated;
grant select, insert, update on public.notification_settings to authenticated;

drop policy if exists "Manage my own notification settings" on public.notification_settings;
create policy "Manage my own notification settings"
  on public.notification_settings for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());


-- ── 6. Triggers: the four things worth interrupting someone for ───
create or replace function public.notify_on_post_like()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $$
declare owner_id uuid; subj text;
begin
  select user_id, coalesce(recipe_title, left(text, 80), 'your post')
    into owner_id, subj
  from public.community_posts where id = new.post_id;
  perform public.push_notification(owner_id, 'like', new.user_id, new.post_id::text, null, null, subj);
  return null;
end $$;

drop trigger if exists post_likes_notify on public.post_likes;
create trigger post_likes_notify after insert on public.post_likes
  for each row execute function public.notify_on_post_like();

create or replace function public.notify_on_post_comment()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $$
declare owner_id uuid; subj text;
begin
  select user_id, coalesce(recipe_title, left(text, 80), 'your post')
    into owner_id, subj
  from public.community_posts where id = new.post_id;
  perform public.push_notification(owner_id, 'comment', new.user_id, new.post_id::text, new.id::text, new.text, subj);
  return null;
end $$;

drop trigger if exists post_comments_notify on public.post_comments;
create trigger post_comments_notify after insert on public.post_comments
  for each row execute function public.notify_on_post_comment();

-- comment_likes may not exist on an older database; skip rather than fail.
do $$
begin
  if to_regclass('public.comment_likes') is null then
    raise warning 'comment_likes not found; skipping that notification trigger';
    return;
  end if;

  execute $fn$
    create or replace function public.notify_on_comment_like()
    returns trigger language plpgsql security definer
    set search_path = public, pg_temp as $body$
    declare owner_id uuid; subj text;
    begin
      select user_id, left(text, 80) into owner_id, subj
      from public.post_comments where id = new.comment_id;
      perform public.push_notification(owner_id, 'comment_like', new.user_id, null, new.comment_id::text, null, subj);
      return null;
    end $body$;
  $fn$;

  execute 'drop trigger if exists comment_likes_notify on public.comment_likes';
  execute 'create trigger comment_likes_notify after insert on public.comment_likes
             for each row execute function public.notify_on_comment_like()';
end $$;

-- Follows are recorded against a username, so the followed account has
-- to be looked up. An unmatched name is someone who has since renamed.
create or replace function public.notify_on_follow()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $$
declare owner_id uuid;
begin
  select id into owner_id from public.profiles where username = new.chef_name;
  perform public.push_notification(owner_id, 'follow', new.user_id, null, null, null, null);
  return null;
end $$;

drop trigger if exists chef_follows_notify on public.chef_follows;
create trigger chef_follows_notify after insert on public.chef_follows
  for each row execute function public.notify_on_follow();


-- ── 7. Marking read, and the unread count ─────────────────────────
create or replace function public.mark_notifications_read()
returns integer
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare n integer;
begin
  if auth.uid() is null then return 0; end if;
  update public.notifications set read_at = now()
   where user_id = auth.uid() and read_at is null;
  get diagnostics n = row_count;
  return n;
end $$;

grant execute on function public.mark_notifications_read() to authenticated;

create or replace function public.unread_notification_count()
returns integer
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select count(*)::int from public.notifications
   where user_id = auth.uid() and read_at is null
$$;

grant execute on function public.unread_notification_count() to authenticated;


-- ── 8. Backfill, so the panel isn't empty after migrating ─────────
-- Recent activity only: the point is continuity, not a complete
-- historical rebuild. Everything lands already-read, because these are
-- things people have in practice already seen in the old panel — marking
-- months of history unread would be worse than showing nothing.
do $$
declare inserted int := 0;
begin
  insert into public.notifications (user_id, kind, actor_id, actor_name, post_id, subject, created_at, read_at)
  select p.user_id, 'like', l.user_id, pr.username, l.post_id::text,
         coalesce(p.recipe_title, left(p.text, 80)), l.created_at, now()
  from public.post_likes l
  join public.community_posts p on p.id = l.post_id
  left join public.profiles pr on pr.id = l.user_id
  where p.user_id <> l.user_id
    and l.created_at > now() - interval '30 days'
  on conflict do nothing;
  get diagnostics inserted = row_count;
  raise notice 'backfilled % like notifications', inserted;

  insert into public.notifications (user_id, kind, actor_id, actor_name, post_id, comment_id, body, subject, created_at, read_at)
  select p.user_id, 'comment', c.user_id, pr.username, c.post_id::text, c.id::text,
         left(c.text, 300), coalesce(p.recipe_title, left(p.text, 80)), c.created_at, now()
  from public.post_comments c
  join public.community_posts p on p.id = c.post_id
  left join public.profiles pr on pr.id = c.user_id
  where p.user_id <> c.user_id
    and c.created_at > now() - interval '30 days'
  on conflict do nothing;
  get diagnostics inserted = row_count;
  raise notice 'backfilled % comment notifications', inserted;

  insert into public.notifications (user_id, kind, actor_id, actor_name, created_at, read_at)
  select me.id, 'follow', f.user_id, pr.username, f.created_at, now()
  from public.chef_follows f
  join public.profiles me on me.username = f.chef_name
  left join public.profiles pr on pr.id = f.user_id
  where me.id <> f.user_id
    and f.created_at > now() - interval '30 days'
  on conflict do nothing;
  get diagnostics inserted = row_count;
  raise notice 'backfilled % follow notifications', inserted;
end $$;


-- ── 9. Device tokens, for push later ──────────────────────────────
-- Created now because it costs nothing and means the push work is a
-- server change plus a client file, with no migration at that point.
create table if not exists public.device_tokens (
  token       text primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  platform    text not null default 'android',
  last_seen   timestamptz not null default now(),
  created_at  timestamptz not null default now()
);
alter table public.device_tokens enable row level security;
revoke all on public.device_tokens from anon, authenticated;
-- A client may register and refresh its OWN device, and remove it on
-- sign-out. It may not read the table: knowing other people's tokens
-- would let someone send pushes if a key ever leaked.
grant insert, update, delete on public.device_tokens to authenticated;

drop policy if exists "Register my own device" on public.device_tokens;
create policy "Register my own device"
  on public.device_tokens for insert
  with check (user_id = auth.uid());
drop policy if exists "Refresh my own device" on public.device_tokens;
create policy "Refresh my own device"
  on public.device_tokens for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "Remove my own device" on public.device_tokens;
create policy "Remove my own device"
  on public.device_tokens for delete
  using (user_id = auth.uid());

create index if not exists device_tokens_user_idx on public.device_tokens (user_id);


-- ── 10. Realtime, so the badge stops polling ──────────────────────
-- With this, the client subscribes to inserts on its own rows instead of
-- running six queries every two minutes.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.notifications;
      raise notice 'notifications added to the realtime publication';
    exception
      when duplicate_object then raise notice 'notifications was already in the realtime publication';
      when others then raise warning 'could not add notifications to realtime: %', sqlerrm;
    end;
  else
    raise warning 'no supabase_realtime publication found; the client will fall back to polling';
  end if;
end $$;


-- ── 10b. The id types this database actually uses ────────────────
-- Printed because this file was first written assuming uuid post ids
-- and this project uses bigint. If these ever change, the notification
-- columns are text and don't care — but it is worth seeing.
do $$
declare t text;
begin
  for t in
    select format('%s.%s is %s', table_name, column_name, data_type)
    from information_schema.columns
    where table_schema = 'public'
      and ((table_name = 'community_posts' and column_name = 'id')
        or (table_name = 'post_comments' and column_name = 'id')
        or (table_name = 'notifications' and column_name in ('post_id', 'comment_id')))
    order by table_name, column_name
  loop
    raise notice '%', t;
  end loop;
end $$;


-- ── 11. What you should see ───────────────────────────────────────
select
  (select count(*) from public.notifications) as notifications_rows,
  (select count(*) from public.notifications where read_at is null) as unread_rows;

-- Clients may only ever write read_at. Nothing else should be listed.
select privilege_type, string_agg(coalesce(column_name, '(table)'), ', ' order by column_name) as cols
from information_schema.column_privileges
where table_schema = 'public' and table_name = 'notifications' and grantee = 'authenticated'
group by privilege_type order by privilege_type;
