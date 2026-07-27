-- Adds real article publish time so the News tab can show accurate recency
-- and rank "recent" stories correctly. Nullable — existing rows and any
-- future RSS item whose pubDate fails to parse simply have published_at = null
-- and fall back to created_at for sorting.
alter table newswire_items
  add column if not exists published_at timestamptz;

create index if not exists newswire_items_published_at_idx
  on newswire_items (published_at desc nulls last);

create index if not exists newswire_items_created_at_idx
  on newswire_items (created_at desc);
