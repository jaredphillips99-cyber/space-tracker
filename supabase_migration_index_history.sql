-- ─────────────────────────────────────────────────────────────────────────────
-- AI Index feature — index_history + index_constituents
--
-- Run manually in the Supabase SQL Editor BEFORE the first daily index cron
-- fires (the post-market leg of the Daily Newswire workflow). NOT run by
-- Claude Code. Idempotent — safe to re-run.
--
-- RLS posture mirrors newswire_items: public/anon SELECT (this data is public
-- market math, same privacy tier as prices/news), service_role writes.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── index_history: one row per (date, index_name) ──────────────────────────
create table if not exists public.index_history (
  date           date        not null,
  index_name     text        not null,   -- 'composite' | 'space' | 'ai_infrastructure' | 'defense' | 'clean_energy' | 'cyber'
  value          numeric     not null,    -- base-100 point value
  divisor        numeric     not null,    -- for audit/debug; not displayed
  day_change_pct numeric     not null,
  created_at     timestamptz not null default now(),
  primary key (date, index_name)
);

-- Fast range queries for the historical chart (WHERE index_name = ? ORDER BY date).
create index if not exists index_history_name_date_idx
  on public.index_history (index_name, date);

-- ── index_constituents: per-ticker contribution for the drill-down table ────
create table if not exists public.index_constituents (
  date             date        not null,
  index_name       text        not null,
  ticker           text        not null,
  weight_pct       numeric     not null,
  day_change_pct   numeric     not null,
  contribution_pct numeric     not null,  -- pp contribution to index day_change_pct
  created_at       timestamptz not null default now(),
  primary key (date, index_name, ticker)
);

create index if not exists index_constituents_name_date_idx
  on public.index_constituents (index_name, date);

-- ── Row-level security ──────────────────────────────────────────────────────
alter table public.index_history      enable row level security;
alter table public.index_constituents enable row level security;

-- Public read (anon + authenticated). Drop-then-create for idempotency —
-- Postgres CREATE POLICY has no IF NOT EXISTS.
drop policy if exists "index_history public read"      on public.index_history;
drop policy if exists "index_constituents public read" on public.index_constituents;
create policy "index_history public read"
  on public.index_history      for select using (true);
create policy "index_constituents public read"
  on public.index_constituents for select using (true);

-- service_role bypasses RLS by default; these are explicit belt-and-suspenders
-- write policies matching the newswire_items convention.
drop policy if exists "index_history service write"      on public.index_history;
drop policy if exists "index_constituents service write" on public.index_constituents;
create policy "index_history service write"
  on public.index_history      for all to service_role using (true) with check (true);
create policy "index_constituents service write"
  on public.index_constituents for all to service_role using (true) with check (true);
