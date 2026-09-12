import type { FastifyInstance } from 'fastify';
import { getRound, subscribe } from '../store/store.js';
import { toRoundState } from '../store/state.js';

/**
 * SSE — đẩy trạng thái lượt mỗi khi `round.version` đổi.
 *
 * Dùng SSE thay WebSocket: chỉ cần một chiều, đi qua HTTP thường, và trình duyệt
 * tự kết nối lại khi mạng chập chờn (quan trọng ở Wi-Fi sự kiện).
 */
export async function streamRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/rounds/:id/stream', async (req, reply) => {
    const { id } = req.params as { id: string };
    const round = getRound(id);
    if (!round) return reply.code(404).send({ error: 'NOT_FOUND' });

    // Tự quản lý socket thô — Fastify không được đụng vào reply này nữa.
    reply.hijack();
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const send = (): void => {
      reply.raw.write(`event: state\ndata: ${JSON.stringify(toRoundState(round))}\n\n`);
    };

    send(); // gửi ngay trạng thái hiện tại để client không phải chờ
    const unsubscribe = subscribe(round.id, send);

    // Comment định kỳ giữ kết nối sống qua proxy/wi-fi.
    const keepAlive = setInterval(() => reply.raw.write(': ping\n\n'), 15_000);
    keepAlive.unref();

    req.raw.on('close', () => {
      clearInterval(keepAlive);
      unsubscribe();
    });
  });
}
