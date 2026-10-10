const CHECKOUT_ACKNOWLEDGEMENT = 'I_UNDERSTAND_NO_PRODUCTION_CHECKOUT';

export const safeModeMessage =
  'Online ordering and live inventory are temporarily unavailable while the bookstore system is being secured.';

export function createRuntimeSafety(options = {}) {
  const viteEnvironment = options.environment || import.meta.env || {};
  const checkoutMode = String(viteEnvironment.VITE_CHECKOUT_EXECUTION_MODE || '').trim();
  const deploymentEnvironment = String(viteEnvironment.VITE_DEPLOYMENT_ENVIRONMENT || '').trim();
  const hasExplicitAcknowledgement =
    viteEnvironment.VITE_CHECKOUT_DISPOSABLE_ENV_ACK === CHECKOUT_ACKNOWLEDGEMENT;
  const isDevelopmentBuild = options.isDevelopment ?? Boolean(viteEnvironment.DEV);
  const isDisposableLocal = checkoutMode === 'local' && isDevelopmentBuild;
  const isDisposableStaging = checkoutMode === 'staging' && deploymentEnvironment === 'staging';
  const checkoutEnabled = hasExplicitAcknowledgement && (isDisposableLocal || isDisposableStaging);

  return Object.freeze({
    phase: 'production-hardening-phase-2b',
    readOnly: !checkoutEnabled,
    useBundledPreviewCatalog: !checkoutEnabled,
    databaseWritesAllowed: checkoutEnabled,
    adminAccessAllowed: false,
    orderSubmissionAllowed: checkoutEnabled,
    checkoutExecutionMode: checkoutEnabled ? checkoutMode : 'disabled',
  });
}

export const runtimeSafety = createRuntimeSafety();

export function canAccessAdmin(safety = runtimeSafety) {
  return safety.adminAccessAllowed === true && safety.readOnly === false;
}

export function canSubmitLiveOrder(safety = runtimeSafety) {
  return safety.orderSubmissionAllowed === true && safety.databaseWritesAllowed === true && safety.readOnly === false;
}

export function assertDatabaseWriteAllowed(operation = 'This action', safety = runtimeSafety) {
  if (safety.databaseWritesAllowed !== true || safety.readOnly !== false) {
    throw new Error(`${operation} is unavailable while the bookstore is in read-only mode.`);
  }
}
