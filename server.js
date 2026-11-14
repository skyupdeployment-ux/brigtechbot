'use strict';

const http = require('http');
const env = require('./config/env');
const logger = require('./utils/logger');

env.validate();

const app = require('./app');
const { connectDB, disconnectDB } = require('./config/db');
const botService = require('./services/botService');
const realtime = require('./services/realtime');

async function main() {
  await connectDB();
  await botService.ensureDefaultBot();

  const server = http.createServer(app);
  realtime.init(server);
  server.listen(env.PORT, () => logger.info(`Brightech bot backend listening on http://localhost:${env.PORT} (${env.NODE_ENV})`));

  const shutdown = async (signal) => {
    logger.info(`${signal} received, shutting down`);
    server.close(async () => {
      await disconnectDB().catch(() => {});
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

process.on('unhandledRejection', (reason) => logger.error('Unhandled rejection', reason));
process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception', err);
  process.exit(1);
});

main().catch((err) => {
  logger.error('Failed to start', err.message);
  process.exit(1);
});
