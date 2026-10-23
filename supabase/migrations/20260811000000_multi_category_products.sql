-- Multi-category products enhancement
-- Allows products to be assigned to multiple categories.
-- Keeps category_id for backwards compatibility, and adds category_ids uuid[] default '{}'.

alter table public.products add column if not exists category_ids uuid[] default '{}';

-- Backfill existing products so category_ids contains [category_id]
update public.products
set category_ids = array[category_id]
where category_id is not null and (category_ids is null or cardinality(category_ids) = 0);

-- GIN index for fast multi-category containment queries
create index if not exists idx_products_category_ids on public.products using gin (category_ids);
