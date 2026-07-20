-- ─────────────────────────────────────────────────────────────────────────────
-- supabase_migration_dedupe_preferences_policies.sql
--
-- Purpose: user_preferences accumulated DUPLICATE RLS policies from being
-- migrated more than once — each of SELECT / UPDATE / INSERT exists twice
-- under two different names doing the identical auth.uid() = user_id check.
-- Harmless but redundant. This drops the older human-phrased pair, keeping
-- exactly one concise policy per action.
--
-- Confirmed harmless: writes and reads are NOT blocked by RLS today (verified
-- via direct Supabase inspection — a fresh row with real values persists
-- correctly). This is pure cleanup; it does not change effective access.
--
-- Idempotent: uses IF EXISTS / IF NOT EXISTS so it can be re-run safely.
-- Run manually in the Supabase SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

-- Ensure RLS is on (no-op if already enabled).
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

-- Drop the older, verbosely-named duplicates. Keep the short-named set below.
DROP POLICY IF EXISTS "Users can read their own preferences"   ON public.user_preferences;
DROP POLICY IF EXISTS "Users can update their own preferences" ON public.user_preferences;
DROP POLICY IF EXISTS "Users can upsert their own preferences" ON public.user_preferences;

-- Recreate the canonical single policy per action only if missing, so this
-- file is safe to run whether or not the short-named set already exists.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_preferences'
      AND policyname = 'select_own_preferences'
  ) THEN
    CREATE POLICY select_own_preferences ON public.user_preferences
      FOR SELECT USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_preferences'
      AND policyname = 'update_own_preferences'
  ) THEN
    CREATE POLICY update_own_preferences ON public.user_preferences
      FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_preferences'
      AND policyname = 'upsert_own_preferences'
  ) THEN
    CREATE POLICY upsert_own_preferences ON public.user_preferences
      FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- Verify the result — should show exactly one policy per action.
-- SELECT policyname, cmd FROM pg_policies
-- WHERE tablename = 'user_preferences' ORDER BY cmd, policyname;
