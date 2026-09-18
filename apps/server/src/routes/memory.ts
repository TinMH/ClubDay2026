import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { registerStartHook } from '../store/lobby.js';
import { findPlayer } from '../store/store.js';
import { seedFromRoundId } from '../services/math-gen.js';
import { generateSequence } from '../services/memory-gen.js';
import { currentSequence, submitReplay } from '../services/memory-session.js';
import { MEMORY_PAD_COUNT, MEMORY_STEP_MS } from '../store/types.js';

/**
 * TRACK C — NHỚ NHANH (API).
 *
 * Chuỗi cần nhớ do server giữ. Client chỉ bao giờ thấy chuỗi của ĐÚNG cấp đang
 * chơi — phần còn lại nằm im ở server, nên không có cách nào đọc trước.
 */

const ReplayBody = z.object({
  playerId: z.string().min(1),
  level: z.number().int().min(1),
  taps: z.array(z.number().int().min(0).max(MEMORY_PAD_COUNT - 1)).min(1).max(64),
  // Cố ý KHÔNG có `score`: server tự chấm.
});

/** Mã lỗi nghiệp vụ → HTTP status. */
const CODE_STATUS: Record<string, number> = {
  NOT_PLAYING: 409,
  TIME_UP: 409,
  BAD_LEVEL: 400,
  TOO_FAST: 429,
};

/** Tra người chơi và xác nhận họ thuộc ĐÚNG lượt này (không thì trả null). */
function locate(roundId: string, playerId: string) {
  const found = findPlayer(playerId);
  if (!found) return null;
  if (found.round.id.toUpperCase() !== roundId.toUpperCase()) return null;
  if (found.round.game !== 'memory') return null;
  return found;
}

export async function memoryRoutes(app: FastifyInstance): Promise<void> {
  // Chạy khi BTC bấm BẮT ĐẦU — sinh chuỗi một lần cho cả lượt.
  registerStartHook('memory', (round) => {
    if (!round.sequence) {
      round.sequence = generateSequence(seedFromRoundId(round.id));
    }
  });

  /**
   * Chuỗi của cấp đang chơi.
   * Cần cho lần vào đầu tiên và khi người chơi tải lại trang giữa chừng.
   */
  app.get('/api/rounds/:id/sequence', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { playerId } = req.query as { playerId?: string };
    if (!playerId) return reply.code(400).send({ error: 'BAD_REQUEST' });

    const located = locate(id, playerId);
    if (!located) return reply.code(404).send({ error: 'NOT_FOUND' });

    const { round, player } = located;
    const now = Date.now();
    return {
      roundId: round.id,
      status: round.status,
      level: player.level,
      sequence: currentSequence(round, player, now),
      pads: MEMORY_PAD_COUNT,
      stepMs: MEMORY_STEP_MS,
      score: player.score,
      correct: player.correct,
      wrong: player.wrong,
      endsAt: round.endsAt,
      serverNow: now,
    };
  });

  /** Lặp lại chuỗi. Điểm do server quyết định — xem services/memory-session.ts. */
  app.post('/api/rounds/:id/replay', async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = ReplayBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'BAD_REQUEST' });

    const located = locate(id, parsed.data.playerId);
    if (!located) return reply.code(404).send({ error: 'NOT_FOUND' });

    const { round, player } = located;
    const now = Date.now();
    const outcome = submitReplay(round, player, parsed.data.level, parsed.data.taps, now);

    if (!outcome.ok) {
      return reply
        .code(CODE_STATUS[outcome.code] ?? 400)
        .send({ error: outcome.code, score: player.score, serverNow: now });
    }

    return {
      correct: outcome.correct,
      score: outcome.score,
      level: outcome.level,
      sequence: outcome.sequence,
      correctCount: player.correct,
      wrongCount: player.wrong,
      serverNow: now,
    };
  });
}
