-- P0 auth harden — analyses write tightening (HANDOFF)
--
-- Run in the Supabase SQL Editor. NOT applied by this PR.
-- Claude Code / agents must not auto-run Supabase migrations.
--
-- Current inferred posture (from app code, not a live dashboard dump):
--   analyses          — public SELECT (dashboard hydrate). Writes today go
--                       through the anon client upsert in useAnalysis.ts.
--                       Anyone holding the anon key could overwrite shared
--                       research if INSERT/UPDATE is granted to `anon`.
--   user_preferences  — RLS auth.uid() = user_id (migrations exist).
--   accounts          — existing RLS claimed to cover new columns.
--   retirement_profile — RLS auth.uid() = user_id.
--
-- This file only tightens `analyses` writes to authenticated users.
-- It does NOT encode ADMIN_EMAILS (Postgres cannot read Vercel env).
-- Operator-only Claude spend is enforced in /api/analyze, not SQL.
--
-- Review grants in the dashboard before running. If anon currently has
-- INSERT/UPDATE, this will block anonymous overwrites — which is the point —
-- and the browser upsert in useAnalysis.ts will start failing for
-- non-signed-in sessions (Run Analysis is already operator-gated).

ALTER TABLE public.analyses ENABLE ROW LEVEL SECURITY;

-- Public read: the dashboard hydrates analyses for every visitor.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'analyses' AND policyname = 'analyses_public_select'
  ) THEN
    CREATE POLICY analyses_public_select ON public.analyses
      FOR SELECT USING (true);
  END IF;
END $$;

-- Authenticated write. Operator allowlist remains an API concern.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'analyses' AND policyname = 'analyses_authenticated_insert'
  ) THEN
    CREATE POLICY analyses_authenticated_insert ON public.analyses
      FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'analyses' AND policyname = 'analyses_authenticated_update'
  ) THEN
    CREATE POLICY analyses_authenticated_update ON public.analyses
      FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

REVOKE INSERT, UPDATE, DELETE ON public.analyses FROM anon;
GRANT SELECT ON public.analyses TO anon, authenticated;
GRANT INSERT, UPDATE ON public.analyses TO authenticated;
