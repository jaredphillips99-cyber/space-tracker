-- Retirement tab — one row per user, mirrors user_financial_profile's shape + RLS.
-- Idempotent, additive, nullable. MUST be applied in the Supabase SQL Editor
-- before the Retirement tab ships, or read/write fails on the missing table.
-- Claude Code does NOT run this — hand-off only (same posture as every other
-- migration in this project).

create table if not exists public.retirement_profile (
  user_id                    uuid primary key references auth.users(id),
  employment_type            text,   -- 'private' | 'state_government' | 'municipal_government' | 'federal_government' | 'self_employed' | 'other'
  state                      text,   -- 2-letter US state code
  annual_salary              numeric,
  primary_plan_type          text,   -- '401k' | '403b' | '457b' | 'pension_plus_457b' | 'none'
  primary_contribution_pct   numeric,
  employer_match_pct         numeric,   -- e.g. 100 = matches 100%...
  employer_match_up_to_pct   numeric,   -- ...up to this % of salary
  has_pension                boolean,
  birth_year                 integer,
  other_retirement_accounts  jsonb,   -- [{label, kind, balance, monthlyContribution}]
  other_investment_goals     jsonb,   -- [{label, monthlyAmount, accountType}]
  updated_at                 timestamptz default now()
);

alter table public.retirement_profile enable row level security;

create policy "own retirement profile" on public.retirement_profile
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
