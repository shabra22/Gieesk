-- ═══════════════════════════════════════════════════════════════
--  GieesK — Verified badge (paid, identity-checked)
--  Run once in Supabase → SQL Editor → New query → paste → Run.
--  Safe to run more than once. Run supabase-discover-feed.sql first.
-- ═══════════════════════════════════════════════════════════════
--
-- How it works:
--   1. The person subscribes to GieesK Verified (yearly) on
--      gieesk.com/verify.html — Stripe Checkout.
--   2. They then pass a Stripe Identity check (ID document + selfie).
--      Stripe collects and keeps the documents; we never see or store
--      them. We only ever record "verified", when, and the session id.
--   3. The badge shows next to their name. It goes away if the
--      subscription is cancelled or goes unpaid.
--
-- Everything below is written ONLY by the stripe-webhook edge function
-- (service role). The app can't set any of it, not even on its own row:
-- the trigger at the end puts every field back if it tries.


-- ── 1. Columns ────────────────────────────────────────────────────
alter table public.profiles
  add column if not exists is_verified boolean not null default false,
  -- none | awaiting_id | processing | verified | failed | lapsed
  add column if not exists verification_status text not null default 'none',
  add column if not exists verified_since timestamptz,
  add column if not exists verification_paid_until timestamptz,
  -- Why a check failed, in Stripe's own words, so the person can fix it.
  add column if not exists verification_note text,
  add column if not exists verification_session_id text,
  add column if not exists stripe_customer_id text;

-- Gieesk Pro fields, in case this database predates them. The same
-- webhook keeps these up to date.
alter table public.profiles
  add column if not exists is_premium boolean not null default false,
  add column if not exists premium_until timestamptz;

alter table public.profiles drop constraint if exists profiles_verification_status_check;
alter table public.profiles add constraint profiles_verification_status_check
  check (verification_status in ('none', 'awaiting_id', 'processing', 'verified', 'failed', 'lapsed'));

create index if not exists profiles_stripe_customer_idx on public.profiles (stripe_customer_id);


-- ── 2. Only the webhook can change any of this ────────────────────
-- Requests from the app arrive as role anon/authenticated. The service
-- role (edge functions) and this SQL editor are not restricted, so you
-- can still grant or remove a badge by hand:
--   update profiles set is_verified = true, verification_status = 'verified',
--          verified_since = now() where username = 'brian_cooks';
create or replace function public.protect_profile_verified()
returns trigger
language plpgsql
as $$
begin
  if coalesce(auth.role(), '') in ('anon', 'authenticated') then
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


-- ── 3. A record of what Stripe told us ────────────────────────────
-- Only the webhook writes here, and nobody can read it from the app.
-- It's for you: what happened, when, for which account. No documents,
-- no ID numbers, no names from the ID — just the outcome.
create table if not exists public.verification_events (
  id          bigserial primary key,
  user_id     uuid references auth.users(id) on delete set null,
  event       text not null,
  detail      text,
  stripe_id   text,
  created_at  timestamptz not null default now()
);
create index if not exists verification_events_user_idx on public.verification_events (user_id, created_at desc);

alter table public.verification_events enable row level security;
revoke all on public.verification_events from anon, authenticated;


-- ── 4. Is this person's badge still paid for? ─────────────────────
-- Used by the app to show "renews on…" and by you for a quick check.
-- Returns your own row only.
create or replace function public.get_my_verification()
returns table (
  is_verified boolean,
  verification_status text,
  verified_since timestamptz,
  paid_until timestamptz,
  note text
)
language sql
stable
security definer
set search_path = public
as $$
  select p.is_verified, p.verification_status, p.verified_since,
         p.verification_paid_until, p.verification_note
  from profiles p
  where p.id = auth.uid();
$$;
revoke all on function public.get_my_verification() from public, anon;
grant execute on function public.get_my_verification() to authenticated;
