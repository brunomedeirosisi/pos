import 'dotenv/config';
import { app } from './app.js';
import { getEnv } from './config/env.js';
import { runPendingMigrations } from './services/migrations.js';
import { initializeLegacyImportWorker } from './services/legacy-importer.js';
import { logger } from './observability/logger.js';

async function bootstrap(): Promise<void> {
  const env = getEnv();
  await runPendingMigrations();
  await initializeLegacyImportWorker();

  const port = env.API_PORT;
  app.listen(port, () => {
    logger.info({ event: 'server_started', port }, 'API started');
  });
}

bootstrap().catch((error) => {
  logger.error(
    {
      event: 'server_startup_failed',
      error: error instanceof Error ? { message: error.message, stack: error.stack } : error,
    },
    'API failed to start'
  );
  process.exit(1);
});
