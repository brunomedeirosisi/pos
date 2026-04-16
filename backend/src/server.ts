import 'dotenv/config';
import { createApp } from './app.js';
import { logger } from './observability/logger.js';

const port = process.env.API_PORT || 8080;
const app = createApp();
app.listen(port, () => {
  logger.info({ event: 'server_started', port: Number(port) }, 'API started');
});
