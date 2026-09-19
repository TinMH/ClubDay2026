import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { locatePlayer, statusFor } from './track.js';
import { currentBoard, submitPick } from '../services/spot-session.js';
import { SPOT_MAX_SIZE } from '../store/types.js';

/**
 * TRACK D — Ô KHÁC MÀU (API).
 *
 * Không có start hook: bàn chơi suy ra được từ (mã lượt, cấp) nên chẳng có gì
 * phải chuẩn bị lúc bắt đầu lượt, và cũng chẳng có gì phải lưu vào `Round`.
 */

const PickBody = z.object({
  playerId: z.string().min(1),
  level: z.number().int().min(1),
  index: z.number().int().min(0).max(SPOT_MAX_SIZE * SPOT_MAX_SIZE - 1),
  // Cố ý KHÔNG có `correct` hay `score`: server tự chấm.
});

export async function spotRoutes(app: FastifyInstance): Promise<void> {
  /**
   * Bàn chơi của cấp đang chơi.
   * Cần cho lần vào đầu tiên và khi người chơi tải lại trang giữa chừng.
   */
  app.get('/api/rounds/:id/board', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { playerId } = req.query as { playerId?: string };
    if (!playerId) return reply.code(400).send({ error: 'BAD_REQUEST' });

    const located = locatePlayer(id, playerId, 'spot');
    if (!located) return reply.code(404).send({ error: 'NOT_FOUND' });

    const { round, player } = located;
    return {
      roundId: round.id,
      status: round.status,
      level: player.spot.level,
      board: currentBoard(round, player),
      score: player.score,
      correct: player.correct,
      wrong: player.wrong,
      endsAt: round.endsAt,
      serverNow: Date.now(),
    };
  });

  /** Chạm một ô. Điểm do server quyết định — xem services/spot-session.ts. */
  app.post('/api/rounds/:id/pick', async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = PickBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'BAD_REQUEST' });

    const located = locatePlayer(id, parsed.data.playerId, 'spot');
    if (!located) return reply.code(404).send({ error: 'NOT_FOUND' });

    const { round, player } = located;
    const now = Date.now();
    const outcome = submitPick(round, player, parsed.data.level, parsed.data.index, now);

    if (!outcome.ok) {
      return reply
        .code(statusFor(outcome.code))
        .send({ error: outcome.code, score: player.score, serverNow: now });
    }

    return {
      correct: outcome.correct,
      score: outcome.score,
      level: outcome.level,
      board: outcome.board,
      correctCount: player.correct,
      wrongCount: player.wrong,
      serverNow: now,
    };
  });
}
