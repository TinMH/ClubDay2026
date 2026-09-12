/**
 * ClubDay server — khung khởi động (Phase 0).
 * Model AI + các route game sẽ được thêm ở Phase 1–3.
 */
import Fastify from 'fastify';

const PORT = Number(process.env.PORT ?? 8787);
const HOST = process.env.HOST ?? '0.0.0.0';

const app = Fastify({ logger: true });

app.get('/api/health', async () => ({
  ok: true,
  model: 'not-loaded-yet',
  node: process.version,
  uptimeSec: Math.round(process.uptime()),
}));

try {
  await app.listen({ port: PORT, host: HOST });
  console.log(`
  ClubDay server: http://localhost:${PORT}`);
  console.log(`  Health check  : http://localhost:${PORT}/api/health
`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
