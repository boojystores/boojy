-- Migration: 20261026000001_security_hardening.sql
-- Description: Hardens Row Level Security (RLS) on orders, order_items, customers, and rates.
-- Protects PII from anonymous table enumeration while preserving guest checkout and order tracking.

-- ----------------------------------------------------------------------------
-- 1. Enable RLS on core e-commerce tables
-- ----------------------------------------------------------------------------
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

-- Defensive column alignment for products
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- ----------------------------------------------------------------------------
-- 2. Revoke direct anonymous data mutations and enumeration
-- Enforces that all customer checkouts flow strictly through place_order(),
-- tracking flows strictly through track_order(order_number, email),
-- and status confirmation flows through getOrderPaymentStatus server action.
-- ----------------------------------------------------------------------------
REVOKE ALL ON public.orders FROM anon;
REVOKE ALL ON public.order_items FROM anon;
REVOKE ALL ON public.customers FROM anon;

-- ----------------------------------------------------------------------------
-- 3. Hardened RLS Policies for orders
-- Direct table SELECT is strictly restricted to authenticated admins & service role.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Anon can track orders via realtime" ON public.orders;
DROP POLICY IF EXISTS "Guests can create orders" ON public.orders;
DROP POLICY IF EXISTS "Public can view own orders" ON public.orders;
DROP POLICY IF EXISTS "Admins have full access on orders" ON public.orders;
DROP POLICY IF EXISTS "Service role has full access on orders" ON public.orders;
DROP POLICY IF EXISTS "Anon can view order by id" ON public.orders;

-- Service role (server actions & webhooks) has full access
CREATE POLICY "Service role has full access on orders"
  ON public.orders FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Authenticated Admins have full access
CREATE POLICY "Admins have full access on orders"
  ON public.orders FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ----------------------------------------------------------------------------
-- 4. Hardened RLS Policies for customers (PII protection)
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Guests can create customers" ON public.customers;
DROP POLICY IF EXISTS "Admins can manage customers" ON public.customers;
DROP POLICY IF EXISTS "Public can view customers" ON public.customers;
DROP POLICY IF EXISTS "Service role has full access on customers" ON public.customers;
DROP POLICY IF EXISTS "Admins have full access on customers" ON public.customers;

CREATE POLICY "Service role has full access on customers"
  ON public.customers FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Admins have full access on customers"
  ON public.customers FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ----------------------------------------------------------------------------
-- 5. Hardened RLS Policies for order_items
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Guests can create order items" ON public.order_items;
DROP POLICY IF EXISTS "Admins can manage order items" ON public.order_items;
DROP POLICY IF EXISTS "Public can view order items" ON public.order_items;
DROP POLICY IF EXISTS "Anon can view order items for their order" ON public.order_items;
DROP POLICY IF EXISTS "Service role has full access on order_items" ON public.order_items;
DROP POLICY IF EXISTS "Admins have full access on order_items" ON public.order_items;

CREATE POLICY "Service role has full access on order_items"
  ON public.order_items FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Admins have full access on order_items"
  ON public.order_items FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ----------------------------------------------------------------------------
-- 6. Hardened RLS Policies for products & categories
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Catalog products are publicly readable" ON public.products;
DROP POLICY IF EXISTS "Admins can manage products" ON public.products;
DROP POLICY IF EXISTS "Public can view active products" ON public.products;
DROP POLICY IF EXISTS "Service role has full access on products" ON public.products;

CREATE POLICY "Public can view active products"
  ON public.products FOR SELECT
  TO anon, authenticated
  USING (status = 'active' OR (auth.role() = 'authenticated' AND public.is_admin()));

CREATE POLICY "Admins can manage products"
  ON public.products FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Service role has full access on products"
  ON public.products FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ----------------------------------------------------------------------------
-- 7. Grant execute permissions on public RPC functions
-- Drop obsolete 7-argument place_order signature to eliminate function ambiguity
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.place_order(text, text, text, text, text, jsonb, text);

GRANT EXECUTE ON FUNCTION public.place_order(
  text, text, text, text, text, jsonb, text, text, bigint, uuid, uuid, uuid, text, text, text, text, text, text
) TO anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.track_order(text, text) TO anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.calculate_shipping_rate(text, uuid, uuid, uuid) TO anon, authenticated, service_role;

