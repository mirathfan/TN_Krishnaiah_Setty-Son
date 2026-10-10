const PHASE_ONE_SECURITY_LOCK = true;

export const safeModeMessage =
  'Online ordering and live inventory are temporarily unavailable while the bookstore system is being secured.';

export function createRuntimeSafety() {
  // Phase 1 is deliberately code-locked. Re-enabling writes or admin access
  // requires a reviewed Phase 2 code change after server-side authorization,
  // RLS, and transactional checkout are in place.
  const isLocked = PHASE_ONE_SECURITY_LOCK;

  return Object.freeze({
    phase: 'production-hardening-phase-1',
    readOnly: isLocked,
    useBundledPreviewCatalog: isLocked,
    databaseWritesAllowed: false,
    adminAccessAllowed: false,
    orderSubmissionAllowed: false,
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
