begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select plan(17);

select has_column('public', 'orders', 'idempotency_key', 'orders have an additive idempotency key');
select has_column('public', 'orders', 'request_fingerprint', 'orders retain a request fingerprint');
select has_column('public', 'orders', 'inventory_committed_at', 'orders record trusted inventory commitment');
select has_table('private', 'checkout_rate_limits', 'rate-limit state is outside the exposed public schema');

select ok(
  not has_schema_privilege('anon', 'private', 'usage'),
  'anonymous clients cannot use the private schema'
);
select ok(
  not has_table_privilege('anon', 'private.checkout_rate_limits', 'select,insert,update,delete'),
  'anonymous clients cannot access rate-limit state'
);

select ok(
  not has_function_privilege('anon', 'public.create_checkout_order(jsonb,uuid,text)', 'execute'),
  'anonymous clients cannot execute transactional checkout directly'
);
select ok(
  not has_function_privilege('authenticated', 'public.create_checkout_order(jsonb,uuid,text)', 'execute'),
  'ordinary authenticated clients cannot execute transactional checkout directly'
);
select ok(
  has_function_privilege('service_role', 'public.create_checkout_order(jsonb,uuid,text)', 'execute'),
  'only the trusted service role can execute transactional checkout'
);
select ok(
  not has_function_privilege('anon', 'public.confirm_order_inventory(uuid)', 'execute'),
  'anonymous clients cannot commit inventory'
);
select ok(
  not has_function_privilege('authenticated', 'public.confirm_order_inventory(uuid)', 'execute'),
  'ordinary authenticated clients cannot commit inventory'
);
select ok(
  has_function_privilege('service_role', 'public.confirm_order_inventory(uuid)', 'execute'),
  'only the trusted service role can commit inventory'
);

select ok(
  exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and indexname = 'orders_idempotency_key_idx'
      and indexdef ilike '%unique%'
  ),
  'idempotency is protected by a unique database index'
);

select ok(
  exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and indexname = 'coupons_code_upper_idx'
      and indexdef ilike '%unique%'
  ),
  'coupon codes are unique under checkout case normalization'
);

insert into public.products (
  id, slug, title, sku, price, stock_status, stock_quantity, is_active
) values (
  '10000000-0000-4000-8000-000000000001',
  'phase2b-rollback-book',
  'Phase 2B rollback book',
  'P2B-ROLLBACK',
  250,
  'in_stock',
  5,
  true
);

create function public.phase2b_force_line_failure()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using message = 'PHASE2B_FORCED_FAILURE';
end;
$$;

create trigger phase2b_force_line_failure
before insert on public.order_items
for each row execute function public.phase2b_force_line_failure();

select throws_ok(
  $$
    select public.create_checkout_order(
      '{
        "customer": {
          "full_name": "Rollback Test",
          "phone": "+91 9880226598",
          "email": "rollback@example.test",
          "address": "234 Chickpet Main Road",
          "city": "Bangalore",
          "state": "Karnataka",
          "pincode": "560053",
          "notes": "Local rollback test"
        },
        "items": [{"product_id": "10000000-0000-4000-8000-000000000001", "quantity": 1}],
        "payment_method": "upi",
        "coupon_code": ""
      }'::jsonb,
      '20000000-0000-4000-8000-000000000001'::uuid,
      repeat('a', 64)
    )
  $$,
  'P0001',
  'PHASE2B_FORCED_FAILURE',
  'a line-item failure aborts the checkout transaction'
);

select is(
  (
    select count(*)::integer
    from public.orders
    where idempotency_key = '20000000-0000-4000-8000-000000000001'::uuid
  ),
  0,
  'the order row is rolled back when a line-item write fails'
);

drop trigger phase2b_force_line_failure on public.order_items;
drop function public.phase2b_force_line_failure();

select is(
  (
    select count(*)::integer
    from public.order_items
    where product_id = '10000000-0000-4000-8000-000000000001'::uuid
  ),
  0,
  'no orphan line item survives a failed checkout'
);

select * from finish();
rollback;
