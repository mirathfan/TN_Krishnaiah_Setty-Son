-- Phase 2A authorization boundary.
--
-- Authorization is based only on auth.uid() membership in admin_users. The
-- allowlist has no client-side write policy: it must be maintained by a trusted
-- server-side operator using the Supabase dashboard/SQL editor or another
-- service-role-only process. Authentication alone never grants admin access.

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

comment on table public.admin_users is
  'Server-managed allowlist of Supabase Auth users authorized as bookstore administrators.';
comment on column public.admin_users.user_id is
  'Supabase Auth user UUID. Client roles cannot insert, update, or delete this value.';

create index if not exists admin_users_created_by_idx on public.admin_users(created_by);

alter table public.admin_users enable row level security;
alter table public.admin_users force row level security;
alter table public.categories enable row level security;
alter table public.categories force row level security;
alter table public.products enable row level security;
alter table public.products force row level security;
alter table public.orders enable row level security;
alter table public.orders force row level security;
alter table public.order_items enable row level security;
alter table public.order_items force row level security;
alter table public.customer_reviews enable row level security;
alter table public.customer_reviews force row level security;
alter table public.coupons enable row level security;
alter table public.coupons force row level security;

-- Replace every application-table policy so legacy permissive policies cannot
-- survive an upgrade. This changes policy metadata only; no table rows change.
do $policy_cleanup$
declare
  existing_policy record;
begin
  for existing_policy in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = any (array[
        'admin_users',
        'categories',
        'products',
        'orders',
        'order_items',
        'customer_reviews',
        'coupons'
      ])
  loop
    execute format(
      'drop policy %I on %I.%I',
      existing_policy.policyname,
      existing_policy.schemaname,
      existing_policy.tablename
    );
  end loop;
end
$policy_cleanup$;

-- Explicit least-privilege grants. RLS still decides which rows each
-- authenticated request may act on.
revoke all on table public.admin_users from anon, authenticated;
revoke all on table public.categories from anon, authenticated;
revoke all on table public.products from anon, authenticated;
revoke all on table public.orders from anon, authenticated;
revoke all on table public.order_items from anon, authenticated;
revoke all on table public.customer_reviews from anon, authenticated;
revoke all on table public.coupons from anon, authenticated;

grant usage on schema public to anon, authenticated;
grant select on table public.categories, public.products, public.customer_reviews to anon, authenticated;
grant select on table public.admin_users to authenticated;
grant select, insert, update, delete on table
  public.categories,
  public.products,
  public.orders,
  public.order_items,
  public.customer_reviews,
  public.coupons
to authenticated;

-- A signed-in user may only discover their own allowlist membership. There are
-- deliberately no INSERT, UPDATE, or DELETE policies on admin_users.
create policy "Admin users can verify their own membership"
on public.admin_users
for select
to authenticated
using (user_id = (select auth.uid()));

-- Public catalog visibility plus a separate admin path for inactive records.
create policy "Public can read active categories"
on public.categories
for select
to anon, authenticated
using (is_active = true);

create policy "Authorized admins can manage categories"
on public.categories
for all
to authenticated
using (
  exists (
    select 1 from public.admin_users
    where user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.admin_users
    where user_id = (select auth.uid())
  )
);

create policy "Public can read active products"
on public.products
for select
to anon, authenticated
using (is_active = true);

create policy "Authorized admins can manage products"
on public.products
for all
to authenticated
using (
  exists (
    select 1 from public.admin_users
    where user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.admin_users
    where user_id = (select auth.uid())
  )
);

create policy "Public can read approved reviews"
on public.customer_reviews
for select
to anon, authenticated
using (is_approved = true);

create policy "Authorized admins can manage reviews"
on public.customer_reviews
for all
to authenticated
using (
  exists (
    select 1 from public.admin_users
    where user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.admin_users
    where user_id = (select auth.uid())
  )
);

-- Orders, order items, and coupons have no anonymous policies. Checkout remains
-- disabled until Phase 2B supplies a trusted server-side transaction boundary.
create policy "Authorized admins can manage orders"
on public.orders
for all
to authenticated
using (
  exists (
    select 1 from public.admin_users
    where user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.admin_users
    where user_id = (select auth.uid())
  )
);

create policy "Authorized admins can manage order items"
on public.order_items
for all
to authenticated
using (
  exists (
    select 1 from public.admin_users
    where user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.admin_users
    where user_id = (select auth.uid())
  )
);

create policy "Authorized admins can manage coupons"
on public.coupons
for all
to authenticated
using (
  exists (
    select 1 from public.admin_users
    where user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.admin_users
    where user_id = (select auth.uid())
  )
);

-- Product images are downloadable through public bucket URLs. Object listing,
-- upload, replacement, and deletion require allowlisted admin membership.
-- Fail instead of silently changing an existing bucket whose recovered
-- configuration differs. Such a project needs an operator-reviewed bridge
-- migration after its existing objects and MIME types have been inventoried.
do $product_images_bucket_compatibility$
declare
  existing_bucket storage.buckets%rowtype;
begin
  select *
  into existing_bucket
  from storage.buckets
  where id = 'product-images';

  if found and (
    existing_bucket.public is distinct from true
    or existing_bucket.file_size_limit is distinct from 5242880
    or existing_bucket.allowed_mime_types is distinct from
      array['image/jpeg', 'image/png', 'image/webp']::text[]
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'PHASE2A_PRODUCT_IMAGES_BUCKET_REVIEW_REQUIRED',
      hint = 'Inventory the recovered product-images bucket and prepare an operator-reviewed bridge migration.';
  end if;
end
$product_images_bucket_compatibility$;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'product-images',
  'product-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do nothing;

-- Remove only known legacy and current product-image policies. Never erase
-- policies belonging to unrelated recovered buckets. The following guard then
-- refuses to continue if an unknown policy could still expose product-images
-- or grants a broad anon/authenticated Storage rule.
do $storage_policy_cleanup$
declare
  existing_policy record;
begin
  for existing_policy in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = any (array[
        'Public can read product images',
        'Authenticated users can upload product images',
        'Authenticated users can update product images',
        'Authenticated users can delete product images',
        'Authorized admins can list product images',
        'Authorized admins can upload product images',
        'Authorized admins can update product images',
        'Authorized admins can delete product images'
      ])
  loop
    execute format(
      'drop policy %I on %I.%I',
      existing_policy.policyname,
      existing_policy.schemaname,
      existing_policy.tablename
    );
  end loop;
end
$storage_policy_cleanup$;

do $storage_policy_compatibility$
declare
  conflicting_policies text;
begin
  select string_agg(policyname, ', ' order by policyname)
  into conflicting_policies
  from pg_policies
  where schemaname = 'storage'
    and tablename = 'objects'
    and roles && array['public', 'anon', 'authenticated']::name[]
    and (
      coalesce(qual, '') ilike '%product-images%'
      or coalesce(with_check, '') ilike '%product-images%'
      or (
        coalesce(qual, '') not ilike '%bucket_id%'
        and coalesce(with_check, '') not ilike '%bucket_id%'
      )
    );

  if conflicting_policies is not null then
    raise exception using
      errcode = 'P0001',
      message = 'PHASE2A_STORAGE_POLICY_REVIEW_REQUIRED',
      detail = conflicting_policies,
      hint = 'Review and replace only the conflicting recovered Storage policies before retrying.';
  end if;
end
$storage_policy_compatibility$;

create policy "Authorized admins can list product images"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'product-images'
  and (storage.foldername(name))[1] = 'products'
  and exists (
    select 1 from public.admin_users
    where user_id = (select auth.uid())
  )
);

create policy "Authorized admins can upload product images"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'product-images'
  and (storage.foldername(name))[1] = 'products'
  and exists (
    select 1 from public.admin_users
    where user_id = (select auth.uid())
  )
);

create policy "Authorized admins can update product images"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'product-images'
  and (storage.foldername(name))[1] = 'products'
  and exists (
    select 1 from public.admin_users
    where user_id = (select auth.uid())
  )
)
with check (
  bucket_id = 'product-images'
  and (storage.foldername(name))[1] = 'products'
  and exists (
    select 1 from public.admin_users
    where user_id = (select auth.uid())
  )
);

create policy "Authorized admins can delete product images"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'product-images'
  and (storage.foldername(name))[1] = 'products'
  and exists (
    select 1 from public.admin_users
    where user_id = (select auth.uid())
  )
);
