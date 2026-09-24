-- ═══════════════════════════════════════════════════════════════
--  GieesK — Play Billing entitlements + the earned verified badge
--  Supabase → SQL Editor → New query → paste → Run.
--  Safe to run more than once. Run it AFTER supabase-lockdown.sql.
-- ═══════════════════════════════════════════════════════════════
--
-- Two changes, both moving away from Stripe.
--
-- 1. ENTITLEMENT SOURCE. Pro will be sold through Google Play, so
--    is_premium can now be granted by Play as well as (historically) by
--    Stripe. A single boolean can't say WHICH, and that matters: an
--    Apple or Stripe cancellation must never revoke Premium somebody is
--    paying Google for. So every grant now records its source and its
--    reference (the Play purchase token), and a webhook may only revoke
--    a grant it owns.
--
-- 2. THE BADGE IS EARNED, NOT BOUGHT. It was a paid, ID-checked
--    subscription built on Stripe Identity — which is not available to
--    businesses in the UAE at all, so that design could never ship from
--    here. It is now earned from public, checkable facts: how long the
--    account has existed, how many real recipes it has published, and
--    how many people follow it. No documents, no payment, no vendor.
--
--    That means the badge no longer asserts "we checked this person's
--    ID". The app copy changes with it — claiming an identity check
--    that didn't happen would be worse than having no badge.


-- ── 1. Who is allowed to write the protected columns ──────────────
-- The paid columns are pinned by protect_profile_verified(), which
-- tests auth.role(). A SECURITY DEFINER function still carries the
-- caller's JWT, so auth.role() stays 'authenticated' inside it and the
-- trigger would block our own recompute. current_user, by contrast,
-- becomes the function's owner. That difference is the safe signal:
-- only a definer function we wrote can present it.
create or replace function public.is_privileged_writer()
returns boolean
language plpgsql
stable
security invoker
set search_path = public, pg_catalog, pg_temp
as $$
declare
  owner_name text;
begin
  -- The SQL editor (no JWT) and the webhooks (service_role) may write.
  if coalesce(auth.role(), 'sql') in ('sql', 'service_role') then
    return true;
  end if;
  -- Inside a SECURITY DEFINER function owned by the table's owner.
  select pg_get_userbyid(relowner) into owner_name
  from pg_class where oid = 'public.profiles'::regclass;
  return current_user = owner_name and current_user <> session_user;
exception when others then
  -- Fail CLOSED: if this can't be decided, the client is not privileged.
  return false;
end $$;

comment on function public.is_privileged_writer() is
  'True for the SQL editor, service_role, and our own SECURITY DEFINER functions. Fails closed.';


-- ── 2. Entitlement columns: which source granted Pro ──────────────
do $$
begin
  alter table public.profiles add column if not exists premium_source text;
  alter table public.profiles add column if not exists premium_ref text;

  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_premium_source_check' and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_premium_source_check
      check (premium_source is null or premium_source in ('play', 'apple', 'stripe', 'manual'));
  end if;
end $$;

-- One Play purchase token must never entitle two accounts.
create unique index if not exists profiles_premium_ref_key
  on public.profiles (premium_source, premium_ref)
  where premium_ref is not null;

comment on column public.profiles.premium_source is
  'Which system granted Pro: play | apple | stripe | manual. A webhook may only revoke its own source.';
comment on column public.profiles.premium_ref is
  'The Play purchase token (or Stripe subscription id) behind the current grant.';


-- ── 3. The protect trigger, taught about definer functions ────────
-- Same fail-closed shape as supabase-lockdown.sql, with one addition:
-- our recompute function can now write the badge columns. Clients still
-- cannot, because part 5 never grants them and this still pins them.
create or replace function public.protect_profile_verified()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if not public.is_privileged_writer() then
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
      new.premium_source := null;
      new.premium_ref := null;
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
      new.premium_source := old.premium_source;
      new.premium_ref := old.premium_ref;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists profiles_protect_verified on public.profiles;
create trigger profiles_protect_verified
  before insert or update on public.profiles
  for each row execute function public.protect_profile_verified();


-- ── 4. The badge rules, in one place ──────────────────────────────
-- Public, checkable facts only. Tunable here and nowhere else, so the
-- UI and the grant can never disagree about what "earned" means.
create table if not exists public.badge_rules (
  id              int primary key default 1,
  min_account_age_days int not null default 14,
  min_recipes     int not null default 3,
  min_followers   int not null default 10,
  constraint badge_rules_single_row check (id = 1)
);
insert into public.badge_rules (id) values (1) on conflict (id) do nothing;

-- Readable by everyone (the app shows the thresholds), writable by no
-- client — change them in the SQL editor.
grant select on public.badge_rules to anon, authenticated;
revoke insert, update, delete on public.badge_rules from anon, authenticated;
alter table public.badge_rules enable row level security;
drop policy if exists "Anyone may read the badge rules" on public.badge_rules;
create policy "Anyone may read the badge rules"
  on public.badge_rules for select using (true);

-- A manual override, for granting the badge to someone who plainly
-- deserves it, or withholding it from someone gaming the numbers.
-- NULL = follow the rules. true/false = force.
alter table public.profiles add column if not exists verified_override boolean;
alter table public.profiles add column if not exists verified_reason text;

comment on column public.profiles.verified_override is
  'NULL follows badge_rules; true force-grants; false force-denies. Service role / SQL editor only.';
comment on column public.profiles.verified_reason is
  'Why the badge is or is not held — shown to the owner in Settings.';


-- ── 5. Progress towards the badge ─────────────────────────────────
-- Returns the counts and the thresholds so the app can show a real
-- checklist instead of a paywall. SECURITY DEFINER because it reads
-- across tables, but it only ever answers for the CALLER — passing
-- somebody else's id would otherwise leak their follower counts.
create or replace function public.my_badge_progress()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  uid uuid := auth.uid();
  r   record;
  uname text;
  age_days int;
  recipes int;
  followers int;
  prof record;
begin
  if uid is null then
    return jsonb_build_object('signed_in', false);
  end if;

  select * into r from public.badge_rules where id = 1;
  select username, is_verified, verified_override, verified_reason, created_at
    into prof from public.profiles where id = uid;
  uname := prof.username;

  age_days := greatest(0, floor(extract(epoch from (now() - coalesce(prof.created_at, now()))) / 86400)::int);

  -- A "recipe" is a post with real ingredients, not a caption that
  -- happens to carry a title. Same test the recipe-link search uses.
  select count(*) into recipes
  from public.community_posts p
  where p.user_id = uid
    and p.recipe_title is not null
    and p.ingredients is not null
    and coalesce(array_length(p.ingredients, 1), 0) > 0;

  -- Follows are recorded against the username, not the user id.
  if uname is null then
    followers := 0;
  else
    select count(*) into followers
    from public.chef_follows f where f.chef_name = uname;
  end if;

  return jsonb_build_object(
    'signed_in', true,
    'verified', coalesce(prof.is_verified, false),
    'override', prof.verified_override,
    'reason', prof.verified_reason,
    'has_username', uname is not null,
    'account_age_days', age_days,
    'recipes', recipes,
    'followers', followers,
    'need_account_age_days', r.min_account_age_days,
    'need_recipes', r.min_recipes,
    'need_followers', r.min_followers,
    'earned', (uname is not null
               and age_days >= r.min_account_age_days
               and recipes   >= r.min_recipes
               and followers >= r.min_followers)
  );
end $$;

revoke all on function public.my_badge_progress() from public;
grant execute on function public.my_badge_progress() to authenticated;


-- ── 6. Granting and removing the badge ────────────────────────────
-- The only writer of is_verified. Idempotent, so triggers and a nightly
-- sweep can both call it freely.
create or replace function public.recompute_verified(target uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r record;
  prof record;
  uname text;
  age_days int;
  recipes int;
  followers int;
  earned boolean;
  final boolean;
  why text;
begin
  if target is null then return false; end if;
  select * into r from public.badge_rules where id = 1;
  select username, is_verified, verified_override, created_at
    into prof from public.profiles where id = target;
  if not found then return false; end if;

  uname := prof.username;
  age_days := greatest(0, floor(extract(epoch from (now() - coalesce(prof.created_at, now()))) / 86400)::int);

  select count(*) into recipes
  from public.community_posts p
  where p.user_id = target
    and p.recipe_title is not null
    and p.ingredients is not null
    and coalesce(array_length(p.ingredients, 1), 0) > 0;

  if uname is null then
    followers := 0;
  else
    select count(*) into followers
    from public.chef_follows f where f.chef_name = uname;
  end if;

  earned := uname is not null
        and age_days >= r.min_account_age_days
        and recipes   >= r.min_recipes
        and followers >= r.min_followers;

  final := coalesce(prof.verified_override, earned);

  if prof.verified_override is true then
    why := 'Granted by GieesK.';
  elsif prof.verified_override is false then
    why := 'Not eligible.';
  elsif final then
    why := format('Earned: %s recipes, %s followers, account %s days old.', recipes, followers, age_days);
  else
    why := format('Needs %s recipes (has %s), %s followers (has %s), %s days (has %s).',
                  r.min_recipes, recipes, r.min_followers, followers, r.min_account_age_days, age_days);
  end if;

  update public.profiles
     set is_verified = final,
         verification_status = case when final then 'earned' else 'none' end,
         -- Keep the first date it was earned; don't reset on every call.
         verified_since = case when final then coalesce(verified_since, now()) else null end,
         verified_reason = why
   where id = target
     and (is_verified is distinct from final or verified_reason is distinct from why);

  return final;
end $$;

revoke all on function public.recompute_verified(uuid) from public;
-- Deliberately NOT granted to authenticated: nobody asks for their own
-- badge. The triggers below call it, and they run as the definer.


-- ── 7. Recompute when the inputs change ───────────────────────────
create or replace function public.badge_touch_from_post()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.recompute_verified(coalesce(new.user_id, old.user_id));
  return null;
end $$;

drop trigger if exists community_posts_badge_touch on public.community_posts;
create trigger community_posts_badge_touch
  after insert or delete or update of recipe_title, ingredients on public.community_posts
  for each row execute function public.badge_touch_from_post();

create or replace function public.badge_touch_from_follow()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  owner_id uuid;
begin
  -- chef_follows records a username, so the followed account has to be
  -- looked up. An unmatched name is somebody who has since changed it.
  select id into owner_id from public.profiles
   where username = coalesce(new.chef_name, old.chef_name);
  if owner_id is not null then
    perform public.recompute_verified(owner_id);
  end if;
  return null;
end $$;

drop trigger if exists chef_follows_badge_touch on public.chef_follows;
create trigger chef_follows_badge_touch
  after insert or delete on public.chef_follows
  for each row execute function public.badge_touch_from_follow();

-- Account age crosses its threshold with no write to trigger on, so a
-- sweep is the only thing that can notice. Run it from Supabase →
-- Database → Cron (nightly is plenty), or by hand.
create or replace function public.recompute_all_verified()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  n int := 0;
  p record;
begin
  for p in select id from public.profiles loop
    perform public.recompute_verified(p.id);
    n := n + 1;
  end loop;
  return n;
end $$;

revoke all on function public.recompute_all_verified() from public;


-- ── 8. Retire the paid verification path ──────────────────────────
-- The columns stay — dropping them would throw away the history of who
-- paid — but nothing reads them for the badge any more. Anyone left
-- mid-purchase is moved onto the earned rules, and a note is left so
-- the old state is explicable if you ever look.
do $$
begin
  update public.profiles
     set verification_status = 'none',
         verification_note = coalesce(verification_note, '')
           || case when verification_status in ('awaiting_id', 'processing', 'failed')
                   then ' [Paid ID verification was retired on 2026-09-23; the badge is now earned.]'
                   else '' end
   where verification_status in ('awaiting_id', 'processing', 'failed');
end $$;

-- The status check constraint has to allow the new value.
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'profiles_verification_status_check' and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles drop constraint profiles_verification_status_check;
  end if;
  alter table public.profiles
    add constraint profiles_verification_status_check
    check (verification_status is null or verification_status in
           ('none', 'earned', 'awaiting_id', 'processing', 'failed', 'lapsed', 'verified'));
end $$;


-- ── 9. Play purchases, and not processing one twice ───────────────
-- Google's RTDN reference is explicit that a notification only says the
-- state changed, and that you must call the Developer API for the real
-- state. Pub/Sub also redelivers, so messageId is the dedupe key.
create table if not exists public.play_notifications (
  message_id   text primary key,
  received_at  timestamptz not null default now(),
  notification_type int,
  purchase_token text,
  handled      boolean not null default false,
  detail       jsonb
);
alter table public.play_notifications enable row level security;
-- No policy at all: RLS on with no policy means only service_role (which
-- bypasses RLS) can touch it. Exactly right for a webhook ledger.
revoke all on public.play_notifications from anon, authenticated;

create index if not exists play_notifications_token_idx
  on public.play_notifications (purchase_token);

-- A record of every token we have granted from, kept separately from
-- profiles so a refund can be traced even after entitlement is removed.
create table if not exists public.play_purchases (
  purchase_token text primary key,
  user_id        uuid not null references auth.users(id) on delete cascade,
  product_id     text,
  expiry_time    timestamptz,
  auto_renewing  boolean,
  state          text,
  acknowledged   boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
alter table public.play_purchases enable row level security;
revoke all on public.play_purchases from anon, authenticated;

create index if not exists play_purchases_user_idx on public.play_purchases (user_id);


-- ── 10. Applying a Play entitlement ───────────────────────────────
-- Called by the edge functions with service_role. Kept in SQL so the
-- grant/revoke rule lives next to the data rather than in two
-- TypeScript files that could drift apart.
create or replace function public.apply_play_entitlement(
  p_user_id uuid,
  p_token   text,
  p_product text,
  p_expiry  timestamptz,
  p_auto_renewing boolean,
  p_state   text,
  p_active  boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_src text;
  current_ref text;
begin
  if p_user_id is null or p_token is null then
    raise exception 'apply_play_entitlement needs a user and a token';
  end if;

  insert into public.play_purchases (purchase_token, user_id, product_id, expiry_time, auto_renewing, state)
  values (p_token, p_user_id, p_product, p_expiry, p_auto_renewing, p_state)
  on conflict (purchase_token) do update
    set product_id = excluded.product_id,
        expiry_time = excluded.expiry_time,
        auto_renewing = excluded.auto_renewing,
        state = excluded.state,
        updated_at = now();

  select premium_source, premium_ref into current_src, current_ref
  from public.profiles where id = p_user_id;

  if p_active then
    update public.profiles
       set is_premium = true,
           premium_until = p_expiry,
           premium_source = 'play',
           premium_ref = p_token
     where id = p_user_id;
    return jsonb_build_object('granted', true, 'until', p_expiry);
  end if;

  -- Revoking: only ever our own grant. Without this check, an expiry
  -- notification for an old Play token would strip Premium from someone
  -- who has since resubscribed through another source — or with a newer
  -- token.
  if current_src = 'play' and current_ref = p_token then
    update public.profiles
       set is_premium = false,
           premium_until = null,
           premium_source = null,
           premium_ref = null
     where id = p_user_id;
    return jsonb_build_object('revoked', true);
  end if;

  return jsonb_build_object('revoked', false, 'reason', 'a different grant is current');
end $$;

revoke all on function public.apply_play_entitlement(uuid, text, text, timestamptz, boolean, text, boolean) from public;


-- ── 11. What the client may write, restated ───────────────────────
-- supabase-lockdown.sql granted a column list; the new columns must not
-- join it. Restated here so running this file after the lockdown can't
-- silently widen what the app can write.
do $$
declare
  wanted text[] := array[
    'full_name', 'bio', 'country', 'favorite_cuisine', 'dietary_preferences',
    'avatar_url', 'username', 'profile_view_history', 'updated_at'
  ];
  present text;
begin
  select string_agg(quote_ident(column_name), ', ') into present
  from information_schema.columns
  where table_schema = 'public' and table_name = 'profiles'
    and column_name = any(wanted);

  if present is null then
    raise warning 'profiles has none of the expected editable columns; nothing granted';
    return;
  end if;

  revoke update on public.profiles from anon, authenticated;
  revoke insert on public.profiles from anon, authenticated;
  execute format('grant update (%s) on public.profiles to authenticated', present);
  execute format('grant insert (id, %s) on public.profiles to authenticated', present);
  raise notice 'profiles: authenticated may write only: id, %', present;
end $$;


-- ── 12. First run: settle everyone's badge ────────────────────────
select public.recompute_all_verified() as profiles_recomputed;

-- ── 13. What you should see ───────────────────────────────────────
-- The paid and badge columns must NOT appear in this list.
select string_agg(distinct column_name, ', ' order by column_name) as app_may_write
from information_schema.column_privileges
where table_schema = 'public' and table_name = 'profiles'
  and grantee = 'authenticated' and privilege_type = 'UPDATE';
