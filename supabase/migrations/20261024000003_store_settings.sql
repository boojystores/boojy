-- Migration: 20261024000003_store_settings.sql
-- Description: Create store_settings table for serverless-safe configuration persistence (promotions, banners, announcements)

CREATE TABLE IF NOT EXISTS public.store_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Row Level Security
ALTER TABLE public.store_settings ENABLE ROW LEVEL SECURITY;

-- Public can read store settings (needed for storefront promo banner & ads)
CREATE POLICY "Store settings are publicly readable"
  ON public.store_settings FOR SELECT
  TO anon, authenticated
  USING (true);

-- Admins can update store settings
CREATE POLICY "Admins can manage store settings"
  ON public.store_settings FOR ALL
  TO anon, authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

GRANT SELECT ON public.store_settings TO anon, authenticated;
GRANT ALL ON public.store_settings TO service_role;
