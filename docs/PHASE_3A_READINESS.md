# Phase 3A production safety and recovery preparation

Date reviewed: 2026-10-10

Original inactive Supabase project: `sxdfjtcbfpmwdwtgouea`

Scope: local repository and disposable local Supabase only. The original project was not contacted, resumed, restored, or modified.

## Decision

**NO-GO for live backend, admin access, or checkout.** The application is suitable for a reviewed **read-only storefront deployment** only after the deployment checklist below is completed and the exact Vercel build artifact is rechecked. Product data remains an explicitly labeled preview, checkout and admin stay locked, and orders continue through WhatsApp/manual contact.

The original database cannot be inventoried while it is inactive and off-limits. The repository now contains repeatable, read-only inventory and reconciliation scripts for a future isolated restore. Their output must be reviewed before any migration is applied.

## Verified production boundary

- Production defaults to `readOnly: true`. The catalog uses bundled preview data; no Supabase client is instantiated, no order endpoint is called, and database/admin/image writes are rejected.
- Admin access is always false in the current runtime policy. Supabase Auth sessions, browser storage, legacy `VITE_ADMIN_*` values, and mock tokens cannot unlock it.
- Checkout requires a deliberately configured disposable local environment, or a hosted staging environment whose URL, allowlisted project ref, hosted deployment ID, mode, deployment label, and acknowledgement agree. The original project ref is rejected.
- A Vercel preview build fails if it is pointed at the original Supabase project. In ordinary preview/read-only builds, Supabase remains uninstantiated.
- The build audits emitted assets for obsolete admin markers/values, service-role material, and mock-session markers. The complete `import.meta.env` object is never referenced, preventing unused `VITE_*` credentials from being serialized merely because they exist in the build environment.
- Preview products, price, stock, and availability are labeled unconfirmed. Checkout buttons show unavailable; cart browsing and WhatsApp links remain available.
- `vercel.json` supplies the SPA rewrite for admin, product, and other client routes. CSP prevents inline scripts, framing, plugins, cross-origin forms, and arbitrary connections; other headers add HSTS, referrer restriction, MIME sniffing protection, and a restrictive Permissions Policy.

The Supabase JavaScript package remains in the compiled application because disposable local/staging checkout is part of the same codebase. Presence of library code is not a client instance or network connection. The runtime guard and browser tests are the production controls.

## Vercel environment matrix

| Environment | Allowed backend variables | Checkout variables | Result |
| --- | --- | --- | --- |
| Production read-only | Prefer no `VITE_SUPABASE_*`; a public URL/publishable key is inert but unnecessary | All checkout mode, acknowledgement, deployment, and allowed-ref variables absent | Preview catalog; no Supabase client; admin and checkout blocked |
| Vercel preview | Never the original project URL/key; preferably no backend variables | Absent | Preview catalog; no Supabase client; admin and checkout blocked |
| Disposable local | Localhost URL and local publishable key only | `local` mode plus exact acknowledgement; development build required | Checkout testing only |
| Disposable hosted staging | Dedicated non-production project only | `staging`, deployment `staging`, exact acknowledgement, and exact non-production allowed project ref | Checkout testing only after review |

Do not put service/secret keys, admin passwords, rate-limit pepper, or server-only Function settings in any `VITE_*` variable. Vite values are public browser configuration.

## Read-only deployment checklist

### Before building

1. Obtain explicit deployment authorization and record the approved commit.
2. In Vercel, inspect Production and Preview scopes separately. Remove obsolete `VITE_ADMIN_USERNAME`, `VITE_ADMIN_PASSWORD`, and `VITE_ADMIN_EMAIL`. Do not copy any service-role/secret key into Vercel.
3. Leave all `VITE_CHECKOUT_*` variables unset in Production and Preview.
4. Prefer removing `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` for the read-only release. At minimum, prove Preview does not reference the original project.
5. Confirm the build command is `npm run build` and output directory is `dist`.
6. Run `npm ci`, `npm run verify:phase3a`, and retain the logs. Only the documented Vite chunk-size warning is accepted.
7. Inspect emitted assets with `npm run audit:bundle`. Search them for the original project ref and all known obsolete credential values without printing those values to logs.
8. Review the complete Git diff and confirm `qa-screenshots/` and customer data are untouched.

### Preview verification

1. Deploy to an unaliased Vercel Preview first; do not connect the custom domain.
2. Check response headers with `curl -I` and confirm CSP, HSTS, `nosniff`, Referrer Policy, Permissions Policy, and frame denial.
3. Open the homepage at desktop and mobile widths. Confirm the preview banner is visible and no console error or network request targets Supabase.
4. Browse categories, search/filter products, open a product detail, add/update/remove cart items, and open WhatsApp contact.
5. Confirm online checkout is unavailable and cannot be opened by direct UI manipulation.
6. Visit `/admin/login`, `/admin/products`, and `/admin/orders` as deep links. Each must load the SPA and show the safety lock.
7. Search Local Storage, Session Storage, cookies, and IndexedDB. Only non-sensitive cart/wishlist preferences may exist; no customer contact/order/admin session may exist.
8. Repeat with an incognito session and a hard refresh on every deep link.

### Production release

1. Promote only the verified Preview artifact/commit after explicit authorization.
2. Keep `tnkrishnaiahsetty.com` disconnected until the client/domain owner approves DNS and the read-only release.
3. Repeat all Preview checks on the production URL from a clean browser.
4. Verify WhatsApp/call links on a real mobile device and visually confirm `+91 9880226598`, the Chickpet address, `Publishers and Booksellers`, and `Estd. 1910`.
5. Record the deployment ID, artifact commit, environment-variable audit, timestamp, tester, and screenshots.

### Rollback

1. Do not change database state during a read-only rollout; rollback must therefore be frontend-only.
2. In Vercel, immediately promote the last known safe read-only deployment if headers, routing, labels, or runtime behavior differ from the checklist.
3. If no safe deployment exists, remove the production/custom-domain alias instead of enabling any backend path.
4. Preserve the failed deployment and logs for analysis. Never “fix forward” by enabling Supabase, checkout, or admin environment variables.
5. Re-run the asset audit and smoke tests before any second attempt.

## Isolated database recovery plan

### Evidence collection

Once separately authorized, download an available backup without connecting this application to the project. Record the original Postgres major version, backup type/time, project ref, and checksums. Supabase database backups include Storage metadata but **not object bytes**, so export the `product-images` objects separately and preserve paths/checksums. Hosted Auth settings are control-plane configuration and must be recorded manually: signup/anonymous-sign-in state, providers, redirect URLs/site URL, SMTP/templates, JWT/session settings, CAPTCHA, MFA, hooks, rate limits, and custom domains.

Also inventory Edge Functions and versions, Function secrets by **name only**, Database Webhooks, Realtime publications, Cron, `pg_net`, Vault references, foreign data wrappers, replication publications/subscriptions/slots, log drains, custom SMTP, analytics/export jobs, and third-party notifications. Do not copy secret values into repository files or reports.

### Isolated restore

1. Work on an offline/disposable local machine or isolated no-egress environment. Never use a paid hosted resource without approval.
2. Match the backup's Postgres version and use the documented Supabase CLI local backup restore workflow. Do not link this repository to a hosted project and never run `db reset` remotely.
3. Before allowing normal services to start, disable outbound network paths and keep Cron jobs, `pg_net` jobs, webhooks, subscriptions, Edge Functions, Realtime consumers, email/SMS, and third-party callbacks stopped. Preserve their definitions for inventory; do not execute them.
4. Take a checksum-protected copy of the untouched restore. Perform every experiment on a new clone.
5. Run `inventory-restored-database.sql` and retain its access-controlled output. Run `preflight-compatibility.sql`; investigate every reported collision, orphan, policy, trigger, function, extension, and bucket difference.
6. Capture `reconcile-restored-database.sql` before changes. Create a bespoke bridge migration from the observed schema; do not apply the baseline blindly.
7. Apply the candidate bridge plus Phase 2A/2B only to a disposable clone. Capture reconciliation again and diff counts/identity digests. Products, customers, orders, line items, UUIDs, order numbers, and Storage paths must remain stable.
8. Reconcile Storage database metadata against separately exported object bytes. Test a representative sample of image checksums and public URLs in isolation.
9. Run RLS, Storage, Auth, checkout, rollback, idempotency, privacy, rate-limit, and concurrent confirmation tests using anonymous, non-admin, and allowlisted-admin identities.
10. Have the schema diff, data reconciliation, and recovery logs independently reviewed before proposing any hosted restoration.

Supabase references: [database backups](https://supabase.com/docs/guides/platform/backups), [restoring a downloaded backup locally](https://supabase.com/docs/guides/local-development/restoring-downloaded-backup), [database migrations](https://supabase.com/docs/guides/deployment/database-migrations), [Edge Function secrets](https://supabase.com/docs/guides/functions/secrets), and [Edge Function authorization](https://supabase.com/docs/guides/functions/auth).

## Known migration compatibility conflicts

| Area | Conflict/risk | Required bridge action |
| --- | --- | --- |
| Baseline | `CREATE TABLE IF NOT EXISTS` does not correct missing columns, types, defaults, nullability, constraints, triggers, or indexes on an existing table | Diff the recovered schema and generate explicit additive changes |
| Legacy policies | The original schema treated every authenticated user as an administrator and allowed anonymous order/order-item inserts | Export policies; Phase 2A must replace application-table policies after review |
| Custom policies | Phase 2A intentionally removes policies on the seven bookstore tables | Decide whether each policy is obsolete; recreate only least-privilege policies deliberately |
| Storage policies | Legacy names granted every authenticated user product-image writes; older Phase 2A code also removed unrelated bucket policies | Current migration removes only known product-image policies and fails on unknown broad/product-image policies; review manually |
| Storage bucket | Current contract expects public reads, 5 MiB max, and JPEG/PNG/WebP | Inventory old objects/MIME types; migration now fails rather than silently changing a different configuration |
| Auth allowlist | `admin_users.user_id` references `auth.users` | Provision the Auth user first, then insert its immutable UUID using a trusted operator path |
| Reviews | Legacy databases may use `reviews` rather than `customer_reviews` | Map data and IDs explicitly; do not create an empty parallel table without deciding authority |
| Checkout columns | Phase 2B adds idempotency/fingerprint/coupon/inventory fields | Check name/type conflicts and constraints before applying |
| Coupons | Legacy uniqueness is case-sensitive while checkout normalizes to upper case | Resolve case-insensitive duplicates before creating `coupons_code_upper_idx` |
| Order numbers | The private sequence starts independently of existing `TNK-YYYY-*` numbers | Set it from reviewed values in the bridge or adopt an approved collision-free convention |
| Functions/triggers | Existing names, overloads, owners, `SECURITY DEFINER`, or search paths can conflict | Export definitions, remove unsafe overloads, and pin paths/grants explicitly |
| Existing data | Negative values, duplicates, nulls, invalid statuses, and orphan rows may violate new constraints | Reconcile case-by-case; never discard or auto-rewrite production data |
| Extensions | `pgcrypto`, Cron, `pg_net`, Vault, HTTP, wrappers, and FDWs may differ | Match extension placement/version and keep background/network features disabled |
| Storage bytes | DB backup restores metadata only | Restore object bytes separately and reconcile bucket/path/checksum manifests |

## Independent checkout security review

### Controls confirmed

- The guest endpoint accepts only customer/delivery fields, product UUID/quantity pairs, payment preference, coupon code, and UUID idempotency key. Unknown price/total fields fail validation.
- PostgreSQL re-reads and locks active products, calculates price/shipping/discount totals, writes order and lines atomically, and rolls back on failure.
- Advisory locking plus a unique partial index make retries idempotent. Reusing a key with a different fingerprint is rejected.
- Anonymous and ordinary authenticated roles have no execute privilege on checkout, rate-limit, or inventory functions. The Edge Function is the sole guest-to-service-role trust boundary.
- The service credential is supplied only by the Edge runtime and is never returned, logged, stored in browser code, or placed in a `VITE_*` variable.
- Requests are limited to 16 KiB; keys, lengths, formats, cart size, units, payment methods, and coupon applicability are validated in TypeScript and SQL.
- Logs contain only random request ID, safe error code, and status. Responses omit customer data and database error details.
- Inventory is not reserved by an unconfirmed request. Trusted confirmation locks rows in deterministic order, aggregates legacy duplicate lines, and deducts once. Concurrent confirmations cannot take stock below zero.
- Coupon codes have a case-normalized unique index, preventing ambiguous differently cased discounts.

### Findings fixed during Phase 3A

1. **High — obsolete Vite credentials could be serialized.** Referencing complete `import.meta.env` caused unused `VITE_ADMIN_*` values to enter the bundle. Runtime reads are now allowlisted and emitted assets/build-environment values are scanned.
2. **High — disposable checkout target was too loosely tied to hosting context.** Frontend and Function staging modes now require an exact non-production project ref; the Function also checks hosted deployment ID. Hosted local-mode spoofing and the original ref are rejected.
3. **High — legacy duplicate line items could be under-deducted.** Confirmation now aggregates quantities per product before validation/update; integration coverage exercises it.
4. **Medium — coupon case collisions could select an ambiguous row.** A normalized unique index stops migration until collisions are reconciled.
5. **Medium — Phase 2A could erase unrelated Storage policies.** Cleanup is limited to known product-image names and fails on an unknown policy that could expose the bucket.

### Residual risks/blockers

- Rate limiting is keyed by an Edge-observed address. It is not a replacement for WAF/gateway controls or CAPTCHA; shared networks may produce false positives and distributed clients can bypass a per-address limit. Confirm the trustworthy proxy header before staging.
- `checkout_rate_limits` has no retention job. Add trusted cleanup before sustained traffic, keeping Cron disabled during recovery.
- The public guest Function necessarily holds service-role capability. A runtime compromise has broad impact; staging must review dependency pinning, secret rotation, logging/alerting, origin policy, and gateway protections.
- CORS is a browser control, not caller authentication. Requests without `Origin` remain possible for guest checkout by design and rely on abuse controls.
- An accepted request does not reserve stock. More pending requests than units are expected; only trusted confirmation prevents overselling. Copy and staff procedure must not imply reservation or payment capture.
- No reviewed staff confirmation endpoint, cancellation/restock workflow, notifications, retention policy, or incident runbook exists. The service-role RPC is not suitable for browser use.
- Sequence initialization and migration compatibility remain unresolved until isolated inventory exists.

## Local test evidence (2026-10-10)

- Frontend Vitest: 34 passed, 0 failed; 17 local-integration cases skipped in this command as designed.
- Database pgTAP: 49 assertions passed across Phase 2A and 2B; Supabase schema lint returned no errors.
- Disposable local integration: 17 passed, covering Auth/RLS roles, Storage, forged totals, inactive/out-of-stock products, shipping/coupons, idempotency, unauthorized RPCs, privacy, rollback, rate limiting, and concurrent/duplicate-line inventory confirmation.
- Production build: passed. Only the known Vite chunk-size warning appeared. Emitted-bundle audit passed and `npm audit --omit=dev` reported zero vulnerabilities.
- Production-scope guard: a build supplied with complete staging checkout variables plus `VERCEL_ENV=production` still rendered the read-only preview and disabled checkout. A Preview build pointed at the original project ref failed before compilation as intended.
- Recovery tooling: all three read-only SQL scripts executed successfully against the disposable local schema and ended with `ROLLBACK`.
- Mobile browser (342 × 897): homepage, preview labeling, categories, product detail, cart, disabled checkout, WhatsApp link targets, and all three admin deep links passed. Browser console warnings/errors: none.
- Desktop browser (1440 × 1000): homepage/header/navigation/hero/preview banner responsive layout was visually inspected in headless Chrome. No application error was observed; Chrome itself emitted unrelated local updater/crash-reporting diagnostics.
- `git diff --check` passed before the final review. `qa-screenshots/` remained untracked and unchanged.

Passing local tests is not production security approval. A reviewed deployment and separately authorized isolated database recovery are still required.
