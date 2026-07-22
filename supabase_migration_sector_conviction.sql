-- Migration: add non-theme sector conviction column to user_preferences
-- Run manually in the Supabase SQL Editor BEFORE deploying the sector-conviction
-- feature. Idempotent — safe to re-run. Mirrors the theme_preferences migration.
--
-- Stores SectorConviction: a jsonb object of { <gics_sector>: 'lean_in'|'neutral'|'avoid' }
-- for the 8 GICS sectors outside the four curated themes. Percentages/enums only —
-- no dollar figures. Existing user_preferences RLS policies (auth.uid() = user_id)
-- already cover this new column.

ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS sector_conviction jsonb;

-- Nullable by design: a null column reads back as "no conviction set yet", which
-- the app merges over an all-neutral default. usePortfolioSync selects '*', so a
-- missing column degrades to null (not a crash) until this runs; the first
-- preferences write after this migration populates it.
