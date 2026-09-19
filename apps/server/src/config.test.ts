import { afterEach, describe, expect, it, vi } from 'vitest';
import { GAME_KINDS, MAX_PLAYERS, MAX_PLAYERS_CAP } from './store/types.js';

/**
 * Cấu hình đọc biến môi trường MỘT LẦN lúc nạp module, nên mỗi ca test phải nạp
 * lại module sau khi đặt biến — `vi.resetModules()` là chỗ làm việc đó.
 */
async function loadWith(env: Record<string, string>) {
  vi.resetModules();
  vi.unstubAllEnvs();
  // Xoá sạch mọi biến của lần trước, kể cả biến từ .env thật của máy đang chạy.
  vi.stubEnv('MAX_PLAYERS', '');
  for (const g of GAME_KINDS) vi.stubEnv(`MAX_PLAYERS_${g.toUpperCase()}`, '');
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  return import('./config.js');
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('config — số người tối đa mỗi trò', () => {
  it('không đặt gì thì mọi trò dùng mặc định', async () => {
    const { MAX_PLAYERS_BY_GAME } = await loadWith({});
    for (const g of GAME_KINDS) expect(MAX_PLAYERS_BY_GAME[g]).toBe(MAX_PLAYERS);
  });

  it('MAX_PLAYERS đặt mặc định cho TẤT CẢ các trò', async () => {
    const { MAX_PLAYERS_BY_GAME } = await loadWith({ MAX_PLAYERS: '8' });
    for (const g of GAME_KINDS) expect(MAX_PLAYERS_BY_GAME[g]).toBe(8);
  });

  it('MAX_PLAYERS_<TRÒ> đè lên mặc định, chỉ riêng trò đó', async () => {
    const { MAX_PLAYERS_BY_GAME } = await loadWith({ MAX_PLAYERS: '8', MAX_PLAYERS_DRAW: '3' });
    expect(MAX_PLAYERS_BY_GAME.draw).toBe(3);
    expect(MAX_PLAYERS_BY_GAME.math).toBe(8);
    expect(MAX_PLAYERS_BY_GAME.memory).toBe(8);
    expect(MAX_PLAYERS_BY_GAME.spot).toBe(8);
  });

  it.each([
    ['chữ', 'nhiều vào'],
    ['số 0', '0'],
    ['số âm', '-2'],
    ['số lẻ', '4.5'],
    ['quá trần', String(MAX_PLAYERS_CAP + 1)],
  ])('giá trị hỏng (%s) thì CẢNH BÁO rồi dùng mặc định, không làm sập server', async (_, raw) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { MAX_PLAYERS_BY_GAME } = await loadWith({ MAX_PLAYERS_MATH: raw });

    expect(MAX_PLAYERS_BY_GAME.math).toBe(MAX_PLAYERS);
    expect(warn).toHaveBeenCalled();
  });

  it('nhận đúng hai đầu của khoảng cho phép', async () => {
    const low = await loadWith({ MAX_PLAYERS: '1' });
    expect(low.MAX_PLAYERS_BY_GAME.math).toBe(1);

    const high = await loadWith({ MAX_PLAYERS: String(MAX_PLAYERS_CAP) });
    expect(high.MAX_PLAYERS_BY_GAME.math).toBe(MAX_PLAYERS_CAP);
  });

  it('mặc định hỏng thì trò không đặt riêng vẫn về hằng số gốc', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { MAX_PLAYERS_BY_GAME } = await loadWith({ MAX_PLAYERS: '999', MAX_PLAYERS_SPOT: '6' });
    expect(MAX_PLAYERS_BY_GAME.math).toBe(MAX_PLAYERS);
    expect(MAX_PLAYERS_BY_GAME.spot).toBe(6);
  });
});
