import { mulberry32, randInt } from '../lib/prng.js';
import { MEMORY_PAD_COUNT } from '../store/types.js';

/**
 * Trần độ dài chuỗi. Vượt cấp 24 trong 60 giây là bất khả thi (riêng phần xem
 * lại chuỗi đã mất 24 × 0,6s ≈ 14s cho MỘT cấp), nên 24 là trần an toàn chứ
 * không phải mục tiêu — nó chỉ tồn tại để mảng không phình vô hạn.
 */
export const SEQUENCE_LENGTH = 24;

/**
 * Không cho quá 2 ô GIỐNG NHAU liền nhau.
 *
 * Ba lần cùng một ô nháy liên tiếp thì người chơi trượt vì ĐẾM nhầm, không phải
 * vì nhớ kém — trò này đo trí nhớ, không đo khả năng đếm nhịp.
 */
const MAX_RUN = 2;

/**
 * Sinh chuỗi ô cần nhớ từ một seed — CÙNG seed luôn cho CÙNG chuỗi.
 *
 * Cấp n dùng n phần tử ĐẦU của chuỗi, nên lên cấp là nối thêm đúng một ô vào
 * chuỗi vừa nhớ được. Nếu mỗi cấp sinh một chuỗi mới thì người chơi phải học
 * lại từ đầu mỗi lần, và trò chơi mất hẳn cảm giác "nhớ dài dần".
 *
 * Chỉ chạy ở SERVER: client biết trước chuỗi là biết luôn đáp án của mọi cấp
 * còn lại, khỏi cần nhớ gì nữa.
 */
export function generateSequence(seed: number, length = SEQUENCE_LENGTH): number[] {
  const rnd = mulberry32(seed);
  const out: number[] = [];
  let run = 0;

  for (let i = 0; i < length; i++) {
    let pad = randInt(rnd, 0, MEMORY_PAD_COUNT - 1);

    // Chuỗi đã có MAX_RUN ô giống nhau ở cuối → bốc lại cho tới khi khác đi.
    for (let tries = 0; tries < 8 && run >= MAX_RUN && pad === out[i - 1]; tries++) {
      pad = randInt(rnd, 0, MEMORY_PAD_COUNT - 1);
    }
    // Hết lượt bốc mà vẫn trùng (xác suất rất nhỏ) thì dịch sang ô kế bên.
    if (run >= MAX_RUN && pad === out[i - 1]) pad = (pad + 1) % MEMORY_PAD_COUNT;

    run = pad === out[i - 1] ? run + 1 : 1;
    out.push(pad);
  }

  return out;
}
