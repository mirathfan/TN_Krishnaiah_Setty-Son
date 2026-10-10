import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

import { getRouteFromLocation, isAdminRouteType } from '../src/lib/routes';
import { getForbiddenHostedVariableNames } from '../vite.config';

const projectFile = (relativePath) => new URL(`../${relativePath}`, import.meta.url);

describe('frontend routing', () => {
  it.each([
    ['/admin/login', 'adminLogin'],
    ['/admin/products', 'adminProducts'],
    ['/admin/orders', 'adminOrders'],
    ['/admin/anything-else', 'adminProducts'],
  ])('maps %s to a blocked admin route', (pathname, expectedType) => {
    const route = getRouteFromLocation({ pathname, hash: '' });
    expect(route.type).toBe(expectedType);
    expect(isAdminRouteType(route.type)).toBe(true);
  });

  it('keeps product hash routing and public storefront routing intact', () => {
    expect(getRouteFromLocation({ pathname: '/', hash: '#product/gita-kannada' })).toEqual({
      type: 'product',
      productId: 'gita-kannada',
    });
    expect(getRouteFromLocation({ pathname: '/', hash: '' })).toEqual({ type: 'store' });
  });
});

describe('Vercel production configuration', () => {
  it('classifies backend, admin, and checkout variables as forbidden for hosted read-only releases', () => {
    expect(getForbiddenHostedVariableNames({
      VERCEL_ENV: 'preview',
      VITE_ADMIN_PASSWORD: 'redacted',
      VITE_SUPABASE_URL: 'redacted',
      NEXT_PUBLIC_SUPABASE_URL: 'redacted',
      SUPABASE_SERVICE_ROLE_KEY: 'redacted',
      CHECKOUT_EXECUTION_MODE: 'redacted',
    })).toEqual([
      'CHECKOUT_EXECUTION_MODE',
      'NEXT_PUBLIC_SUPABASE_URL',
      'SUPABASE_SERVICE_ROLE_KEY',
      'VITE_ADMIN_PASSWORD',
      'VITE_SUPABASE_URL',
    ]);
  });

  it('rewrites SPA deep links to index.html', async () => {
    const config = JSON.parse(await readFile(projectFile('vercel.json'), 'utf8'));
    expect(config.rewrites).toContainEqual({ source: '/(.*)', destination: '/index.html' });
  });

  it('sets the expected browser security headers', async () => {
    const config = JSON.parse(await readFile(projectFile('vercel.json'), 'utf8'));
    const headers = Object.fromEntries(config.headers[0].headers.map(({ key, value }) => [key, value]));

    expect(headers['Content-Security-Policy']).toContain("default-src 'self'");
    expect(headers['Content-Security-Policy']).toContain("connect-src 'self'");
    expect(headers['Content-Security-Policy']).not.toContain('supabase.co');
    expect(headers['Content-Security-Policy']).toContain("frame-ancestors 'none'");
    expect(headers['Content-Security-Policy']).toContain('upgrade-insecure-requests');
    expect(headers['X-Content-Type-Options']).toBe('nosniff');
    expect(headers['X-Frame-Options']).toBe('DENY');
    expect(headers['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
    expect(headers['Permissions-Policy']).toContain('payment=()');
    expect(headers['Cross-Origin-Opener-Policy']).toBe('same-origin');
    expect(headers['Cross-Origin-Resource-Policy']).toBe('same-origin');
  });

  it('refuses Vercel previews that point at the original production backend', async () => {
    const viteConfig = await readFile(projectFile('vite.config.js'), 'utf8');
    const bundleAudit = await readFile(projectFile('scripts/audit-production-bundle.mjs'), 'utf8');

    expect(viteConfig).toMatch(/vercelEnvironment === 'preview'/);
    expect(viteConfig).toMatch(/originalProductionProjectRef/);
    expect(viteConfig).toMatch(/Refusing to build a Vercel preview/);
    expect(viteConfig).toMatch(/BUILD_HOST_ENVIRONMENT/);
    expect(viteConfig).toMatch(/forbiddenHostedVariableNames/);
    expect(viteConfig).toMatch(/VITE_ADMIN_/);
    expect(viteConfig).toMatch(/VITE_SUPABASE_/);
    expect(viteConfig).toMatch(/SUPABASE_/);
    expect(bundleAudit).toMatch(/\['preview', 'production'\]/);
    expect(bundleAudit).toMatch(/SupabaseClient\|GoTrueClient\|PostgrestClient/);
    expect(bundleAudit).toMatch(/functions\\\/v1\\\/checkout/);
  });
});

describe('client-side secret and sensitive-storage regression checks', () => {
  it('does not reference browser admin credentials or mock admin sessions', async () => {
    const authSource = await readFile(projectFile('src/services/authService.js'), 'utf8');
    expect(authSource).not.toMatch(/VITE_ADMIN_(?:USERNAME|PASSWORD)/);
    expect(authSource).not.toMatch(/localStorage/);
    expect(authSource).not.toMatch(/local-admin-session/);
  });

  it('does not persist customer profiles, addresses, or orders in localStorage', async () => {
    const appSource = await readFile(projectFile('src/App.jsx'), 'utf8');
    const orderSource = await readFile(projectFile('src/services/orderService.js'), 'utf8');

    expect(appSource).not.toMatch(/tnk-customer-(?:profile|bulk-profile|order-history)/);
    expect(orderSource).not.toMatch(/localStorage/);
    expect(orderSource).not.toMatch(/tnk-orders/);
    expect(appSource).toContain("const CUSTOMER_WISHLIST_STORAGE_KEY = 'tnk-customer-wishlist-v1'");
  });
});
