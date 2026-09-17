-- ═══════════════════════════════════════════════════════════════
--  GieesK — Discover extras: comment likes + video downloads
--  Run once in Supabase → SQL Editor → New query → paste → Run.
--  Safe to run more than once.
-- ═══════════════════════════════════════════════════════════════


-- ── 1. Comment likes ──────────────────────────────────────────────
-- One row per (comment, person). Deleting a comment removes its likes.
create table if not exists public.comment_likes (
  comment_id bigint not null references public.post_comments(id) on delete cascade,
  user_id    uuid   not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

create index if not exists comment_likes_comment_id_idx on public.comment_likes (comment_id);

alter table public.comment_likes enable row level security;

drop policy if exists "Comment likes are public"      on public.comment_likes;
drop policy if exists "Users like comments"            on public.comment_likes;
drop policy if exists "Users remove own comment likes" on public.comment_likes;

-- Anyone can see like counts (and the app shows "Liked by creator").
create policy "Comment likes are public"
  on public.comment_likes for select using (true);
create policy "Users like comments"
  on public.comment_likes for insert with check (auth.uid() = user_id);
create policy "Users remove own comment likes"
  on public.comment_likes for delete using (auth.uid() = user_id);


-- ── 2. Video downloads (off unless the creator turns them on) ─────
-- When on, "Save video" appears in the video's share menu for everyone.
-- The creator can always save their own video.
alter table public.community_posts
  add column if not exists allow_downloads boolean not null default false;
