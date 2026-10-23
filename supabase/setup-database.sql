-- ============================================================================
-- Boojy E-Commerce — Complete Database Setup & Schema
-- Target: Supabase (PostgreSQL 15+)
-- Standard conventions: snake_case, plural tables, UUID PKs, explicit FKs,
-- Row-Level Security (RLS) + SECURITY DEFINER RPC boundaries.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. EXTENSIONS
-- ----------------------------------------------------------------------------
create extension if not exists pg_trgm;
create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- 2. CUSTOM TYPES / ENUMS
-- ----------------------------------------------------------------------------
do $$ begin
  create type product_status as enum ('active', 'inactive');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type order_status as enum ('pending', 'confirmed', 'preparing', 'shipped', 'completed', 'cancelled');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type payment_method as enum ('cod', 'ewallet', 'bank_transfer');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type customer_account_status as enum ('active', 'inactive');
exception
  when duplicate_object then null;
end $$;

-- ----------------------------------------------------------------------------
-- 3. HELPER FUNCTION: is_admin()
-- Reads the `role: admin` claim from the JWT's app_metadata.
-- ----------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
set search_path = public
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin';
$$;

-- ----------------------------------------------------------------------------
-- 4. CORE TABLES (Standard PostgreSQL naming: plural, snake_case, explicit constraints)
-- ----------------------------------------------------------------------------

-- Categories
create table if not exists public.categories (
  id uuid default gen_random_uuid(),
  name varchar(100) not null,
  slug varchar(100) not null,
  created_at timestamptz not null default now(),
  constraint categories_pkey primary key (id),
  constraint categories_name_key unique (name),
  constraint categories_slug_key unique (slug)
);

-- Products (restricted deletion if orders or categories reference it)
create table if not exists public.products (
  id uuid default gen_random_uuid(),
  category_id uuid,
  name varchar(255) not null,
  description text,
  price numeric(10, 2) not null,
  stock_quantity integer not null default 0,
  image_url text not null,
  status product_status not null default 'active',
  created_at timestamptz not null default now(),
  constraint products_pkey primary key (id),
  constraint products_category_id_fkey foreign key (category_id) references public.categories(id) on delete restrict,
  constraint products_price_check check (price >= 0),
  constraint products_stock_quantity_check check (stock_quantity >= 0)
);

-- Customers (guest checkout records)
create table if not exists public.customers (
  id uuid default gen_random_uuid(),
  full_name varchar(150) not null,
  email varchar(150) not null,
  contact_number varchar(50) not null,
  account_status customer_account_status not null default 'active',
  created_at timestamptz not null default now(),
  constraint customers_pkey primary key (id),
  constraint customers_email_key unique (email)
);

-- Orders
create table if not exists public.orders (
  id uuid default gen_random_uuid(),
  order_number varchar(30) not null,
  customer_id uuid not null,
  delivery_address text not null,
  payment_method payment_method not null,
  status order_status not null default 'pending',
  total_amount numeric(10, 2) not null,
  notes text,
  created_at timestamptz not null default now(),
  constraint orders_pkey primary key (id),
  constraint orders_order_number_key unique (order_number),
  constraint orders_customer_id_fkey foreign key (customer_id) references public.customers(id) on delete restrict,
  constraint orders_total_amount_check check (total_amount >= 0)
);

-- Order Items (captures price and product_name snapshots at purchase time)
create table if not exists public.order_items (
  id uuid default gen_random_uuid(),
  order_id uuid not null,
  product_id uuid,
  product_name varchar(255) not null default 'Unknown product',
  quantity integer not null,
  unit_price numeric(10, 2) not null,
  created_at timestamptz not null default now(),
  constraint order_items_pkey primary key (id),
  constraint order_items_order_id_fkey foreign key (order_id) references public.orders(id) on delete cascade,
  constraint order_items_quantity_check check (quantity > 0),
  constraint order_items_unit_price_check check (unit_price >= 0)
);

-- Order Number Counters (per-day atomic serial sequence generator)
create table if not exists public.order_number_counters (
  day date not null,
  last_value integer not null default 0,
  constraint order_number_counters_pkey primary key (day),
  constraint order_number_counters_last_value_check check (last_value >= 0)
);

-- ----------------------------------------------------------------------------
-- 5. INDEXES
-- ----------------------------------------------------------------------------
create index if not exists products_category_id_idx on public.products(category_id);
create index if not exists products_status_idx on public.products(status);
create index if not exists products_name_trgm_idx on public.products using gin (name gin_trgm_ops);
create index if not exists categories_name_trgm_idx on public.categories using gin (name gin_trgm_ops);
create index if not exists orders_status_idx on public.orders(status);
create index if not exists orders_customer_id_idx on public.orders(customer_id);
create index if not exists orders_created_at_idx on public.orders(created_at desc);
create index if not exists order_items_order_id_idx on public.order_items(order_id);
create index if not exists order_items_product_id_idx on public.order_items(product_id);

-- ----------------------------------------------------------------------------
-- 6. ROW-LEVEL SECURITY (RLS) POLICIES
-- ----------------------------------------------------------------------------
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.customers enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_number_counters enable row level security;

-- Internal state table: lock out direct client access
revoke all on public.order_number_counters from public;
revoke all on public.order_number_counters from anon, authenticated;

-- Catalog categories: world-readable, admin-manageable
drop policy if exists "Catalog categories are publicly readable" on public.categories;
create policy "Catalog categories are publicly readable"
  on public.categories for select
  to anon, authenticated
  using (true);

drop policy if exists "Admins can manage categories" on public.categories;
create policy "Admins can manage categories"
  on public.categories for all
  to anon, authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Catalog products: world-readable, admin-manageable
drop policy if exists "Catalog products are publicly readable" on public.products;
create policy "Catalog products are publicly readable"
  on public.products for select
  to anon, authenticated
  using (true);

drop policy if exists "Admins can manage products" on public.products;
create policy "Admins can manage products"
  on public.products for all
  to anon, authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Customers: guests can insert on checkout, admins can view/manage
drop policy if exists "Guests can create customers" on public.customers;
create policy "Guests can create customers"
  on public.customers for insert
  to anon, authenticated
  with check (true);

drop policy if exists "Admins can manage customers" on public.customers;
create policy "Admins can manage customers"
  on public.customers for all
  to anon, authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Orders: guests can insert, anon can track via realtime events, admins can view/manage
drop policy if exists "Guests can create orders" on public.orders;
create policy "Guests can create orders"
  on public.orders for insert
  to anon, authenticated
  with check (true);

drop policy if exists "Anon can track orders via realtime" on public.orders;
create policy "Anon can track orders via realtime"
  on public.orders for select
  to anon
  using (true);

drop policy if exists "Admins can manage orders" on public.orders;
create policy "Admins can manage orders"
  on public.orders for all
  to anon, authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Order items: guests can insert, admins can view/manage
drop policy if exists "Guests can create order items" on public.order_items;
create policy "Guests can create order items"
  on public.order_items for insert
  to anon, authenticated
  with check (true);

drop policy if exists "Admins can manage order items" on public.order_items;
create policy "Admins can manage order items"
  on public.order_items for all
  to anon, authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- 7. STORAGE BUCKET (product-images)
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-images',
  'product-images',
  true,
  5242880, -- 5 MB
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

drop policy if exists "Product images are publicly readable" on storage.objects;
create policy "Product images are publicly readable"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'product-images');

drop policy if exists "Admins can upload product images" on storage.objects;
create policy "Admins can upload product images"
  on storage.objects for insert
  to anon, authenticated
  with check (bucket_id = 'product-images' and public.is_admin());

drop policy if exists "Admins can update product images" on storage.objects;
create policy "Admins can update product images"
  on storage.objects for update
  to anon, authenticated
  using (bucket_id = 'product-images' and public.is_admin());

drop policy if exists "Admins can delete product images" on storage.objects;
create policy "Admins can delete product images"
  on storage.objects for delete
  to anon, authenticated
  using (bucket_id = 'product-images' and public.is_admin());

-- ----------------------------------------------------------------------------
-- 8. BUSINESS TRANSACTIONS (RPCs)
-- ----------------------------------------------------------------------------

-- Atomic Order Placement with Stock Validation, Sequence Generation, & Snapshots
create or replace function public.place_order(
  p_full_name text,
  p_email text,
  p_contact_number text,
  p_delivery_address text,
  p_payment_method text,
  p_items jsonb,
  p_notes text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_customer_id uuid;
  v_order_id uuid;
  v_order_number text;
  v_total numeric(10, 2) := 0;
  v_day_counter integer;
  v_attempt integer;
  v_item record;
  v_product public.products%rowtype;
  v_issues jsonb := '[]'::jsonb;
begin
  -- 1. Input validation
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    return jsonb_build_object('ok', false, 'code', 'VALIDATION', 'message', 'Your cart is empty.');
  end if;

  if nullif(trim(p_full_name), '') is null
     or nullif(trim(p_email), '') is null
     or nullif(trim(p_contact_number), '') is null
     or nullif(trim(p_delivery_address), '') is null then
    return jsonb_build_object('ok', false, 'code', 'VALIDATION',
      'message', 'Name, email, contact number, and delivery address are required.');
  end if;

  if p_payment_method not in ('cod', 'ewallet', 'bank_transfer') then
    return jsonb_build_object('ok', false, 'code', 'VALIDATION',
      'message', 'Choose a valid payment method.');
  end if;

  if p_email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    return jsonb_build_object('ok', false, 'code', 'VALIDATION',
      'message', 'Enter a valid email address.');
  end if;

  if jsonb_array_length(p_items) > 100 then
    return jsonb_build_object('ok', false, 'code', 'VALIDATION',
      'message', 'Too many items in the cart.');
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_items) as x(product_id uuid, quantity int)
    group by product_id
    having count(*) > 1
  ) then
    return jsonb_build_object('ok', false, 'code', 'VALIDATION',
      'message', 'Your cart contains the same product more than once.');
  end if;

  -- 2. Lock + re-validate every line BEFORE writing
  for v_item in
    select product_id, quantity
    from jsonb_to_recordset(p_items) as x(product_id uuid, quantity int)
  loop
    if v_item.product_id is null or v_item.quantity is null or v_item.quantity < 1 then
      return jsonb_build_object('ok', false, 'code', 'VALIDATION',
        'message', 'Each cart line needs a product id and a quantity of at least 1.');
    end if;

    select * into v_product
    from public.products
    where id = v_item.product_id
    for update;

    if not found then
      return jsonb_build_object('ok', false, 'code', 'PRODUCT_UNAVAILABLE',
        'message', 'A product in your cart is no longer available.',
        'items', jsonb_build_array(jsonb_build_object(
          'product_id', v_item.product_id,
          'name', 'Unavailable product',
          'requested', v_item.quantity
        )));
    end if;

    if v_product.status <> 'active' then
      return jsonb_build_object('ok', false, 'code', 'PRODUCT_UNAVAILABLE',
        'message', format('"%s" is no longer available.', v_product.name),
        'items', jsonb_build_array(jsonb_build_object(
          'product_id', v_product.id,
          'name', v_product.name,
          'requested', v_item.quantity
        )));
    end if;

    if v_product.stock_quantity < v_item.quantity then
      v_issues := v_issues || jsonb_build_object(
        'product_id', v_product.id,
        'name', v_product.name,
        'available', v_product.stock_quantity,
        'requested', v_item.quantity
      );
    end if;

    v_total := v_total + v_product.price * v_item.quantity;
  end loop;

  if jsonb_array_length(v_issues) > 0 then
    return jsonb_build_object('ok', false, 'code', 'INSUFFICIENT_STOCK',
      'message', 'Some items do not have enough stock. Review the highlighted lines and try again.',
      'items', v_issues);
  end if;

  -- 3. Customer upsert by email
  insert into public.customers (full_name, email, contact_number)
  values (trim(p_full_name), lower(trim(p_email)), trim(p_contact_number))
  on conflict (email) do update
    set full_name = excluded.full_name,
        contact_number = excluded.contact_number
  returning id into v_customer_id;

  -- 4. Order number generation: ORD-YYYYMMDD-XXXX
  for v_attempt in 1..3 loop
    insert into public.order_number_counters (day, last_value)
    values (current_date, 1)
    on conflict (day) do update
      set last_value = public.order_number_counters.last_value + 1
    returning last_value into v_day_counter;

    v_order_number := 'ORD-' || to_char(current_date, 'YYYYMMDD')
      || '-' || lpad(v_day_counter::text, 4, '0');

    begin
      insert into public.orders (
        order_number, customer_id, delivery_address, payment_method,
        status, total_amount, notes
      )
      values (
        v_order_number, v_customer_id, trim(p_delivery_address),
        p_payment_method::public.payment_method, 'pending', v_total,
        nullif(trim(coalesce(p_notes, '')), '')
      )
      returning id into v_order_id;

      exit;
    exception
      when unique_violation then
        v_order_number := null;
    end;
  end loop;

  if v_order_number is null then
    raise exception 'Could not allocate a unique order number';
  end if;

  -- 5. Order items with price + product_name snapshots and stock deduction
  for v_item in
    select product_id, quantity
    from jsonb_to_recordset(p_items) as x(product_id uuid, quantity int)
  loop
    select * into v_product
    from public.products
    where id = v_item.product_id
    for update;

    if not found then
      raise exception 'Product % vanished during checkout', v_item.product_id;
    end if;

    insert into public.order_items (order_id, product_id, product_name, quantity, unit_price)
    values (v_order_id, v_product.id, v_product.name, v_item.quantity, v_product.price);

    update public.products
    set stock_quantity = stock_quantity - v_item.quantity
    where id = v_product.id;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'order_id', v_order_id,
    'order_number', v_order_number,
    'total_amount', v_total
  );
end;
$$;

revoke all on function public.place_order(text, text, text, text, text, jsonb, text) from public;
grant execute on function public.place_order(text, text, text, text, text, jsonb, text) to anon, authenticated;

-- Order Status Transitions with Atomic Stock Restore upon Cancellation
create or replace function public.transition_order_status(
  p_order_id uuid,
  p_new_status text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_item record;
  v_from_index int;
  v_to_index int;
  v_lifecycle text[] := array['pending', 'confirmed', 'preparing', 'shipped', 'completed'];
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'message', 'Admins only.');
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'message', 'That order no longer exists.');
  end if;

  if p_new_status not in ('pending', 'confirmed', 'preparing', 'shipped', 'completed', 'cancelled') then
    return jsonb_build_object('ok', false, 'message', 'Unknown order status.');
  end if;

  if p_new_status = v_order.status::text then
    return jsonb_build_object('ok', false, 'message', format('Order is already %s.', v_order.status));
  end if;

  if v_order.status in ('completed', 'cancelled') then
    return jsonb_build_object('ok', false, 'message', format('%s orders cannot be changed.', initcap(v_order.status::text)));
  end if;

  if p_new_status <> 'cancelled' then
    v_from_index := array_position(v_lifecycle, v_order.status::text);
    v_to_index := array_position(v_lifecycle, p_new_status);

    if v_to_index is null or abs(v_to_index - v_from_index) <> 1 then
      return jsonb_build_object('ok', false, 'message',
        format('Cannot move an order from %s directly to %s.', v_order.status, p_new_status));
    end if;
  end if;

  -- Cancel restores stock atomically
  if p_new_status = 'cancelled' then
    for v_item in
      select product_id, quantity
      from public.order_items
      where order_id = v_order.id
        and product_id is not null
    loop
      update public.products
      set stock_quantity = stock_quantity + v_item.quantity
      where id = v_item.product_id;
    end loop;
  end if;

  update public.orders
  set status = p_new_status::public.order_status
  where id = v_order.id;

  return jsonb_build_object('ok', true, 'status', p_new_status);
end;
$$;

revoke all on function public.transition_order_status(uuid, text) from public;
grant execute on function public.transition_order_status(uuid, text) to authenticated;

-- Order Tracking Lookup (Guest-facing, verified by order number + email)
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
  where o.order_number = p_order_number
    and lower(c.email) = lower(p_email);

  return result;
end;
$$;

revoke all on function public.track_order(text, text) from public;
grant execute on function public.track_order(text, text) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- 9. ADMIN READ MODEL VIEWS & KPIS
-- ----------------------------------------------------------------------------

-- Order Summaries View (with payment_method and aggregated item counts)
drop view if exists public.order_summaries;
create view public.order_summaries
with (security_invoker = true) as
select
  o.id,
  o.order_number,
  o.status,
  o.total_amount,
  o.payment_method,
  o.created_at,
  o.customer_id,
  c.full_name as customer_name,
  c.email as customer_email,
  coalesce(oi.items_count, 0) as items_count
from public.orders o
left join public.customers c on c.id = o.customer_id
left join (
  select order_id, sum(quantity)::int as items_count
  from public.order_items
  group by order_id
) oi on oi.order_id = o.id;

-- Order Details View (with full order payload and snapshot product names)
drop view if exists public.order_details;
create view public.order_details
with (security_invoker = true) as
select
  o.id,
  o.order_number,
  o.status,
  o.total_amount,
  o.notes,
  o.created_at,
  o.delivery_address,
  o.payment_method,
  c.full_name as customer_name,
  c.email as customer_email,
  c.contact_number as customer_contact_number,
  coalesce(items.items, '[]'::jsonb) as items
from public.orders o
left join public.customers c on c.id = o.customer_id
left join (
  select
    oi.order_id,
    jsonb_agg(
      jsonb_build_object(
        'id', oi.id,
        'product_id', oi.product_id,
        'product_name', oi.product_name,
        'image_url', p.image_url,
        'quantity', oi.quantity,
        'unit_price', oi.unit_price
      ) order by oi.created_at, oi.id
    ) as items
  from public.order_items oi
  left join public.products p on p.id = oi.product_id
  group by oi.order_id
) items on items.order_id = o.id;

-- Customer Summaries View (live order count and spend rollups, excluding cancellations)
drop view if exists public.customer_summaries;
create view public.customer_summaries
with (security_invoker = true) as
select
  c.id,
  c.full_name,
  c.email,
  c.contact_number,
  c.account_status,
  c.created_at,
  count(o.id) filter (where o.status <> 'cancelled')::int as order_count,
  coalesce(sum(o.total_amount) filter (where o.status <> 'cancelled'), 0) as total_spent
from public.customers c
left join public.orders o on o.customer_id = c.id
group by c.id;

revoke all on public.order_summaries, public.order_details, public.customer_summaries from public;
grant select on public.order_summaries, public.order_details, public.customer_summaries to authenticated;

-- Dashboard KPI Aggregates Function
create or replace function public.get_admin_kpis()
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_kpis jsonb;
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'message', 'Admins only.');
  end if;

  select jsonb_build_object(
    'total_products', (select count(*) from public.products),
    'total_orders', (select count(*) from public.orders),
    'pending_orders', (select count(*) from public.orders where status = 'pending'),
    'completed_orders', (select count(*) from public.orders where status = 'completed'),
    'total_customers', (select count(*) from public.customers),
    'total_sales', coalesce((select sum(total_amount) from public.orders where status <> 'cancelled'), 0)
  ) into v_kpis;

  return jsonb_build_object('ok', true, 'kpis', v_kpis);
end;
$$;

revoke all on function public.get_admin_kpis() from public;
grant execute on function public.get_admin_kpis() to authenticated;

-- ----------------------------------------------------------------------------
-- 10. REALTIME PUBLICATION
-- ----------------------------------------------------------------------------
do $$ begin
  alter publication supabase_realtime add table
    public.products,
    public.categories,
    public.orders,
    public.order_items,
    public.customers;
exception
  when duplicate_object then null;
end $$;

-- ----------------------------------------------------------------------------
-- 11. CATALOG SEED DATA
-- ----------------------------------------------------------------------------
insert into public.categories (id, name, slug) values
  ('10000000-0000-4000-8000-000000000001', 'Speed Cubes', 'speed-cubes'),
  ('10000000-0000-4000-8000-000000000002', 'Puzzles & Brain Teasers', 'puzzles'),
  ('10000000-0000-4000-8000-000000000003', 'Collectibles', 'collectibles'),
  ('10000000-0000-4000-8000-000000000004', 'Accessories', 'accessories')
on conflict (id) do nothing;

insert into public.products (
  id, category_id, name, description, price, stock_quantity, image_url, status
) values
  (
    '20000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    '3x3 Speed Cube',
    'The classic 3x3, factory-lubricated with a smooth corner-cutting mechanism. Great for beginners and speedcubers alike.',
    12.99, 50, 'https://picsum.photos/seed/cube-3x3/800/800', 'active'
  ),
  (
    '20000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    '4x4 Master Cube',
    'Take on the 4x4 — center-piece parity, edge pairing, and a satisfying final solve. A step up for confident solvers.',
    19.99, 30, 'https://picsum.photos/seed/cube-4x4/800/800', 'active'
  ),
  (
    '20000000-0000-4000-8000-000000000003',
    '10000000-0000-4000-8000-000000000001',
    '2x2 Mini Cube',
    'A pocket-sized 2x2 that fits in any bag. Fewer pieces, same brain-bending fun — the perfect travel cube.',
    8.99, 0, 'https://picsum.photos/seed/cube-2x2/800/800', 'active'
  ),
  (
    '20000000-0000-4000-8000-000000000004',
    '10000000-0000-4000-8000-000000000001',
    '5x5 Professor Cube',
    'The 5x5 brings 98 movable pieces and hours of puzzling depth. For solvers who want the full professor experience.',
    24.99, 20, 'https://picsum.photos/seed/cube-5x5/800/800', 'active'
  ),
  (
    '20000000-0000-4000-8000-000000000005',
    '10000000-0000-4000-8000-000000000002',
    'Pyraminx',
    'A tetrahedral twisty puzzle with a surprisingly elegant solve. A friendly first step beyond the cube.',
    9.99, 40, 'https://picsum.photos/seed/pyraminx/800/800', 'active'
  ),
  (
    '20000000-0000-4000-8000-000000000006',
    '10000000-0000-4000-8000-000000000002',
    'Megaminx',
    'Twelve faces, fifty sides, one magnificent challenge. The dodecahedral Megaminx rewards patience and pattern sense.',
    21.99, 15, 'https://picsum.photos/seed/megaminx/800/800', 'active'
  ),
  (
    '20000000-0000-4000-8000-000000000007',
    '10000000-0000-4000-8000-000000000002',
    'Wooden Puzzle Box',
    'A beautifully crafted wooden box that only opens once you discover its hidden mechanism. Three layers of mystery.',
    34.99, 8, 'https://picsum.photos/seed/puzzle-box/800/800', 'active'
  ),
  (
    '20000000-0000-4000-8000-000000000008',
    '10000000-0000-4000-8000-000000000003',
    'Gold Collector''s Cube',
    'A limited-run 3x3 with a gold-plated finish, presented in a numbered display case. For the serious collector.',
    89.99, 5, 'https://picsum.photos/seed/gold-cube/800/800', 'active'
  ),
  (
    '20000000-0000-4000-8000-000000000009',
    '10000000-0000-4000-8000-000000000003',
    'Retro 80s Replica Cube',
    'A faithful recreation of the original 1980s cube, right down to the colour scheme and rough-turning corners.',
    49.99, 10, 'https://picsum.photos/seed/retro-cube/800/800', 'active'
  ),
  (
    '20000000-0000-4000-8000-000000000010',
    '10000000-0000-4000-8000-000000000004',
    'Cube Display Stand',
    'A minimal acrylic stand that shows off any cube at a perfect angle. Sizes fit all cubes from 2x2 to 5x5.',
    6.99, 100, 'https://picsum.photos/seed/cube-stand/800/800', 'active'
  ),
  (
    '20000000-0000-4000-8000-000000000011',
    '10000000-0000-4000-8000-000000000004',
    'Premium Cube Lubricant',
    'Silicone-based lube for fast, quiet turns. A few drops transform any sluggish cube. (Currently not for sale.)',
    4.99, 0, 'https://picsum.photos/seed/cube-lube/800/800', 'inactive'
  )
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- 12. ADMIN ACCOUNT BOOTSTRAP (AUTH SEED)
-- Seeds both boojystores@gmail.com and admin@example.com with password 'admin123'
-- Pre-confirmed and carrying role: admin claim in app_metadata.
-- ----------------------------------------------------------------------------

-- Clean up any empty string phone values in auth.users so they do not violate users_phone_key
update auth.users set phone = null where phone = '';

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  confirmation_token,
  recovery_token,
  email_change,
  email_change_token_new,
  email_change_token_current,
  phone,
  phone_change,
  phone_change_token,
  reauthentication_token,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
select
  '00000000-0000-0000-0000-000000000000',
  gen_random_uuid(),
  'authenticated',
  'authenticated',
  'boojystores@gmail.com',
  crypt('admin123', gen_salt('bf')),
  now(),
  '',
  '',
  '',
  '',
  '',
  null,
  '',
  '',
  '',
  '{"provider":"email","providers":["email"],"role":"admin"}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
where not exists (
  select 1 from auth.users where email = 'boojystores@gmail.com'
);

insert into auth.identities (
  id,
  user_id,
  provider_id,
  identity_data,
  provider,
  last_sign_in_at,
  created_at,
  updated_at
)
select
  u.id,
  u.id,
  u.id,
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
  'email',
  now(),
  now(),
  now()
from auth.users u
where u.email = 'boojystores@gmail.com'
  and not exists (
    select 1 from auth.identities i
    where i.user_id = u.id and i.provider = 'email'
  );

-- Backup legacy admin seed
insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  confirmation_token,
  recovery_token,
  email_change,
  email_change_token_new,
  email_change_token_current,
  phone,
  phone_change,
  phone_change_token,
  reauthentication_token,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
select
  '00000000-0000-0000-0000-000000000000',
  gen_random_uuid(),
  'authenticated',
  'authenticated',
  'admin@example.com',
  crypt('admin123', gen_salt('bf')),
  now(),
  '',
  '',
  '',
  '',
  '',
  null,
  '',
  '',
  '',
  '{"provider":"email","providers":["email"],"role":"admin"}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
where not exists (
  select 1 from auth.users where email = 'admin@example.com'
);

insert into auth.identities (
  id,
  user_id,
  provider_id,
  identity_data,
  provider,
  last_sign_in_at,
  created_at,
  updated_at
)
select
  u.id,
  u.id,
  u.id,
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
  'email',
  now(),
  now(),
  now()
from auth.users u
where u.email = 'admin@example.com'
  and not exists (
    select 1 from auth.identities i
    where i.user_id = u.id and i.provider = 'email'
  );
