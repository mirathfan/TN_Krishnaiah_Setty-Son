import { describe, expect, it } from 'vitest';

import {
  assertDatabaseWriteAllowed,
  canAccessAdmin,
  canSubmitLiveOrder,
  createRuntimeSafety,
  runtimeSafety,
} from '../src/config/runtimeSafety';
import { getAdminAuthMode, getCurrentAdminSession, signInAdmin } from '../src/services/authService';
import { createOrder } from '../src/services/orderService';
import { getActiveProducts } from '../src/services/productService';

describe('Phase 1 runtime safety', () => {
  it('is code-locked to read-only preview mode', () => {
    expect(createRuntimeSafety()).toEqual(runtimeSafety);
    expect(runtimeSafety).toMatchObject({
      readOnly: true,
      useBundledPreviewCatalog: true,
      databaseWritesAllowed: false,
      adminAccessAllowed: false,
      orderSubmissionAllowed: false,
    });
    expect(canAccessAdmin()).toBe(false);
    expect(canSubmitLiveOrder()).toBe(false);
  });

  it('fails closed for every database write', () => {
    expect(() => assertDatabaseWriteAllowed('Testing writes')).toThrow(/read-only mode/i);
  });

  it('blocks admin authentication without creating a mock session', async () => {
    expect(getAdminAuthMode()).toBe('blocked');
    await expect(getCurrentAdminSession()).resolves.toBeNull();
    await expect(signInAdmin({ email: 'admin@example.com', password: 'not-used' })).rejects.toThrow(
      /admin access is temporarily unavailable/i,
    );
  });

  it('blocks order creation before any storage fallback or network request', async () => {
    await expect(createOrder({ items: [] })).rejects.toThrow(/read-only mode/i);
  });

  it('serves only clearly marked bundled preview products', async () => {
    const products = await getActiveProducts();

    expect(products.length).toBeGreaterThan(0);
    expect(products.every((product) => product.isCatalogPreview === true)).toBe(true);
  });
});
