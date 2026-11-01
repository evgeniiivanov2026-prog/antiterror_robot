import { loadConfig } from './config/env.js';
import { startBot } from './app.js';

const config = loadConfig();
const app = await startBot(config);

const shutdown = async () => {
  await app.stop();
  process.exit(0);
};

process.on('SIGINT', () => {
  void shutdown();
});
process.on('SIGTERM', () => {
  void shutdown();
});
