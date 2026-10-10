# T N Krishnaiah Setty & Son Deployment Guide

This guide prepares the bookstore app for production deployment on Vercel with Supabase as the backend.

## Production Safety Status and Phase 3A Preparation

The application is code-locked to read-only mode during production hardening:

1. The public storefront uses the bundled preview catalog.
2. Catalog prices and availability are explicitly unconfirmed.
3. Database writes, checkout submission, image writes, and admin access are blocked.
4. Do not connect, restore, or recreate a production Supabase backend until the authorization, RLS, and transactional checkout work has been reviewed and tested.
5. Do not add admin usernames or passwords to `VITE_*` variables. Vite exposes those variables to the browser bundle.

Phase 2A provides local migrations for the `auth.uid()` administrator allowlist, restrictive RLS, Storage policies, and real Supabase Auth verification. Phase 2B adds a public Edge endpoint backed by service-role-only transactional checkout and inventory operations. None of it has been deployed or applied to a hosted project. Production remains read-only until a recovered backend and reviewed staging deployment are available.

The authoritative readiness, rollback, recovery, compatibility, and checkout-review runbook is [`docs/PHASE_3A_READINESS.md`](docs/PHASE_3A_READINESS.md). Do not deploy or restore from this repository until that checklist has been reviewed and explicit authorization has been given.

The frontend and Edge Function fail closed independently. Do not set the disposable checkout mode or acknowledgement variables in production. Checkout is currently enabled only for explicitly configured local/staging verification, and frontend admin access remains blocked.

## Reserved Backend Environment Variables

These variables are reserved for a future secured backend. The Phase 1 read-only build does not use them for catalog loading or writes. Prefer leaving both unset for the read-only deployment:

```bash
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-publishable-or-anon-key
```

The Supabase CLI migration files under `supabase/migrations/` are now authoritative. The top-level `supabase/schema.sql` and `supabase/patches/` files are legacy MVP references and must not be applied to a restored project. They previously included broad authenticated-user policies and direct anonymous order inserts. See `supabase/README.md` for local testing and secure administrator provisioning.

Phase 2B uses server-managed Function settings for allowed origins, execution mode, acknowledgement, and a secret rate-limit pepper. Supabase supplies the trusted server credential to the Edge runtime. Never add a service/secret key to `VITE_*`, browser code, or Vercel frontend variables.

## Supabase Auth Security Settings

Before any restored project is connected to the frontend:

1. Open Supabase Dashboard.
2. Disable new-user signups and keep anonymous sign-ins disabled. Leave the email provider enabled for pre-provisioned administrators.
3. Go to Authentication > Settings > Security.
4. Enable leaked password protection and MFA where available.
5. Save changes.

This is a dashboard Auth setting, not a Vite frontend code setting.

## Product Image Storage

The Phase 2A security migration creates a public bucket named `product-images`.

Expected behavior:

1. Public image URLs are readable by customers.
2. Phase 1 blocks all image upload, update, and delete operations in the frontend.
3. Anonymous and ordinary authenticated users cannot list, upload, update, or delete images.
4. Only an `admin_users` allowlisted Supabase Auth user can list or write objects under `products/`.

If uploads fail in a future staging admin, confirm the Phase 2A migration was applied and the verified Auth UUID was provisioned in `public.admin_users` by a trusted operator.

## Vercel Deployment

Intended production domain: `tnkrishnaiahsetty.com`

Connect this custom domain in Vercel only after the client or domain owner has provided access and the DNS records are ready. Keep preview and current deployment URLs unchanged until then.

1. Push the project to GitHub.
2. Import the repo into Vercel.
3. Framework preset: Vite.
4. Build command: `npm run build`.
5. Output directory: `dist`.
6. Keep `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and every `VITE_CHECKOUT_*` variable unset for the read-only deployment.
7. Deploy.
8. In Vercel Project Settings > Domains, add `tnkrishnaiahsetty.com` and follow Vercel's DNS instructions when ownership is available.

After deploy, open the production URL and run the checklist below.

## Production Test Checklist

Public storefront:

1. Homepage loads.
2. Product listing loads from the clearly labeled bundled preview catalog, with no Supabase network request.
3. Inventory, price, and availability are labeled unconfirmed.
4. Product detail pages load by slug.
5. Uploaded cover and gallery images render.
6. Cart opens and updates quantities.
7. Checkout submission remains disabled in production and explains that totals are previews.
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
3. Anonymous direct order inserts and direct checkout RPC calls are denied; the production Edge checkout gate remains disabled.
4. No Supabase client is instantiated by the Phase 1 read-only build.
5. Phase 2A migrations and local integration tests must be reviewed and rerun against a disposable staging clone before any backend restoration or production deployment.
6. Phase 2B checkout tests must pass there, including idempotency, rollback, privacy, rate limiting, and concurrent inventory confirmation.

## Manual confirmation and inventory

An order request is not a completed sale and does not capture payment or reserve stock. After staff verifies availability/payment, a trusted server-side process must call `confirm_order_inventory` when accepting the order. It rechecks and atomically commits stock so concurrent confirmations cannot oversell. The current browser admin status controls are not an authorized substitute and remain blocked.

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
