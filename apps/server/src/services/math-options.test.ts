import { describe, expect, it } from 'vitest';
import { OPTION_COUNT, optionsFor } from './math-options.js';
import { generateQuestions, seedFromRoundId } from './math-gen.js';

/**
 * Test chạy trên ĐỀ THẬT do `math-gen.ts` sinh ra, không phải đề tự bịa — vì
 * thứ được ship là hành vi trên đề thật.
 */

/** 100 lượt × 60 câu = 6000 câu, đủ phủ cả 4 phép toán. */
function allQuestions(): Array<{ prompt: string; answer: number }> {
  const out: Array<{ prompt: string; answer: number }> = [];
  for (let r = 0; r < 100; r++) {
    out.push(...generateQuestions(seedFromRoundId(`R${r}`), 60));
  }
  return out;
}

const QUESTIONS = allQuestions();

/** Dải cho phép của một lựa chọn sai — khớp hằng số trong math-options.ts. */
const bandOf = (answer: number): number => Math.max(15, Math.round(answer * 0.6));

describe('optionsFor — bất biến trên đề thật', () => {
  it('mọi câu đều có ĐÚNG 4 lựa chọn, khác nhau, và chứa đáp án', () => {
    let broken = 0;
    for (const q of QUESTIONS) {
      const opts = optionsFor(q.prompt, q.answer);
      const ok =
        opts.length === OPTION_COUNT &&
        new Set(opts).size === OPTION_COUNT &&
        opts.includes(q.answer) &&
        opts.every((v) => Number.isInteger(v) && v >= 0);
      if (!ok) broken++;
    }
    // Cứng: một câu hỏng nghĩa là có người chơi không thể trả lời đúng.
    expect(broken).toBe(0);
  });

  it('đáp án xuất hiện đúng MỘT lần, không bị nhân đôi', () => {
    for (const q of QUESTIONS) {
      const opts = optionsFor(q.prompt, q.answer);
      expect(opts.filter((v) => v === q.answer).length).toBe(1);
    }
  });

  it('KHÔNG lựa chọn sai nào lệch quá xa đáp án', () => {
    // Đây là regression test cho hai lỗi thật đã xảy ra:
    //   `41 + 58 = 99` từng có lựa chọn 2378 (= 41 × 58)
    //   `11 × 11 = 121` từng có lựa chọn 22  (= 11 + 11)
    // Nhìn hai con số đó cạnh đáp án là biết ngay, không cần tính.
    let far = 0;
    let worst = 0;
    for (const q of QUESTIONS) {
      for (const v of optionsFor(q.prompt, q.answer)) {
        const off = Math.abs(v - q.answer);
        if (off > worst) worst = off;
        if (off > bandOf(q.answer)) far++;
      }
    }
    expect(far).toBe(0);
    expect(worst).toBeLessThanOrEqual(40);
  });

  it('lựa chọn sai cùng cỡ với đáp án (cùng số chữ số)', () => {
    let sameSizeAll = 0;
    for (const q of QUESTIONS) {
      const digits = String(q.answer).length;
      const wrong = optionsFor(q.prompt, q.answer).filter((v) => v !== q.answer);
      if (wrong.every((v) => String(v).length === digits)) sameSizeAll++;
    }
    // Đo được 95.5% trên 18000 câu; lấy ngưỡng thấp hơn để bắt được suy giảm
    // chứ không phải ghim một con số.
    expect(sameSizeAll / QUESTIONS.length).toBeGreaterThan(0.93);
  });

  it('vị trí đáp án rải đều 0..3, không luôn đứng đầu', () => {
    const pos = [0, 0, 0, 0];
    for (const q of QUESTIONS) pos[optionsFor(q.prompt, q.answer).indexOf(q.answer)]! += 1;

    for (const count of pos) {
      const share = (count as number) / QUESTIONS.length;
      // Nếu đáp án luôn nằm ở một vị trí thì người chơi chỉ cần bấm mãi một nút.
      expect(share).toBeGreaterThan(0.15);
      expect(share).toBeLessThan(0.35);
    }
  });

  it('đáp án không phải lúc nào cũng là số lớn nhất hay nhỏ nhất', () => {
    let biggest = 0;
    let smallest = 0;
    for (const q of QUESTIONS) {
      const opts = optionsFor(q.prompt, q.answer);
      if (q.answer === Math.max(...opts)) biggest++;
      if (q.answer === Math.min(...opts)) smallest++;
    }
    // Cũng là một cách đoán mò: "khoanh số to nhất".
    expect(biggest / QUESTIONS.length).toBeLessThan(0.6);
    expect(smallest / QUESTIONS.length).toBeLessThan(0.6);
  });
});

describe('optionsFor — tất định', () => {
  it('cùng một đề luôn ra cùng bộ lựa chọn, cùng thứ tự', () => {
    for (const q of QUESTIONS.slice(0, 200)) {
      expect(optionsFor(q.prompt, q.answer)).toEqual(optionsFor(q.prompt, q.answer));
    }
  });

  it('tải lại trang giữa chừng không làm lựa chọn nhảy chỗ', () => {
    // Không có seed thì mỗi lần hỏi lại sẽ ra thứ tự khác, và người chơi đang
    // nhắm nút này lại thấy nút khác.
    const a = optionsFor('47 + 36', 83);
    const b = optionsFor('47 + 36', 83);
    expect(a).toEqual(b);
  });
});

describe('optionsFor — ca biên', () => {
  it('đáp án 0, 1, 2 vẫn ra đủ 4 lựa chọn hợp lệ', () => {
    for (const answer of [0, 1, 2]) {
      const opts = optionsFor(`10 - 10`, answer);
      expect(opts.length).toBe(OPTION_COUNT);
      expect(new Set(opts).size).toBe(OPTION_COUNT);
      expect(opts).toContain(answer);
      expect(opts.every((v) => Number.isInteger(v) && v >= 0)).toBe(true);
    }
  });

  it('đề lạ (không khớp định dạng) vẫn ra đủ lựa chọn, không ném lỗi', () => {
    for (const prompt of ['không phải đề', '5 ^ 3', '', '1 + 2 + 3', '99999999999999 + 1']) {
      const opts = optionsFor(prompt, 42);
      expect(opts.length).toBe(OPTION_COUNT);
      expect(new Set(opts).size).toBe(OPTION_COUNT);
      expect(opts).toContain(42);
      expect(opts.every((v) => Number.isInteger(v) && v >= 0)).toBe(true);
    }
  });

  it('đề đúng định dạng nhưng đáp án truyền vào SAI thì bỏ qua phân tích', () => {
    // Chốt an toàn: nếu math-gen đổi cách viết đề, parse ra số khác đáp án thì
    // phải lùi về cách sinh chung, không dựng lựa chọn trên tiền đề sai.
    const opts = optionsFor('41 + 58', 999);
    expect(opts.length).toBe(OPTION_COUNT);
    expect(opts).toContain(999);
    expect(new Set(opts).size).toBe(OPTION_COUNT);
  });

  it('tôn trọng tham số count', () => {
    expect(optionsFor('20 + 30', 50, 3)).toHaveLength(3);
    expect(optionsFor('20 + 30', 50, 2)).toHaveLength(2);
  });

  it('count = 1 thì chỉ có đáp án', () => {
    expect(optionsFor('20 + 30', 50, 1)).toEqual([50]);
  });
});
