import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DURATION_MS,
  GAME_KINDS,
  GAME_LABEL,
  MAX_PLAYERS_CAP,
  MEMORY_PAD_COUNT,
  MEMORY_STEP_MS,
  DEFAULT_MAX_PLAYERS,
} from './types';

/**
 * `apps/web/src/lib/types.ts` là BẢN CHÉP TAY của hợp đồng bên server. Comment ở
 * cả hai file đều ghi "phải khớp", nhưng không có gì bắt nó khớp — lệch một con
 * số là lỗi im lặng, và nó im theo kiểu tệ nhất:
 *
 *   - lệch `MEMORY_STEP_MS` → client phát chuỗi nhanh hơn server nghĩ → người
 *     chơi THẬT bị gắn cờ gian lận;
 *   - thiếu một game trong `GAME_KINDS` → trò đó biến mất khỏi trang chủ mà
 *     không lỗi gì;
 *   - lệch `DURATION_MS` → đồng hồ đếm ngược chạy sai so với đồng hồ chấm điểm.
 *
 * Bộ test này đọc THẲNG file của server và so từng giá trị. Cách làm thô (parse
 * bằng regex) và chỉ là giải pháp tạm: đúng hơn là tách một package hợp đồng cho
 * hai app cùng import. Nhưng nó chặn được drift ngay hôm nay với chi phí gần như
 * bằng không, nên đáng tồn tại cho tới khi package đó có thật.
 */

const serverTypes = readFileSync(
  join(import.meta.dirname, '../../../server/src/store/types.ts'),
  'utf8',
);

/** `export const NAME = 123;` → 123 */
function num(name: string): number {
  const m = new RegExp(`export const ${name} = ([0-9_]+)`).exec(serverTypes);
  if (!m?.[1]) throw new Error(`Không thấy hằng số ${name} trong types.ts của server`);
  return Number(m[1].replace(/_/g, ''));
}

/** Giá trị số trong một khối `Record<GameKind, number>`. */
function record(name: string): Record<string, number> {
  const block = new RegExp(`export const ${name}: Record<GameKind, number> = \\{([^}]*)\\}`, 's').exec(
    serverTypes,
  );
  if (!block?.[1]) throw new Error(`Không thấy bảng ${name} trong types.ts của server`);
  const out: Record<string, number> = {};
  for (const [, key, value] of block[1].matchAll(/^\s*(\w+):\s*([0-9_]+)/gm)) {
    if (key && value) out[key] = Number(value.replace(/_/g, ''));
  }
  return out;
}

describe('hợp đồng server ↔ web', () => {
  it('danh sách game khớp nhau', () => {
    const m = /export const GAME_KINDS = \[([^\]]*)\]/.exec(serverTypes);
    const games = [...(m?.[1] ?? '').matchAll(/'(\w+)'/g)].map(([, g]) => g);
    expect(games).toEqual([...GAME_KINDS]);
  });

  it('thời lượng từng trò khớp nhau', () => {
    expect(record('DURATION_MS')).toEqual(DURATION_MS);
  });

  it('tên hiển thị có đủ cho mọi trò ở cả hai bên', () => {
    const labels = /export const GAME_LABEL: Record<GameKind, string> = \{([^}]*)\}/s.exec(
      serverTypes,
    );
    const keys = [...(labels?.[1] ?? '').matchAll(/^\s*(\w+):/gm)].map(([, k]) => k);
    expect(keys.sort()).toEqual(Object.keys(GAME_LABEL).sort());
  });

  it('các hằng số chia chung khớp nhau', () => {
    expect(num('MEMORY_STEP_MS')).toBe(MEMORY_STEP_MS);
    expect(num('MEMORY_PAD_COUNT')).toBe(MEMORY_PAD_COUNT);
    expect(num('MAX_PLAYERS_CAP')).toBe(MAX_PLAYERS_CAP);
    expect(num('MAX_PLAYERS')).toBe(DEFAULT_MAX_PLAYERS);
  });
});
