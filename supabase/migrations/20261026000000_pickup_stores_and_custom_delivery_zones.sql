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

-- 2. Enhance delivery_zones with direct base_price_kobo and estimated_days
ALTER TABLE public.delivery_zones ADD COLUMN IF NOT EXISTS base_price_kobo bigint DEFAULT NULL;
ALTER TABLE public.delivery_zones ADD COLUMN IF NOT EXISTS estimated_days text DEFAULT '1-2 business days';
