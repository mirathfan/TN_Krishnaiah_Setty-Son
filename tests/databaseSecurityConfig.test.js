import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const projectFile = (relativePath) => new URL(`../${relativePath}`, import.meta.url);
const baselinePath = 'supabase/migrations/20261010015250_baseline_bookstore_schema.sql';
const securityPath = 'supabase/migrations/20261010015254_phase_2a_admin_authorization_rls_storage.sql';

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

  it('disables local public registration and keeps Phase 1 code-locked', async () => {
    const config = await readFile(projectFile('supabase/config.toml'), 'utf8');
    const safety = await readFile(projectFile('src/config/runtimeSafety.js'), 'utf8');

    expect(config).toMatch(/\[auth\][\s\S]*?enable_signup = false/);
    expect(config).toMatch(/\[auth\.email\][\s\S]*?enable_signup = true/);
    expect(config).toMatch(/enable_anonymous_sign_ins = false/);
    expect(safety).toMatch(/const PHASE_ONE_SECURITY_LOCK = true/);
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
});
