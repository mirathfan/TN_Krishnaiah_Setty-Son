-- Read-only inventory for an isolated restore of the original bookstore DB.
-- Run with psql against the disposable LOCAL recovery database only:
--   psql "$RECOVERY_DATABASE_URL" -X -f supabase/recovery/inventory-restored-database.sql \
--     > recovery-inventory.txt
-- Never point RECOVERY_DATABASE_URL at the original hosted project.

\set ON_ERROR_STOP on
\pset pager off
\timing on

begin transaction read only;

select
  current_database() as database_name,
  current_user as database_user,
  current_setting('server_version') as postgres_version,
  pg_is_in_recovery() as postgres_is_in_recovery,
  pg_catalog.now() as inventoried_at;

select extname, extversion, nspname as schema_name
from pg_extension
join pg_namespace on pg_namespace.oid = pg_extension.extnamespace
order by extname;

select nspname as schema_name
from pg_namespace
where nspname !~ '^pg_' and nspname <> 'information_schema'
order by nspname;

select schemaname, tablename, tableowner, rowsecurity
from pg_tables
where schemaname in ('public', 'auth', 'storage', 'private', 'realtime', 'cron', 'vault')
order by schemaname, tablename;

select
  table_schema,
  table_name,
  ordinal_position,
  column_name,
  data_type,
  udt_name,
  is_nullable,
  column_default
from information_schema.columns
where table_schema in ('public', 'auth', 'storage', 'private')
order by table_schema, table_name, ordinal_position;

select
  namespace.nspname as schema_name,
  relation.relname as table_name,
  constraint_record.conname as constraint_name,
  constraint_record.contype as constraint_type,
  pg_get_constraintdef(constraint_record.oid, true) as definition
from pg_constraint as constraint_record
join pg_class as relation on relation.oid = constraint_record.conrelid
join pg_namespace as namespace on namespace.oid = relation.relnamespace
where namespace.nspname in ('public', 'auth', 'storage', 'private')
order by namespace.nspname, relation.relname, constraint_record.conname;

select schemaname, tablename, indexname, indexdef
from pg_indexes
where schemaname in ('public', 'auth', 'storage', 'private')
order by schemaname, tablename, indexname;

select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname in ('public', 'storage')
order by schemaname, tablename, policyname;

select grantee, table_schema, table_name, privilege_type
from information_schema.role_table_grants
where table_schema in ('public', 'storage', 'private')
  and grantee in ('anon', 'authenticated', 'service_role', 'PUBLIC')
order by table_schema, table_name, grantee, privilege_type;

select
  routine_schema,
  routine_name,
  routine_type,
  data_type,
  security_type
from information_schema.routines
where routine_schema in ('public', 'private')
order by routine_schema, routine_name, specific_name;

select
  event_object_schema,
  event_object_table,
  trigger_name,
  action_timing,
  event_manipulation,
  action_statement
from information_schema.triggers
where event_object_schema in ('public', 'auth', 'storage')
order by event_object_schema, event_object_table, trigger_name, event_manipulation;

select schemaname, sequencename, sequenceowner, data_type, start_value, increment_by
from pg_sequences
where schemaname in ('public', 'private')
order by schemaname, sequencename;

select pubname, puballtables, pubinsert, pubupdate, pubdelete, pubtruncate
from pg_publication
order by pubname;

select publication.pubname, namespace.nspname as schema_name, relation.relname as table_name
from pg_publication_rel as publication_relation
join pg_publication as publication on publication.oid = publication_relation.prpubid
join pg_class as relation on relation.oid = publication_relation.prrelid
join pg_namespace as namespace on namespace.oid = relation.relnamespace
order by publication.pubname, namespace.nspname, relation.relname;

select subname, subenabled, subslotname, subpublications
from pg_subscription
order by subname;

select evtname, evtevent, evtenabled, evtfoid::regprocedure as function_name
from pg_event_trigger
order by evtname;

-- Application table counts only. No customer PII is printed.
select format(
  'select %L as table_name, count(*) as row_count from %I.%I;',
  table_name,
  table_schema,
  table_name
)
from information_schema.tables
where table_schema = 'public'
  and table_name = any (array[
    'categories', 'products', 'orders', 'order_items',
    'customer_reviews', 'reviews', 'coupons', 'admin_users'
  ])
order by table_name
\gexec

-- Stable identifiers and business keys needed for reconciliation. Customer
-- names, addresses, phones, email addresses, and notes are intentionally absent.
select 'select id, slug, name, is_active from public.categories order by id;'
where to_regclass('public.categories') is not null
\gexec

select 'select id, slug, sku, title, category_id, category, is_active, stock_status, stock_quantity, cover_image_url, gallery_images from public.products order by id;'
where to_regclass('public.products') is not null
\gexec

select 'select id, order_number, payment_status, order_status, created_at, updated_at from public.orders order by id;'
where to_regclass('public.orders') is not null
\gexec

select 'select id, order_id, product_id, sku_snapshot, quantity, created_at from public.order_items order by id;'
where to_regclass('public.order_items') is not null
\gexec

-- Auth configuration itself is a hosted control-plane setting and must be
-- recorded manually. These counts help reconcile the restored Auth data
-- without printing emails, phone numbers, tokens, identities, or metadata.
select 'select count(*) as auth_user_count, count(*) filter (where email_confirmed_at is not null) as confirmed_email_count, count(*) filter (where banned_until > now()) as currently_banned_count from auth.users;'
where to_regclass('auth.users') is not null
\gexec

select 'select provider, count(*) as identity_count from auth.identities group by provider order by provider;'
where to_regclass('auth.identities') is not null
\gexec

-- Database backups contain Storage metadata but not the object bytes. This
-- manifest is safe to compare with a separately exported object inventory.
select 'select id, name, public, file_size_limit, allowed_mime_types, created_at, updated_at from storage.buckets order by id;'
where to_regclass('storage.buckets') is not null
\gexec

select 'select bucket_id, count(*) as object_count, coalesce(sum((metadata ->> ''size'')::bigint), 0) as recorded_bytes from storage.objects group by bucket_id order by bucket_id;'
where to_regclass('storage.objects') is not null
\gexec

select 'select bucket_id, id, name, owner_id, metadata ->> ''mimetype'' as mime_type, metadata ->> ''size'' as recorded_size, created_at, updated_at from storage.objects order by bucket_id, name;'
where to_regclass('storage.objects') is not null
\gexec

select 'select * from supabase_migrations.schema_migrations order by version;'
where to_regclass('supabase_migrations.schema_migrations') is not null
\gexec

select 'select jobid, schedule, command, database, username, active from cron.job order by jobid;'
where to_regclass('cron.job') is not null
\gexec

rollback;
