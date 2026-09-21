import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import fastifyStatic from '@fastify/static';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { config } from './config.js';
import { getDb } from './db/index.js';
import { AccountsStorageService } from './services/accountsStorage.js';
import { quotaScheduler } from './services/scheduler.js';
import { wsHub } from './services/websocket.js';
import { authMiddleware } from './middleware/auth.js';
import { apiRoutes } from './routes/api.js';
import { authRoutes } from './routes/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function bootstrap() {
  const fastify = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info'
    }
  });

  // 1. CORS
  await fastify.register(cors, {
    origin: true,
    credentials: true
  });

  // 2. WebSockets
  if (config.enableWebSocket) {
    await fastify.register(websocket);

    fastify.register(async function (wsScope) {
      wsScope.get('/ws', { websocket: true }, (socket, req) => {
        wsHub.registerClient(socket);
      });
    });
  }

  // 3. Security & Auth Middleware
  fastify.addHook('preHandler', authMiddleware);

  // 4. API & Auth Routes
  await fastify.register(apiRoutes);
  await fastify.register(authRoutes);

  // 5. Static Frontend Serving (in production or when dist exists)
  const candidateFrontendPaths = [
    path.resolve(__dirname, '../../frontend/dist'),
    path.resolve(__dirname, '../frontend/dist'),
    path.resolve(process.cwd(), 'apps/frontend/dist'),
    path.resolve(process.cwd(), 'dist/frontend')
  ];

  const frontendDist = candidateFrontendPaths.find(p => fs.existsSync(p));

  if (frontendDist) {
    console.log(`[Frontend] Serving static frontend from ${frontendDist}`);
    await fastify.register(fastifyStatic, {
      root: frontendDist,
      prefix: '/',
      wildcard: false
    });

    // SPA fallback route
    fastify.setNotFoundHandler(async (req, reply) => {
      if (req.url.startsWith('/api') || req.url.startsWith('/ws')) {
        return reply.status(404).send({ error: 'Endpoint not found' });
      }
      return reply.sendFile('index.html');
    });
  } else {
    fastify.get('/', async () => ({
      message: 'AI Quota Dashboard API Server running. Frontend build not found.',
      apiDocs: '/api/status'
    }));
  }

  // 6. Initialize Database & Storage
  getDb();
  AccountsStorageService.init();

  // 7. Start Polling Scheduler
  quotaScheduler.start(config.pollIntervalSeconds);

  // 8. Start HTTP Server
  try {
    await fastify.listen({ port: config.port, host: config.host });
    console.log(`\n=============================================================`);
    console.log(`  AI Quota Dashboard started at http://${config.host}:${config.port}`);
    console.log(`  Data Directory: ${config.dataDir}`);
    console.log(`  Auth Mode:      ${config.authMode}`);
    console.log(`=============================================================\n`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }

  // Graceful shutdown
  const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
  for (const signal of signals) {
    process.on(signal, async () => {
      console.log(`[Server] Received ${signal}, gracefully shutting down...`);
      quotaScheduler.stop();
      AccountsStorageService.stopWatcher();
      await fastify.close();
      process.exit(0);
    });
  }
}

bootstrap().catch(err => {
  console.error('[Bootstrap] Fatal startup error:', err);
  process.exit(1);
});
