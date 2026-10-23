import { describe, expect, it } from 'vitest';
import { restoreBackupWithRollback } from '../../src/services/backup-restore-service.js';
import { queueLegacyImportUseCase } from '../../src/modules/legacy-import/application/legacy-import-use-cases.js';
import { closeDatabase } from '../../src/db.js';
import { afterAll } from 'vitest';
afterAll(() => closeDatabase());
describe('phase zero destructive-operation containment', () => {
  it('refuses restore before touching the database or invoking tools', async () => {
    await expect(restoreBackupWithRollback({ actor: { userId: 'synthetic' }, filename: 'missing.zip' })).rejects.toMatchObject({ statusCode: 403, message: 'database_restore_disabled_pending_recovery_validation' });
  });
  it('refuses overwrite before persisting or queueing a destructive job', async () => {
    await expect(queueLegacyImportUseCase({ sessionId: 'synthetic', sessionDir: '/never-used', overwrite: true, userId: 'synthetic', files: [] })).rejects.toMatchObject({ statusCode: 403, message: 'legacy_overwrite_disabled_pending_recovery_validation' });
  });
});
