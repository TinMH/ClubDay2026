/**
 * TRỌNG TÀI của game Tính nhanh.
 *
 * Nguyên tắc duy nhất: điểm do SERVER quyết định. Client chỉ gửi "câu số mấy,
 * tôi trả lời bao nhiêu" — không bao giờ gửi điểm.
 *
 * ĐIỂM = CHUỖI ĐÚNG DÀI NHẤT, không phải tổng số câu đúng. Trả lời sai làm chuỗi
 * hiện tại về 0, nhưng KHÔNG lấy đi chuỗi dài nhất đã lập — nhờ vậy người chơi
 * vẫn còn động lực trả lời tiếp sau khi đã sai, thay vì buông xuôi.
 *
 * Mọi hàm nhận `now` như THAM SỐ (không gọi Date.now() bên trong) để test
 * giả lập được "đã hết giờ" mà không cần chờ 90 giây thật.
 */
import { tooFast } from '../lib/rate-limit.js';
import { syncRoundStatus } from '../store/lobby.js';
import { touch } from '../store/store.js';
import { MIN_ANSWER_GAP_MS, type Player, type Question, type Round } from '../store/types.js';

export type AnswerOutcome =
  | { ok: true; correct: boolean; score: number; question: Question | null; index: number }
  | { ok: false; code: 'NOT_PLAYING' | 'TIME_UP' | 'BAD_INDEX' | 'TOO_FAST' };

/**
 * Chấm một câu trả lời.
 *
 * Các chốt chống gian lận, theo thứ tự kiểm tra:
 *   1. Lượt phải đang chơi.
 *   2. Còn trong thời gian — hết giờ thì KHÔNG cộng điểm dù đáp án đúng.
 *   3. Chỉ được trả lời ĐÚNG câu hiện tại của mình (không nhảy câu, không trả lời lại).
 *   4. Không nhanh hơn 250ms/câu — nhanh hơn là bot, đánh cờ.
 *   5. Đáp án đúng lấy từ `round.math.questions` do server sinh, không từ client.
 */
export function submitAnswer(
  round: Round,
  player: Player,
  idx: number,
  value: number,
  now: number,
): AnswerOutcome {
  if (round.status !== 'playing' || player.finished) return { ok: false, code: 'NOT_PLAYING' };

  if (round.endsAt !== null && now > round.endsAt) {
    // Hết giờ: đóng người chơi lại, không cộng điểm kể cả khi đáp án đúng.
    player.finished = true;
    syncRoundStatus(round, now);
    return { ok: false, code: 'TIME_UP' };
  }

  const questions = round.math.questions;
  if (!questions) return { ok: false, code: 'NOT_PLAYING' };

  // Phải đúng câu đang mở. Chặn cả việc nhảy tới câu dễ và trả lời lại câu cũ.
  if (idx !== player.math.qIndex) return { ok: false, code: 'BAD_INDEX' };

  const current = questions[idx];
  if (!current) return { ok: false, code: 'BAD_INDEX' };

  if (tooFast(player.lastActionAt, now, MIN_ANSWER_GAP_MS)) {
    player.flagged = true;
    return { ok: false, code: 'TOO_FAST' };
  }

  const correct = current.answer === value;

  player.lastActionAt = now;
  player.math.qIndex = idx + 1;

  if (correct) {
    player.correct += 1;
    player.math.streak += 1;
    // Điểm là chuỗi DÀI NHẤT, nên chỉ nhích lên khi chuỗi hiện tại vượt kỷ lục.
    if (player.math.streak > player.score) player.score = player.math.streak;
  } else {
    player.wrong += 1;
    player.math.streak = 0; // chuỗi đứt; `score` giữ nguyên kỷ lục cũ
  }

  const next = questions[player.math.qIndex] ?? null;
  if (!next) player.finished = true; // hết đề
  else syncRoundStatus(round, now);

  touch(round); // đẩy điểm mới cho mọi client đang xem
  return { ok: true, correct, score: player.score, question: next, index: player.math.qIndex };
}

/**
 * Câu hỏi hiện tại của người chơi.
 * Dùng khi vào lượt lần đầu và khi tải lại trang giữa chừng.
 */
export function currentQuestion(round: Round, player: Player): Question | null {
  return round.math.questions?.[player.math.qIndex] ?? null;
}
