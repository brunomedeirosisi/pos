import { getEnv } from '../config/env.js';
import { forbidden } from '../errors.js';

/** Temporary containment until recovery and overwrite gates are proven (TSK-003/004). */
export function assertDestructiveOperationEnabled(operation: 'restore' | 'legacy-overwrite'): void {
  const env = getEnv();
  const enabled = operation === 'restore' ? env.ENABLE_DATABASE_RESTORE : env.ENABLE_LEGACY_OVERWRITE;
  if (!enabled) throw forbidden(operation === 'restore' ? 'database_restore_disabled_pending_recovery_validation' : 'legacy_overwrite_disabled_pending_recovery_validation');
}
