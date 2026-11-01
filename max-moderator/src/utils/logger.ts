import pino, { type Logger as PinoLogger } from 'pino';
import type { AppEnv } from '../config/env.js';

export interface Logger {
  debug(obj: object, msg?: string): void;
  info(obj: object, msg?: string): void;
  warn(obj: object, msg?: string): void;
  error(obj: object, msg?: string): void;
  child(bindings: object): Logger;
}

export const silentLogger: Logger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
  child() {
    return silentLogger;
  },
};

function scrubString(value: string, secret: string): string {
  if (secret.length < 4 || !value.includes(secret)) return value;
  return value.split(secret).join('[redacted]');
}

function scrub(value: unknown, secret: string, depth = 0): unknown {
  if (secret.length < 4 || depth > 5) return value;
  if (typeof value === 'string') return scrubString(value, secret);
  if (value instanceof Error) {
    return {
      name: value.name,
      message: scrubString(value.message, secret),
    };
  }
  if (Array.isArray(value)) return value.map((item) => scrub(item, secret, depth + 1));
  if (value && typeof value === 'object') {
    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      if (/token|authorization|password|secret/i.test(key)) {
        output[key] = '[redacted]';
        continue;
      }
      output[key] = scrub(item, secret, depth + 1);
    }
    return output;
  }
  return value;
}

class ScrubbingLogger implements Logger {
  constructor(
    private readonly inner: PinoLogger,
    private readonly secret: string,
  ) {}

  debug(obj: object, msg?: string): void {
    this.inner.debug(
      scrub(obj, this.secret) as object,
      msg ? scrubString(msg, this.secret) : undefined,
    );
  }

  info(obj: object, msg?: string): void {
    this.inner.info(
      scrub(obj, this.secret) as object,
      msg ? scrubString(msg, this.secret) : undefined,
    );
  }

  warn(obj: object, msg?: string): void {
    this.inner.warn(
      scrub(obj, this.secret) as object,
      msg ? scrubString(msg, this.secret) : undefined,
    );
  }

  error(obj: object, msg?: string): void {
    this.inner.error(
      scrub(obj, this.secret) as object,
      msg ? scrubString(msg, this.secret) : undefined,
    );
  }

  child(bindings: object): Logger {
    return new ScrubbingLogger(
      this.inner.child(scrub(bindings, this.secret) as object),
      this.secret,
    );
  }
}

export function createLogger(env: Pick<AppEnv, 'logLevel' | 'token' | 'nodeEnv'>): Logger {
  const inner = pino({
    level: env.logLevel,
    redact: {
      paths: [
        'token',
        'authorization',
        'MAX_BOT_TOKEN',
        'req.headers.authorization',
        '*.token',
        '*.authorization',
      ],
      censor: '[redacted]',
    },
    ...(env.nodeEnv === 'development'
      ? { transport: { target: 'pino-pretty', options: { colorize: true } } }
      : {}),
  });
  return new ScrubbingLogger(inner, env.token);
}
