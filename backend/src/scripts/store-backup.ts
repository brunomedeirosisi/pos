import { createManagedBackup } from '../services/backup-restore-service.js';
import { preflightBackup } from '../services/backup-preflight.js';
import { closeDatabase } from '../db.js';

try {
  const preflight = await preflightBackup();
  if (!preflight.ready) throw new Error('backup_preflight_not_ready');
  if (!process.argv.includes('--check')) await createManagedBackup({ userId: null });
  console.log(JSON.stringify({ ready: true, created: !process.argv.includes('--check') }));
} finally { await closeDatabase(); }
