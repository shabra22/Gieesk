-- ═══════════════════════════════════════════════════════════════════
-- GieesK — database hardening                           NOT RUN YET
--
-- Read RELIABILITY.md first. Nothing in the app depends on this file; the
-- app works the same without it. Run it (Supabase → SQL Editor) at the
-- final stage together with your other pending SQL. Safe to run twice, and
-- every step quietly skips a table or column that doesn't exist.
--
--   1. Indexes          the columns the app filters and sorts by
--   2. Rate limits      stop one account flooding posts, comments, likes…
--   3. Storage limits   size and file-type caps enforced by Supabase itself
--   4. client_errors    where the app can report unexpected errors (off
--                       until you set GK_ERROR_LOG, see RELIABILITY.md)
--   5. AI Chef cap      per-person daily ceiling used by ai-chef-chat
-- ═══════════════════════════════════════════════════════════════════


-- ── 1. Indexes ────────────────────────────────────────────────────
-- Without these, every feed load, comment list and notification check
-- reads the whole table; it works at 100 rows and crawls at 100,000.
create or replace function public.gk_make_index(p_name text, p_table text, p_cols text[], p_def text)
returns void
language plpgsql
as $$
declare c text;
begin
  if to_regclass('public.' || p_table) is null then return; end if;
  foreach c in array p_cols loop
    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = p_table and column_name = c
    ) then return; end if;
  end loop;
  execute format('create index if not exists %I on public.%I %s', p_name, p_table, p_def);
end;
$$;

select public.gk_make_index('gk_idx_posts_status_created', 'community_posts', array['status','created_at'],   '(status, created_at desc)');
select public.gk_make_index('gk_idx_posts_user_created',   'community_posts', array['user_id','created_at'],  '(user_id, created_at desc)');
select public.gk_make_index('gk_idx_comments_post_created','post_comments',   array['post_id','created_at'],  '(post_id, created_at)');
select public.gk_make_index('gk_idx_comments_user_created','post_comments',   array['user_id','created_at'],  '(user_id, created_at desc)');
select public.gk_make_index('gk_idx_likes_post',           'post_likes',      array['post_id'],               '(post_id)');
select public.gk_make_index('gk_idx_likes_user',           'post_likes',      array['user_id'],               '(user_id)');
select public.gk_make_index('gk_idx_reports_post',         'content_reports', array['post_id'],               '(post_id)');
select public.gk_make_index('gk_idx_follows_user',         'chef_follows',    array['user_id'],               '(user_id)');
select public.gk_make_index('gk_idx_follows_chef',         'chef_follows',    array['chef_name'],             '(chef_name)');
select public.gk_make_index('gk_idx_notifs_user_created',  'notifications',   array['user_id','created_at'],  '(user_id, created_at desc)');


-- ── 2. Rate limits ────────────────────────────────────────────────
-- A person can't realistically post a video every few seconds; a script
-- can. The database refuses the insert with a plain-English message, which
-- the app already shows as "Couldn't post your comment: …". Requests made
-- through the SQL editor or the service role are never limited.
create or replace function public.gk_rate_limit()
returns trigger
language plpgsql
as $$
declare
  v_col    text     := TG_ARGV[0];
  v_window interval := TG_ARGV[1]::interval;
  v_max    int      := TG_ARGV[2]::int;
  v_uid    uuid;
  v_count  int;
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;
  v_uid := nullif(to_jsonb(new) ->> v_col, '')::uuid;
  if v_uid is null then
    return new;
  end if;
  execute format('select count(*) from %I.%I where %I = $1 and created_at > now() - $2',
                 TG_TABLE_SCHEMA, TG_TABLE_NAME, v_col)
    into v_count using v_uid, v_window;
  if v_count >= v_max then
    raise exception 'You are doing that too quickly. Please wait a few minutes and try again.'
      using errcode = 'P0001', hint = 'rate_limited';
  end if;
  return new;
end;
$$;

create or replace function public.gk_add_rate_limit(p_table text, p_user_col text, p_window text, p_max int)
returns void
language plpgsql
as $$
begin
  if to_regclass('public.' || p_table) is null then return; end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name=p_table and column_name=p_user_col)
     or not exists (select 1 from information_schema.columns where table_schema='public' and table_name=p_table and column_name='created_at')
  then
    raise notice 'Rate limit skipped for % (needs % and created_at).', p_table, p_user_col;
    return;
  end if;
  execute format('drop trigger if exists gk_rate_limit_%1$s on public.%1$I', p_table);
  execute format(
    'create trigger gk_rate_limit_%1$s before insert on public.%1$I for each row execute function public.gk_rate_limit(%2$L, %3$L, %4$L)',
    p_table, p_user_col, p_window, p_max::text);
  perform public.gk_make_index('gk_idx_rl_' || p_table, p_table, array[p_user_col,'created_at'],
                               format('(%I, created_at desc)', p_user_col));
end;
$$;

--                              table              who            window        max
select public.gk_add_rate_limit('community_posts',  'user_id',     '1 hour',     15);   -- videos, photos, drafts
select public.gk_add_rate_limit('post_comments',    'user_id',     '10 minutes', 40);
select public.gk_add_rate_limit('content_reports',  'reporter_id', '1 hour',     20);
select public.gk_add_rate_limit('post_likes',       'user_id',     '10 minutes', 200);
select public.gk_add_rate_limit('chef_follows',     'user_id',     '1 hour',     60);


-- ── 3. Storage limits ─────────────────────────────────────────────
-- The app checks size and type before uploading; this makes Supabase
-- itself refuse anything else, including requests that skip the app.
-- (A project-wide cap in Dashboard → Storage → Settings also applies: the
-- free plan's is 50 MB, which is below the app's 150 MB video limit.)
do $$
begin
  if to_regclass('storage.buckets') is null then return; end if;
  update storage.buckets set file_size_limit = 5 * 1024 * 1024,
         allowed_mime_types = array['image/jpeg','image/png','image/webp','image/gif']
   where id = 'post-images';
  update storage.buckets set file_size_limit = 2 * 1024 * 1024,
         allowed_mime_types = array['image/jpeg','image/png','image/webp','image/gif']
   where id = 'avatars';
  update storage.buckets set file_size_limit = 150 * 1024 * 1024,
         allowed_mime_types = array['video/mp4','video/quicktime','video/x-m4v','video/webm','video/3gpp','video/x-matroska']
   where id = 'cooking-videos';
end $$;


-- ── 4. Error log ──────────────────────────────────────────────────
-- js/resilience.js can send unexpected errors here (technical details
-- only: message, stack, page path, web/app, browser). Anyone may add a
-- row; nobody but you can read them (Table Editor / SQL editor).
create table if not exists public.client_errors (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  kind       text not null check (kind in ('error', 'promise')),
  message    text not null check (char_length(message) <= 500),
  stack      text check (char_length(stack) <= 2000),
  page       text check (char_length(page) <= 200),
  platform   text check (platform in ('web', 'app')),
  agent      text check (char_length(agent) <= 200)
);
create index if not exists gk_idx_client_errors_created on public.client_errors (created_at desc);

alter table public.client_errors enable row level security;
drop policy if exists "anyone can report an error" on public.client_errors;
create policy "anyone can report an error" on public.client_errors
  for insert to anon, authenticated with check (true);
grant insert on public.client_errors to anon, authenticated;
revoke select, update, delete on public.client_errors from anon, authenticated;

-- A flood guard: if something is going badly wrong for everyone at once,
-- keep the first 300 reports a minute and drop the rest quietly.
create or replace function public.gk_client_errors_cap()
returns trigger
language plpgsql
security definer          -- it must be able to count rows that visitors themselves may not read
set search_path = public
as $$
begin
  if (select count(*) from public.client_errors where created_at > now() - interval '1 minute') >= 300 then
    return null;
  end if;
  return new;
end;
$$;
drop trigger if exists gk_client_errors_cap on public.client_errors;
create trigger gk_client_errors_cap before insert on public.client_errors
  for each row execute function public.gk_client_errors_cap();

-- Housekeeping, from the SQL editor whenever you like:
--   select public.gk_purge_client_errors(30);
create or replace function public.gk_purge_client_errors(p_days int default 30)
returns bigint
language sql
security definer
set search_path = public
as $$
  with gone as (delete from public.client_errors where created_at < now() - make_interval(days => p_days) returning 1)
  select count(*) from gone;
$$;
revoke all on function public.gk_purge_client_errors(int) from public, anon, authenticated;


-- ── 5. AI Chef daily ceiling ──────────────────────────────────────
-- ai-chef-chat calls gk_ai_chef_hit() before answering. It counts the
-- message and says whether the person is still under today's limit
-- (AI_CHEF_DAILY_LIMIT, default 150). Only the function can call it.
create table if not exists public.ai_chef_usage (
  user_id uuid not null,
  day     date not null default (now() at time zone 'utc')::date,
  count   int  not null default 0,
  primary key (user_id, day)
);
alter table public.ai_chef_usage enable row level security;
-- No policies: only the service role touches this table.

create or replace function public.gk_ai_chef_hit(p_user uuid, p_limit int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare v_count int;
begin
  insert into public.ai_chef_usage as u (user_id, day, count)
  values (p_user, (now() at time zone 'utc')::date, 1)
  on conflict (user_id, day) do update set count = u.count + 1
  returning u.count into v_count;
  return v_count <= p_limit;
end;
$$;
revoke all on function public.gk_ai_chef_hit(uuid, int) from public, anon, authenticated;
grant execute on function public.gk_ai_chef_hit(uuid, int) to service_role;
