begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select plan(32);

select has_table('public', 'admin_users', 'admin_users allowlist exists');

select ok(
  (
    select count(*) = 7 and bool_and(c.relrowsecurity)
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = any (array[
        'admin_users', 'categories', 'products', 'orders', 'order_items',
        'customer_reviews', 'coupons'
      ])
  ),
  'RLS is enabled on every application table'
);

select ok(
  (
    select count(*) = 7 and bool_and(c.relforcerowsecurity)
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = any (array[
        'admin_users', 'categories', 'products', 'orders', 'order_items',
        'customer_reviews', 'coupons'
      ])
  ),
  'RLS is forced on every application table'
);

select ok(has_table_privilege('authenticated', 'public.admin_users', 'select'), 'authenticated can verify own allowlist membership');
select ok(not has_table_privilege('authenticated', 'public.admin_users', 'insert'), 'authenticated cannot insert allowlist rows');
select ok(not has_table_privilege('authenticated', 'public.admin_users', 'update'), 'authenticated cannot update allowlist rows');
select ok(not has_table_privilege('authenticated', 'public.admin_users', 'delete'), 'authenticated cannot delete allowlist rows');

select ok(has_table_privilege('anon', 'public.categories', 'select'), 'anonymous users can read public categories');
select ok(has_table_privilege('anon', 'public.products', 'select'), 'anonymous users can read public products');
select ok(has_table_privilege('anon', 'public.customer_reviews', 'select'), 'anonymous users can read approved reviews');

select ok(not has_table_privilege('anon', 'public.orders', 'select'), 'anonymous users cannot read orders');
select ok(not has_table_privilege('anon', 'public.orders', 'insert'), 'anonymous users cannot create orders');
select ok(not has_table_privilege('anon', 'public.orders', 'update'), 'anonymous users cannot update orders');
select ok(not has_table_privilege('anon', 'public.orders', 'delete'), 'anonymous users cannot delete orders');
select ok(not has_table_privilege('anon', 'public.order_items', 'select'), 'anonymous users cannot read order items');
select ok(not has_table_privilege('anon', 'public.order_items', 'insert'), 'anonymous users cannot create order items');
select ok(not has_table_privilege('anon', 'public.order_items', 'update'), 'anonymous users cannot update order items');
select ok(not has_table_privilege('anon', 'public.order_items', 'delete'), 'anonymous users cannot delete order items');
select ok(not has_table_privilege('anon', 'public.coupons', 'select'), 'anonymous users cannot read coupons');

select ok(has_table_privilege('authenticated', 'public.categories', 'insert'), 'authenticated role has category DML grant constrained by RLS');
select ok(has_table_privilege('authenticated', 'public.products', 'update'), 'authenticated role has product DML grant constrained by RLS');
select ok(has_table_privilege('authenticated', 'public.customer_reviews', 'delete'), 'authenticated role has review DML grant constrained by RLS');
select ok(
  has_table_privilege('authenticated', 'public.orders', 'select,insert,update,delete'),
  'authenticated role has order DML grants constrained by RLS'
);
select ok(
  has_table_privilege('authenticated', 'public.order_items', 'select,insert,update,delete'),
  'authenticated role has order-item DML grants constrained by RLS'
);
select ok(
  has_table_privilege('authenticated', 'public.coupons', 'select,insert,update,delete'),
  'authenticated role has coupon DML grants constrained by RLS'
);

select is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname = 'public'
      and tablename = any (array['orders', 'order_items'])
      and roles && array['anon']::name[]
  ),
  0,
  'orders and order items have no anonymous policies'
);

select is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname = 'public'
      and policyname like 'Authorized admins can manage %'
  ),
  6,
  'all six administrative data tables have allowlist policies'
);

select ok(
  (
    select public is true
    from storage.buckets
    where id = 'product-images'
  ),
  'product-images bucket supports public downloads'
);

select is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname like 'Authorized admins can % product images'
  ),
  4,
  'Storage has admin-only select, insert, update, and delete policies'
);

select is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and roles && array['anon']::name[]
  ),
  0,
  'Storage exposes no anonymous object policy'
);

select is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname = 'public'
      and tablename = 'admin_users'
      and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
  ),
  0,
  'admin allowlist has no client write policy'
);

select is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname in ('public', 'storage')
      and (
        coalesce(qual, '') ilike '%auth.role()%'
        or coalesce(with_check, '') ilike '%auth.role()%'
      )
  ),
  0,
  'no policy treats the authenticated role as administrator authorization'
);

select * from finish();
rollback;
