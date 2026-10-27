-- ============================================================================
-- Migration: Deduct stock ONLY on payment confirmation (not at checkout)
--
-- Business requirement:
-- When a customer clicks checkout to open the payment gateway, inventory/stock
-- must NOT be deducted. If the customer closes the tab, cancels, or the payment
-- fails, inventory must remain untouched. Stock is deducted only after payment
-- is verified and confirmed (or when admin moves order to confirmed).
-- ============================================================================

-- 1. Add stock_deducted flag to public.orders
ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS stock_deducted BOOLEAN NOT NULL DEFAULT false;

-- Backfill existing confirmed, processing, shipped, completed, or paid orders
UPDATE public.orders
SET stock_deducted = true
WHERE status IN ('confirmed', 'preparing', 'shipped', 'completed')
   OR payment_status = 'paid';

-- 2. Update place_order: re-validates stock availability but DOES NOT deduct stock
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

  -- 2. Lock + re-validate stock availability BEFORE any write
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
        'requested', v_item.quantity,
        'available', v_product.stock_quantity
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

    IF v_calculated_rate.free_shipping_threshold_kobo IS NOT NULL
       AND (v_items_subtotal * 100) >= v_calculated_rate.free_shipping_threshold_kobo THEN
      v_final_fee_kobo := 0;
    ELSE
      v_final_fee_kobo := v_calculated_rate.price_kobo;
    END IF;
  ELSE
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

  -- 5. Order number allocation & insertion with stock_deducted = false
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
        shipment_status, delivery_instructions,
        stock_deducted
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
        nullif(trim(coalesce(p_notes, '')), ''),
        false
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

  -- 6. Order items with price snapshot (STOCK IS NOT DEDUCTED YET)
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
  END LOOP;

  -- 7. Initial shipment log
  INSERT INTO public.shipment_logs (order_id, status, notes)
  VALUES (v_order_id, 'pending', 'Order placed, awaiting payment confirmation.');

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

-- 3. Update confirm_bachs_payment: Atomically deducts stock when payment succeeds
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

  -- Idempotency check: if already confirmed/paid, return success without duplicate action
  IF v_order.payment_status = 'paid' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'order_id', v_order.id,
      'already_paid', true,
      'status', v_order.status
    );
  END IF;

  -- Verify currency is NGN
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

  -- Deduct stock for all order items if not already deducted
  IF NOT COALESCE(v_order.stock_deducted, false) THEN
    FOR v_item IN
      SELECT product_id, quantity
      FROM public.order_items
      WHERE order_id = v_order.id
        AND product_id IS NOT NULL
    LOOP
      UPDATE public.products
      SET stock_quantity = GREATEST(0, stock_quantity - v_item.quantity)
      WHERE id = v_item.product_id;
    END LOOP;
  END IF;

  -- Atomically update order to confirmed + paid + stock_deducted = true
  UPDATE public.orders
  SET
    status = CASE WHEN status = 'pending' THEN 'confirmed'::public.order_status ELSE status END,
    payment_status = 'paid',
    payment_provider = 'bachs',
    bachs_charge_id = coalesce(p_charge_id, bachs_charge_id),
    payment_reference = coalesce(p_payment_reference, payment_reference),
    paid_at = now(),
    payment_metadata = coalesce(p_metadata, payment_metadata),
    stock_deducted = true
  WHERE id = p_order_id;

  RETURN jsonb_build_object(
    'ok', true,
    'order_id', v_order.id,
    'order_number', v_order.order_number,
    'status', 'confirmed',
    'payment_status', 'paid',
    'stock_deducted', true
  );
END;
$$;

-- 4. Update transition_order_status: Manages stock deduction / restore accurately
CREATE OR REPLACE FUNCTION public.transition_order_status(
  p_order_id UUID,
  p_new_status TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_lifecycle TEXT[] := ARRAY['pending', 'confirmed', 'preparing', 'shipped', 'completed'];
  v_from_index INT;
  v_to_index INT;
  v_item RECORD;
  v_new_stock_deducted BOOLEAN;
BEGIN
  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'message', 'That order no longer exists.');
  END IF;

  IF p_new_status = v_order.status::TEXT THEN
    RETURN jsonb_build_object('ok', false, 'message', format('Order is already %s.', p_new_status));
  END IF;

  IF v_order.status IN ('completed', 'cancelled') THEN
    RETURN jsonb_build_object('ok', false, 'message',
      format('%s orders cannot be changed.', initcap(v_order.status::TEXT)));
  END IF;

  IF p_new_status <> 'cancelled' THEN
    v_from_index := array_position(v_lifecycle, v_order.status::TEXT);
    v_to_index := array_position(v_lifecycle, p_new_status);

    IF v_to_index IS NULL OR ABS(v_to_index - v_from_index) <> 1 THEN
      RETURN jsonb_build_object('ok', false, 'message',
        format('Cannot move an order from %s directly to %s.', v_order.status, p_new_status));
    END IF;
  END IF;

  v_new_stock_deducted := COALESCE(v_order.stock_deducted, false);

  -- Transitioning to confirmed/preparing/shipped/completed deducts stock if not yet deducted
  IF p_new_status IN ('confirmed', 'preparing', 'shipped', 'completed') AND NOT v_new_stock_deducted THEN
    FOR v_item IN
      SELECT product_id, quantity
      FROM public.order_items
      WHERE order_id = v_order.id
        AND product_id IS NOT NULL
    LOOP
      UPDATE public.products
      SET stock_quantity = GREATEST(0, stock_quantity - v_item.quantity)
      WHERE id = v_item.product_id;
    END LOOP;
    v_new_stock_deducted := true;
  END IF;

  -- Cancel only restores stock IF stock was actually deducted previously
  IF p_new_status = 'cancelled' AND v_new_stock_deducted THEN
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
    v_new_stock_deducted := false;
  END IF;

  UPDATE public.orders
  SET
    status = p_new_status::public.order_status,
    stock_deducted = v_new_stock_deducted
  WHERE id = v_order.id;

  RETURN jsonb_build_object('ok', true, 'status', p_new_status);
END;
$$;

-- 5. Update handle_bachs_payment_failure: Only restores stock if stock was deducted
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
  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_FOUND', 'message', 'Order not found.');
  END IF;

  IF v_order.payment_status = 'paid' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'ALREADY_PAID',
      'message', 'Cannot fail an order that has already been paid.'
    );
  END IF;

  -- Only restore stock if it was actually deducted
  IF p_restore_stock AND COALESCE(v_order.stock_deducted, false) AND v_order.status <> 'cancelled' THEN
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

  UPDATE public.orders
  SET
    payment_status = 'failed',
    status = CASE WHEN p_restore_stock THEN 'cancelled'::public.order_status ELSE status END,
    stock_deducted = CASE WHEN p_restore_stock AND COALESCE(v_order.stock_deducted, false) THEN false ELSE stock_deducted END,
    payment_metadata = jsonb_set(
      coalesce(payment_metadata, '{}'::jsonb),
      '{failure_reason}',
      to_jsonb(p_reason),
      true
    )
  WHERE id = p_order_id;

  RETURN jsonb_build_object(
    'ok', true,
    'order_id', v_order.id,
    'payment_status', 'failed',
    'status', CASE WHEN p_restore_stock THEN 'cancelled' ELSE v_order.status::text END,
    'reason', p_reason
  );
END;
$$;
