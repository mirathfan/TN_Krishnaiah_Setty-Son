# T N Krishnaiah Setty & Son Deployment Guide

This guide prepares the bookstore app for production deployment on Vercel with Supabase as the backend.

## Required Environment Variables

Set these in local `.env.local` and in Vercel Project Settings > Environment Variables:

```bash
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-publishable-or-anon-key
```

Local fallback credentials are only for development when Supabase is not configured:

```bash
VITE_ADMIN_USERNAME=admin
VITE_ADMIN_PASSWORD=change-this-password
```

Do not use local fallback credentials as production admin authentication.

## Supabase Setup

Run the SQL files in this order from the Supabase SQL Editor:

1. `supabase/schema.sql`
2. `supabase/patches/fix-anonymous-checkout-insert.sql`
3. `supabase/patches/setup-product-images-storage.sql`
4. `supabase/patches/fix-function-search-path.sql`

After running the files, verify:

1. Public products load from the `products` table.
2. Anonymous users can insert into `orders` and `order_items`.
3. Anonymous users cannot select all orders.
4. Authenticated admins can manage products and orders.
5. `product-images` bucket exists and accepts JPG, PNG, and WebP images up to 5 MB.

## Supabase Auth Admin User

Create an admin user in Supabase:

1. Open Supabase Dashboard.
2. Go to Authentication > Users.
3. Add a user with email/password.
4. Use that account at `/admin/login`.

Current RLS treats authenticated Supabase users as admins. Before a larger staff rollout, add an admin role/profile table and tighten the product/order policies to that role.

## Supabase Auth Security Setting

Enable leaked-password protection in Supabase:

1. Open Supabase Dashboard.
2. Go to Authentication > Settings > Security.
3. Enable leaked password protection.
4. Save changes.

This is a dashboard Auth setting, not a Vite frontend code setting.

## Product Image Storage

The `setup-product-images-storage.sql` patch creates a public bucket named `product-images`.

Expected behavior:

1. Public image URLs are readable by customers.
2. Authenticated admins can upload, update, and delete images in `products/`.
3. Anonymous users cannot upload, update, or delete images.
4. There is no broad anonymous `storage.objects` SELECT policy for listing the bucket.

If uploads fail in admin, confirm the storage patch was run and the admin is logged in through Supabase Auth.

## Vercel Deployment

1. Push the project to GitHub.
2. Import the repo into Vercel.
3. Framework preset: Vite.
4. Build command: `npm run build`.
5. Output directory: `dist`.
6. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in Vercel environment variables.
7. Deploy.

After deploy, open the production URL and run the checklist below.

## Production Test Checklist

Public storefront:

1. Homepage loads.
2. Product listing loads from Supabase.
3. Inactive products are hidden.
4. Product detail pages load by slug.
5. Uploaded cover and gallery images render.
6. Cart opens and updates quantities.
7. Checkout creates an order request.
8. Order confirmation shows an order number.
9. WhatsApp handoff includes order number, products, quantities, total, and customer details.

Admin:

1. `/admin/products` redirects to `/admin/login` when logged out.
2. Admin Supabase email/password login works.
3. Product create/edit/delete works.
4. Product image upload works.
5. Admin orders page loads.
6. Order status and payment status updates work.
7. Logout works.

Security:

1. Anonymous product create/update/delete is blocked.
2. Anonymous image upload/update/delete is blocked.
3. Anonymous checkout insert works.
4. Anonymous order SELECT remains blocked.
5. Supabase advisors show no unresolved database function search path warning.

## Manual QA Data Cleanup

Do not bulk-delete production data. Remove only rows and files that you clearly created during testing.

Recommended cleanup steps before handoff:

1. In Supabase Table Editor, inspect `orders` for obvious QA order numbers, names, phone numbers, notes, or product titles.
2. Delete matching `orders` rows only after confirming they are test data. Related `order_items` should cascade from `orders`.
3. If needed, inspect `order_items` by `order_id` before deleting the matching order.
4. Inspect `products` for temporary QA products by title, slug, SKU, or description, then delete only those products.
5. In Storage > `product-images`, remove only folders/files created for QA products, usually under `products/{qa-product-slug}/`.
6. Recheck the storefront after cleanup to make sure real products still display.

Optional SQL patterns for carefully targeted cleanup:

```sql
-- Preview first.
select id, order_number, customer_name, created_at
from public.orders
where order_number ilike '%QA%'
   or customer_name ilike '%QA%';

-- Delete only after reviewing the preview.
delete from public.orders
where order_number ilike '%QA%'
   or customer_name ilike '%QA%';
```

```sql
-- Preview first.
select id, slug, title, sku
from public.products
where slug ilike '%qa%'
   or title ilike '%qa%'
   or sku ilike '%qa%';

-- Delete only after reviewing the preview.
delete from public.products
where slug ilike '%qa%'
   or title ilike '%qa%'
   or sku ilike '%qa%';
```

Storage files are safest to remove through the Supabase Storage UI so the owner can visually confirm the product folder before deletion.
