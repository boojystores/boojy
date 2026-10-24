-- Migration: 20261024000002_bachs_payment_integration.sql
-- Description: Complete Bachs.io payment gateway integration
--   1. Adds 'bachs' to payment_method enum
--   2. Adds payment fields to public.orders (payment_provider, payment_status, payment_reference, bachs_checkout_id, bachs_charge_id, paid_at, payment_metadata)
--   3. Creates bachs_webhook_events table for idempotency and event auditing
--   4. Updates place_order RPC to allow 'bachs'
--   5. Creates confirm_bachs_payment and handle_bachs_payment_failure RPCs
--   6. Updates order_summaries and order_details views to include payment fields

-- 1. Add 'bachs' to payment_method enum
ALTER TYPE public.payment_method ADD VALUE IF NOT EXISTS 'bachs';

-- 2. Add payment fields to public.orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_provider text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS payment_reference text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS bachs_checkout_id text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS bachs_charge_id text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS payment_metadata jsonb DEFAULT NULL;

-- Indexes for fast payment lookups and reconciliation
CREATE INDEX IF NOT EXISTS orders_payment_status_idx ON public.orders(payment_status);
CREATE INDEX IF NOT EXISTS orders_payment_reference_idx ON public.orders(payment_reference);
CREATE INDEX IF NOT EXISTS orders_bachs_checkout_id_idx ON public.orders(bachs_checkout_id);
CREATE INDEX IF NOT EXISTS orders_bachs_charge_id_idx ON public.orders(bachs_charge_id);

-- 3. Webhook idempotency and audit table
CREATE TABLE IF NOT EXISTS public.bachs_webhook_events (
  id text PRIMARY KEY, -- provider event id (e.g. evt_...)
  event_type text NOT NULL,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'processed', -- 'processed', 'failed', 'duplicate', 'ignored'
  payload jsonb NOT NULL,
  error_message text DEFAULT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bachs_webhook_events_order_id_idx ON public.bachs_webhook_events(order_id);
CREATE INDEX IF NOT EXISTS bachs_webhook_events_created_at_idx ON public.bachs_webhook_events(created_at DESC);

-- Enable RLS on bachs_webhook_events: admins only
ALTER TABLE public.bachs_webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view bachs webhook events"
  ON public.bachs_webhook_events FOR SELECT
  TO authenticated
  USING (public.is_admin());

-- 4. Update place_order to allow 'bachs' and persist initial payment fields
CREATE OR REPLACE FUNCTION public.place_order(
  p_full_name TEXT,
  p_email TEXT,
  p_contact_number TEXT,
  p_delivery_address TEXT,
  p_payment_method TEXT,
  p_items JSONB,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer_id UUID;
  v_order_id UUID;
  v_order_number TEXT;
  v_total NUMERIC(10, 2) := 0;
  v_day_counter INTEGER;
  v_attempt INTEGER;
  v_item RECORD;
  v_product public.products%ROWTYPE;
  v_issues JSONB := '[]'::JSONB;
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

    IF v_product.status <> 'active' THEN
      RETURN jsonb_build_object('ok', false, 'code', 'PRODUCT_UNAVAILABLE',
        'message', format('"%s" is no longer available.', v_product.name),
        'items', jsonb_build_array(jsonb_build_object(
          'product_id', v_product.id,
          'name', v_product.name,
          'requested', v_item.quantity
        )));
    END IF;

    IF v_product.stock_quantity < v_item.quantity THEN
      v_issues := v_issues || jsonb_build_object(
        'product_id', v_product.id,
        'name', v_product.name,
        'available', v_product.stock_quantity,
        'requested', v_item.quantity
      );
    END IF;

    v_total := v_total + v_product.price * v_item.quantity;
  END LOOP;

  IF jsonb_array_length(v_issues) > 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INSUFFICIENT_STOCK',
      'message', 'Some items do not have enough stock. Review the highlighted lines and try again.',
      'items', v_issues);
  END IF;

  -- 3. Customer upsert by email
  INSERT INTO public.customers (full_name, email, contact_number)
  VALUES (trim(p_full_name), lower(trim(p_email)), trim(p_contact_number))
  ON CONFLICT (email) DO UPDATE
    SET full_name = excluded.full_name,
        contact_number = excluded.contact_number
  RETURNING id INTO v_customer_id;

  -- 4. Order number: per-day counter
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
        payment_provider, payment_status
      )
      VALUES (
        v_order_number, v_customer_id, trim(p_delivery_address),
        p_payment_method::public.payment_method, 'pending', v_total,
        nullif(trim(coalesce(p_notes, '')), ''),
        CASE WHEN p_payment_method = 'bachs' THEN 'bachs' ELSE NULL END,
        'pending'
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

  -- 5. Order items with price & product_name snapshot + stock deduction
  FOR v_item IN
    SELECT product_id, quantity
    FROM jsonb_to_recordset(p_items) AS x(product_id UUID, quantity INT)
  LOOP
    SELECT * INTO v_product
    FROM public.products
    WHERE id = v_item.product_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Product % vanished during checkout', v_item.product_id;
    END IF;

    INSERT INTO public.order_items (order_id, product_id, product_name, quantity, unit_price)
    VALUES (v_order_id, v_product.id, v_product.name, v_item.quantity, v_product.price);

    UPDATE public.products
    SET stock_quantity = stock_quantity - v_item.quantity
    WHERE id = v_product.id;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'order_id', v_order_id,
    'order_number', v_order_number,
    'total_amount', v_total
  );
END;
$$;

-- 5. RPC: Atomically confirm Bachs payment and transition order to confirmed
CREATE OR REPLACE FUNCTION public.confirm_bachs_payment(
  p_order_id UUID,
  p_charge_id TEXT,
  p_payment_reference TEXT,
  p_amount NUMERIC(10, 2),
  p_currency TEXT,
  p_metadata JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
BEGIN
  -- Row-lock order
  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_FOUND', 'message', 'Order not found.');
  END IF;

  -- Idempotency check: if already confirmed/paid, return success without duplicate action
  IF v_order.payment_status = 'paid' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'order_id', v_order.id,
      'already_paid', true,
      'status', v_order.status
    );
  END IF;

  -- Verify currency is NGN (or matches expected store currency)
  IF upper(p_currency) <> 'NGN' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'CURRENCY_MISMATCH',
      'message', format('Expected currency NGN, got %s', p_currency)
    );
  END IF;

  -- Verify amount matches expected order total
  IF p_amount <> v_order.total_amount THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'AMOUNT_MISMATCH',
      'message', format('Expected amount %s, received %s', v_order.total_amount, p_amount)
    );
  END IF;

  -- Atomically update order to confirmed + paid
  UPDATE public.orders
  SET
    status = CASE WHEN status = 'pending' THEN 'confirmed'::public.order_status ELSE status END,
    payment_status = 'paid',
    payment_provider = 'bachs',
    bachs_charge_id = coalesce(p_charge_id, bachs_charge_id),
    payment_reference = coalesce(p_payment_reference, payment_reference),
    paid_at = now(),
    payment_metadata = coalesce(p_metadata, payment_metadata)
  WHERE id = p_order_id;

  RETURN jsonb_build_object(
    'ok', true,
    'order_id', v_order.id,
    'order_number', v_order.order_number,
    'status', 'confirmed',
    'payment_status', 'paid'
  );
END;
$$;

-- 6. RPC: Handle Bachs payment failure or session expiration
CREATE OR REPLACE FUNCTION public.handle_bachs_payment_failure(
  p_order_id UUID,
  p_reason TEXT,
  p_restore_stock BOOLEAN DEFAULT true
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_item RECORD;
BEGIN
  -- Row-lock order
  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_FOUND', 'message', 'Order not found.');
  END IF;

  -- If order was already paid, do NOT cancel it!
  IF v_order.payment_status = 'paid' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ALREADY_PAID', 'message', 'Cannot fail an already paid order.');
  END IF;

  -- Restore reserved stock if requested and order is not already cancelled
  IF p_restore_stock AND v_order.status <> 'cancelled' THEN
    FOR v_item IN
      SELECT product_id, quantity
      FROM public.order_items
      WHERE order_id = v_order.id
        AND product_id IS NOT NULL
    LOOP
      UPDATE public.products
      SET stock_quantity = stock_quantity + v_item.quantity
      WHERE id = v_item.product_id;
    END LOOP;
  END IF;

  -- Update order payment_status to 'failed' or 'cancelled'
  UPDATE public.orders
  SET
    status = CASE WHEN p_restore_stock THEN 'cancelled'::public.order_status ELSE status END,
    payment_status = 'failed',
    notes = concat_ws(' | ', notes, format('Bachs payment failure: %s', p_reason))
  WHERE id = p_order_id;

  RETURN jsonb_build_object(
    'ok', true,
    'order_id', v_order.id,
    'status', CASE WHEN p_restore_stock THEN 'cancelled' ELSE v_order.status::text END,
    'payment_status', 'failed'
  );
END;
$$;

-- 7. Update order_summaries view to include payment columns
DROP VIEW IF EXISTS public.order_summaries;

CREATE VIEW public.order_summaries
WITH (security_invoker = true) AS
SELECT
  o.id,
  o.order_number,
  o.status,
  o.total_amount,
  o.payment_method,
  o.payment_provider,
  o.payment_status,
  o.payment_reference,
  o.bachs_checkout_id,
  o.bachs_charge_id,
  o.paid_at,
  o.created_at,
  o.customer_id,
  c.full_name AS customer_name,
  c.email AS customer_email,
  coalesce(oi.items_count, 0) AS items_count
FROM public.orders o
LEFT JOIN public.customers c ON c.id = o.customer_id
LEFT JOIN (
  SELECT order_id, sum(quantity)::int AS items_count
  FROM public.order_items
  GROUP BY order_id
) oi ON oi.order_id = o.id;

GRANT SELECT ON public.order_summaries TO authenticated;

-- 8. Update order_details view to include payment columns
DROP VIEW IF EXISTS public.order_details;

CREATE VIEW public.order_details
WITH (security_invoker = true) AS
SELECT
  o.id,
  o.order_number,
  o.status,
  o.total_amount,
  o.payment_method,
  o.payment_provider,
  o.payment_status,
  o.payment_reference,
  o.bachs_checkout_id,
  o.bachs_charge_id,
  o.paid_at,
  o.payment_metadata,
  o.notes,
  o.created_at,
  o.delivery_address,
  c.full_name AS customer_name,
  c.email AS customer_email,
  c.contact_number AS customer_contact_number,
  coalesce(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', oi.id,
          'product_id', oi.product_id,
          'product_name', coalesce(oi.product_name, p.name, 'Deleted product'),
          'image_url', p.image_url,
          'quantity', oi.quantity,
          'unit_price', oi.unit_price,
          'line_total', round(oi.quantity * oi.unit_price, 2)
        )
        ORDER BY oi.created_at
      )
      FROM public.order_items oi
      LEFT JOIN public.products p ON p.id = oi.product_id
      WHERE oi.order_id = o.id
    ),
    '[]'::jsonb
  ) AS items
FROM public.orders o
JOIN public.customers c ON c.id = o.customer_id;

GRANT SELECT ON public.order_details TO authenticated;

-- 9. Update track_order function to return payment details
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

GRANT EXECUTE ON FUNCTION public.confirm_bachs_payment(UUID, TEXT, TEXT, NUMERIC, TEXT, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.handle_bachs_payment_failure(UUID, TEXT, BOOLEAN) TO service_role;
