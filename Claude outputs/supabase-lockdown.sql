-- ═══════════════════════════════════════════════════════════════
--  GieesK — close the write holes in profiles and post_comments
--  Supabase → SQL Editor → New query → paste → Run.
--  Safe to run more than once. Run it LAST, after any other file.
-- ═══════════════════════════════════════════════════════════════
--
-- Why this exists. The app's protection for the paid fields is a
-- trigger, `protect_profile_verified()`, and three different files
-- define it with `create or replace`: supabase-discover-feed.sql has a
-- NARROW version that guards only `is_verified`, while
-- supabase-verified-badge.sql and supabase-badge-visibility.sql have the
-- full one. Whichever file ran last wins. Every one of them says "safe
-- to run more than once" — and re-running the discover file is exactly
-- when it isn't, because it quietly leaves `is_premium` writable.
--
-- With `is_premium` writable, one request gets somebody Gieesk Pro for
-- nothing:
--
--   PATCH /rest/v1/profiles?id=eq.<their own id>
--   {"is_premium": true, "premium_until": "2099-01-01"}
--
-- The row-level policy allows writing your own row, which is correct;
-- the question is WHICH COLUMNS. So this file stops relying on trigger
-- order and says it with privileges instead: the client may write the
-- columns the app actually edits, and nothing else. Postgres enforces
-- that regardless of what any trigger does or what order files ran in.
--
-- Nothing here changes what the app can do. Every column it writes is
-- granted below.


-- ── 1. profiles: column-level write privileges ────────────────────
-- Built from the columns that actually exist, so this file can't fail
-- on a schema that's missing one.
do $$
declare
  wanted text[] := array[
    'full_name', 'bio', 'country', 'favorite_cuisine', 'dietary_preferences',
    'avatar_url', 'username', 'profile_view_history', 'updated_at'
  ];
  present text;
begin
  select string_agg(quote_ident(column_name), ', ')
    into present
  from information_schema.columns
  where table_schema = 'public' and table_name = 'profiles'
    and column_name = any(wanted);

  if present is null then
    raise warning 'profiles has none of the expected editable columns; nothing granted';
    return;
  end if;

  -- Table-wide write rights go first, then only these columns come back.
  revoke update on public.profiles from anon, authenticated;
  revoke insert on public.profiles from anon, authenticated;

  execute format('grant update (%s) on public.profiles to authenticated', present);
  -- INSERT is only the fallback for accounts created before the
  -- auto-create trigger existed; it needs the id as well.
  execute format('grant insert (id, %s) on public.profiles to authenticated', present);

  raise notice 'profiles: authenticated may now write only: id, %', present;
end $$;

-- Deliberately NOT granted, and therefore now impossible to write from
-- the app whatever the trigger says:
--   is_premium, premium_until            (Gieesk Pro — Stripe only)
--   is_verified, verification_*          (the badge — Stripe + Identity)
--   stripe_customer_id, stripe_subscription_id
--   role, premium                        (legacy/unused; see part 5)


-- ── 2. The trigger, restated, and made to fail closed ─────────────
-- Kept as a second layer. The old test named the roles to block
-- ('anon', 'authenticated'), so an unrecognised or NULL role fell
-- through and wrote whatever it liked. This one names the two callers
-- allowed to touch these fields — the SQL editor (no JWT, so
-- auth.role() is null) and the Stripe webhook (service_role) — and
-- pins the columns for everybody else.
create or replace function public.protect_profile_verified()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if coalesce(auth.role(), 'sql') not in ('sql', 'service_role') then
    if tg_op = 'INSERT' then
      new.is_verified := false;
      new.verification_status := 'none';
      new.verified_since := null;
      new.verification_paid_until := null;
      new.verification_note := null;
      new.verification_session_id := null;
      new.stripe_customer_id := null;
      new.is_premium := false;
      new.premium_until := null;
    else
      new.is_verified := old.is_verified;
      new.verification_status := old.verification_status;
      new.verified_since := old.verified_since;
      new.verification_paid_until := old.verification_paid_until;
      new.verification_note := old.verification_note;
      new.verification_session_id := old.verification_session_id;
      new.stripe_customer_id := old.stripe_customer_id;
      new.is_premium := old.is_premium;
      new.premium_until := old.premium_until;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_verified on public.profiles;
create trigger profiles_protect_verified
  before insert or update on public.profiles
  for each row execute function public.protect_profile_verified();


-- ── 3. Reserved usernames, enforced by the database ───────────────
-- The blocklist (admin, support, billing, gieesk*, …) lived only inside
-- set_my_username(), so writing profiles.username directly walked past
-- it and "gieesk_billing" was available to anyone. As a constraint it
-- holds on every path.
do $$
begin
  if to_regprocedure('public.is_reserved_username(text)') is null then
    raise warning 'is_reserved_username() not found — run supabase-privacy-and-unique-usernames.sql first for the reserved-name rule';
    return;
  end if;
  if exists (
    select 1 from pg_constraint
    where conname = 'profiles_username_not_reserved' and conrelid = 'public.profiles'::regclass
  ) then
    return;
  end if;
  -- Existing rows are checked too; if one already holds a reserved name
  -- the constraint is added NOT VALID so this file still completes and
  -- you can deal with that row by hand.
  begin
    alter table public.profiles
      add constraint profiles_username_not_reserved
      check (username is null or not public.is_reserved_username(username));
  exception when check_violation then
    alter table public.profiles
      add constraint profiles_username_not_reserved
      check (username is null or not public.is_reserved_username(username)) not valid;
    raise warning 'A profile already holds a reserved username — constraint added NOT VALID. Find it with: select id, username from profiles where public.is_reserved_username(username);';
  end;
end $$;


-- ── 4. Comments: only the text may be edited ──────────────────────
-- The UPDATE policy checks ownership, which is right, but nothing
-- pinned the other columns — so your own comment could be moved onto
-- someone else's post (past their comments-off setting), re-parented
-- under any thread, back-dated to the top of the list, or given a
-- different author name.
do $$
begin
  if to_regclass('public.post_comments') is null then
    raise warning 'post_comments not found; skipping';
    return;
  end if;
end $$;

create or replace function public.protect_comment_columns()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if coalesce(auth.role(), 'sql') not in ('sql', 'service_role') then
    new.post_id := old.post_id;
    new.user_id := old.user_id;
    new.author_name := old.author_name;
    new.created_at := old.created_at;
    if to_jsonb(new) ? 'parent_comment_id' then
      new.parent_comment_id := old.parent_comment_id;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists post_comments_protect_columns on public.post_comments;
create trigger post_comments_protect_columns
  before update on public.post_comments
  for each row execute function public.protect_comment_columns();


-- ── 5. The two dead columns ───────────────────────────────────────
-- `role` (with 'admin' in its own CHECK list) and `premium` are written
-- by nothing and read by nothing — I checked every JS file. They are
-- now unwritable from the app by part 1, but the first admin screen
-- that trusts profiles.role would be self-serve, so they are better
-- gone. Uncomment when you're sure nothing external reads them:
--
-- alter table public.profiles drop column if exists role;
-- alter table public.profiles drop column if exists premium;


-- ── 6. The signup trigger's search_path ───────────────────────────
-- Every other SECURITY DEFINER function in this project pins its
-- search_path; this one, which runs as the table owner on every signup,
-- did not.
do $$
begin
  if to_regprocedure('public.handle_new_user()') is null then return; end if;
  execute 'alter function public.handle_new_user() set search_path = public, pg_temp';
end $$;


-- ── 7. Meal planner items had RLS on and no policy at all ─────────
-- Which means it fails closed: the planner can't read or write its own
-- rows. Ownership comes through the parent plan — never `using (true)`,
-- since this table has no user_id of its own.
do $$
begin
  if to_regclass('public.meal_plan_items') is null then
    raise warning 'meal_plan_items not found; skipping';
    return;
  end if;
  drop policy if exists "Users manage own plan items" on public.meal_plan_items;
  create policy "Users manage own plan items"
    on public.meal_plan_items for all
    using (exists (
      select 1 from public.meal_plans p
      where p.id = meal_plan_items.plan_id and p.user_id = auth.uid()
    ))
    with check (exists (
      select 1 from public.meal_plans p
      where p.id = meal_plan_items.plan_id and p.user_id = auth.uid()
    ));
end $$;


-- ── 8. What you should see ────────────────────────────────────────
-- The paid columns must NOT appear in this list.
select string_agg(distinct column_name, ', ' order by column_name) as app_may_write
from information_schema.column_privileges
where table_schema = 'public' and table_name = 'profiles'
  and grantee = 'authenticated' and privilege_type = 'UPDATE';

-- Proof the lock works. Run this as yourself from the app's perspective
-- and it should change nothing (the SQL editor bypasses the trigger by
-- design, so test this from the app or with a user JWT instead):
--   update profiles set is_premium = true where id = auth.uid();
