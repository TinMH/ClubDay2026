import { describe, expect, it } from 'vitest';
import { deltaForLevel, generateBoard, sizeForLevel } from './spot-gen.js';
import { SPOT_MAX_SIZE, SPOT_MIN_SIZE } from '../store/types.js';

/** Tách "hsl(H S% L%)" ra ba số để so sánh. */
function hsl(value: string): { h: number; s: number; l: number } {
  const m = /^hsl\((\d+(?:\.\d+)?) (\d+(?:\.\d+)?)% (\d+(?:\.\d+)?)%\)$/.exec(value);
  if (!m) throw new Error(`Màu không đúng dạng: ${value}`);
  return { h: Number(m[1]), s: Number(m[2]), l: Number(m[3]) };
}

describe('spot-gen', () => {
  it('cùng seed + cùng cấp → CÙNG bàn chơi (server chấm lại được)', () => {
    const a = generateBoard(12_345, 4);
    const b = generateBoard(12_345, 4);
    expect(a).toEqual(b);
  });

  it('hai cấp liền nhau ra hai bàn khác nhau', () => {
    const a = generateBoard(12_345, 4);
    const b = generateBoard(12_345, 5);
    expect(a).not.toEqual(b);
  });

  it('cấp n của lượt này KHÔNG trùng cấp n+1 của lượt có seed lệch 1', () => {
    // Nếu seed chỉ được cộng thẳng với level thì hai bàn này trùng nhau, và người
    // chơi lượt sau nhận ra vị trí quen thay vì phải nhìn.
    expect(generateBoard(1_000, 5)).not.toEqual(generateBoard(1_001, 4));
  });

  it('ô khác chỉ lệch ĐỘ SÁNG — cùng tông, cùng độ bão hoà (để người mù màu vẫn chơi được)', () => {
    for (let level = 1; level <= 20; level++) {
      const { base, odd } = generateBoard(777, level);
      const b = hsl(base);
      const o = hsl(odd);
      expect(o.h).toBe(b.h);
      expect(o.s).toBe(b.s);
      expect(o.l).not.toBe(b.l);
    }
  });

  it('độ lệch sáng đúng bằng `deltaForLevel` và không bao giờ xuống dưới sàn', () => {
    for (let level = 1; level <= 30; level++) {
      const { base, odd } = generateBoard(99, level);
      const gap = Math.abs(hsl(odd).l - hsl(base).l);
      expect(gap).toBeCloseTo(deltaForLevel(level), 5);
      expect(gap).toBeGreaterThanOrEqual(2);
    }
  });

  it('độ sáng luôn nằm trong [0, 100] — không bị kẹp ở hai đầu', () => {
    for (let seed = 0; seed < 200; seed++) {
      const { base, odd } = generateBoard(seed, 1); // cấp 1 lệch nhiều nhất
      for (const l of [hsl(base).l, hsl(odd).l]) {
        expect(l).toBeGreaterThan(0);
        expect(l).toBeLessThan(100);
      }
    }
  });

  it('ô khác lúc sáng hơn lúc tối hơn — không đoán được một chiều', () => {
    const dirs = new Set<boolean>();
    for (let seed = 0; seed < 50; seed++) {
      const { base, odd } = generateBoard(seed, 3);
      dirs.add(hsl(odd).l > hsl(base).l);
    }
    expect(dirs.size).toBe(2);
  });

  it('lưới rộng dần theo cấp rồi dừng ở trần', () => {
    expect(sizeForLevel(1)).toBe(SPOT_MIN_SIZE);
    expect(sizeForLevel(3)).toBe(3);
    expect(sizeForLevel(9)).toBe(SPOT_MAX_SIZE);
    expect(sizeForLevel(50)).toBe(SPOT_MAX_SIZE); // chạm trần thì chỉ còn màu khó đi
  });

  it('độ khó chỉ tăng, không bao giờ dễ lại', () => {
    for (let level = 1; level < 30; level++) {
      expect(sizeForLevel(level + 1)).toBeGreaterThanOrEqual(sizeForLevel(level));
      expect(deltaForLevel(level + 1)).toBeLessThanOrEqual(deltaForLevel(level));
    }
  });

  it('ô khác luôn nằm trong lưới', () => {
    for (let level = 1; level <= 20; level++) {
      const board = generateBoard(4_242, level);
      expect(board.oddIndex).toBeGreaterThanOrEqual(0);
      expect(board.oddIndex).toBeLessThan(board.size * board.size);
    }
  });
});
