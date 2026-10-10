-- Phase 2B secure order-request boundary.
--
-- This migration is additive and data-safe. It does not seed, delete, or
-- rewrite existing catalog/order rows. Apply it only after the Phase 2A
-- migrations have been reviewed on a disposable clone of a recovered backend.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;

alter table public.orders
  add column if not exists idempotency_key uuid,
  add column if not exists request_fingerprint text,
  add column if not exists coupon_code text,
  add column if not exists inventory_committed_at timestamptz;

create unique index if not exists orders_idempotency_key_idx
  on public.orders(idempotency_key)
  where idempotency_key is not null;

create sequence if not exists private.checkout_order_number_seq;
revoke all on sequence private.checkout_order_number_seq from public, anon, authenticated;
grant usage, select on sequence private.checkout_order_number_seq to service_role;

create table if not exists private.checkout_rate_limits (
  client_hash text primary key,
  window_started_at timestamptz not null,
  request_count integer not null,
  constraint checkout_rate_limits_hash_length check (char_length(client_hash) = 64),
  constraint checkout_rate_limits_request_count_positive check (request_count > 0)
);

revoke all on table private.checkout_rate_limits from public, anon, authenticated;
grant select, insert, update, delete on table private.checkout_rate_limits to service_role;

comment on table private.checkout_rate_limits is
  'Short-lived checkout abuse counters keyed only by a salted SHA-256 client hash; never stores contact data or raw IP addresses.';
comment on column public.orders.idempotency_key is
  'Caller-generated UUID used to make secure checkout retries return one order.';
comment on column public.orders.request_fingerprint is
  'SHA-256 of the validated checkout request; detects reuse of an idempotency key with different input.';
comment on column public.orders.inventory_committed_at is
  'Set only by the trusted confirmation operation when stock is permanently deducted.';

create or replace function public.consume_checkout_rate_limit(
  p_client_hash text,
  p_limit integer default 5,
  p_window_seconds integer default 60
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  rate_row private.checkout_rate_limits%rowtype;
  rate_now timestamptz := pg_catalog.clock_timestamp();
  window_interval interval;
begin
  if p_client_hash is null
     or p_client_hash !~ '^[0-9a-f]{64}$'
     or p_limit < 1 or p_limit > 100
     or p_window_seconds < 1 or p_window_seconds > 3600 then
    raise exception using message = 'CHECKOUT_INVALID_RATE_LIMIT';
  end if;

  window_interval := pg_catalog.make_interval(secs => p_window_seconds);

  insert into private.checkout_rate_limits as limits (
    client_hash,
    window_started_at,
    request_count
  )
  values (p_client_hash, rate_now, 1)
  on conflict (client_hash) do update
  set window_started_at = case
        when limits.window_started_at + window_interval <= rate_now then rate_now
        else limits.window_started_at
      end,
      request_count = case
        when limits.window_started_at + window_interval <= rate_now then 1
        else limits.request_count + 1
      end
  returning * into rate_row;

  return pg_catalog.jsonb_build_object(
    'allowed', rate_row.request_count <= p_limit,
    'remaining', greatest(p_limit - rate_row.request_count, 0),
    'retry_after_seconds', greatest(
      pg_catalog.ceil(extract(epoch from (
        rate_row.window_started_at + window_interval - rate_now
      )))::integer,
      0
    )
  );
end;
$$;

revoke all on function public.consume_checkout_rate_limit(text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_checkout_rate_limit(text, integer, integer)
  to service_role;

create or replace function public.create_checkout_order(
  p_payload jsonb,
  p_idempotency_key uuid,
  p_request_fingerprint text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  customer_data jsonb;
  item_data jsonb;
  product_row public.products%rowtype;
  coupon_row public.coupons%rowtype;
  existing_order public.orders%rowtype;
  created_order public.orders%rowtype;
  normalized_items jsonb := '[]'::jsonb;
  normalized_coupon text;
  payment_preference text;
  customer_name text;
  customer_phone text;
  customer_email text;
  customer_address text;
  customer_city text;
  customer_state text;
  customer_pincode text;
  customer_notes text;
  requested_quantity integer;
  requested_product_id uuid;
  item_count integer;
  total_units integer;
  subtotal_amount numeric(10, 2) := 0;
  shipping_amount numeric(10, 2) := 0;
  discount_amount numeric(10, 2) := 0;
  total_amount numeric(10, 2) := 0;
  response_items jsonb;
begin
  perform pg_catalog.set_config('lock_timeout', '5s', true);
  perform pg_catalog.set_config('statement_timeout', '10s', true);

  if p_payload is null
     or pg_catalog.jsonb_typeof(p_payload) <> 'object'
     or p_idempotency_key is null
     or p_request_fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception using message = 'CHECKOUT_INVALID_INPUT';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_object_keys(p_payload) as payload_key(key)
    where payload_key.key not in ('customer', 'items', 'payment_method', 'coupon_code')
  ) then
    raise exception using message = 'CHECKOUT_INVALID_INPUT';
  end if;

  -- One transaction-scoped lock serializes concurrent retries for this key.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_idempotency_key::text, 20261010)
  );

  select * into existing_order
  from public.orders
  where idempotency_key = p_idempotency_key;

  if found then
    if existing_order.request_fingerprint is distinct from p_request_fingerprint then
      raise exception using message = 'CHECKOUT_IDEMPOTENCY_CONFLICT';
    end if;

    select coalesce(
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'product_id', order_line.product_id,
          'title', order_line.title_snapshot,
          'sku', order_line.sku_snapshot,
          'price', order_line.price_snapshot,
          'quantity', order_line.quantity,
          'line_total', order_line.line_total
        ) order by order_line.created_at, order_line.id
      ),
      '[]'::jsonb
    ) into response_items
    from public.order_items as order_line
    where order_line.order_id = existing_order.id;

    return pg_catalog.jsonb_build_object(
      'id', existing_order.id,
      'order_number', existing_order.order_number,
      'subtotal', existing_order.subtotal,
      'shipping_fee', existing_order.shipping_fee,
      'discount', existing_order.discount,
      'total', existing_order.total,
      'payment_method', existing_order.payment_method,
      'payment_status', existing_order.payment_status,
      'order_status', existing_order.order_status,
      'created_at', existing_order.created_at,
      'items', response_items,
      'duplicate', true
    );
  end if;

  customer_data := p_payload -> 'customer';
  if pg_catalog.jsonb_typeof(customer_data) <> 'object'
     or exists (
       select 1
       from pg_catalog.jsonb_object_keys(customer_data) as customer_key(key)
       where customer_key.key not in ('full_name', 'phone', 'email', 'address', 'city', 'state', 'pincode', 'notes')
     ) then
    raise exception using message = 'CHECKOUT_INVALID_CUSTOMER';
  end if;

  customer_name := pg_catalog.btrim(customer_data ->> 'full_name');
  customer_phone := pg_catalog.btrim(customer_data ->> 'phone');
  customer_email := nullif(pg_catalog.btrim(customer_data ->> 'email'), '');
  customer_address := pg_catalog.btrim(customer_data ->> 'address');
  customer_city := pg_catalog.btrim(customer_data ->> 'city');
  customer_state := nullif(pg_catalog.btrim(customer_data ->> 'state'), '');
  customer_pincode := pg_catalog.btrim(customer_data ->> 'pincode');
  customer_notes := nullif(pg_catalog.btrim(customer_data ->> 'notes'), '');

  if pg_catalog.char_length(customer_name) not between 2 and 160
     or pg_catalog.char_length(customer_phone) not between 8 and 24
     or customer_phone !~ '^[0-9+() -]+$'
     or (customer_email is not null and (
       pg_catalog.char_length(customer_email) > 254
       or customer_email !~* '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
     ))
     or pg_catalog.char_length(customer_address) not between 5 and 1000
     or pg_catalog.char_length(customer_city) not between 2 and 120
     or (customer_state is not null and pg_catalog.char_length(customer_state) > 120)
     or pg_catalog.char_length(customer_pincode) not between 4 and 20
     or customer_pincode !~ '^[0-9A-Za-z -]+$'
     or (customer_notes is not null and pg_catalog.char_length(customer_notes) > 1000) then
    raise exception using message = 'CHECKOUT_INVALID_CUSTOMER';
  end if;

  payment_preference := pg_catalog.btrim(p_payload ->> 'payment_method');
  if payment_preference not in ('upi', 'online', 'cod', 'whatsapp') then
    raise exception using message = 'CHECKOUT_INVALID_PAYMENT_METHOD';
  end if;

  if pg_catalog.jsonb_typeof(p_payload -> 'items') <> 'array' then
    raise exception using message = 'CHECKOUT_INVALID_ITEMS';
  end if;

  item_count := pg_catalog.jsonb_array_length(p_payload -> 'items');
  if item_count < 1 or item_count > 20 then
    raise exception using message = 'CHECKOUT_INVALID_ITEMS';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_payload -> 'items') as raw_item(value)
    where pg_catalog.jsonb_typeof(raw_item.value) <> 'object'
       or exists (
         select 1
         from pg_catalog.jsonb_object_keys(raw_item.value) as item_key(key)
         where item_key.key not in ('product_id', 'quantity')
       )
       or (raw_item.value ->> 'product_id') is null
       or (raw_item.value ->> 'quantity') !~ '^[0-9]+$'
  ) then
    raise exception using message = 'CHECKOUT_INVALID_ITEMS';
  end if;

  if (
    select pg_catalog.count(*)
    from (
      select raw_item.value ->> 'product_id'
      from pg_catalog.jsonb_array_elements(p_payload -> 'items') as raw_item(value)
      group by raw_item.value ->> 'product_id'
    ) as distinct_items
  ) <> item_count then
    raise exception using message = 'CHECKOUT_DUPLICATE_PRODUCT';
  end if;

  select pg_catalog.sum((raw_item.value ->> 'quantity')::integer)
  into total_units
  from pg_catalog.jsonb_array_elements(p_payload -> 'items') as raw_item(value);

  if total_units < 1 or total_units > 100 then
    raise exception using message = 'CHECKOUT_INVALID_ITEMS';
  end if;

  -- Product rows are locked in a deterministic order. The same order is used
  -- by inventory confirmation, preventing deadlocks and inconsistent totals.
  for item_data in
    select raw_item.value
    from pg_catalog.jsonb_array_elements(p_payload -> 'items') as raw_item(value)
    order by raw_item.value ->> 'product_id'
  loop
    begin
      requested_product_id := (item_data ->> 'product_id')::uuid;
      requested_quantity := (item_data ->> 'quantity')::integer;
    exception when invalid_text_representation or numeric_value_out_of_range then
      raise exception using message = 'CHECKOUT_INVALID_ITEMS';
    end;

    if requested_quantity < 1 or requested_quantity > 99 then
      raise exception using message = 'CHECKOUT_INVALID_ITEMS';
    end if;

    select * into product_row
    from public.products
    where id = requested_product_id
    for share;

    if not found or product_row.is_active is not true then
      raise exception using message = 'CHECKOUT_PRODUCT_UNAVAILABLE';
    end if;

    if product_row.stock_status = 'out_of_stock'
       or product_row.stock_quantity < requested_quantity then
      raise exception using message = 'CHECKOUT_OUT_OF_STOCK';
    end if;

    subtotal_amount := subtotal_amount + pg_catalog.round(product_row.price * requested_quantity, 2);
    normalized_items := normalized_items || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'product_id', product_row.id,
        'title', product_row.title,
        'sku', product_row.sku,
        'price', product_row.price,
        'quantity', requested_quantity,
        'line_total', pg_catalog.round(product_row.price * requested_quantity, 2)
      )
    );
  end loop;

  subtotal_amount := pg_catalog.round(subtotal_amount, 2);
  shipping_amount := case when subtotal_amount >= 500 then 0 else 60 end;
  normalized_coupon := nullif(pg_catalog.upper(pg_catalog.btrim(p_payload ->> 'coupon_code')), '');

  if normalized_coupon is not null then
    select * into coupon_row
    from public.coupons
    where pg_catalog.upper(code) = normalized_coupon
    for share;

    if not found
       or coupon_row.is_active is not true
       or (coupon_row.starts_at is not null and coupon_row.starts_at > pg_catalog.now())
       or (coupon_row.expires_at is not null and coupon_row.expires_at <= pg_catalog.now())
       or subtotal_amount < coupon_row.min_order_amount then
      raise exception using message = 'CHECKOUT_INVALID_COUPON';
    end if;

    discount_amount := case coupon_row.discount_type
      when 'percentage' then pg_catalog.round(subtotal_amount * coupon_row.discount_value / 100, 2)
      when 'fixed' then pg_catalog.round(coupon_row.discount_value, 2)
      else 0
    end;
    if coupon_row.max_discount is not null then
      discount_amount := least(discount_amount, coupon_row.max_discount);
    end if;
    discount_amount := least(greatest(discount_amount, 0), subtotal_amount);
  end if;

  total_amount := pg_catalog.round(subtotal_amount + shipping_amount - discount_amount, 2);

  insert into public.orders (
    id,
    order_number,
    customer_name,
    customer_phone,
    customer_email,
    delivery_address,
    city,
    state,
    pincode,
    notes,
    subtotal,
    shipping_fee,
    discount,
    total,
    payment_method,
    payment_status,
    order_status,
    idempotency_key,
    request_fingerprint,
    coupon_code
  )
  values (
    extensions.gen_random_uuid(),
    'TNK-' || pg_catalog.to_char(pg_catalog.now(), 'YYYY') || '-' ||
      pg_catalog.lpad(pg_catalog.nextval('private.checkout_order_number_seq'::regclass)::text, 10, '0'),
    customer_name,
    customer_phone,
    customer_email,
    customer_address,
    customer_city,
    customer_state,
    customer_pincode,
    customer_notes,
    subtotal_amount,
    shipping_amount,
    discount_amount,
    total_amount,
    payment_preference,
    'pending',
    'pending_confirmation',
    p_idempotency_key,
    p_request_fingerprint,
    normalized_coupon
  )
  returning * into created_order;

  insert into public.order_items (
    order_id,
    product_id,
    title_snapshot,
    sku_snapshot,
    price_snapshot,
    quantity,
    line_total
  )
  select
    created_order.id,
    (normalized_item.value ->> 'product_id')::uuid,
    normalized_item.value ->> 'title',
    nullif(normalized_item.value ->> 'sku', ''),
    (normalized_item.value ->> 'price')::numeric,
    (normalized_item.value ->> 'quantity')::integer,
    (normalized_item.value ->> 'line_total')::numeric
  from pg_catalog.jsonb_array_elements(normalized_items) as normalized_item(value);

  return pg_catalog.jsonb_build_object(
    'id', created_order.id,
    'order_number', created_order.order_number,
    'subtotal', created_order.subtotal,
    'shipping_fee', created_order.shipping_fee,
    'discount', created_order.discount,
    'total', created_order.total,
    'payment_method', created_order.payment_method,
    'payment_status', created_order.payment_status,
    'order_status', created_order.order_status,
    'created_at', created_order.created_at,
    'items', normalized_items,
    'duplicate', false
  );
end;
$$;

revoke all on function public.create_checkout_order(jsonb, uuid, text)
  from public, anon, authenticated;
grant execute on function public.create_checkout_order(jsonb, uuid, text)
  to service_role;

create or replace function public.confirm_order_inventory(p_order_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  order_row public.orders%rowtype;
  order_line public.order_items%rowtype;
  product_row public.products%rowtype;
begin
  perform pg_catalog.set_config('lock_timeout', '5s', true);
  perform pg_catalog.set_config('statement_timeout', '10s', true);

  select * into order_row
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception using message = 'CHECKOUT_ORDER_NOT_FOUND';
  end if;

  if order_row.inventory_committed_at is not null then
    return pg_catalog.jsonb_build_object(
      'order_id', order_row.id,
      'order_number', order_row.order_number,
      'inventory_committed_at', order_row.inventory_committed_at,
      'duplicate', true
    );
  end if;

  if order_row.order_status in ('cancelled', 'rejected') then
    raise exception using message = 'CHECKOUT_ORDER_NOT_CONFIRMABLE';
  end if;

  if not exists (
    select 1 from public.order_items where order_id = order_row.id
  ) then
    raise exception using message = 'CHECKOUT_INVALID_ITEMS';
  end if;

  for order_line in
    select line.*
    from public.order_items as line
    where line.order_id = order_row.id
    order by line.product_id
  loop
    if order_line.product_id is null then
      raise exception using message = 'CHECKOUT_PRODUCT_UNAVAILABLE';
    end if;

    select * into product_row
    from public.products
    where id = order_line.product_id
    for update;

    if not found or product_row.is_active is not true then
      raise exception using message = 'CHECKOUT_PRODUCT_UNAVAILABLE';
    end if;

    if product_row.stock_quantity < order_line.quantity then
      raise exception using message = 'CHECKOUT_OUT_OF_STOCK';
    end if;
  end loop;

  update public.products as product
  set stock_quantity = product.stock_quantity - line.quantity,
      stock_status = case
        when product.stock_quantity - line.quantity <= 0 then 'out_of_stock'
        else product.stock_status
      end
  from public.order_items as line
  where line.order_id = order_row.id
    and line.product_id = product.id;

  update public.orders
  set inventory_committed_at = pg_catalog.now(),
      order_status = 'confirmed'
  where id = order_row.id
  returning * into order_row;

  return pg_catalog.jsonb_build_object(
    'order_id', order_row.id,
    'order_number', order_row.order_number,
    'inventory_committed_at', order_row.inventory_committed_at,
    'duplicate', false
  );
end;
$$;

revoke all on function public.confirm_order_inventory(uuid)
  from public, anon, authenticated;
grant execute on function public.confirm_order_inventory(uuid)
  to service_role;

comment on function public.create_checkout_order(jsonb, uuid, text) is
  'Service-role-only atomic order request. Reprices products, validates stock/coupons, and does not deduct inventory.';
comment on function public.confirm_order_inventory(uuid) is
  'Service-role-only final stock commitment for a manually confirmed order; locks product rows before decrementing.';
