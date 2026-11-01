import { z } from 'zod';
import { LinkMode, ModerationAction } from '../domain/enums.js';

const schema = z.object({
  MAX_BOT_TOKEN: z.string().min(1),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  ADMIN_IDS: z.string().default(''),
  DEFAULT_LINK_MODE: z.enum(['allow', 'deny', 'review']).default('review'),
  DEFAULT_WORD_ACTION: z.enum(['delete', 'warn', 'review', 'notify_admins']).default('delete'),
  MAX_DELETIONS_PER_SECOND: z.coerce.number().int().min(1).max(2).default(2),
  MAX_API_BASE_URL: z.string().url().default('https://platform-api2.max.ru'),
  BOT_MODE: z.enum(['polling', 'webhook']).default('polling'),
  WEBHOOK_PORT: z.coerce.number().int().positive().default(8088),
  WEBHOOK_PATH: z.string().startsWith('/').default('/webhook'),
  WEBHOOK_SECRET: z.string().optional().default(''),
  WEBHOOK_DOMAIN: z.string().optional().default(''),
});

export interface AppConfig {
  token: string;
  databaseUrl: string;
  redisUrl: string;
  nodeEnv: 'development' | 'test' | 'production';
  logLevel: string;
  adminIds: Set<string>;
  defaultLinkMode: LinkMode;
  defaultWordAction: ModerationAction;
  maxDeletionsPerSecond: number;
  apiBaseUrl: string;
  botMode: 'polling' | 'webhook';
  webhookPort: number;
  webhookPath: string;
  webhookSecret: string;
  webhookDomain: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => issue.path.join('.') || 'env').join(', ');
    throw new Error(`Некорректное окружение: ${details}`);
  }
  const value = parsed.data;
  return {
    token: value.MAX_BOT_TOKEN,
    databaseUrl: value.DATABASE_URL,
    redisUrl: value.REDIS_URL,
    nodeEnv: value.NODE_ENV,
    logLevel: value.LOG_LEVEL,
    adminIds: parseAdminIds(value.ADMIN_IDS),
    defaultLinkMode: value.DEFAULT_LINK_MODE as LinkMode,
    defaultWordAction: toAction(value.DEFAULT_WORD_ACTION),
    maxDeletionsPerSecond: value.MAX_DELETIONS_PER_SECOND,
    apiBaseUrl: value.MAX_API_BASE_URL,
    botMode: value.BOT_MODE,
    webhookPort: value.WEBHOOK_PORT,
    webhookPath: value.WEBHOOK_PATH,
    webhookSecret: value.WEBHOOK_SECRET,
    webhookDomain: value.WEBHOOK_DOMAIN,
  };
}

function parseAdminIds(raw: string): Set<string> {
  return new Set(
    raw
      .split(/[,\s]+/)
      .map((item) => item.trim())
      .filter((item) => /^[0-9]+$/.test(item)),
  );
}

function toAction(value: string): ModerationAction {
  switch (value) {
    case 'warn':
      return ModerationAction.WARN;
    case 'review':
      return ModerationAction.REVIEW;
    case 'notify_admins':
      return ModerationAction.NOTIFY_ADMINS;
    default:
      return ModerationAction.DELETE;
  }
}
