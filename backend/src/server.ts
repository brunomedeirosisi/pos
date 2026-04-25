import 'dotenv/config';
import { app } from './app.js';
import { getEnv } from './config/env.js';
import { runPendingMigrations } from './services/migrations.js';
import { initializeLegacyImportWorker } from './services/legacy-importer.js';

async function bootstrap(): Promise<void> {
  const env = getEnv();
  await runPendingMigrations();
  await initializeLegacyImportWorker();

  const port = env.API_PORT;
  app.listen(port, () => {
    console.log(`[api] up on :${port}`);
  });
}

bootstrap().catch((error) => {
  console.error('[api] failed to start', error);
  process.exit(1);
});
