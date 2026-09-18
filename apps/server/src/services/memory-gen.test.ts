import { describe, expect, it } from 'vitest';
import { generateSequence, SEQUENCE_LENGTH } from './memory-gen.js';
import { MEMORY_PAD_COUNT } from '../store/types.js';

describe('memory-gen', () => {
  it('cùng seed → cùng chuỗi (tái lập được một lượt đã chơi)', () => {
    expect(generateSequence(7)).toEqual(generateSequence(7));
  });

  it('seed khác → chuỗi khác', () => {
    expect(generateSequence(7)).not.toEqual(generateSequence(8));
  });

  it('mọi ô đều nằm trong bàn chơi', () => {
    for (const pad of generateSequence(123)) {
      expect(Number.isInteger(pad)).toBe(true);
      expect(pad).toBeGreaterThanOrEqual(0);
      expect(pad).toBeLessThan(MEMORY_PAD_COUNT);
    }
  });

  it('độ dài mặc định đủ cho cả lượt', () => {
    expect(generateSequence(1)).toHaveLength(SEQUENCE_LENGTH);
  });

  /**
   * Ba ô giống nhau liên tiếp làm người chơi trượt vì ĐẾM nhầm chứ không phải vì
   * nhớ kém — quét nhiều seed vì lỗi này chỉ lộ ra ở một số dãy nhất định.
   */
  it('không bao giờ có 3 ô giống nhau liên tiếp', () => {
    for (let seed = 0; seed < 200; seed++) {
      const seq = generateSequence(seed);
      for (let i = 2; i < seq.length; i++) {
        expect(seq[i] === seq[i - 1] && seq[i] === seq[i - 2]).toBe(false);
      }
    }
  });

  it('dùng đủ cả 4 ô, không thiên về ô nào', () => {
    const counts = new Array<number>(MEMORY_PAD_COUNT).fill(0);
    for (let seed = 0; seed < 50; seed++) {
      for (const pad of generateSequence(seed)) counts[pad] = (counts[pad] ?? 0) + 1;
    }
    const total = counts.reduce((a, b) => a + b, 0);
    for (const c of counts) expect(c / total).toBeGreaterThan(0.15); // lý tưởng 0.25
  });
});
