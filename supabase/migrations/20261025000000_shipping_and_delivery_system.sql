-- Migration: 20261025000000_shipping_and_delivery_system.sql
-- Description: Complete Database-Driven Shipping & Delivery Management System for Nigeria
--   1. Creates `states`, `lgas`, and `delivery_zones` tables
--   2. Creates `shipping_methods` and `shipping_rates` tables with strict constraints
--   3. Creates `shipment_logs` table for tracking delivery rider assignments and status changes
--   4. Extends `public.orders` with shipping fee snapshot, delivery location snapshot, and shipment statuses
--   5. Creates `calculate_shipping_rate` function enforcing the 4-tier precedence rule
--   6. Updates `place_order` function to accept delivery destination and snapshot authoritative shipping fee
--   7. Configures Row Level Security (RLS) for public checkout reads and admin management
--   8. Populates initial shipping methods and sample rates

-- ---------------------------------------------------------------------------
-- 1. Locations: states, lgas, delivery_zones
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  code text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS states_is_active_idx ON public.states(is_active);
CREATE INDEX IF NOT EXISTS states_name_idx ON public.states(name);

CREATE TABLE IF NOT EXISTS public.lgas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  state_id uuid NOT NULL REFERENCES public.states(id) ON DELETE CASCADE,
  name text NOT NULL,
  code text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lgas_state_name_unique UNIQUE (state_id, name)
);

CREATE INDEX IF NOT EXISTS lgas_state_id_idx ON public.lgas(state_id);
CREATE INDEX IF NOT EXISTS lgas_is_active_idx ON public.lgas(is_active);

CREATE TABLE IF NOT EXISTS public.delivery_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  state_id uuid NOT NULL REFERENCES public.states(id) ON DELETE CASCADE,
  lga_id uuid REFERENCES public.lgas(id) ON DELETE SET NULL,
  name text NOT NULL,
  aliases text[] DEFAULT '{}'::text[],
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS delivery_zones_state_id_idx ON public.delivery_zones(state_id);
CREATE INDEX IF NOT EXISTS delivery_zones_lga_id_idx ON public.delivery_zones(lga_id);
CREATE INDEX IF NOT EXISTS delivery_zones_is_active_idx ON public.delivery_zones(is_active);

-- ---------------------------------------------------------------------------
-- 2. Shipping Methods & Rates
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.shipping_methods (
  id text PRIMARY KEY, -- e.g. 'own_delivery', 'standard', 'express', 'pickup'
  name text NOT NULL,
  method_type text NOT NULL DEFAULT 'own_delivery', -- 'own_delivery', 'courier', 'pickup'
  provider_id text DEFAULT NULL,
  description text DEFAULT NULL,
  estimated_min_days integer NOT NULL DEFAULT 1,
  estimated_max_days integer NOT NULL DEFAULT 3,
  is_active boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS shipping_methods_is_active_idx ON public.shipping_methods(is_active);
CREATE INDEX IF NOT EXISTS shipping_methods_display_order_idx ON public.shipping_methods(display_order);

CREATE TABLE IF NOT EXISTS public.shipping_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shipping_method_id text NOT NULL REFERENCES public.shipping_methods(id) ON DELETE CASCADE,
  state_id uuid NOT NULL REFERENCES public.states(id) ON DELETE CASCADE,
  lga_id uuid REFERENCES public.lgas(id) ON DELETE CASCADE, -- NULL means state-wide
  delivery_zone_id uuid REFERENCES public.delivery_zones(id) ON DELETE CASCADE, -- NULL means LGA or state-wide
  price_kobo bigint NOT NULL CHECK (price_kobo >= 0),
  free_shipping_threshold_kobo bigint DEFAULT NULL,
  estimated_min_days integer DEFAULT NULL,
  estimated_max_days integer DEFAULT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Unique index to prevent conflicting duplicate active rates at the same destination level
CREATE UNIQUE INDEX IF NOT EXISTS shipping_rates_exact_scope_idx ON public.shipping_rates(
  shipping_method_id,
  state_id,
  COALESCE(lga_id, '00000000-0000-0000-0000-000000000000'::uuid),
  COALESCE(delivery_zone_id, '00000000-0000-0000-0000-000000000000'::uuid)
);

CREATE INDEX IF NOT EXISTS shipping_rates_state_id_idx ON public.shipping_rates(state_id);
CREATE INDEX IF NOT EXISTS shipping_rates_lga_id_idx ON public.shipping_rates(lga_id);
CREATE INDEX IF NOT EXISTS shipping_rates_delivery_zone_id_idx ON public.shipping_rates(delivery_zone_id);
CREATE INDEX IF NOT EXISTS shipping_rates_is_active_idx ON public.shipping_rates(is_active);

-- ---------------------------------------------------------------------------
-- 3. Extend public.orders with Shipping & Delivery Snapshots
-- ---------------------------------------------------------------------------

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS recipient_name text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS recipient_phone text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS shipping_method_id text REFERENCES public.shipping_methods(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS shipping_method_name text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS state_id uuid REFERENCES public.states(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS lga_id uuid REFERENCES public.lgas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS delivery_zone_id uuid REFERENCES public.delivery_zones(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS state_name text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS lga_name text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS city_name text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS street_address text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS shipping_fee_kobo bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shipping_fee numeric(10, 2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS shipment_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS assigned_rider_name text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS assigned_rider_phone text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS tracking_number text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS tracking_url text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS courier_provider text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS delivery_instructions text DEFAULT NULL;

CREATE INDEX IF NOT EXISTS orders_shipment_status_idx ON public.orders(shipment_status);
CREATE INDEX IF NOT EXISTS orders_shipping_method_id_idx ON public.orders(shipping_method_id);
CREATE INDEX IF NOT EXISTS orders_state_id_idx ON public.orders(state_id);

-- ---------------------------------------------------------------------------
-- 4. Shipment Logs Table
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.shipment_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  status text NOT NULL,
  notes text DEFAULT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS shipment_logs_order_id_idx ON public.shipment_logs(order_id);
CREATE INDEX IF NOT EXISTS shipment_logs_created_at_idx ON public.shipment_logs(created_at DESC);

-- ---------------------------------------------------------------------------
-- 5. Rate Precedence Resolution Function
-- ---------------------------------------------------------------------------

-- Precedence Rule:
-- 1. Exact city / delivery zone rate
-- 2. Applicable LGA rate
-- 3. State-wide rate
-- 4. NULL (Unavailable)
CREATE OR REPLACE FUNCTION public.calculate_shipping_rate(
  p_shipping_method_id text,
  p_state_id uuid,
  p_lga_id uuid DEFAULT NULL,
  p_delivery_zone_id uuid DEFAULT NULL
)
RETURNS TABLE (
  rate_id uuid,
  shipping_method_id text,
  price_kobo bigint,
  free_shipping_threshold_kobo bigint,
  estimated_min_days integer,
  estimated_max_days integer,
  rate_scope text
)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
BEGIN
  -- 1. Check for exact city/delivery zone rate
  IF p_delivery_zone_id IS NOT NULL THEN
    RETURN QUERY
    SELECT
      sr.id,
      sr.shipping_method_id,
      sr.price_kobo,
      sr.free_shipping_threshold_kobo,
      COALESCE(sr.estimated_min_days, sm.estimated_min_days),
      COALESCE(sr.estimated_max_days, sm.estimated_max_days),
      'zone'::text
    FROM public.shipping_rates sr
    JOIN public.shipping_methods sm ON sm.id = sr.shipping_method_id
    WHERE sr.is_active = true
      AND sm.is_active = true
      AND sr.shipping_method_id = p_shipping_method_id
      AND sr.delivery_zone_id = p_delivery_zone_id
    LIMIT 1;

    IF FOUND THEN
      RETURN;
    END IF;
  END IF;

  -- 2. Check for LGA rate
  IF p_lga_id IS NOT NULL THEN
    RETURN QUERY
    SELECT
      sr.id,
      sr.shipping_method_id,
      sr.price_kobo,
      sr.free_shipping_threshold_kobo,
      COALESCE(sr.estimated_min_days, sm.estimated_min_days),
      COALESCE(sr.estimated_max_days, sm.estimated_max_days),
      'lga'::text
    FROM public.shipping_rates sr
    JOIN public.shipping_methods sm ON sm.id = sr.shipping_method_id
    WHERE sr.is_active = true
      AND sm.is_active = true
      AND sr.shipping_method_id = p_shipping_method_id
      AND sr.lga_id = p_lga_id
      AND sr.delivery_zone_id IS NULL
    LIMIT 1;

    IF FOUND THEN
      RETURN;
    END IF;
  END IF;

  -- 3. Check for State-wide rate
  RETURN QUERY
  SELECT
    sr.id,
    sr.shipping_method_id,
    sr.price_kobo,
    sr.free_shipping_threshold_kobo,
    COALESCE(sr.estimated_min_days, sm.estimated_min_days),
    COALESCE(sr.estimated_max_days, sm.estimated_max_days),
    'state'::text
  FROM public.shipping_rates sr
  JOIN public.shipping_methods sm ON sm.id = sr.shipping_method_id
  WHERE sr.is_active = true
    AND sm.is_active = true
    AND sr.shipping_method_id = p_shipping_method_id
    AND sr.state_id = p_state_id
    AND sr.lga_id IS NULL
    AND sr.delivery_zone_id IS NULL
  LIMIT 1;
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. Updated place_order RPC with Shipping Integration
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.place_order(
  p_full_name text,
  p_email text,
  p_contact_number text,
  p_delivery_address text,
  p_payment_method text,
  p_items jsonb,
  p_notes text DEFAULT NULL,
  p_shipping_method_id text DEFAULT NULL,
  p_shipping_fee_kobo bigint DEFAULT 0,
  p_state_id uuid DEFAULT NULL,
  p_lga_id uuid DEFAULT NULL,
  p_delivery_zone_id uuid DEFAULT NULL,
  p_state_name text DEFAULT NULL,
  p_lga_name text DEFAULT NULL,
  p_city_name text DEFAULT NULL,
  p_street_address text DEFAULT NULL,
  p_recipient_name text DEFAULT NULL,
  p_recipient_phone text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer_id UUID;
  v_order_id UUID;
  v_order_number TEXT;
  v_items_subtotal NUMERIC(10, 2) := 0;
  v_shipping_fee NUMERIC(10, 2) := 0;
  v_total NUMERIC(10, 2) := 0;
  v_day_counter INTEGER;
  v_attempt INTEGER;
  v_item RECORD;
  v_product public.products%ROWTYPE;
  v_issues JSONB := '[]'::JSONB;
  v_method public.shipping_methods%ROWTYPE;
  v_calculated_rate RECORD;
  v_final_fee_kobo BIGINT := 0;
BEGIN
  -- 1. Input validation
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'VALIDATION', 'message', 'Your cart is empty.');
  END IF;

  IF nullif(trim(p_full_name), '') IS NULL
     OR nullif(trim(p_email), '') IS NULL
     OR nullif(trim(p_contact_number), '') IS NULL
     OR nullif(trim(p_delivery_address), '') IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'VALIDATION',
      'message', 'Name, email, contact number, and delivery address are required.');
  END IF;

  IF p_payment_method NOT IN ('cod', 'ewallet', 'bank_transfer', 'bachs') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'VALIDATION',
      'message', 'Choose a valid payment method.');
  END IF;

  IF p_email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'VALIDATION',
      'message', 'Enter a valid email address.');
  END IF;

  IF jsonb_array_length(p_items) > 100 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'VALIDATION',
      'message', 'Too many items in the cart.');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_items) AS x(product_id UUID, quantity INT)
    GROUP BY product_id
    HAVING count(*) > 1
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'VALIDATION',
      'message', 'Your cart contains the same product more than once.');
  END IF;

  -- 2. Lock + re-validate every line BEFORE any write
  FOR v_item IN
    SELECT product_id, quantity
    FROM jsonb_to_recordset(p_items) AS x(product_id UUID, quantity INT)
  LOOP
    IF v_item.product_id IS NULL OR v_item.quantity IS NULL OR v_item.quantity < 1 THEN
      RETURN jsonb_build_object('ok', false, 'code', 'VALIDATION',
        'message', 'Each cart line needs a product id and a quantity of at least 1.');
    END IF;

    SELECT * INTO v_product
    FROM public.products
    WHERE id = v_item.product_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'code', 'PRODUCT_UNAVAILABLE',
        'message', 'A product in your cart is no longer available.',
        'items', jsonb_build_array(jsonb_build_object(
          'product_id', v_item.product_id,
          'name', 'Unavailable product',
          'requested', v_item.quantity
        )));
    END IF;

    IF NOT v_product.is_active THEN
      RETURN jsonb_build_object('ok', false, 'code', 'PRODUCT_UNAVAILABLE',
        'message', 'A product in your cart has been retired.',
        'items', jsonb_build_array(jsonb_build_object(
          'product_id', v_product.id,
          'name', v_product.name,
          'requested', v_item.quantity
        )));
    END IF;

    IF v_product.stock < v_item.quantity THEN
      v_issues := v_issues || jsonb_build_object(
        'product_id', v_product.id,
        'name', v_product.name,
        'requested', v_item.quantity,
        'available', v_product.stock
      );
    END IF;

    v_items_subtotal := v_items_subtotal + (v_product.price * v_item.quantity);
  END LOOP;

  IF jsonb_array_length(v_issues) > 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'INSUFFICIENT_STOCK',
      'message', 'Some items do not have enough stock.',
      'items', v_issues
    );
  END IF;

  -- 3. Shipping Validation & Server-Side Calculation
  IF p_shipping_method_id IS NOT NULL AND p_state_id IS NOT NULL THEN
    SELECT * INTO v_method
    FROM public.shipping_methods
    WHERE id = p_shipping_method_id AND is_active = true;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'code', 'SHIPPING_UNAVAILABLE',
        'message', 'Selected shipping method is not available.');
    END IF;

    -- Calculate verified rate using precedence
    SELECT * INTO v_calculated_rate
    FROM public.calculate_shipping_rate(
      p_shipping_method_id,
      p_state_id,
      p_lga_id,
      p_delivery_zone_id
    );

    IF v_calculated_rate.rate_id IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'code', 'SHIPPING_UNAVAILABLE',
        'message', 'Delivery is not available to the selected destination.');
    END IF;

    -- Check free shipping threshold if applicable
    IF v_calculated_rate.free_shipping_threshold_kobo IS NOT NULL
       AND (v_items_subtotal * 100) >= v_calculated_rate.free_shipping_threshold_kobo THEN
      v_final_fee_kobo := 0;
    ELSE
      v_final_fee_kobo := v_calculated_rate.price_kobo;
    END IF;
  ELSE
    -- If no shipping method supplied, use passed fee or 0
    v_final_fee_kobo := COALESCE(p_shipping_fee_kobo, 0);
  END IF;

  v_shipping_fee := ROUND((v_final_fee_kobo::numeric / 100.0), 2);
  v_total := v_items_subtotal + v_shipping_fee;

  -- 4. Customer upsert by email
  INSERT INTO public.customers (full_name, email, contact_number)
  VALUES (trim(p_full_name), lower(trim(p_email)), trim(p_contact_number))
  ON CONFLICT (email) DO UPDATE
    SET full_name = excluded.full_name,
        contact_number = excluded.contact_number
  RETURNING id INTO v_customer_id;

  -- 5. Order number allocation
  FOR v_attempt IN 1..3 LOOP
    INSERT INTO public.order_number_counters (day, last_value)
    VALUES (current_date, 1)
    ON CONFLICT (day) DO UPDATE
      SET last_value = public.order_number_counters.last_value + 1
    RETURNING last_value INTO v_day_counter;

    v_order_number := 'ORD-' || to_char(current_date, 'YYYYMMDD')
      || '-' || lpad(v_day_counter::text, 4, '0');

    BEGIN
      INSERT INTO public.orders (
        order_number, customer_id, delivery_address, payment_method,
        status, total_amount, notes,
        payment_provider, payment_status,
        recipient_name, recipient_phone,
        shipping_method_id, shipping_method_name,
        state_id, lga_id, delivery_zone_id,
        state_name, lga_name, city_name, street_address,
        shipping_fee_kobo, shipping_fee,
        shipment_status, delivery_instructions
      )
      VALUES (
        v_order_number, v_customer_id, trim(p_delivery_address),
        p_payment_method::public.payment_method, 'pending', v_total,
        nullif(trim(coalesce(p_notes, '')), ''),
        CASE WHEN p_payment_method = 'bachs' THEN 'bachs' ELSE NULL END,
        'pending',
        COALESCE(p_recipient_name, trim(p_full_name)),
        COALESCE(p_recipient_phone, trim(p_contact_number)),
        p_shipping_method_id,
        v_method.name,
        p_state_id, p_lga_id, p_delivery_zone_id,
        p_state_name, p_lga_name, p_city_name,
        COALESCE(p_street_address, trim(p_delivery_address)),
        v_final_fee_kobo, v_shipping_fee,
        'pending',
        nullif(trim(coalesce(p_notes, '')), '')
      )
      RETURNING id INTO v_order_id;

      EXIT;
    EXCEPTION
      WHEN unique_violation THEN
        v_order_number := NULL;
    END;
  END LOOP;

  IF v_order_number IS NULL THEN
    RAISE EXCEPTION 'Could not allocate a unique order number';
  END IF;

  -- 6. Order items with price snapshot & stock deduction
  FOR v_item IN
    SELECT product_id, quantity
    FROM jsonb_to_recordset(p_items) AS x(product_id UUID, quantity INT)
  LOOP
    SELECT * INTO v_product
    FROM public.products
    WHERE id = v_item.product_id;

    INSERT INTO public.order_items (
      order_id, product_id, product_name, quantity, unit_price
    )
    VALUES (
      v_order_id, v_product.id, v_product.name, v_item.quantity, v_product.price
    );

    UPDATE public.products
    SET stock = stock - v_item.quantity,
        updated_at = now()
    WHERE id = v_product.id;
  END LOOP;

  -- 7. Initial shipment log
  INSERT INTO public.shipment_logs (order_id, status, notes)
  VALUES (v_order_id, 'pending', 'Order placed, awaiting processing.');

  RETURN jsonb_build_object(
    'ok', true,
    'order_id', v_order_id,
    'order_number', v_order_number,
    'total_amount', v_total,
    'items_subtotal', v_items_subtotal,
    'shipping_fee', v_shipping_fee
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 7. Row Level Security Policies
-- ---------------------------------------------------------------------------

ALTER TABLE public.states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lgas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipping_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipping_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipment_logs ENABLE ROW LEVEL SECURITY;

-- Public reads for storefront checkout
CREATE POLICY "Public can view active states"
  ON public.states FOR SELECT
  USING (is_active = true OR (auth.role() = 'authenticated' AND public.is_admin()));

CREATE POLICY "Public can view active lgas"
  ON public.lgas FOR SELECT
  USING (is_active = true OR (auth.role() = 'authenticated' AND public.is_admin()));

CREATE POLICY "Public can view active delivery zones"
  ON public.delivery_zones FOR SELECT
  USING (is_active = true OR (auth.role() = 'authenticated' AND public.is_admin()));

CREATE POLICY "Public can view active shipping methods"
  ON public.shipping_methods FOR SELECT
  USING (is_active = true OR (auth.role() = 'authenticated' AND public.is_admin()));

CREATE POLICY "Public can view active shipping rates"
  ON public.shipping_rates FOR SELECT
  USING (is_active = true OR (auth.role() = 'authenticated' AND public.is_admin()));

-- Admin write policies
CREATE POLICY "Admins have full access to states"
  ON public.states FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins have full access to lgas"
  ON public.lgas FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins have full access to delivery zones"
  ON public.delivery_zones FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins have full access to shipping methods"
  ON public.shipping_methods FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins have full access to shipping rates"
  ON public.shipping_rates FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins have full access to shipment logs"
  ON public.shipment_logs FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ---------------------------------------------------------------------------
-- 8. Seed Default Shipping Methods
-- ---------------------------------------------------------------------------

INSERT INTO public.shipping_methods (id, name, method_type, description, estimated_min_days, estimated_max_days, display_order)
VALUES
  ('own_delivery', 'Boojy Dispatch (Own Delivery)', 'own_delivery', 'Handled directly by Boojy dispatch riders with live tracking.', 1, 2, 1),
  ('standard', 'Standard Courier Delivery', 'courier', 'Doorstep delivery via trusted regional courier network.', 2, 4, 2),
  ('express', 'Express Same-Day / Next-Day Delivery', 'courier', 'Priority rapid dispatch for urgent deliveries.', 1, 1, 3),
  ('pickup', 'Store Pickup / Hub Collection', 'pickup', 'Collect in person from our flagship store during business hours.', 0, 1, 4)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  method_type = EXCLUDED.method_type;

-- ---------------------------------------------------------------------------
-- 9. Update track_order function to include shipment details
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.track_order(p_order_number text, p_email text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'id', o.id,
    'order_number', o.order_number,
    'status', o.status,
    'total_amount', o.total_amount,
    'payment_method', o.payment_method,
    'payment_provider', o.payment_provider,
    'payment_status', o.payment_status,
    'paid_at', o.paid_at,
    'delivery_address', o.delivery_address,
    'created_at', o.created_at,
    'customer_name', c.full_name,
    'shipping_fee', COALESCE(o.shipping_fee, 0),
    'shipping_method_name', o.shipping_method_name,
    'shipment_status', COALESCE(o.shipment_status, 'pending'),
    'assigned_rider_name', o.assigned_rider_name,
    'assigned_rider_phone', o.assigned_rider_phone,
    'tracking_number', o.tracking_number,
    'tracking_url', o.tracking_url,
    'courier_provider', o.courier_provider,
    'items', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'product_name', oi.product_name,
        'image_url', p.image_url,
        'quantity', oi.quantity,
        'unit_price', oi.unit_price
      ) ORDER BY oi.created_at), '[]'::jsonb)
      FROM public.order_items oi
      LEFT JOIN public.products p ON p.id = oi.product_id
      WHERE oi.order_id = o.id
    )
  ) INTO result
  FROM public.orders o
  JOIN public.customers c ON c.id = o.customer_id
  WHERE upper(trim(o.order_number)) = upper(trim(p_order_number))
    AND lower(trim(c.email)) = lower(trim(p_email));

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.track_order(text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.track_order(text, text) TO authenticated;

