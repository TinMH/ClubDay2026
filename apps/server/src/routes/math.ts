import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { locatePlayer, statusFor } from './track.js';
import { registerStartHook } from '../store/lobby.js';
import { generateQuestions, seedFromRoundId } from '../services/math-gen.js';
import { optionsFor } from '../services/math-options.js';
import { currentQuestion, submitAnswer } from '../services/math-session.js';
import type { Question } from '../store/types.js';

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

/** Câu hỏi gửi ra cho client — CỐ Ý không có `answer`. */
interface PublicQuestion {
  prompt: string;
  options: number[];
}

/**
 * Câu hỏi gửi ra cho client — CẮT `answer`.
 *
 * Client TUYỆT ĐỐI không được thấy đáp án: mở DevTools là đọc được, và toàn bộ
 * phần chấm điểm phía server thành vô nghĩa. Chỉ gửi chuỗi hiển thị.
 *
 * Kèm 4 lựa chọn ĐÃ XÁO TRỘN — nhưng vẫn không nói con nào đúng. Người chơi nhận
 * được bốn con số; muốn biết con nào thì phải tự tính.
 */
function publicQuestion(question: Question | null): PublicQuestion | null {
  if (!question) return null;
  return {
    prompt: question.prompt,
    options: optionsFor(question.prompt, question.answer),
  };
}

export async function mathRoutes(app: FastifyInstance): Promise<void> {
  // Chạy khi BTC bấm BẮT ĐẦU — sinh đề một lần cho cả lượt.
  registerStartHook('math', (round) => {
    if (!round.math.questions) {
      round.math.questions = generateQuestions(seedFromRoundId(round.id));
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

    const located = locatePlayer(id, playerId, 'math');
    if (!located) return reply.code(404).send({ error: 'NOT_FOUND' });

    const { round, player } = located;
    return {
      roundId: round.id,
      status: round.status,
      index: player.math.qIndex,
      question: publicQuestion(currentQuestion(round, player)),
      score: player.score,
      streak: player.math.streak,
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

    const located = locatePlayer(id, parsed.data.playerId, 'math');
    if (!located) return reply.code(404).send({ error: 'NOT_FOUND' });

    const { round, player } = located;
    const now = Date.now();
    const outcome = submitAnswer(round, player, parsed.data.idx, parsed.data.value, now);

    if (!outcome.ok) {
      return reply
        .code(statusFor(outcome.code))
        .send({ error: outcome.code, score: player.score, serverNow: now });
    }

    return {
      correct: outcome.correct,
      score: outcome.score,
      streak: player.math.streak,
      correctCount: player.correct,
      wrongCount: player.wrong,
      index: outcome.index,
      question: publicQuestion(outcome.question),
      serverNow: now,
    };
  });
}
