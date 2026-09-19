import { mulberry32, randInt } from '../lib/prng.js';
import { SPOT_MAX_SIZE, SPOT_MIN_SIZE } from '../store/types.js';

/**
 * TRACK D — sinh BÀN CHƠI của game Ô khác màu.
 *
 * Một bàn = lưới `size × size` ô cùng màu, đúng MỘT ô lệch màu. Lên cấp thì lưới
 * dày thêm và độ lệch màu nhỏ đi, nên trò này khó dần theo hai hướng cùng lúc.
 *
 * Bàn chơi được SUY RA từ (mã lượt, cấp) chứ không lưu ở đâu cả: server tính lại
 * đúng bàn đó bất cứ lúc nào để chấm, và 5 người trong cùng lượt gặp đúng cùng
 * một đề ở mỗi cấp — công bằng như chuỗi dùng chung của Nhớ nhanh.
 */

/**
 * Độ lệch SÁNG giữa ô khác và các ô còn lại, tính theo phần trăm L của HSL.
 *
 * ⚠️ Hai màu CỐ Ý chỉ khác nhau ở độ sáng, cùng tông cùng độ bão hoà.
 *
 * Khoảng 8% nam giới không phân biệt được đỏ–lục; nếu ô lệch chỉ khác TÔNG MÀU
 * thì với họ cả lưới trông y hệt nhau và trò này thành không thể chơi. Độ sáng
 * thì ai cũng thấy. Đây là ràng buộc thiết kế, không phải lựa chọn thẩm mỹ —
 * đổi sang lệch tông màu là loại hẳn một phần người chơi ra khỏi cuộc.
 */
const DELTA_START = 18;
/** Sàn của độ lệch: dưới ~2% thì màn hình rẻ tiền ngoài nắng không hiện nổi. */
const DELTA_MIN = 2;
/** Mỗi cấp độ lệch còn 85% cấp trước → cấp 12 còn ~3%, cấp 16 chạm sàn. */
const DELTA_DECAY = 0.85;

/** Độ sáng nền: đủ xa 0% và 100% để còn chỗ cộng/trừ `delta` mà không bị kẹp. */
const BASE_L_MIN = 45;
const BASE_L_MAX = 62;
const SATURATION = 65;

export interface SpotBoard {
  /** Cạnh lưới — bàn có `size × size` ô. */
  size: number;
  /** Màu của các ô thường, dạng chuỗi CSS. */
  base: string;
  /** Màu của ô khác. */
  odd: string;
  /** Vị trí ô khác (0-based, đọc theo hàng). */
  oddIndex: number;
}

/** Cạnh lưới theo cấp: rộng dần 2 cấp một, chạm trần thì chỉ còn màu khó đi. */
export function sizeForLevel(level: number): number {
  return Math.min(SPOT_MAX_SIZE, SPOT_MIN_SIZE + Math.floor((level - 1) / 2));
}

/** Độ lệch sáng theo cấp (phần trăm L). */
export function deltaForLevel(level: number): number {
  const raw = DELTA_START * DELTA_DECAY ** (level - 1);
  return Math.max(DELTA_MIN, Math.round(raw * 10) / 10);
}

/**
 * Bàn chơi của một cấp.
 *
 * Trộn `level` vào seed bằng một số nguyên tố lớn để hai cấp liền nhau ra hai bàn
 * KHÔNG giống nhau — cộng thẳng `seed + level` thì cấp n của lượt này trùng hệt
 * cấp n+1 của lượt có seed lệch 1, và người chơi lượt sau nhận ra vị trí quen.
 *
 * Chỉ chạy ở SERVER. (Bàn vẫn phải gửi đủ màu + vị trí cho client để vẽ ra được —
 * xem ghi chú "giới hạn" ở services/spot-session.ts.)
 */
export function generateBoard(seed: number, level: number): SpotBoard {
  const rnd = mulberry32((seed ^ Math.imul(level, 2_654_435_761)) >>> 0);

  const size = sizeForLevel(level);
  const delta = deltaForLevel(level);

  const hue = randInt(rnd, 0, 359);
  const baseL = randInt(rnd, BASE_L_MIN, BASE_L_MAX);
  // Hướng lệch ngẫu nhiên: nếu ô khác LÚC NÀO CŨNG sáng hơn thì tới cấp 5 người
  // chơi thôi không tìm ô lệch nữa, chỉ quét tìm ô sáng nhất.
  const oddL = rnd() < 0.5 ? baseL + delta : baseL - delta;

  return {
    size,
    base: `hsl(${hue} ${SATURATION}% ${baseL}%)`,
    odd: `hsl(${hue} ${SATURATION}% ${Math.round(oddL * 10) / 10}%)`,
    oddIndex: randInt(rnd, 0, size * size - 1),
  };
}
