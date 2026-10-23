import './environment.js';
import { closeDatabase } from '../../src/db.js';
import { processLegacyImportJob } from '../../src/services/legacy-import/worker.js';

try {
  await processLegacyImportJob({
    data: { importId: process.argv[2] },
    attemptsMade: Number(process.argv[3] ?? 0),
    opts: { attempts: 3 },
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await closeDatabase();
}
