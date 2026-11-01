import pino, { type Logger } from 'pino';

export function createLogger(level: string): Logger {
  return pino({
    level,
    redact: {
      paths: [
        'token',
        'MAX_BOT_TOKEN',
        'authorization',
        'Authorization',
        'req.headers.authorization',
        '*.token',
        '*.authorization',
        '*.Authorization',
      ],
      censor: '[redacted]',
    },
    base: undefined,
  });
}

export const logger = createLogger(process.env.LOG_LEVEL ?? 'info');
