const CHECKOUT_ACKNOWLEDGEMENT = 'I_UNDERSTAND_NO_PRODUCTION_CHECKOUT';
const ORIGINAL_PRODUCTION_PROJECT_REF = 'sxdfjtcbfpmwdwtgouea';

function defaultRuntimeEnvironment() {
  // Never spread or retain the complete import.meta.env object. Vite embeds
  // every VITE_* value when the whole object is referenced, including obsolete
  // variables that the application does not otherwise use.
  return {
    DEV: import.meta.env.DEV,
    BUILD_HOST_ENVIRONMENT: import.meta.env.BUILD_HOST_ENVIRONMENT,
    VITE_CHECKOUT_EXECUTION_MODE: import.meta.env.VITE_CHECKOUT_EXECUTION_MODE,
    VITE_DEPLOYMENT_ENVIRONMENT: import.meta.env.VITE_DEPLOYMENT_ENVIRONMENT,
    VITE_CHECKOUT_DISPOSABLE_ENV_ACK: import.meta.env.VITE_CHECKOUT_DISPOSABLE_ENV_ACK,
    VITE_CHECKOUT_ALLOWED_PROJECT_REF: import.meta.env.VITE_CHECKOUT_ALLOWED_PROJECT_REF,
    VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
  };
}

function getSupabaseTarget(urlValue) {
  try {
    const url = new URL(String(urlValue || ''));
    const isLocal = ['localhost', '127.0.0.1'].includes(url.hostname);
    const projectRef = url.hostname.endsWith('.supabase.co')
      ? url.hostname.slice(0, -'.supabase.co'.length)
      : '';
    return { isLocal, projectRef };
  } catch {
    return { isLocal: false, projectRef: '' };
  }
}

export const safeModeMessage =
  'Online ordering and live inventory are temporarily unavailable while the bookstore system is being secured.';

export function createRuntimeSafety(options = {}) {
  const viteEnvironment = options.environment || defaultRuntimeEnvironment();
  const checkoutMode = String(viteEnvironment.VITE_CHECKOUT_EXECUTION_MODE || '').trim();
  const deploymentEnvironment = String(viteEnvironment.VITE_DEPLOYMENT_ENVIRONMENT || '').trim();
  const buildHostEnvironment = String(viteEnvironment.BUILD_HOST_ENVIRONMENT || '').trim();
  const hasExplicitAcknowledgement =
    viteEnvironment.VITE_CHECKOUT_DISPOSABLE_ENV_ACK === CHECKOUT_ACKNOWLEDGEMENT;
  const isDevelopmentBuild = options.isDevelopment ?? Boolean(viteEnvironment.DEV);
  const backendTarget = getSupabaseTarget(viteEnvironment.VITE_SUPABASE_URL);
  const allowedProjectRef = String(viteEnvironment.VITE_CHECKOUT_ALLOWED_PROJECT_REF || '').trim();
  const isDisposableLocal = checkoutMode === 'local' && isDevelopmentBuild && backendTarget.isLocal;
  const isDisposableStaging =
    checkoutMode === 'staging' &&
    deploymentEnvironment === 'staging' &&
    buildHostEnvironment !== 'production' &&
    Boolean(allowedProjectRef) &&
    backendTarget.projectRef === allowedProjectRef &&
    backendTarget.projectRef !== ORIGINAL_PRODUCTION_PROJECT_REF;
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
