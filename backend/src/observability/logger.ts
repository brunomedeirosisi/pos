import pino from 'pino';

const level = process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'production' ? 'info' : 'debug');
const service = process.env.SERVICE_NAME ?? 'pos-api';
const environment = process.env.NODE_ENV ?? 'development';

export const logger = pino({
  level,
  base: {
    service,
    env: environment,
  },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.body.password',
      'req.body.confirmation',
      'err.stack',
      'err.config',
    ],
    remove: false,
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

