import { z } from 'zod';
import { LinkMode, ModerationAction } from '../domain/enums.js';

const emptyToUndefined = (value: unknown) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
};

const schema = z.object({
  MAX_BOT_TOKEN: z.string().trim().min(1, 'MAX_BOT_TOKEN is required'),
  DATABASE_URL: z.string().trim().min(1, 'DATABASE_URL is required'),
  REDIS_URL: z.string().trim().min(1, 'REDIS_URL is required'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  ADMIN_IDS: z.string().optional().default(''),
  DEFAULT_LINK_MODE: z.enum(['allow', 'deny', 'review']).default('review'),
  DEFAULT_WORD_ACTION: z
    .enum(['delete', 'warn', 'review', 'mute', 'kick', 'notify'])
    .default('delete'),
  MAX_DELETIONS_PER_SECOND: z.coerce.number().int().min(1).max(2).default(2),
  MAX_API_BASE_URL: z.string().url().default('https://platform-api2.max.ru'),
  BOT_MODE: z.enum(['polling', 'webhook']).default('polling'),
  WEBHOOK_DOMAIN: z.preprocess(emptyToUndefined, z.string().url().optional()),
  WEBHOOK_PATH: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  WEBHOOK_SECRET: z.preprocess(emptyToUndefined, z.string().min(8).optional()),
  WEBHOOK_PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  AI_MODERATION_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
});

export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'production';
  logLevel: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';
  adminIds: Set<string>;
  defaultLinkMode: LinkMode;
  defaultWordAction: ModerationAction;
  maxDeletionsPerSecond: number;
  apiBaseUrl: string;
  botMode: 'polling' | 'webhook';
  webhookDomain?: string;
  webhookPath?: string;
  webhookSecret?: string;
  webhookPort: number;
  aiModerationUrl?: string;
}

export interface LoadedEnv {
  token: string;
  databaseUrl: string;
  redisUrl: string;
  config: AppConfig;
}

const LINK_MODE: Record<'allow' | 'deny' | 'review', LinkMode> = {
  allow: LinkMode.ALLOW,
  deny: LinkMode.DENY,
  review: LinkMode.REVIEW,
};

const WORD_ACTION: Record<string, ModerationAction> = {
  delete: ModerationAction.DELETE,
  warn: ModerationAction.WARN,
  review: ModerationAction.REVIEW,
  mute: ModerationAction.MUTE,
  kick: ModerationAction.KICK,
  notify: ModerationAction.NOTIFY_ADMINS,
};

export function loadEnv(source: NodeJS.ProcessEnv): LoadedEnv {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => issue.message).join('; ');
    throw new Error(`Invalid environment: ${issues}`);
  }
  const env = parsed.data;
  if (env.AI_MODERATION_URL && !env.AI_MODERATION_URL.startsWith('https://')) {
    throw new Error('AI_MODERATION_URL must use https');
  }
  if (env.BOT_MODE === 'webhook' && !env.WEBHOOK_DOMAIN) {
    throw new Error('WEBHOOK_DOMAIN is required when BOT_MODE=webhook');
  }
  const adminIds = new Set(
    env.ADMIN_IDS.split(',')
      .map((item) => item.trim())
      .filter((item) => /^[1-9]\d{0,18}$/.test(item)),
  );
  const defaultWordAction = WORD_ACTION[env.DEFAULT_WORD_ACTION] ?? ModerationAction.DELETE;
  return {
    token: env.MAX_BOT_TOKEN,
    databaseUrl: env.DATABASE_URL,
    redisUrl: env.REDIS_URL,
    config: {
      nodeEnv: env.NODE_ENV,
      logLevel: env.LOG_LEVEL,
      adminIds,
      defaultLinkMode: LINK_MODE[env.DEFAULT_LINK_MODE],
      defaultWordAction,
      maxDeletionsPerSecond: env.MAX_DELETIONS_PER_SECOND,
      apiBaseUrl: env.MAX_API_BASE_URL.replace(/\/$/, ''),
      botMode: env.BOT_MODE,
      webhookDomain: env.WEBHOOK_DOMAIN,
      webhookPath: env.WEBHOOK_PATH,
      webhookSecret: env.WEBHOOK_SECRET,
      webhookPort: env.WEBHOOK_PORT,
      aiModerationUrl: env.AI_MODERATION_URL,
    },
  };
}

export function defaultChatSettings(
  chatId: string,
  config: Pick<AppConfig, 'defaultLinkMode' | 'defaultWordAction'>,
): ChatSettingsDefaults {
  return {
    chatId,
    linkMode: config.defaultLinkMode,
    defaultAction: config.defaultWordAction,
    language: 'ru',
    enabled: true,
    wholeWord: true,
    capsEnabled: true,
    capsRatio: 0.7,
    capsMinLength: 20,
    floodEnabled: true,
    floodMaxMessages: 5,
    floodWindowSec: 10,
    mentionEnabled: true,
    mentionMax: 5,
    repeatEnabled: true,
    repeatMax: 3,
    repeatWindowSec: 120,
    mediaMode: 'off',
    forwardMode: 'off',
    hardAction: ModerationAction.NOTIFY_ADMINS,
    muteMinutes: 15,
    allowPurge: false,
  };
}

type ChatSettingsDefaults = import('../domain/types.js').ChatSettingsRecord;
