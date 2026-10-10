import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

import { getRouteFromLocation, isAdminRouteType } from '../src/lib/routes';

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
  it('rewrites SPA deep links to index.html', async () => {
    const config = JSON.parse(await readFile(projectFile('vercel.json'), 'utf8'));
    expect(config.rewrites).toContainEqual({ source: '/(.*)', destination: '/index.html' });
  });

  it('sets the expected browser security headers', async () => {
    const config = JSON.parse(await readFile(projectFile('vercel.json'), 'utf8'));
    const headers = Object.fromEntries(config.headers[0].headers.map(({ key, value }) => [key, value]));

    expect(headers['Content-Security-Policy']).toContain("default-src 'self'");
    expect(headers['Content-Security-Policy']).toContain("frame-ancestors 'none'");
    expect(headers['X-Content-Type-Options']).toBe('nosniff');
    expect(headers['X-Frame-Options']).toBe('DENY');
    expect(headers['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
    expect(headers['Permissions-Policy']).toContain('payment=()');
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
