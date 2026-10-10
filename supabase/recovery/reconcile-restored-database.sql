-- Read-only reconciliation snapshot. Run before and after each candidate bridge
-- migration in separate disposable clones, then diff the captured outputs.

\set ON_ERROR_STOP on
\pset pager off

begin transaction read only;

select current_database() as database_name, pg_catalog.now() as captured_at;

select format(
  'select %L as relation, count(*) as row_count from %I.%I;',
  table_schema || '.' || table_name,
  table_schema,
  table_name
)
from information_schema.tables
where (table_schema = 'public' and table_name = any (array[
  'categories', 'products', 'orders', 'order_items',
  'customer_reviews', 'reviews', 'coupons', 'admin_users'
])) or (table_schema = 'storage' and table_name in ('buckets', 'objects'))
order by table_schema, table_name
\gexec

-- Hash only stable identifiers/business keys; exclude customer PII and mutable
-- totals so a diff can prove identity preservation without copying personal data.
select 'select ''categories'' as entity, md5(coalesce(string_agg(concat_ws(''|'', id, slug), E''\n'' order by id), '''')) as identity_digest from public.categories;'
where to_regclass('public.categories') is not null
\gexec
select 'select ''products'' as entity, md5(coalesce(string_agg(concat_ws(''|'', id, slug, coalesce(sku, '''')), E''\n'' order by id), '''')) as identity_digest from public.products;'
where to_regclass('public.products') is not null
\gexec
select 'select ''orders'' as entity, md5(coalesce(string_agg(concat_ws(''|'', id, order_number), E''\n'' order by id), '''')) as identity_digest from public.orders;'
where to_regclass('public.orders') is not null
\gexec
select 'select ''order_items'' as entity, md5(coalesce(string_agg(concat_ws(''|'', id, order_id, coalesce(product_id::text, '''')), E''\n'' order by id), '''')) as identity_digest from public.order_items;'
where to_regclass('public.order_items') is not null
\gexec
select 'select ''storage.objects'' as entity, md5(coalesce(string_agg(concat_ws(''|'', bucket_id, id, name), E''\n'' order by bucket_id, name), '''')) as identity_digest from storage.objects;'
where to_regclass('storage.objects') is not null
\gexec

select 'select count(*) as orphan_order_items from public.order_items item left join public.orders parent on parent.id = item.order_id where parent.id is null;'
where to_regclass('public.order_items') is not null and to_regclass('public.orders') is not null
\gexec
select 'select count(*) as missing_product_references from public.order_items item left join public.products parent on parent.id = item.product_id where item.product_id is not null and parent.id is null;'
where to_regclass('public.order_items') is not null and to_regclass('public.products') is not null
\gexec

select schemaname, tablename, policyname, roles, cmd
from pg_policies
where schemaname in ('public', 'storage')
order by schemaname, tablename, policyname;

rollback;
