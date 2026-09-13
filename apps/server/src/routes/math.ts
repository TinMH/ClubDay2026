import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { registerStartHook } from '../store/lobby.js';
import { findPlayer } from '../store/store.js';
import { generateQuestions, seedFromRoundId } from '../services/math-gen.js';
import { currentQuestion, submitAnswer } from '../services/math-session.js';

/**
 * TRACK A — TÍNH NHANH (API).
 *
 * File này Track A sở hữu hoàn toàn. Không sửa file nền tảng 🔒 nào.
 */

const AnswerBody = z.object({
  playerId: z.string().min(1),
  idx: z.number().int().min(0),
  value: z.number().int(),
  // Cố ý KHÔNG có `score`: server tự đếm. Nếu client gửi kèm, zod bỏ qua field lạ.
});

/** Mã lỗi nghiệp vụ → HTTP status. */
const CODE_STATUS: Record<string, number> = {
  NOT_PLAYING: 409,
  TIME_UP: 409,
  BAD_INDEX: 400,
  TOO_FAST: 429,
};

/** Tra người chơi và xác nhận họ thuộc ĐÚNG lượt này (không thì trả null). */
function locate(roundId: string, playerId: string) {
  const found = findPlayer(playerId);
  if (!found) return null;
  if (found.round.id.toUpperCase() !== roundId.toUpperCase()) return null;
  if (found.round.game !== 'math') return null;
  return found;
}

export async function mathRoutes(app: FastifyInstance): Promise<void> {
  // Chạy khi BTC bấm BẮT ĐẦU — sinh đề một lần cho cả lượt.
  registerStartHook('math', (round) => {
    if (!round.questions) {
      round.questions = generateQuestions(seedFromRoundId(round.id));
    }
  });

  /**
   * Câu hỏi hiện tại của người chơi.
   * Cần cho lần vào đầu tiên và khi người chơi tải lại trang giữa chừng.
   */
  app.get('/api/rounds/:id/question', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { playerId } = req.query as { playerId?: string };
    if (!playerId) return reply.code(400).send({ error: 'BAD_REQUEST' });

    const located = locate(id, playerId);
    if (!located) return reply.code(404).send({ error: 'NOT_FOUND' });

    const { round, player } = located;
    return {
      roundId: round.id,
      status: round.status,
      index: player.qIndex,
      question: currentQuestion(round, player),
      score: player.score,
      correct: player.correct,
      wrong: player.wrong,
      endsAt: round.endsAt,
      serverNow: Date.now(),
    };
  });

  /** Trả lời một câu. Điểm do server quyết định — xem services/math-session.ts. */
  app.post('/api/rounds/:id/answer', async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = AnswerBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'BAD_REQUEST' });

    const located = locate(id, parsed.data.playerId);
    if (!located) return reply.code(404).send({ error: 'NOT_FOUND' });

    const { round, player } = located;
    const now = Date.now();
    const outcome = submitAnswer(round, player, parsed.data.idx, parsed.data.value, now);

    if (!outcome.ok) {
      return reply
        .code(CODE_STATUS[outcome.code] ?? 400)
        .send({ error: outcome.code, score: player.score, serverNow: now });
    }

    return {
      correct: outcome.correct,
      score: outcome.score,
      correctCount: player.correct,
      wrongCount: player.wrong,
      index: outcome.index,
      question: outcome.question,
      serverNow: now,
    };
  });
}
