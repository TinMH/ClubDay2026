/**
 * TRỌNG TÀI của game Vẽ hình nhanh.
 *
 * Nguyên tắc: client gửi TOẠ ĐỘ NÉT, server tự rasterize rồi tự nhận diện. Không
 * có đường nào để client gửi lên một tấm ảnh không phải do mình vẽ, và không có
 * field điểm nào trong request.
 *
 * Mọi hàm nhận `now` như THAM SỐ để test giả lập được "đã hết 15 giây" mà không
 * phải chờ thật.
 */
import { tooFast } from '../lib/rate-limit.js';
import { syncRoundStatus } from '../store/lobby.js';
import { touch } from '../store/store.js';
import { MIN_FRAME_GAP_MS, type Player, type Prediction, type Round } from '../store/types.js';
import { accepted } from './labels.js';
import { rasterize, type Stroke } from './raster.js';

/** Điểm khi giải được: `150 − số giây đã dùng`. Xong càng sớm điểm càng cao. */
export const SOLVE_BASE_SCORE = 150;

/**
 * Hàm nhận diện, TIÊM TỪ NGOÀI vào.
 *
 * Nhờ vậy `draw-session` test được mà không cần nạp model ONNX (700ms + native
 * binary) trong bộ unit test. Route truyền hàm thật vào.
 */
export type ClassifyFn = (px: Uint8Array, topK?: number) => Promise<Prediction[]>;

export interface FrameInput {
  /** Số thứ tự frame do client đếm. Phải TĂNG DẦN — xem chốt 4. */
  seq: number;
  strokes: readonly Stroke[];
}

export type FrameOutcome =
  | {
      ok: true;
      matched: boolean;
      top: Prediction[];
      score: number;
      solved: boolean;
      /** Giây đã dùng tính từ lúc bắt đầu lượt — server đo, không tin client. */
      seconds: number;
      endsAt: number | null;
    }
  | {
      ok: false;
      code: 'NOT_PLAYING' | 'TIME_UP' | 'TOO_FAST' | 'SEQUENCE' | 'NO_TARGET';
    };

/**
 * Nhận và chấm một frame.
 *
 * Các chốt, theo đúng thứ tự kiểm tra:
 *   1. Lượt phải đang chơi và người này chưa xong.
 *   2. Còn trong thời gian — hết giờ thì không chấm nữa.
 *   3. Không gửi nhanh hơn 1 frame/giây; nhanh hơn là bot, đánh cờ.
 *   4. `seq` phải TĂNG DẦN: chặn gửi lại frame cũ.
 *   5. Từ khoá lấy từ `round.target` do server chọn, không bao giờ từ client.
 *
 * Toàn bộ phần kiểm tra chạy ĐỒNG BỘ trước `await classify` — nên hai frame gửi
 * cùng lúc cho cùng một người chơi sẽ bị chốt 3 hoặc 4 chặn, không cùng lọt qua.
 */
export async function submitFrame(
  round: Round,
  player: Player,
  frame: FrameInput,
  now: number,
  classify: ClassifyFn,
): Promise<FrameOutcome> {
  const target = round.target;
  if (!target) return { ok: false, code: 'NO_TARGET' };

  if (round.status !== 'playing' || player.finished) return { ok: false, code: 'NOT_PLAYING' };

  if (round.endsAt !== null && now > round.endsAt) {
    player.finished = true;
    syncRoundStatus(round, now);
    return { ok: false, code: 'TIME_UP' };
  }

  if (tooFast(player.lastFrameAt, now, MIN_FRAME_GAP_MS)) {
    player.flagged = true;
    return { ok: false, code: 'TOO_FAST' };
  }

  if (frame.seq <= player.seq) return { ok: false, code: 'SEQUENCE' };

  // Từ đây trở đi là đã TIÊU thụ frame: ghi mốc thời gian và seq trước khi
  // `await`, để frame gửi chồng lên không lách được qua chốt 3/4.
  player.lastFrameAt = now;
  player.seq = frame.seq;

  const seconds = secondsSince(round, now);

  // Canvas trống: không tốn 3ms inference cho một tấm ảnh đen thui, và cũng
  // không được coi là lỗi — người chơi vừa xoá để vẽ lại.
  const px = rasterize(frame.strokes);
  if (isBlank(px)) {
    return {
      ok: true,
      matched: false,
      top: [],
      score: player.score,
      solved: false,
      seconds,
      endsAt: round.endsAt,
    };
  }

  const top = await classify(px, 3);
  if (top[0]) player.lastGuess = top[0];

  const matched = accepted(top, target.id);
  if (!matched) {
    return {
      ok: true,
      matched: false,
      top,
      score: player.score,
      solved: false,
      seconds,
      endsAt: round.endsAt,
    };
  }

  // Giải xong. Điểm do server tính từ đồng hồ của server.
  const score = Math.max(0, SOLVE_BASE_SCORE - seconds);
  player.score = score;
  player.solved = true;
  player.solvedAt = now;
  player.finished = true;

  touch(round);
  syncRoundStatus(round, now); // mọi người cùng xong → kết thúc lượt sớm
  return { ok: true, matched: true, top, score, solved: true, seconds, endsAt: round.endsAt };
}

/** Số giây đã trôi qua kể từ lúc bắt đầu lượt (làm tròn LÊN). */
function secondsSince(round: Round, now: number): number {
  const start = round.startedAt ?? round.createdAt;
  return Math.max(0, Math.ceil((now - start) / 1000));
}

/** Ảnh không có mực nào = canvas trống. */
function isBlank(px: Uint8Array): boolean {
  for (const v of px) if (v > 0) return false;
  return true;
}
