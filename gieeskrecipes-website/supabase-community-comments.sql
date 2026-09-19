-- ═══════════════════════════════════════════════════════════════
--  GieesK — Community comments: replies, edits and moderation
--  Supabase → SQL Editor → New query → paste → Run.
--  Safe to run more than once, and safe to run in any order.
-- ═══════════════════════════════════════════════════════════════
--
-- The app has offered Reply, Edit and (for the post's owner) Delete on
-- comments for a while, but the original supabase/community.sql created
-- post_comments with only id, post_id, user_id, author_name, text and
-- created_at, and only three policies: read, insert, delete-your-own.
-- So on the live database:
--
--   * Reply had nowhere to store the parent comment. Worse, the app sends
--     parent_comment_id on EVERY comment, and PostgREST rejects the whole
--     insert when a column doesn't exist — so posting any comment at all
--     could fail with "Could not find the 'parent_comment_id' column".
--   * Edit wrote updated_at (no such column) and needed an UPDATE policy
--     (none existed), so it failed twice over.
--   * A creator deleting a comment on their own video matched no row,
--     because the only delete policy covers the comment's own author.
--
-- The app now degrades gracefully without this file — it retries the
-- insert without the column and hides Reply and Edit. Run this to turn
-- the full comment system on.


-- ── 1. Threaded replies ───────────────────────────────────────────
alter table public.post_comments
  add column if not exists parent_comment_id bigint
    references public.post_comments(id) on delete cascade;

-- Replies are always read by parent, so this index earns its keep.
create index if not exists post_comments_parent_idx
  on public.post_comments (parent_comment_id);


-- ── 2. The "edited" marker ────────────────────────────────────────
-- Deliberately null by default: the app shows "edited" whenever this is
-- set, so a default of now() would tag every comment ever written.
alter table public.post_comments
  add column if not exists updated_at timestamptz;


-- ── 3. Editing your own comment ───────────────────────────────────
drop policy if exists "Users edit own comments" on public.post_comments;
create policy "Users edit own comments"
  on public.post_comments for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);


-- ── 4. Letting a creator moderate their own post ──────────────────
-- Anyone can delete their own comment (the existing policy). This adds
-- the owner of the post: on your own video or recipe, you can remove
-- someone else's comment. Nobody else can touch it.
drop policy if exists "Post owners delete comments" on public.post_comments;
create policy "Post owners delete comments"
  on public.post_comments for delete
  using (
    exists (
      select 1 from public.community_posts p
      where p.id = post_comments.post_id
        and p.user_id = auth.uid()
    )
  );


-- ── 5. Columns the rest of Community expects ──────────────────────
-- These were all added by hand at some point rather than in a file. If
-- they already exist, nothing happens; if one was missed, this is what
-- it was breaking.
alter table public.community_posts
  add column if not exists status text not null default 'published',
  add column if not exists image_url text,
  add column if not exists ingredients text[],
  add column if not exists steps text[],
  add column if not exists comments_disabled boolean not null default false,
  add column if not exists likes_hidden boolean not null default false;

-- The feed asks for published, non-video posts, newest first.
create index if not exists community_posts_feed_idx
  on public.community_posts (status, created_at desc);

-- Tag pills filter on the tags array.
create index if not exists community_posts_tags_idx
  on public.community_posts using gin (tags);


-- ── 6. What you should see ────────────────────────────────────────
-- Both new columns, then four policies on post_comments
-- (read / insert / update own / delete own + post owner).
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'post_comments'
order by ordinal_position;

select policyname, cmd
from pg_policies
where schemaname = 'public' and tablename = 'post_comments'
order by cmd, policyname;
