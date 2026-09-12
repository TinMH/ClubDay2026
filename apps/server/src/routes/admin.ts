import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { allRounds, createRound, resetAll } from '../store/store.js';
import { skipRound } from '../store/lobby.js';
import { toRoundState } from '../store/state.js';
import { requireAdmin } from './admin-guard.js';

const CreateBody = z.object({ game: z.enum(['math', 'draw']) });

export async function adminRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireAdmin);

  /** BTC tạo lượt mới. Trả về mã lượt để in QR. */
  app.post('/api/admin/rounds', async (req, reply) => {
    const parsed = CreateBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'BAD_REQUEST' });
    const round = createRound(parsed.data.game);
    return { roundId: round.id, game: round.game, state: toRoundState(round) };
  });

  /** Danh sách lượt gần đây — màn hình BTC. */
  app.get('/api/admin/rounds', async () => ({
    rounds: allRounds()
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 30)
      .map((r) => ({
        roundId: r.id,
        game: r.game,
        status: r.status,
        playerCount: r.players.size,
        createdAt: r.createdAt,
        live: r.live !== false,
      })),
  }));

  /** Bỏ qua lượt đang chờ hoặc đang dở → kết thúc ngay. */
  app.post('/api/admin/rounds/:id/skip', async (req, reply) => {
    const { id } = req.params as { id: string };
    const result = skipRound(id);
    if (!result.ok) return reply.code(404).send({ error: result.code });
    return { ok: true, state: toRoundState(result.round) };
  });

  /** Xoá sạch mọi lượt — dùng khi thử nghiệm, KHÔNG dùng giữa sự kiện. */
  app.post('/api/admin/reset', async () => {
    resetAll();
    return { ok: true };
  });
}
