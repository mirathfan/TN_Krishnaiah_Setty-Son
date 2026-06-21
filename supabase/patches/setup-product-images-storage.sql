-- Supabase Storage setup for product cover and gallery images.
-- Run this in the Supabase SQL editor after the main schema.
--
-- Bucket:
--   product-images
--
-- Access model:
--   - Public users can read product images from public object URLs.
--   - Authenticated Supabase admin users can upload, update, and delete images.
--   - Anonymous users cannot upload, update, or delete images.
--   - Database RLS for products/orders is not changed by this patch.
--
-- Note: this bucket is public, so object URLs are readable without a broad
-- storage.objects SELECT policy. Avoiding a broad SELECT policy prevents
-- anonymous clients from listing all stored product image names.

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
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public can read product images" on storage.objects;
drop policy if exists "Authenticated users can upload product images" on storage.objects;
drop policy if exists "Authenticated users can update product images" on storage.objects;
drop policy if exists "Authenticated users can delete product images" on storage.objects;

create policy "Authenticated users can upload product images"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'product-images'
  and (storage.foldername(name))[1] = 'products'
);

-- Storage replacement/upsert flows need SELECT + UPDATE. This policy keeps
-- updates inside the product-images bucket and the products/ folder only.
create policy "Authenticated users can update product images"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'product-images'
  and (storage.foldername(name))[1] = 'products'
)
with check (
  bucket_id = 'product-images'
  and (storage.foldername(name))[1] = 'products'
);

create policy "Authenticated users can delete product images"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'product-images'
  and (storage.foldername(name))[1] = 'products'
);
