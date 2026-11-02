import { z } from 'zod';
import { ModerationAction, parseAction, type LinkMode } from '../moderation/types.js';

const schema = z.object({
  MAX_BOT_TOKEN: z.string().min(1, 'MAX_BOT_TOKEN is required'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  ADMIN_IDS: z.string().optional().default(''),
  DEFAULT_LINK_MODE: z.enum(['allow', 'deny', 'review']).default('review'),
  DEFAULT_WORD_ACTION: z.string().default('delete'),
  MAX_DELETIONS_PER_SECOND: z.coerce.number().int().min(1).max(2).default(2),
  BOT_MODE: z.enum(['polling', 'webhook']).default('polling'),
  WEBHOOK_PORT: z.coerce.number().int().positive().default(8080),
  WEBHOOK_PATH: z.string().min(1).default('/max/webhook'),
  WEBHOOK_SECRET: z.string().optional().default(''),
  WEBHOOK_DOMAIN: z.string().optional().default(''),
  AI_MODERATION_URL: z.string().optional().default(''),
  AI_MODERATION_TOKEN: z.string().optional().default(''),
});

export interface AppEnv {
  token: string;
  databaseUrl: string;
  redisUrl: string;
  nodeEnv: 'development' | 'test' | 'production';
  logLevel: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';
  adminIds: string[];
  defaultLinkMode: LinkMode;
  defaultWordAction: ModerationAction;
  deletionsPerSecond: number;
  botMode: 'polling' | 'webhook';
  webhookPort: number;
  webhookPath: string;
  webhookSecret: string;
  webhookDomain: string;
  aiModerationUrl: string;
  aiModerationToken: string;
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): AppEnv {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const message = parsed.error.issues.map((issue) => issue.message).join('; ');
    throw new Error(`Invalid environment: ${message}`);
  }
  const value = parsed.data;
  const action = parseAction(value.DEFAULT_WORD_ACTION);
  if (!action) {
    throw new Error('Invalid environment: DEFAULT_WORD_ACTION is not a known action');
  }
  if (value.BOT_MODE === 'webhook' && value.WEBHOOK_DOMAIN.trim() === '') {
    throw new Error('Invalid environment: WEBHOOK_DOMAIN is required when BOT_MODE=webhook');
  }
  return {
    token: value.MAX_BOT_TOKEN,
    databaseUrl: value.DATABASE_URL,
    redisUrl: value.REDIS_URL,
    nodeEnv: value.NODE_ENV,
    logLevel: value.LOG_LEVEL,
    adminIds: value.ADMIN_IDS.split(',')
      .map((item) => item.trim())
      .filter((item) => item.length > 0),
    defaultLinkMode: value.DEFAULT_LINK_MODE,
    defaultWordAction: action,
    deletionsPerSecond: value.MAX_DELETIONS_PER_SECOND,
    botMode: value.BOT_MODE,
    webhookPort: value.WEBHOOK_PORT,
    webhookPath: value.WEBHOOK_PATH,
    webhookSecret: value.WEBHOOK_SECRET,
    webhookDomain: value.WEBHOOK_DOMAIN,
    aiModerationUrl: value.AI_MODERATION_URL.trim(),
    aiModerationToken: value.AI_MODERATION_TOKEN,
  };
}
