-- Migration: 20261026000001_remove_hardcoded_owerri_urban_zone.sql
-- Description: Removes hardcoded initial mock data (Owerri Urban zone and mock store pickup entries)

DELETE FROM public.shipping_rates 
WHERE delivery_zone_id = '00000000-0000-0003-0017-000000000001';

DELETE FROM public.delivery_zones 
WHERE id = '00000000-0000-0003-0017-000000000001' 
   OR name ILIKE 'Owerri Urban%';

-- Remove mock pickup store if seeded
DELETE FROM public.pickup_locations
WHERE id = '00000000-0000-0005-0000-000000000001'
   OR name ILIKE 'Boojy Flagship Store%';
