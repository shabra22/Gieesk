-- ═══════════════════════════════════════════════════════════════
--  GieesK — trim points and an overlay caption for videos
--  Supabase → SQL Editor → New query → paste → Run.
--  Safe to run more than once.
-- ═══════════════════════════════════════════════════════════════
--
-- Why metadata and not a real cut.
--
-- Actually trimming a video means re-encoding it, and none of the
-- routes to that are acceptable here: ffmpeg.wasm is ~25MB and takes
-- minutes on a mid-range phone (and tends to exhaust the WebView's
-- memory), a native MediaCodec plugin is Android code nobody in this
-- project maintains, and Supabase edge functions are Deno with no
-- ffmpeg binary.
--
-- So the file is uploaded whole and the PLAYER honours these three
-- values. Inside GieesK that is indistinguishable from a real edit: the
-- clip starts where you said, ends where you said, loops within that
-- window, and the overlay text sits on top. It is also instant, works
-- on every device, and stays editable afterwards instead of being burnt
-- into pixels.
--
-- The known limitation, stated plainly: a file downloaded or shared
-- outside the app is the untrimmed original with no overlay. That is
-- the right place for the watermarking pass that is planned later —
-- whatever process burns in a watermark can apply these values at the
-- same time, from these columns, with no client change.


-- ── 1. The columns ────────────────────────────────────────────────
alter table public.community_posts
  add column if not exists trim_start   numeric(8,2),
  add column if not exists trim_end     numeric(8,2),
  add column if not exists overlay_text text;

comment on column public.community_posts.trim_start is
  'Seconds into the file where playback should begin. NULL means the start.';
comment on column public.community_posts.trim_end is
  'Seconds into the file where playback should stop and loop. NULL means the end.';
comment on column public.community_posts.overlay_text is
  'Text drawn over the video at playback time. Not burnt into the file.';


-- ── 2. Values that can't be nonsense ──────────────────────────────
-- A negative start or an end before the start would make the player
-- loop on a zero-length window, which reads as a frozen video.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'community_posts_trim_check'
      and conrelid = 'public.community_posts'::regclass
  ) then
    alter table public.community_posts
      add constraint community_posts_trim_check
      check (
        (trim_start is null or trim_start >= 0)
        and (trim_end is null or trim_end > 0)
        -- A window must be at least a second long to be playable.
        and (trim_start is null or trim_end is null or trim_end - trim_start >= 1)
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'community_posts_overlay_len_check'
      and conrelid = 'public.community_posts'::regclass
  ) then
    -- Long enough for a real label, short enough that it can't be used
    -- to paste an essay over somebody's feed.
    alter table public.community_posts
      add constraint community_posts_overlay_len_check
      check (overlay_text is null or char_length(overlay_text) <= 120);
  end if;
end $$;


-- ── 3. What you should see ────────────────────────────────────────
select column_name, data_type, numeric_precision, numeric_scale
from information_schema.columns
where table_schema = 'public' and table_name = 'community_posts'
  and column_name in ('trim_start', 'trim_end', 'overlay_text')
order by column_name;

-- Both constraints should be listed.
select conname
from pg_constraint
where conrelid = 'public.community_posts'::regclass
  and conname in ('community_posts_trim_check', 'community_posts_overlay_len_check')
order by conname;
