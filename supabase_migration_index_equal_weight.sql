-- ─────────────────────────────────────────────────────────────────────────────
-- AI Index — equal-weight rewrite (July 31 2026)
--
-- Run manually in the Supabase SQL Editor BEFORE running the rewritten
-- scripts/indexBackfill.mjs or the next scheduled scripts/indexCalc.mjs cron.
-- NOT run by Claude Code. Idempotent — safe to re-run.
--
-- Adds the two columns the new equal-weight, buy-and-hold math persists per
-- ticker per index: base_price (the ticker's fixed reference price, set once
-- on its first eligible date and never changed) and base_allocation (its
-- fixed initial index-point slice, likewise set once). These replace the old
-- shared `divisor` concept — `index_history.divisor` is kept as a column
-- (no schema change there) but is now repurposed as a diagnostic
-- (sum of base_allocations for that index/date) rather than being dropped.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.index_constituents
  add column if not exists base_price numeric,
  add column if not exists base_allocation numeric;

-- No backfill of existing rows here — the rewritten scripts/indexBackfill.mjs
-- fully re-derives and overwrites all history/constituent rows from scratch
-- (upsert on the existing primary keys), so old rows' base_price/
-- base_allocation being null until that re-run is expected and harmless.
