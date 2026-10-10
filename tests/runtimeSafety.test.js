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

  it('permits checkout only with an explicit disposable local or staging acknowledgement', () => {
    const acknowledgement = 'I_UNDERSTAND_NO_PRODUCTION_CHECKOUT';
    const localSafety = createRuntimeSafety({
      isDevelopment: true,
      environment: {
        VITE_CHECKOUT_EXECUTION_MODE: 'local',
        VITE_CHECKOUT_DISPOSABLE_ENV_ACK: acknowledgement,
      },
    });
    const stagingSafety = createRuntimeSafety({
      isDevelopment: false,
      environment: {
        VITE_CHECKOUT_EXECUTION_MODE: 'staging',
        VITE_DEPLOYMENT_ENVIRONMENT: 'staging',
        VITE_CHECKOUT_DISPOSABLE_ENV_ACK: acknowledgement,
      },
    });

    expect(canSubmitLiveOrder(localSafety)).toBe(true);
    expect(canSubmitLiveOrder(stagingSafety)).toBe(true);
    expect(canAccessAdmin(localSafety)).toBe(false);
    expect(canAccessAdmin(stagingSafety)).toBe(false);
  });

  it('keeps production and partially configured environments fail-closed', () => {
    const acknowledgement = 'I_UNDERSTAND_NO_PRODUCTION_CHECKOUT';
    const attemptedProduction = createRuntimeSafety({
      isDevelopment: false,
      environment: {
        VITE_CHECKOUT_EXECUTION_MODE: 'staging',
        VITE_DEPLOYMENT_ENVIRONMENT: 'production',
        VITE_CHECKOUT_DISPOSABLE_ENV_ACK: acknowledgement,
      },
    });
    const missingAcknowledgement = createRuntimeSafety({
      isDevelopment: true,
      environment: { VITE_CHECKOUT_EXECUTION_MODE: 'local' },
    });

    expect(canSubmitLiveOrder(attemptedProduction)).toBe(false);
    expect(canSubmitLiveOrder(missingAcknowledgement)).toBe(false);
    expect(attemptedProduction.readOnly).toBe(true);
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
