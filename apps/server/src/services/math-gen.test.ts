import { describe, expect, it } from 'vitest';
import { generateQuestions, seedFromRoundId, QUESTION_COUNT } from './math-gen.js';
import type { Question } from '../store/types.js';

/** Tính lại đáp án CHỈ từ chuỗi hiển thị cho người chơi. */
function evaluate(prompt: string): number {
  const m = /^(\d+) ([+\-×÷]) (\d+)$/.exec(prompt);
  if (!m) throw new Error(`prompt không hợp lệ: "${prompt}"`);
  const a = Number(m[1]);
  const b = Number(m[3]);
  switch (m[2]) {
    case '+': return a + b;
    case '-': return a - b;
    case '×': return a * b;
    case '÷': return a / b;
    default: throw new Error(`toán tử lạ: ${m[2]}`);
  }
}

const qs: Question[] = generateQuestions(12_345);

describe('math-gen', () => {
  it('sinh đủ số câu', () => {
    expect(qs).toHaveLength(QUESTION_COUNT);
  });

  it('mọi prompt đọc được đúng định dạng "<số> <toán tử> <số>"', () => {
    for (const q of qs) {
      expect(q.prompt, `prompt sai định dạng: ${q.prompt}`).toMatch(/^\d+ [+\-×÷] \d+$/);
    }
  });

  // Đây là test quan trọng nhất: nếu đáp án lưu sẵn lệch với phép toán hiển thị,
  // người chơi trả lời ĐÚNG vẫn bị chấm sai — và không có gì báo lỗi.
  it('đáp án lưu sẵn KHỚP với phép toán hiển thị', () => {
    for (const q of qs) {
      expect(evaluate(q.prompt), `lệch ở "${q.prompt}"`).toBe(q.answer);
    }
  });

  it('đáp án luôn là số nguyên', () => {
    for (const q of qs) expect(Number.isInteger(q.answer)).toBe(true);
  });

  it('phép chia LUÔN chia hết', () => {
    const div = qs.filter((q) => q.prompt.includes('÷'));
    expect(div.length).toBeGreaterThan(0);
    for (const q of div) {
      const [a, b] = q.prompt.split(' ÷ ').map(Number);
      expect(a % b, `${q.prompt} không chia hết`).toBe(0);
    }
  });

  it('phép trừ không bao giờ ra số âm', () => {
    const sub = qs.filter((q) => q.prompt.includes(' - '));
    expect(sub.length).toBeGreaterThan(0);
    for (const q of sub) expect(q.answer).toBeGreaterThan(0);
  });

  it('10 câu đầu chỉ có cộng/trừ (khởi động nhẹ)', () => {
    for (const q of qs.slice(0, 10)) {
      expect(q.prompt).toMatch(/ [+-] /);
    }
  });

  it('câu sau khởi động có đủ 4 loại phép toán', () => {
    const tail = qs.slice(10).map((q) => (/[+\-×÷]/.exec(q.prompt)?.[0] ?? '?'));
    for (const op of ['+', '-', '×', '÷']) {
      expect(tail, `thiếu phép ${op}`).toContain(op);
    }
  });

  it('phép nhân chỉ dùng bảng 2..11', () => {
    for (const q of qs.filter((x) => x.prompt.includes('×'))) {
      const [a, b] = q.prompt.split(' × ').map(Number);
      for (const n of [a, b]) {
        expect(n).toBeGreaterThanOrEqual(2);
        expect(n).toBeLessThanOrEqual(11);
      }
    }
  });

  it('CÙNG seed cho ra CÙNG dãy câu hỏi', () => {
    expect(generateQuestions(777)).toEqual(generateQuestions(777));
  });

  it('seed khác cho ra dãy khác', () => {
    expect(generateQuestions(1)).not.toEqual(generateQuestions(2));
  });

  it('không sinh câu trùng nhau liên tiếp', () => {
    const dup = qs.filter((q, i) => i > 0 && qs[i - 1]?.prompt === q.prompt);
    expect(dup).toHaveLength(0);
  });
});

describe('seedFromRoundId', () => {
  it('tất định: cùng mã lượt → cùng seed', () => {
    expect(seedFromRoundId('AB12CD')).toBe(seedFromRoundId('AB12CD'));
  });

  it('mã lượt khác → seed khác', () => {
    expect(seedFromRoundId('AB12CD')).not.toBe(seedFromRoundId('AB12CE'));
  });

  it('luôn trả số nguyên không âm', () => {
    for (const id of ['AAAAAA', 'ZZZZZZ', '234567', 'ABC123']) {
      const s = seedFromRoundId(id);
      expect(Number.isInteger(s)).toBe(true);
      expect(s).toBeGreaterThanOrEqual(0);
    }
  });

  it('sinh được đề từ mã lượt', () => {
    expect(generateQuestions(seedFromRoundId('XYZ789'))).toHaveLength(QUESTION_COUNT);
  });
});
