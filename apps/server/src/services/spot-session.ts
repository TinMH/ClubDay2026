/**
 * TRỌNG TÀI của game Ô khác màu.
 *
 * ĐIỂM = CẤP CAO NHẤT ĐÃ VƯỢT. Chạm trượt thì cấp hiện tại về 1 nhưng kỷ lục giữ
 * nguyên — cùng triết lý với `streak` của Tính nhanh và `level` của Nhớ nhanh:
 * người vừa trượt ở cấp 11 vẫn còn lý do chơi tiếp thay vì ngồi đợi hết giờ.
 *
 * ⚠️ GIỚI HẠN CÓ THẬT, cần biết trước khi tin vào bảng hạng của trò này:
 * client BẮT BUỘC phải biết ô nào lệch màu thì mới vẽ được bàn chơi ra màn hình.
 * Khác với Nhớ nhanh (chuỗi nằm im ở server) hay Tính nhanh (đáp án không gửi
 * đi), ở đây đáp án nằm sẵn trong DOM của người chơi — ai mở DevTools cũng đọc
 * được. Không có cách nào bịt kín mà vẫn vẽ được lưới ở client.
 *
 * Nên chốt duy nhất ở đây là TỐC ĐỘ: xem `MIN_SPOT_GAP_MS`. Chạm nhanh hơn ngưỡng
 * đó thì bị gắn cờ `flagged` (bảng hạng hiện dấu) và cú chạm bị bỏ. Với một trò
 * chơi ở booth, chừng đó là đủ — muốn kín hơn thì phải render lưới thành ảnh ở
 * server, cái giá không đáng cho 45 giây vui.
 *
 * Mọi hàm nhận `now` như THAM SỐ (không gọi Date.now() bên trong) để test giả lập
 * được "đã hết giờ" mà không phải chờ thật.
 */
import { tooFast } from '../lib/rate-limit.js';
import { syncRoundStatus } from '../store/lobby.js';
import { touch } from '../store/store.js';
import { MIN_SPOT_GAP_MS, type Player, type Round } from '../store/types.js';
import { seedFromRoundId } from './math-gen.js';
import { generateBoard, type SpotBoard } from './spot-gen.js';

export type PickOutcome =
  | { ok: true; correct: boolean; score: number; level: number; board: SpotBoard }
  | { ok: false; code: 'NOT_PLAYING' | 'TIME_UP' | 'BAD_LEVEL' | 'TOO_FAST' };

/**
 * Seed của bàn người chơi đang nhìn.
 *
 * Gồm ba thứ, thiếu cái nào cũng hỏng một kiểu:
 *   - mã lượt      → mỗi lượt một bộ đề khác nhau
 *   - id người chơi → 5 người ngồi sát nhau ở booth KHÔNG thấy cùng một vị trí,
 *                     nên liếc màn hình bên cạnh chẳng được gì. Ở đây đó là kiểu
 *                     gian lận dễ nhất, dễ hơn mở DevTools nhiều.
 *   - số lần đã chạm → trượt rồi về cấp 1 thì gặp bàn MỚI. Thiếu nó thì ô lệch
 *                     nằm nguyên chỗ cũ, và người vừa trượt ở cấp 8 bấm lại một
 *                     mạch 7 cấp đầu từ trí nhớ chứ không phải nhìn.
 *
 * Độ khó KHÔNG nằm trong seed: cỡ lưới và độ lệch màu vẫn do `level` quyết định
 * (xem spot-gen.ts), nên hai người cùng cấp luôn gặp bài khó y như nhau — chỉ
 * khác chỗ đặt và tông màu.
 *
 * Vẫn không lưu gì: cả ba thành phần đều đã có sẵn trong `round` và `player`,
 * nên server tính lại đúng bàn đó bất cứ lúc nào để chấm.
 */
function boardSeed(round: Round, player: Player): number {
  return seedFromRoundId(`${round.id}:${player.id}:${player.correct + player.wrong}`);
}

/** Bàn chơi của cấp người chơi đang ở. */
export function currentBoard(round: Round, player: Player): SpotBoard {
  return generateBoard(boardSeed(round, player), player.level);
}

/**
 * Chấm một cú chạm.
 *
 * Thứ tự kiểm tra:
 *   1. Lượt phải đang chơi.
 *   2. Còn trong thời gian — hết giờ thì KHÔNG cộng điểm dù chạm trúng.
 *   3. Đúng cấp của mình (chặn cả nhảy cấp lẫn nộp lại cấp cũ).
 *   4. Không nhanh hơn `MIN_SPOT_GAP_MS` so với cú chạm trước.
 *   5. So với bàn chơi do SERVER tính lại, không phải thứ client gửi lên.
 */
export function submitPick(
  round: Round,
  player: Player,
  level: number,
  index: number,
  now: number,
): PickOutcome {
  if (round.status !== 'playing' || player.finished) return { ok: false, code: 'NOT_PLAYING' };

  if (round.endsAt !== null && now > round.endsAt) {
    // Hết giờ: đóng người chơi lại, không cộng điểm kể cả khi chạm trúng.
    player.finished = true;
    syncRoundStatus(round, now);
    return { ok: false, code: 'TIME_UP' };
  }

  if (level !== player.level) return { ok: false, code: 'BAD_LEVEL' };

  const board = currentBoard(round, player);
  if (index < 0 || index >= board.size * board.size) return { ok: false, code: 'BAD_LEVEL' };

  if (tooFast(player.lastReplayAt, now, MIN_SPOT_GAP_MS)) {
    player.flagged = true;
    return { ok: false, code: 'TOO_FAST' };
  }

  const correct = index === board.oddIndex;

  player.lastReplayAt = now;
  // Dùng chung với Tính nhanh làm mốc "xong lúc nào" cho bảng hạng (dashboard.ts).
  player.lastAnswerAt = now;

  if (correct) {
    player.correct += 1;
    // Điểm là cấp CAO NHẤT đã vượt — chính là cấp vừa qua được.
    if (player.level > player.score) player.score = player.level;
    player.level += 1;
  } else {
    player.wrong += 1;
    player.level = 1; // làm lại từ đầu; `score` giữ nguyên kỷ lục cũ
  }

  syncRoundStatus(round, now);
  touch(round); // đẩy điểm mới cho mọi client đang xem

  return { ok: true, correct, score: player.score, level: player.level, board: currentBoard(round, player) };
}
