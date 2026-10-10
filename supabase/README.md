# Supabase Phase 2A Security

This directory is a local, migration-first description of the bookstore backend. It was prepared without linking to or contacting the inactive production project.

## Safety boundary

- `migrations/20261010015250_baseline_bookstore_schema.sql` creates missing bookstore tables, constraints, triggers, and indexes. It contains no catalog or order data changes.
- `migrations/20261010015254_phase_2a_admin_authorization_rls_storage.sql` replaces application RLS policies, creates the server-managed `admin_users` allowlist, removes anonymous order writes, and secures the `product-images` bucket.
- `seed.sql` is development-only sample data loaded after a local database reset. It is not a production migration and uses `ON CONFLICT DO NOTHING`.
- `schema.sql` and `patches/` are legacy MVP references. They are outside the CLI migration path and must not be applied to a restored backend. In particular, the old anonymous-checkout and authenticated-storage patches are superseded by Phase 2A.

The React application remains code-locked in Phase 1 read-only mode. Completing these migrations does not authorize enabling checkout or admin access in production.

## Local verification

Docker must be running. The integration script starts an isolated local stack, resets only that local database, runs pgTAP policy assertions, lints the local schema, exercises Auth/Data API/Storage as anonymous, non-admin, and allowlisted-admin users, and then removes the local containers and volumes.

```bash
npm run test:supabase
```

The script always uses `--local`; it does not use `--linked`, a project ref, or production credentials. Public registration and anonymous sign-ins are disabled in `config.toml`. The email provider remains enabled so pre-provisioned administrators can sign in, but project-wide `auth.enable_signup = false` rejects account creation. Test users are created with the disposable stack's local service-role key inside the Node test process only.

Current Supabase guidance used for this design:

- [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Storage access control](https://supabase.com/docs/guides/storage/security/access-control)
- [Public bucket behavior](https://supabase.com/docs/guides/troubleshooting/why-cant-i-uploadlistetc-my-public-bucket-Z6CmGt)
- [`auth.getUser()` verification](https://supabase.com/docs/reference/javascript/auth-getuser)
- [CLI configuration](https://supabase.com/docs/guides/local-development/cli/config)

## Secure administrator provisioning after backend recovery

Do not provision an administrator until a recovered backend has been cloned to a non-production environment, migrations have been reviewed and tested there, and the Phase 1 frontend lock is still active.

1. In Supabase Authentication settings, disable new-user signups and keep anonymous sign-ins disabled. Leave the email provider enabled so pre-provisioned administrators can sign in. This hosted Auth setting is not controlled by a SQL migration.
2. Create or invite the administrator from the Supabase Dashboard's Auth Users page using the person's real email. Do not add a public sign-up screen and do not share a password in source control, chat logs, or Vercel variables.
3. Require email confirmation, a strong unique password, and MFA when the recovered project's plan/configuration supports it.
4. Copy the administrator's UUID from Auth Users. Do not use an email address or mutable user metadata as the authorization key.
5. As a trusted database operator in the SQL editor, insert that UUID into the allowlist:

```sql
begin;

insert into public.admin_users (user_id)
values ('00000000-0000-0000-0000-000000000000')
on conflict (user_id) do nothing;

commit;
```

6. Verify that a normal authenticated test user cannot view inactive catalog rows, orders, coupons, pending reviews, or Storage object listings and cannot write any application row or Storage object.
7. Verify that the allowlisted user can perform the intended administrative operations in staging. Keep the production UI lock active until the migration and deployment are independently reviewed.

To revoke access, delete only the intended UUID from `public.admin_users`, then revoke that user's Auth sessions from the Dashboard. Browser clients cannot add, change, or remove allowlist rows.

Never place the service-role key in `VITE_*`, client code, browser storage, or a public CI variable. It is only appropriate for trusted server-side processes and disposable local tests.

The prepared browser client uses an in-memory Supabase Auth session (`persistSession: false`). Admins must sign in again after a refresh; no custom or Supabase session in `localStorage` can unlock the admin UI.

## Phase 2B prerequisites

Checkout must remain disabled until a trusted server-side order endpoint provides schema validation, server-calculated totals, idempotency, rate limiting/abuse controls, a single database transaction for orders and items, and inventory locking/adjustment. Customer order lookup and payment processing also require explicit privacy and authorization designs before launch.
