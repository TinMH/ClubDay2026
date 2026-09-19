import { mulberry32, randInt } from '../lib/prng.js';
import type { Question } from '../store/types.js';

/** Sinh sẵn 60 câu cho mỗi lượt. 90 giây thì người nhanh nhất cũng không hết. */
export const QUESTION_COUNT = 60;

/** 10 câu đầu chỉ cộng/trừ để khởi động, không dội nhân/chia ngay. */
const WARMUP_COUNT = 10;

const ADD = 0;
const SUB = 1;
const MUL = 2;
const DIV = 3;

/** Sinh một câu theo loại phép toán cho trước. */
function buildOne(rnd: () => number, kind: number): Question {
  switch (kind) {
    case ADD: {
      // 10..99 + 1..89 → tổng ≤ 188, nhẩm được trong đầu
      const a = randInt(rnd, 10, 99);
      const b = randInt(rnd, 1, 89);
      return { prompt: `${a} + ${b}`, answer: a + b };
    }
    case SUB: {
      // 20..99 − 1..19 → kết quả luôn dương
      const a = randInt(rnd, 20, 99);
      const b = randInt(rnd, 1, 19);
      return { prompt: `${a} - ${b}`, answer: a - b };
    }
    case MUL: {
      // bảng cửu chương mở rộng
      const a = randInt(rnd, 2, 11);
      const b = randInt(rnd, 2, 11);
      return { prompt: `${a} × ${b}`, answer: a * b };
    }
    default: {
      // DIV — sinh ngược từ thương để LUÔN chia hết
      const b = randInt(rnd, 2, 11);
      const quotient = randInt(rnd, 2, 11);
      return { prompt: `${b * quotient} ÷ ${b}`, answer: quotient };
    }
  }
}

/**
 * Sinh câu hỏi từ một seed — CÙNG seed luôn cho CÙNG dãy câu hỏi.
 *
 * Hàm này chỉ được chạy ở SERVER. Nếu client sinh được câu hỏi thì nó cũng
 * sửa được đáp án, và toàn bộ phần chống gian lận thành vô nghĩa.
 */
export function generateQuestions(seed: number, count = QUESTION_COUNT): Question[] {
  const rnd = mulberry32(seed);
  const out: Question[] = [];
  let prev: Question | null = null;

  for (let i = 0; i < count; i++) {
    const kind = i < WARMUP_COUNT ? (rnd() < 0.5 ? ADD : SUB) : randInt(rnd, ADD, DIV);
    let question = buildOne(rnd, kind);

    // Hai câu giống hệt liền nhau khiến người chơi tưởng game bị treo → sinh lại.
    for (let tries = 0; tries < 8 && prev !== null && prev.prompt === question.prompt; tries++) {
      question = buildOne(rnd, kind);
    }

    out.push(question);
    prev = question;
  }

  return out;
}

/**
 * Seed tất định từ mã lượt (FNV-1a).
 * Cùng mã lượt → cùng đề bài, nên tra lại được một lượt đã chơi.
 *
 * Là hàm băm chuỗi thường, nên dùng được cho cả khoá ghép: Ô khác màu băm
 * "mã lượt:người chơi:số lần đã chạm" (xem services/spot-session.ts).
 */
export function seedFromRoundId(roundId: string): number {
  let hash = 2_166_136_261;
  for (let i = 0; i < roundId.length; i++) {
    hash ^= roundId.charCodeAt(i);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}
