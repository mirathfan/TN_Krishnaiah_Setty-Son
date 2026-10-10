import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const projectFile = (relativePath) => new URL(`../${relativePath}`, import.meta.url);
const baselinePath = 'supabase/migrations/20261010015250_baseline_bookstore_schema.sql';
const securityPath = 'supabase/migrations/20261010015254_phase_2a_admin_authorization_rls_storage.sql';
const checkoutPath = 'supabase/migrations/20261010023402_secure_transactional_checkout.sql';

describe('Phase 2A database security configuration', () => {
  it('keeps schema creation and development seed data separate', async () => {
    const baseline = await readFile(projectFile(baselinePath), 'utf8');
    const seed = await readFile(projectFile('supabase/seed.sql'), 'utf8');

    expect(baseline).not.toMatch(/insert\s+into\s+public\.(?:categories|products|orders)/i);
    expect(baseline).not.toMatch(/\btruncate\b|delete\s+from\s+public\./i);
    expect(seed).toMatch(/DEVELOPMENT-ONLY/i);
    expect(seed).not.toMatch(/on\s+conflict[^;]+do\s+update/is);
  });

  it('uses an auth.uid allowlist and never treats all authenticated users as admins', async () => {
    const migration = await readFile(projectFile(securityPath), 'utf8');

    expect(migration).toMatch(/create table if not exists public\.admin_users/i);
    expect(migration).toMatch(/user_id\s+uuid\s+primary key references auth\.users\(id\)/i);
    expect(migration).toMatch(/where user_id = \(select auth\.uid\(\)\)/i);
    expect(migration).not.toMatch(/auth\.role\(\)/i);
    expect(migration).not.toMatch(/"Anyone can create (?:orders|order items)"/i);
  });

  it('keeps allowlist writes and anonymous order writes ungranted', async () => {
    const migration = await readFile(projectFile(securityPath), 'utf8');

    expect(migration).toMatch(/revoke all on table public\.admin_users from anon, authenticated/i);
    expect(migration).toMatch(/grant select on table public\.admin_users to authenticated/i);
    expect(migration).not.toMatch(/grant\s+insert[^;]+public\.admin_users/is);
    expect(migration).not.toMatch(/grant\s+insert[^;]+public\.(?:orders|order_items)[^;]+to\s+anon/is);
  });

  it('preserves unrelated Storage policies and fails closed on unknown broad policies', async () => {
    const migration = await readFile(projectFile(securityPath), 'utf8');
    const cleanup = migration.match(/do \$storage_policy_cleanup\$[\s\S]+?\$storage_policy_cleanup\$;/i)?.[0] || '';

    expect(cleanup).toMatch(/policyname = any/i);
    expect(cleanup).toMatch(/Public can read product images/i);
    expect(migration).toMatch(/PHASE2A_STORAGE_POLICY_REVIEW_REQUIRED/);
    expect(migration).toMatch(/PHASE2A_PRODUCT_IMAGES_BUCKET_REVIEW_REQUIRED/);
    expect(migration).toMatch(/array\['public', 'anon', 'authenticated'\]::name\[\]/);
  });

  it('disables local public registration and keeps production checkout fail-closed', async () => {
    const config = await readFile(projectFile('supabase/config.toml'), 'utf8');
    const safety = await readFile(projectFile('src/config/runtimeSafety.js'), 'utf8');

    expect(config).toMatch(/\[auth\][\s\S]*?enable_signup = false/);
    expect(config).toMatch(/\[auth\.email\][\s\S]*?enable_signup = true/);
    expect(config).toMatch(/enable_anonymous_sign_ins = false/);
    expect(safety).toMatch(/CHECKOUT_ACKNOWLEDGEMENT = 'I_UNDERSTAND_NO_PRODUCTION_CHECKOUT'/);
    expect(safety).toMatch(/adminAccessAllowed: false/);
    expect(safety).toMatch(/VITE_DEPLOYMENT_ENVIRONMENT/);
    expect(safety).toMatch(/VITE_CHECKOUT_ALLOWED_PROJECT_REF/);
    expect(safety).not.toMatch(/options\.environment \|\| import\.meta\.env/);
  });

  it('never places a service-role credential in browser code', async () => {
    const browserSources = await Promise.all([
      'src/lib/supabaseClient.js',
      'src/services/adminAuthorization.js',
      'src/services/authService.js',
      'src/services/productService.js',
      'src/services/orderService.js',
      'src/services/imageUploadService.js',
    ].map((path) => readFile(projectFile(path), 'utf8')));

    expect(browserSources.join('\n')).not.toMatch(/SERVICE_ROLE|service[_-]?role/i);
  });

  it('keeps Supabase Auth sessions out of browser localStorage', async () => {
    const clientSource = await readFile(projectFile('src/lib/supabaseClient.js'), 'utf8');

    expect(clientSource).toMatch(/persistSession:\s*false/);
  });

  it('keeps the Edge checkout and database RPC fail-closed', async () => {
    const edgeFunction = await readFile(projectFile('supabase/functions/checkout/index.ts'), 'utf8');
    const checkoutMigration = await readFile(projectFile(checkoutPath), 'utf8');
    const config = await readFile(projectFile('supabase/config.toml'), 'utf8');

    expect(config).toMatch(/\[functions\.checkout\][\s\S]*?verify_jwt = false/);
    expect(edgeFunction).toMatch(/CHECKOUT_DISPOSABLE_ENV_ACK/);
    expect(edgeFunction).toMatch(/CHECKOUT_DEPLOYMENT_ENVIRONMENT/);
    expect(edgeFunction).toMatch(/DENO_DEPLOYMENT_ID/);
    expect(edgeFunction).toMatch(/context\.supabaseAdmin\.rpc\("create_checkout_order"/);
    expect(checkoutMigration).toMatch(/revoke all on function public\.create_checkout_order[\s\S]*?from public, anon, authenticated/i);
    expect(checkoutMigration).toMatch(/grant execute on function public\.create_checkout_order[\s\S]*?to service_role/i);
  });
});
