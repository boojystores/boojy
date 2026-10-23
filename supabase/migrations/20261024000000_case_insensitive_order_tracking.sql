-- Case-insensitive order tracking lookup (ticket / user request)
-- Allows customers to track their orders regardless of uppercase/lowercase in order number and email.

create or replace function public.track_order(p_order_number text, p_email text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  select jsonb_build_object(
    'order_number', o.order_number,
    'status', o.status,
    'total_amount', o.total_amount,
    'payment_method', o.payment_method,
    'delivery_address', o.delivery_address,
    'created_at', o.created_at,
    'customer_name', c.full_name,
    'items', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'product_name', oi.product_name,
        'image_url', p.image_url,
        'quantity', oi.quantity,
        'unit_price', oi.unit_price
      ) order by oi.created_at), '[]'::jsonb)
      from public.order_items oi
      left join public.products p on p.id = oi.product_id
      where oi.order_id = o.id
    )
  ) into result
  from public.orders o
  join public.customers c on c.id = o.customer_id
  where upper(trim(o.order_number)) = upper(trim(p_order_number))
    and lower(trim(c.email)) = lower(trim(p_email));

  return result;
end;
$$;

grant execute on function public.track_order(text, text) to anon;
grant execute on function public.track_order(text, text) to authenticated;
