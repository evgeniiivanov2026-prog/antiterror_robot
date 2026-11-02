import type { AppEnv } from '../config/env.js';
import { JsonCache, type KeyValue } from '../database/cache.js';
import type { Repositories } from '../database/repositories/types.js';
import {
  DisabledAiModerator,
  HttpAiModerator,
  type AiModerator,
} from '../moderation/ai-moderator.js';
import { ModerationPipeline } from '../moderation/moderation-pipeline.service.js';
import { ChatRateLimiter } from '../max/rate-limiter.js';
import type { MaxGateway } from '../max/gateway.js';
import { MessageRemover } from '../max/message-remover.js';
import type { Logger } from '../utils/logger.js';
import { AdminHandler } from './handlers/admin.handler.js';
import { MessageHandler } from './handlers/message.handler.js';
import { PrivilegeService } from './privileges.js';

export interface ModerationApp {
  handleUpdate(update: unknown): Promise<void>;
}

export function createModerationApp(options: {
  env: Pick<AppEnv, 'adminIds' | 'deletionsPerSecond' | 'aiModerationUrl' | 'aiModerationToken'>;
  repositories: Repositories;
  gateway: MaxGateway;
  kv: KeyValue;
  logger: Logger;
  now?: () => number;
  ai?: AiModerator;
}): ModerationApp {
  const now = options.now ?? Date.now;
  const cache = new JsonCache(options.kv, options.logger);
  const remover = new MessageRemover(
    options.gateway,
    new ChatRateLimiter({ limitPerSecond: options.env.deletionsPerSecond, now }),
    options.logger,
  );
  const ai =
    options.ai ??
    (options.env.aiModerationUrl
      ? new HttpAiModerator(
          options.env.aiModerationUrl,
          options.env.aiModerationToken,
          options.logger,
        )
      : new DisabledAiModerator());
  const pipeline = new ModerationPipeline({
    repositories: options.repositories,
    cache,
    kv: options.kv,
    gateway: options.gateway,
    remover,
    logger: options.logger,
    ai,
    adminIds: options.env.adminIds,
    now,
  });
  const privileges = new PrivilegeService(
    options.repositories,
    options.gateway,
    cache,
    options.kv,
    options.env.adminIds,
  );
  const admin = new AdminHandler(options.repositories, options.gateway, remover, cache, options.kv);
  const messages = new MessageHandler(
    pipeline,
    admin,
    privileges,
    options.repositories.events,
    options.gateway,
    options.logger,
  );
  return {
    handleUpdate: (update) => messages.handle(update),
  };
}
