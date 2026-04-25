import 'dotenv/config';
import { runPendingMigrations } from '../services/migrations.js';

async function main(): Promise<void> {
  const applied = await runPendingMigrations();
  if (!applied.length) {
    console.log('[migrations] no pending migrations');
    return;
  }
  for (const filename of applied) {
    console.log(`[migrations] applied ${filename}`);
  }
}

main().catch((error) => {
  console.error('[migrations] failed', error);
  process.exit(1);
});
