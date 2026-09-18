/**
 * TRỌNG TÀI của game Nhớ nhanh.
 *
 * Nguyên tắc duy nhất: điểm do SERVER quyết định. Client chỉ gửi "tôi đang ở cấp
 * mấy, tôi bấm những ô nào" — không bao giờ gửi điểm.
 *
 * ĐIỂM = CẤP CAO NHẤT ĐÃ VƯỢT. Lặp sai thì cấp hiện tại về 1, nhưng KHÔNG lấy đi
 * kỷ lục đã lập — nhờ vậy người vừa trượt ở cấp 7 vẫn còn lý do chơi tiếp thay vì
 * ngồi đợi hết giờ. Cùng triết lý với chuỗi đúng của Tính nhanh.
 *
 * Mọi hàm nhận `now` như THAM SỐ (không gọi Date.now() bên trong) để test giả lập
 * được "đã hết giờ" mà không cần chờ 60 giây thật.
 */
import { tooFast } from '../lib/rate-limit.js';
import { syncRoundStatus } from '../store/lobby.js';
import { touch } from '../store/store.js';
import { MEMORY_STEP_MS, MIN_REPLAY_GAP_MS, type Player, type Round } from '../store/types.js';

/**
 * Phần thời gian xem chuỗi mà người chơi BẮT BUỘC phải dùng, tính theo thời gian
 * phát lại lý thuyết (`level × MEMORY_STEP_MS`).
 *
 * Vì sao không phải 1.0: server đo từ lúc nó GỬI chuỗi đi, nên đồng hồ của nó
 * luôn chạy dài hơn thời gian phát thật ở máy người chơi (còn cộng thêm độ trễ
 * mạng). Để nguyên 1.0 thì về lý thuyết vẫn đúng, nhưng chỉ cần client làm tròn
 * một khung hình hay `setTimeout` nhả sớm vài ms là người chơi THẬT bị gắn cờ
 * gian lận. 0.8 giữ lại 20% biên an toàn mà vẫn chặn được thứ cần chặn: bot bấm
 * ngay khi nhận chuỗi, tức mất gần 0% thời gian xem.
 */
const MIN_WATCH_RATIO = 0.8;

export type ReplayOutcome =
  | { ok: true; correct: boolean; score: number; level: number; sequence: number[] }
  | { ok: false; code: 'NOT_PLAYING' | 'TIME_UP' | 'BAD_LEVEL' | 'TOO_FAST' };

/** Chuỗi của cấp hiện tại = `level` phần tử đầu của chuỗi cả lượt. */
function sliceFor(round: Round, level: number): number[] | null {
  const seq = round.sequence;
  if (!seq || level < 1 || level > seq.length) return null;
  return seq.slice(0, level);
}

/**
 * Chuỗi người chơi phải nhớ lúc này, và ĐÓNG DẤU THỜI GIAN gửi đi.
 *
 * Dấu thời gian là một nửa của chốt chống bot (nửa kia ở `submitReplay`), nên
 * mọi đường gửi chuỗi ra ngoài đều phải đi qua đây — kể cả lúc người chơi tải
 * lại trang giữa lượt.
 */
export function currentSequence(round: Round, player: Player, now: number): number[] | null {
  const seq = sliceFor(round, player.level);
  if (seq) player.levelSentAt = now;
  return seq;
}

/**
 * Chấm một lượt lặp lại.
 *
 * Các chốt chống gian lận, theo thứ tự kiểm tra:
 *   1. Lượt phải đang chơi.
 *   2. Còn trong thời gian — hết giờ thì KHÔNG cộng điểm dù lặp đúng.
 *   3. Đúng cấp của mình, và số ô bấm đúng bằng độ dài cấp đó.
 *   4. Không nhanh hơn 250ms giữa hai lượt lặp.
 *   5. Phải đủ thời gian XEM hết chuỗi — chốt riêng của game này, xem MIN_WATCH_RATIO.
 *   6. So với chuỗi do server giữ, không phải chuỗi client gửi lên.
 */
export function submitReplay(
  round: Round,
  player: Player,
  level: number,
  taps: number[],
  now: number,
): ReplayOutcome {
  if (round.status !== 'playing' || player.finished) return { ok: false, code: 'NOT_PLAYING' };

  if (round.endsAt !== null && now > round.endsAt) {
    // Hết giờ: đóng người chơi lại, không cộng điểm kể cả khi lặp đúng.
    player.finished = true;
    syncRoundStatus(round, now);
    return { ok: false, code: 'TIME_UP' };
  }

  const expected = sliceFor(round, player.level);
  if (!expected) return { ok: false, code: 'NOT_PLAYING' };

  // Chặn cả việc nhảy cấp lẫn nộp lại cấp cũ.
  if (level !== player.level || taps.length !== expected.length) {
    return { ok: false, code: 'BAD_LEVEL' };
  }

  // Chưa từng nhận chuỗi mà đã nộp → không thể là người chơi thật.
  if (player.levelSentAt === 0) return { ok: false, code: 'BAD_LEVEL' };

  if (tooFast(player.lastReplayAt, now, MIN_REPLAY_GAP_MS)) {
    player.flagged = true;
    return { ok: false, code: 'TOO_FAST' };
  }

  if (now - player.levelSentAt < expected.length * MEMORY_STEP_MS * MIN_WATCH_RATIO) {
    player.flagged = true;
    return { ok: false, code: 'TOO_FAST' };
  }

  const correct = expected.every((pad, i) => taps[i] === pad);

  player.lastReplayAt = now;
  // Dùng chung với Tính nhanh làm mốc "xong lúc nào" cho bảng hạng (dashboard.ts).
  player.lastAnswerAt = now;

  if (correct) {
    player.correct += 1;
    // Điểm là cấp CAO NHẤT đã vượt — chính là độ dài chuỗi vừa lặp đúng.
    if (player.level > player.score) player.score = player.level;
    player.level += 1;
  } else {
    player.wrong += 1;
    player.level = 1; // làm lại từ đầu; `score` giữ nguyên kỷ lục cũ
  }

  const next = sliceFor(round, player.level);
  if (!next) {
    player.finished = true; // vượt hết chuỗi — trên thực tế không ai tới được
  } else {
    player.levelSentAt = now;
    syncRoundStatus(round, now);
  }

  touch(round); // đẩy điểm mới cho mọi client đang xem
  return { ok: true, correct, score: player.score, level: player.level, sequence: next ?? [] };
}
