-- Migration: add thematic-conviction column to user_preferences
-- Run manually in the Supabase SQL Editor BEFORE deploying the Thematic
-- Framework feature. Idempotent — safe to re-run.
--
-- Stores ThemePreferences: a jsonb object of { <theme>: 'lean_in'|'neutral'|'avoid' }
-- for the four macro themes. Percentages/enums only — no dollar figures.
-- RLS is unchanged: the existing user_preferences SELECT/UPDATE/INSERT policies
-- (auth.uid() = user_id) already cover this new column.

ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS theme_preferences jsonb;

-- No default and nullable by design: a null column reads back as "no conviction
-- set yet", which the app treats as all-neutral. usePortfolioSync selects '*',
-- so a missing column degrades to null (not a crash) until this runs; the first
-- preferences write after this migration will populate it.
