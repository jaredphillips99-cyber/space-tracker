-- Adds heuristic classification fields so the News tab can filter out
-- generic/listicle content (content-mill "X stocks to buy" pieces) and
-- prioritize material news (earnings, contracts, regulatory, M&A, etc.)
-- in Lead Stories instead of ranking by market cap alone.
alter table newswire_items
  add column if not exists category text,
  add column if not exists is_generic boolean not null default false;

create index if not exists newswire_items_is_generic_idx
  on newswire_items (is_generic);
