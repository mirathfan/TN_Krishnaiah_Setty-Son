# T N Krishnaiah Setty & Son Deployment Guide

This guide prepares the bookstore app for production deployment on Vercel with Supabase as the backend.

## Phase 1 Safety Status

The application is code-locked to read-only mode during production hardening:

1. The public storefront uses the bundled preview catalog.
2. Catalog prices and availability are explicitly unconfirmed.
3. Database writes, checkout submission, image writes, and admin access are blocked.
4. Do not connect, restore, or recreate a production Supabase backend until the authorization, RLS, and transactional checkout work has been reviewed and tested.
5. Do not add admin usernames or passwords to `VITE_*` variables. Vite exposes those variables to the browser bundle.

## Reserved Backend Environment Variables

These variables are reserved for the future secured backend. The Phase 1 read-only build does not use them for catalog loading or writes, and this hardening work does not require changing existing Vercel values:

```bash
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-publishable-or-anon-key
```

The existing SQL files document the previous MVP and must not be applied to production as-is. They contain broad authenticated-user policies and direct anonymous order inserts that are intentionally blocked by the Phase 1 frontend.

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
2. Phase 1 blocks all image upload, update, and delete operations in the frontend.
3. Anonymous users cannot upload, update, or delete images.
4. There is no broad anonymous `storage.objects` SELECT policy for listing the bucket.

If uploads fail in admin, confirm the storage patch was run and the admin is logged in through Supabase Auth.

## Vercel Deployment

Intended production domain: `tnkrishnaiahsetty.com`

Connect this custom domain in Vercel only after the client or domain owner has provided access and the DNS records are ready. Keep preview and current deployment URLs unchanged until then.

1. Push the project to GitHub.
2. Import the repo into Vercel.
3. Framework preset: Vite.
4. Build command: `npm run build`.
5. Output directory: `dist`.
6. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in Vercel environment variables.
7. Deploy.
8. In Vercel Project Settings > Domains, add `tnkrishnaiahsetty.com` and follow Vercel's DNS instructions when ownership is available.

After deploy, open the production URL and run the checklist below.

## Production Test Checklist

Public storefront:

1. Homepage loads.
2. Product listing loads from Supabase.
3. Inactive products are hidden.
4. Product detail pages load by slug.
5. Uploaded cover and gallery images render.
6. Cart opens and updates quantities.
7. Checkout submission is disabled and explains that totals are previews.
8. WhatsApp cart handoff remains available for confirmation.
9. Preview products are clearly labeled as unconfirmed inventory.

Admin:

1. `/admin/login`, `/admin/products`, and `/admin/orders` resolve as SPA deep links.
2. All three routes show the production safety lock.
3. No localStorage token or browser credential can unlock admin access.
4. Product, image, and order writes remain blocked.

Security:

1. Anonymous product create/update/delete is blocked.
2. Anonymous image upload/update/delete is blocked.
3. Anonymous checkout insert is not attempted in Phase 1.
4. No Supabase client is instantiated by the Phase 1 read-only build.
5. Database RLS and advisor verification remains a Phase 2 blocker before backend restoration.

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
