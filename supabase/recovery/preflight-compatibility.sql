-- Fail-safe, read-only compatibility report for an isolated recovered database.
-- Review every non-empty result before writing a bespoke bridge migration.

\set ON_ERROR_STOP on
\pset pager off

begin transaction read only;

with expected(table_name) as (
  values ('categories'), ('products'), ('orders'), ('order_items'),
         ('customer_reviews'), ('coupons')
)
select expected.table_name as missing_required_table
from expected
where to_regclass(format('public.%I', expected.table_name)) is null
order by expected.table_name;

with expected(table_name, column_name, data_type) as (
  values
    ('categories', 'id', 'uuid'),
    ('categories', 'slug', 'text'),
    ('products', 'id', 'uuid'),
    ('products', 'slug', 'text'),
    ('products', 'price', 'numeric'),
    ('products', 'stock_quantity', 'integer'),
    ('orders', 'id', 'uuid'),
    ('orders', 'order_number', 'text'),
    ('order_items', 'id', 'uuid'),
    ('order_items', 'order_id', 'uuid'),
    ('order_items', 'product_id', 'uuid'),
    ('coupons', 'code', 'text')
)
select
  expected.table_name,
  expected.column_name,
  expected.data_type as expected_type,
  columns.data_type as recovered_type,
  case when columns.column_name is null then 'missing' else 'type mismatch' end as conflict
from expected
left join information_schema.columns as columns
  on columns.table_schema = 'public'
 and columns.table_name = expected.table_name
 and columns.column_name = expected.column_name
where columns.column_name is null or columns.data_type <> expected.data_type
order by expected.table_name, expected.column_name;

-- Generate only queries whose target relation exists.
select 'select ''categories.slug'' as conflict, slug as value, count(*) from public.categories group by slug having count(*) > 1;'
where to_regclass('public.categories') is not null
\gexec
select 'select ''products.slug'' as conflict, slug as value, count(*) from public.products group by slug having count(*) > 1;'
where to_regclass('public.products') is not null
\gexec
select 'select ''products.sku'' as conflict, sku as value, count(*) from public.products where sku is not null group by sku having count(*) > 1;'
where to_regclass('public.products') is not null
\gexec
select 'select ''orders.order_number'' as conflict, order_number as value, count(*) from public.orders group by order_number having count(*) > 1;'
where to_regclass('public.orders') is not null
\gexec
select 'select ''coupons.code_case_insensitive'' as conflict, upper(code) as value, count(*) from public.coupons group by upper(code) having count(*) > 1;'
where to_regclass('public.coupons') is not null
\gexec

select 'select id, slug, price, mrp, stock_quantity, rating from public.products where price < 0 or (mrp is not null and mrp < 0) or stock_quantity < 0 or rating < 0 or rating > 5 order by id;'
where to_regclass('public.products') is not null
\gexec
select 'select id, order_number, subtotal, shipping_fee, discount, total from public.orders where subtotal < 0 or shipping_fee < 0 or discount < 0 or total < 0 order by id;'
where to_regclass('public.orders') is not null
\gexec
select 'select id, order_id, product_id, quantity, price_snapshot, line_total from public.order_items where quantity <= 0 or price_snapshot < 0 or line_total < 0 order by id;'
where to_regclass('public.order_items') is not null
\gexec

select 'select item.id, item.order_id from public.order_items item left join public.orders parent on parent.id = item.order_id where parent.id is null order by item.id;'
where to_regclass('public.order_items') is not null and to_regclass('public.orders') is not null
\gexec
select 'select item.id, item.product_id from public.order_items item left join public.products parent on parent.id = item.product_id where item.product_id is not null and parent.id is null order by item.id;'
where to_regclass('public.order_items') is not null and to_regclass('public.products') is not null
\gexec
select 'select product.id, product.category_id from public.products product left join public.categories parent on parent.id = product.category_id where product.category_id is not null and parent.id is null order by product.id;'
where to_regclass('public.products') is not null and to_regclass('public.categories') is not null
\gexec

select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where (schemaname = 'public' and tablename = any (array[
  'admin_users', 'categories', 'products', 'orders', 'order_items',
  'customer_reviews', 'reviews', 'coupons'
])) or (schemaname = 'storage' and tablename = 'objects')
order by schemaname, tablename, policyname;

select
  function_record.oid::regprocedure as conflicting_function,
  pg_get_userbyid(function_record.proowner) as owner,
  function_record.prosecdef as security_definer,
  function_record.proconfig as function_settings
from pg_proc as function_record
join pg_namespace as namespace on namespace.oid = function_record.pronamespace
where namespace.nspname in ('public', 'private')
  and function_record.proname = any (array[
    'create_checkout_order', 'consume_checkout_rate_limit',
    'confirm_order_inventory', 'update_updated_at_column'
  ])
order by function_record.oid::regprocedure::text;

select
  event_object_schema,
  event_object_table,
  trigger_name,
  action_timing,
  event_manipulation,
  action_statement
from information_schema.triggers
where event_object_schema in ('public', 'auth', 'storage')
order by event_object_schema, event_object_table, trigger_name;

select extname as external_or_background_extension
from pg_extension
where extname = any (array[
  'pg_cron', 'pg_net', 'http', 'supabase_vault', 'wrappers', 'postgres_fdw'
])
order by extname;

select publication.pubname, namespace.nspname as schema_name, relation.relname as table_name
from pg_publication_rel as publication_relation
join pg_publication as publication on publication.oid = publication_relation.prpubid
join pg_class as relation on relation.oid = publication_relation.prrelid
join pg_namespace as namespace on namespace.oid = relation.relnamespace
where namespace.nspname = 'public'
order by publication.pubname, relation.relname;

select 'select jobid, schedule, command, database, username, active from cron.job order by jobid;'
where to_regclass('cron.job') is not null
\gexec

select id, name, public, file_size_limit, allowed_mime_types
from storage.buckets
where id = 'product-images';

select bucket_id, count(*) as object_count
from storage.objects
where bucket_id = 'product-images'
group by bucket_id;

rollback;
