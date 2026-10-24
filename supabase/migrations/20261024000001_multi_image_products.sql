-- Multi-image products enhancement
-- Supports multiple pictures for products on storefront and admin
-- image_url stores primary cover image; images text[] stores full gallery list

alter table public.products add column if not exists images text[] default '{}';

-- Backfill existing products so images array contains [image_url]
update public.products
set images = array[image_url]
where image_url is not null and (images is null or cardinality(images) = 0);
