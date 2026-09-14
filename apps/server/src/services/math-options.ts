/**
 * Sinh 4 lựa chọn cho mỗi câu hỏi Tính nhanh.
 *
 * Vì sao phải ở SERVER chứ không cho client tự sinh: muốn sinh được lựa chọn thì
 * phải biết đáp án. Đưa đáp án xuống client là mở lại đúng lỗ hổng đã bịt — xem
 * chú thích ở `routes/math.ts`. Server gửi 4 con số ĐÃ XÁO TRỘN, không nói con
 * nào đúng.
 *
 * Ba đáp án sai quan trọng hơn vẻ ngoài của chúng:
 *   - Phải KHÁC đáp án và khác nhau từng đôi một, nếu không câu hỏi thành vô lý.
 *   - Phải cùng cỡ với đáp án. Lựa chọn 8 / 56 / 800 / 1200 thì nhìn là biết
 *     ngay, không cần tính — câu hỏi thành trò đoán.
 *   - Nên giống kiểu SAI NGƯỜI TA HAY MẮC: lệch một thừa số khi nhân, quên nhớ
 *     khi cộng, nhầm dấu khi trừ. Đoán mò được thì không còn là luyện tính.
 *
 * Hàm thuần và TẤT ĐỊNH theo đề: cùng một đề luôn ra cùng bộ lựa chọn, nên tải
 * lại trang giữa chừng không làm các lựa chọn nhảy chỗ.
 */
import { mulberry32 } from '../lib/prng.js';
// Dùng lại hàm băm chuỗi của math-gen (cùng Track A). Nó là FNV-1a thuần trên
// chuỗi, không có gì riêng cho mã lượt.
import { seedFromRoundId as hashString } from './math-gen.js';

export const OPTION_COUNT = 4;

/** Định dạng đề do `math-gen.ts` sinh ra. Khớp CHÍNH XÁC — có test canh việc này. */
const PROMPT_RE = /^(\d+) ([+\-×÷]) (\d+)$/;

type Operator = '+' | '-' | '×' | '÷';

interface Parsed {
  a: number;
  b: number;
  op: Operator;
}

function compute(a: number, b: number, op: Operator): number {
  switch (op) {
    case '+':
      return a + b;
    case '-':
      return a - b;
    case '×':
      return a * b;
    default:
      return a / b;
  }
}

/**
 * Đọc đề ra hai toán hạng.
 *
 * Trả `null` nếu đề không khớp định dạng, hoặc nếu tính từ đề KHÔNG ra đúng đáp
 * án mà server đang giữ — dấu hiệu `math-gen.ts` đã đổi cách viết đề. Khi đó
 * người gọi lùi về cách sinh đáp án sai chung chung, thay vì dựng lựa chọn trên
 * một tiền đề sai.
 */
function parse(prompt: string, answer: number): Parsed | null {
  const m = PROMPT_RE.exec(prompt);
  if (!m) return null;

  const a = Number(m[1]);
  const b = Number(m[3]);
  const op = m[2] as Operator;
  if (!Number.isInteger(a) || !Number.isInteger(b)) return null;

  const value = compute(a, b, op);
  if (!Number.isInteger(value) || value !== answer) return null;

  return { a, b, op };
}

/** Những con số hay bị tính nhầm, theo đúng phép toán đang làm. */
function candidatesFor({ a, b, op }: Parsed, answer: number): number[] {
  switch (op) {
    case '+':
      // quên nhớ, lệch hàng chục, nhầm sang nhân
      return [answer + 1, answer - 1, answer + 10, answer - 10, answer + 2, answer + 20, a * b];
    case '-':
      // nhầm dấu (ra a+b), lệch 1, lệch hàng chục, trừ ngược
      return [a + b, answer + 1, answer - 1, answer + 10, answer - 10, b - a, answer + 2];
    case '×':
      // lệch đúng một thừa số — lỗi kinh điển của bảng cửu chương
      return [answer + a, answer - a, answer + b, answer - b, a + b, answer + 1, answer - 1];
    default:
      // chia: lệch 1, nhân đôi, nhầm sang số chia / số bị chia
      return [answer + 1, answer - 1, answer * 2, b, answer + b, answer - b];
  }
}

function shuffle<T>(items: readonly T[], rnd: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const tmp = out[i] as T;
    out[i] = out[j] as T;
    out[j] = tmp;
  }
  return out;
}

/**
 * Bộ lựa chọn cho một đề: `count` phần tử, chứa ĐÚNG MỘT lần đáp án, đã xáo trộn.
 *
 * Không bao giờ ném lỗi: đề lạ thì vẫn phải ra đủ số lựa chọn, vì đằng nào người
 * chơi cũng đang nhìn màn hình.
 */
export function optionsFor(prompt: string, answer: number, count = OPTION_COUNT): number[] {
  // Hai luồng ngẫu nhiên tách rời: số lượng ứng viên được chọn không được ảnh
  // hưởng tới thứ tự cuối cùng (và ngược lại), để kết quả chỉ phụ thuộc đề.
  const seed = hashString(prompt);
  const pickRnd = mulberry32(seed);
  const orderRnd = mulberry32(seed ^ 0x5bf03635);

  const parsed = parse(prompt, answer);

  // Dải cho phép: lựa chọn sai phải còn "cùng cỡ" với đáp án.
  //
  // Không có chốt này thì `41 + 58 = 99` từng có lựa chọn là **2378** — đó là
  // 41 × 58, tức lỗi nhầm sang phép nhân, và nó lọt vào vì nhóm "gần" chỉ có 2
  // ứng viên nên phải bù bằng nhóm "xa". Nhìn con số 2378 cạnh 99 là biết ngay
  // đáp án mà không cần tính — câu hỏi thành trò đoán.
  const band = Math.max(15, Math.round(answer * 0.6));
  const valid = new Set<number>();
  if (parsed) {
    for (const c of candidatesFor(parsed, answer)) {
      if (!Number.isInteger(c) || c < 0 || c === answer) continue;
      if (Math.abs(c - answer) > band) continue;
      valid.add(c);
    }
  }

  // Xếp hạng: ưu tiên số CÙNG SỐ CHỮ SỐ với đáp án, rồi mới tới số gần. Lệch cỡ
  // bị phạt rất nặng để nó không bao giờ được chọn khi còn lựa chọn tốt hơn.
  const digits = String(answer).length;
  const ranked = [...valid].sort((x, y) => rank(x) - rank(y));

  function rank(v: number): number {
    const off = Math.abs(v - answer);
    return String(v).length === digits ? off : off + 1_000;
  }

  const picks: number[] = [];
  const takeFrom = (list: readonly number[]): void => {
    for (const v of list) {
      if (picks.length >= count - 1) return;
      if (!picks.includes(v)) picks.push(v);
    }
  };

  // Lấy ngẫu nhiên trong NHÓM TỐT NHẤT, không phải luôn ba số sát đáp án nhất —
  // nếu không thì lựa chọn sai nào cũng lộ ra vì quá giống nhau.
  //
  // Hai tầng rõ ràng: chỉ rơi xuống nhóm "khác số chữ số" khi nhóm cùng cỡ KHÔNG
  // đủ chỗ. Nếu trộn chung rồi cắt, `11 × 11 = 121` sẽ có lúc nhận lựa chọn 22
  // (nhầm sang phép cộng) — nhìn là biết ngay.
  const sameSize = ranked.filter((v) => String(v).length === digits);
  const pool = sameSize.length >= count - 1 ? sameSize : ranked;
  takeFrom(shuffle(pool.slice(0, 6), pickRnd));

  // Vẫn thiếu (đáp án 0 hoặc 1 thì ứng viên rất ít) → bù bằng số quanh đáp án.
  for (let k = 1; picks.length < count - 1; k++) {
    for (const v of [answer + k, answer - k]) {
      if (picks.length >= count - 1) break;
      if (v >= 0 && v !== answer && !picks.includes(v)) picks.push(v);
    }
    if (k > 1_000) break; // chốt an toàn; không bao giờ tới với đề thật
  }

  return shuffle([answer, ...picks], orderRnd);
}
