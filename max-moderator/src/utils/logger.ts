import pino, { type Logger } from 'pino';

export interface AppLogger {
  debug(obj: object, msg?: string): void;
  info(obj: object, msg?: string): void;
  warn(obj: object, msg?: string): void;
  error(obj: object, msg?: string): void;
  child(bindings: object): AppLogger;
}

const REDACT_PATHS = [
  'token',
  'authorization',
  'headers.authorization',
  'MAX_BOT_TOKEN',
  '*.token',
  '*.authorization',
  'req.headers.authorization',
];

export function createLogger(level: string, pretty = false): AppLogger {
  const destination = pretty
    ? pino.transport({
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'SYS:standard' },
      })
    : undefined;
  const logger = pino(
    {
      level,
      redact: { paths: REDACT_PATHS, censor: '[redacted]' },
      base: undefined,
    },
    destination,
  );
  return wrap(logger);
}

export function silentLogger(): AppLogger {
  const noop = () => undefined;
  const logger: AppLogger = {
    debug: noop,
    info: noop,
    warn: noop,
    error: noop,
    child: () => logger,
  };
  return logger;
}

function wrap(logger: Logger): AppLogger {
  return {
    debug: (obj, msg) => logger.debug(obj, msg),
    info: (obj, msg) => logger.info(obj, msg),
    warn: (obj, msg) => logger.warn(obj, msg),
    error: (obj, msg) => logger.error(obj, msg),
    child: (bindings) => wrap(logger.child(bindings)),
  };
}
