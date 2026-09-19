-- ═══════════════════════════════════════════════════════════════
--  GieesK — verify another creator by hand
--  Run in Supabase → SQL Editor. Nothing here is permanent; part 4
--  undoes it.
-- ═══════════════════════════════════════════════════════════════
--
-- Use this to see the tick on someone who ISN'T you. Your own badge
-- can show through a local fallback, so it doesn't fully prove the
-- feed path works. Another creator's badge can only come from the
-- database, so if it appears, the whole chain is working.


-- ── 1. Who is there to verify? ────────────────────────────────────
-- Creators with at least one published video, busiest first.
-- Pick a username from the results and use it in part 2.
select
  p.username,
  count(c.id) as videos,
  p.is_verified,
  p.verification_status
from public.profiles p
join public.community_posts c
  on c.user_id = p.id
 and c.status = 'published'
 and c.video_url is not null
where p.username is not null
group by p.username, p.is_verified, p.verification_status
order by videos desc, p.username
limit 30;


-- ── 2. Give one of them the badge ─────────────────────────────────
-- Change 'PUT_USERNAME_HERE' to a username from part 1, then run.
-- verification_note records why, so you can tell hand-granted
-- badges apart from paid ones later.
update public.profiles
set is_verified        = true,
    verification_status = 'verified',
    verified_since      = coalesce(verified_since, now()),
    verification_note   = 'Granted by hand for testing'
where username = 'PUT_USERNAME_HERE'
returning username, is_verified, verification_status;


-- ── 3. Check the app will actually see it ─────────────────────────
-- This is the exact function the feeds and profiles call. If
-- is_verified comes back true here, the tick will show.
select *
from public.get_public_profiles(
  array(select id from public.profiles where username = 'PUT_USERNAME_HERE')
);


-- ── 4. Take it back off when you're done ──────────────────────────
-- update public.profiles
-- set is_verified = false,
--     verification_status = 'none',
--     verified_since = null,
--     verification_note = null
-- where username = 'PUT_USERNAME_HERE';


-- ── 5. Everyone who currently has a badge ─────────────────────────
select username, verification_status, verified_since, verification_note
from public.profiles
where is_verified
order by verified_since desc nulls last;
