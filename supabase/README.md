# Supabase Phase 2A and 2B Security

This directory is a local, migration-first description of the bookstore backend. It was prepared without linking to or contacting the inactive production project.

## Safety and migration boundary

- `migrations/20261010015250_baseline_bookstore_schema.sql` creates missing bookstore tables, constraints, triggers, and indexes. It contains no catalog or order data changes.
- `migrations/20261010015254_phase_2a_admin_authorization_rls_storage.sql` creates the server-managed `admin_users` allowlist, replaces application RLS policies, removes anonymous order writes, and secures `product-images`.
- `migrations/20261010023402_secure_transactional_checkout.sql` additively introduces checkout idempotency metadata, private rate-limit state, atomic order creation, and trusted inventory confirmation. Existing product/order UUIDs and rows are preserved.
- `seed.sql` is development-only data loaded after a local reset. It is not a production migration.
- `schema.sql` and `patches/` are legacy MVP references outside the CLI migration path. Do not apply them to a restored backend.

Production remains fail-closed and read-only. Checkout can run only when both frontend and Edge Function receive explicit disposable `local` or `staging` configuration plus the exact acknowledgement. Admin access remains blocked by the frontend safe-mode guard.

## Local verification

With Docker running:

```bash
npm run test:supabase
```

The script uses only `--local`. It starts an isolated stack including Edge Runtime, resets only the local database, runs pgTAP policy and rollback tests, lints the schema, then exercises Auth, Data API, Storage, checkout, idempotency, privacy, rate limiting, and inventory concurrency. It removes local containers, volumes, and its temporary Function environment file afterward. It never uses `--linked`, a project ref, or production credentials.

Public registration and anonymous sign-ins are disabled in `config.toml`. The local service-role key is passed only to test processes. Current implementation guidance:

- [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Storage access control](https://supabase.com/docs/guides/storage/security/access-control)
- [Edge Function authentication](https://supabase.com/docs/guides/functions/auth)
- [Edge Function secrets](https://supabase.com/docs/guides/functions/secrets)
- [Database functions and privileges](https://supabase.com/docs/guides/database/functions)
- [CLI testing](https://supabase.com/docs/guides/local-development/cli/testing-and-linting)

## Phase 2B checkout design

The browser calls `functions/checkout` and may submit only customer/delivery fields, product UUIDs with quantities, payment preference, optional coupon code, and an idempotency UUID. Unknown prices or totals are rejected. The Function enforces a 16 KiB body limit, strict input/origin checks, database-backed rate limiting keyed by a salted hash, and sanitized errors. Request bodies and customer data are never logged.

The Function's trusted server client invokes `public.create_checkout_order`. PostgreSQL re-reads active product prices, locks products in UUID order, validates availability/coupons, calculates subtotal/shipping/discount/final total, and writes order plus items in one transaction. An advisory lock and unique partial index serialize concurrent duplicate keys. Anonymous and ordinary authenticated roles cannot invoke checkout or inventory functions directly.

Shipping is ₹60 below ₹500 and free from ₹500. Coupon status, validity dates, minimum, type, cap, and discount are server-owned.

### Inventory confirmation strategy

An unconfirmed request does not reserve or deduct inventory because availability and payment are manually confirmed. Once staff accepts an order, a future trusted staff/server endpoint or controlled runbook must invoke `public.confirm_order_inventory(order_id)`. It locks order/product rows in deterministic order, rechecks quantities, decrements stock once, and marks inventory/order confirmation. Concurrent confirmations cannot oversell. It does not capture or mark payment paid. Browser admin status updates are not a substitute.

### Environment configuration

`functions/.env.example` lists non-production Function settings. The rate-limit pepper and server credentials are secrets: configure them with Supabase secret management and never with `VITE_*`. The local runner creates its own ignored `functions/.env`.

The React client requires `VITE_CHECKOUT_EXECUTION_MODE=local` in a development build, or `staging` with `VITE_DEPLOYMENT_ENVIRONMENT=staging`, plus `VITE_CHECKOUT_DISPOSABLE_ENV_ACK=I_UNDERSTAND_NO_PRODUCTION_CHECKOUT`. The Function independently requires matching server-side mode and acknowledgement. Missing or production-like configuration stays locked.

## Compatibility with a recovered backend

Do not apply the baseline blindly. Clone the recovered backend to disposable staging, back it up, compare its schema/constraints to the baseline, and review migrations in order. The Phase 2B migration is additive (`ADD COLUMN IF NOT EXISTS`, new schema/table/indexes/functions), but operators must still check conflicting function names, triggers, custom order-number conventions, and legacy checkout code. Never run `db reset` against a linked or hosted project.

Phase 3A recovery tooling lives in `recovery/`. All three scripts start a read-only transaction and are intended only for an isolated local restore:

- `inventory-restored-database.sql` inventories schema, RLS, grants, functions, triggers, publications, background jobs, stable application identifiers, Auth counts, and Storage metadata without printing customer contact data.
- `preflight-compatibility.sql` reports structural gaps, duplicate business keys, invalid values, orphans, policy/function conflicts, background integrations, and the product-image bucket contract.
- `reconcile-restored-database.sql` captures row counts and non-PII identity digests before and after a candidate bridge migration.

See `../docs/PHASE_3A_READINESS.md` for the required backup/object export, background-job isolation, custom bridge migration, reconciliation, and rollback procedure.

## Secure administrator provisioning

After a recovered backend is tested in staging, create/invite the real administrator through Supabase Auth, require email verification and strong authentication, and copy the immutable Auth UUID. A trusted operator can allowlist it:

```sql
begin;
insert into public.admin_users (user_id)
values ('00000000-0000-0000-0000-000000000000')
on conflict (user_id) do nothing;
commit;
```

Normal authenticated users must then be verified unable to read or write administrative data. Never expose a secret/service-role key in browser code, Vercel variables intended for Vite, browser storage, or public CI logs.

## Remaining production prerequisites

Keep production read-only until a recovered backend and these migrations are independently reviewed in disposable staging, Function secrets and exact origin allowlists are provisioned, and a trusted inventory-confirmation workflow exists. Payment capture, customer-authenticated order lookup, cancellation/restocking rules, notifications, monitoring, rate-limit retention cleanup, and incident procedures remain future work.
