-- Migration: 20261026000000_pickup_stores_and_custom_delivery_zones.sql
-- Description: Adds pickup_locations table for physical store collection and enhances delivery_zones with direct base price

-- 1. Pickup Locations / Stores Table
CREATE TABLE IF NOT EXISTS public.pickup_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  address text NOT NULL,
  landmark text DEFAULT NULL,
  city text NOT NULL,
  state_id uuid REFERENCES public.states(id) ON DELETE SET NULL,
  phone text DEFAULT NULL,
  email text DEFAULT NULL,
  operating_hours text DEFAULT 'Mon–Sat 9:00 AM – 7:00 PM',
  instructions text DEFAULT 'Ready for collection within 24 hours of payment. Please present your Order ID.',
  is_active boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pickup_locations_is_active_idx ON public.pickup_locations(is_active);
CREATE INDEX IF NOT EXISTS pickup_locations_display_order_idx ON public.pickup_locations(display_order);

-- RLS for pickup_locations
ALTER TABLE public.pickup_locations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view active pickup locations" ON public.pickup_locations;
CREATE POLICY "Public can view active pickup locations"
  ON public.pickup_locations
  FOR SELECT
  USING (is_active = true);

DROP POLICY IF EXISTS "Authenticated users full access to pickup locations" ON public.pickup_locations;
CREATE POLICY "Authenticated users full access to pickup locations"
  ON public.pickup_locations
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Seed initial Boojy Flagship Store in Victoria Island, Lagos
INSERT INTO public.pickup_locations (
  id,
  name,
  address,
  landmark,
  city,
  state_id,
  phone,
  operating_hours,
  instructions,
  is_active,
  display_order
) VALUES (
  '00000000-0000-0005-0000-000000000001',
  'Boojy Flagship Store',
  'Plot 14, Adeola Odeku Street',
  'Opposite Standard Chartered Bank',
  'Victoria Island',
  '00000000-0000-0001-0000-000000000025', -- Lagos state
  '0800-BOOJY-SHOP',
  'Mon–Sat 9:00 AM – 7:00 PM',
  'Ready for collection within 24 hours of payment. Please bring your Order ID.',
  true,
  0
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  address = EXCLUDED.address,
  city = EXCLUDED.city,
  landmark = EXCLUDED.landmark,
  phone = EXCLUDED.phone;

-- 2. Enhance delivery_zones with direct base_price_kobo and estimated_days
ALTER TABLE public.delivery_zones ADD COLUMN IF NOT EXISTS base_price_kobo bigint DEFAULT NULL;
ALTER TABLE public.delivery_zones ADD COLUMN IF NOT EXISTS estimated_days text DEFAULT '1-2 business days';

-- Update existing Lagos built-in zones with default ₦2,000 (200000 kobo)
UPDATE public.delivery_zones
SET base_price_kobo = 200000, estimated_days = '1-2 business days'
WHERE base_price_kobo IS NULL;

-- 3. Link initial delivery zones to their specific LGAs
UPDATE public.delivery_zones
SET lga_id = '00000000-0000-0002-0025-000000000008' -- Eti-Osa (VI, Lekki 1, Ikoyi)
WHERE id IN (
  '00000000-0000-0003-0025-000000000001',
  '00000000-0000-0003-0025-000000000002',
  '00000000-0000-0003-0025-000000000003'
);

UPDATE public.delivery_zones
SET lga_id = '00000000-0000-0002-0025-000000000011' -- Ikeja (Ikeja GRA)
WHERE id = '00000000-0000-0003-0025-000000000004';

UPDATE public.delivery_zones
SET lga_id = '00000000-0000-0002-0015-000000000006' -- Municipal Area Council (Abuja Central / Maitama)
WHERE id = '00000000-0000-0003-0015-000000000001';

UPDATE public.delivery_zones
SET lga_id = '00000000-0000-0002-0017-000000000026' -- Owerri Municipal (Owerri Urban / Ikenegbu)
WHERE id = '00000000-0000-0003-0017-000000000001';
