-- Crypto live-pricing columns on public.accounts.
-- A crypto account switches from a manual dollar balance to live pricing
-- (quantity × Yahoo Finance price) once BOTH of these are set. Nullable so
-- existing manual-balance crypto rows keep working unchanged.
--
-- Idempotent + additive. Existing RLS on public.accounts already covers these
-- columns (row-level, not column-level). useNetWorthSync selects '*', so until
-- this runs a missing column degrades to null (manual-balance behavior) rather
-- than crashing — but INSERT/UPDATE that reference these columns WILL fail with
-- an unknown-column error, so this must be applied before the code ships.

ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS crypto_symbol text,
  ADD COLUMN IF NOT EXISTS crypto_quantity numeric;
