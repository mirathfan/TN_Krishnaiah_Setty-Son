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
        VITE_SUPABASE_URL: 'http://127.0.0.1:57321',
      },
    });
    const stagingSafety = createRuntimeSafety({
      isDevelopment: false,
      environment: {
        VITE_CHECKOUT_EXECUTION_MODE: 'staging',
        VITE_DEPLOYMENT_ENVIRONMENT: 'staging',
        VITE_CHECKOUT_DISPOSABLE_ENV_ACK: acknowledgement,
        VITE_CHECKOUT_ALLOWED_PROJECT_REF: 'disposable-staging-ref',
        VITE_SUPABASE_URL: 'https://disposable-staging-ref.supabase.co',
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
        VITE_CHECKOUT_ALLOWED_PROJECT_REF: 'sxdfjtcbfpmwdwtgouea',
        VITE_SUPABASE_URL: 'https://sxdfjtcbfpmwdwtgouea.supabase.co',
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

  it('keeps a Vercel production build locked if staging variables are copied into it', () => {
    const safety = createRuntimeSafety({
      isDevelopment: false,
      environment: {
        BUILD_HOST_ENVIRONMENT: 'production',
        VITE_CHECKOUT_EXECUTION_MODE: 'staging',
        VITE_DEPLOYMENT_ENVIRONMENT: 'staging',
        VITE_CHECKOUT_DISPOSABLE_ENV_ACK: 'I_UNDERSTAND_NO_PRODUCTION_CHECKOUT',
        VITE_CHECKOUT_ALLOWED_PROJECT_REF: 'disposable-staging-ref',
        VITE_SUPABASE_URL: 'https://disposable-staging-ref.supabase.co',
      },
    });

    expect(safety.readOnly).toBe(true);
    expect(canSubmitLiveOrder(safety)).toBe(false);
  });

  it('rejects production backends and remote URLs in disposable local mode', () => {
    const acknowledgement = 'I_UNDERSTAND_NO_PRODUCTION_CHECKOUT';
    const localModeWithRemoteBackend = createRuntimeSafety({
      isDevelopment: true,
      environment: {
        VITE_CHECKOUT_EXECUTION_MODE: 'local',
        VITE_CHECKOUT_DISPOSABLE_ENV_ACK: acknowledgement,
        VITE_SUPABASE_URL: 'https://sxdfjtcbfpmwdwtgouea.supabase.co',
      },
    });
    const stagingModeWithProductionBackend = createRuntimeSafety({
      isDevelopment: false,
      environment: {
        VITE_CHECKOUT_EXECUTION_MODE: 'staging',
        VITE_DEPLOYMENT_ENVIRONMENT: 'staging',
        VITE_CHECKOUT_DISPOSABLE_ENV_ACK: acknowledgement,
        VITE_CHECKOUT_ALLOWED_PROJECT_REF: 'sxdfjtcbfpmwdwtgouea',
        VITE_SUPABASE_URL: 'https://sxdfjtcbfpmwdwtgouea.supabase.co',
      },
    });

    expect(canSubmitLiveOrder(localModeWithRemoteBackend)).toBe(false);
    expect(canSubmitLiveOrder(stagingModeWithProductionBackend)).toBe(false);
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
