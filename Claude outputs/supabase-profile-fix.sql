-- ═══════════════════════════════════════════════════════════
--  GieesK — profile save fix
--  Run once in Supabase → SQL Editor. Safe to run more than once.
-- ═══════════════════════════════════════════════════════════
--
-- Why: supabase-setup.sql gave `profiles` a SELECT and an UPDATE policy
-- but no INSERT policy. The app saved profiles with upsert(), which
-- Postgres treats as an INSERT, so every save (including a username
-- change) was rejected by row-level security.
--
-- The app now uses a plain UPDATE, which works without this file. This
-- policy covers the one remaining case: an account whose profile row
-- was never created, where the app has to INSERT it.

drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

-- Optional check: accounts with no profile row (these are the ones the
-- insert policy above is for). Expect 0 if the signup trigger has always
-- existed.
-- select count(*) from auth.users u
-- left join public.profiles p on p.id = u.id
-- where p.id is null;
