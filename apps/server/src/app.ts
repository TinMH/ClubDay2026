/**
 * Factory Fastify — tách khỏi `listen()` để test được bằng `app.inject()`.
 * File nền tảng: ĐÓNG BĂNG. Muốn thêm route thì thêm vào file routes của mình,
 * không sửa file này.
 */
import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import { dirname, join as pathJoin } from 'node:path';
import { fileURLToPath } from 'node:url';

import { roundRoutes } from './routes/rounds.js';
import { streamRoutes } from './routes/stream.js';
import { adminRoutes } from './routes/admin.js';
import { mathRoutes } from './routes/math.js'; // TRACK A
import { drawRoutes } from './routes/draw.js'; // TRACK B
import { configRoutes } from './routes/config.js';
import { healthReport } from './lib/health.js';

// `src` và `dist` đều nằm ngay dưới apps/server → cùng trỏ tới apps/web/dist.
const here = dirname(fileURLToPath(import.meta.url));
const webDist = pathJoin(here, '../../web/dist');

export interface BuildOptions {
  logger?: boolean;
}

export async function buildApp(opts: BuildOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: opts.logger ?? true });

  await app.register(cors, { origin: true });

  app.get('/api/health', async () => ({
    ok: true,
    node: process.version,
    uptimeSec: Math.round(process.uptime()),
    ...(await healthReport()),
  }));

  await app.register(roundRoutes);
  await app.register(streamRoutes);
  await app.register(adminRoutes);
  await app.register(mathRoutes); // TRACK A — stub cho tới Wave 2
  await app.register(drawRoutes); // TRACK B — stub cho tới Wave 2
  await app.register(configRoutes);

  // Phục vụ luôn bản build của web → sự kiện chỉ cần 1 URL duy nhất.
  if (existsSync(webDist)) {
    await app.register(fastifyStatic, { root: webDist });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/')) return reply.code(404).send({ error: 'NOT_FOUND' });
      return reply.sendFile('index.html'); // SPA fallback
    });
  }

  return app;
}
