import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { MAX_PLAYERS_CAP } from '../store/types.js';

/**
 * Test ở tầng ROUTE — thứ duy nhất kiểm được bằng `app.inject()`.
 *
 * Bộ test service/store không chạm tới ba thứ sau, mà cả ba đều là nơi hỏng thì
 * hỏng nặng:
 *   1. `admin-guard` — chốt duy nhất quyết định ai bắt đầu được lượt;
 *   2. schema zod — cửa duy nhất chặn dữ liệu rác từ client;
 *   3. bảng mã lỗi → HTTP status.
 *
 * `ADMIN_TOKEN` đọc một lần lúc nạp module nên mỗi ca phải nạp lại app; đổi lại
 * mỗi ca có store sạch, không ca nào thấy lượt của ca khác.
 */

const TOKEN = 'mat-khau-test';

async function bootApp(env: Record<string, string> = {}): Promise<FastifyInstance> {
  vi.resetModules();
  vi.unstubAllEnvs();
  vi.stubEnv('NODE_ENV', 'test'); // chặn nạp model nhận diện — xem routes/draw.ts
  vi.stubEnv('ADMIN_TOKEN', env.ADMIN_TOKEN ?? TOKEN);
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);

  const { buildApp } = await import('../app.js');
  return buildApp({ logger: false });
}

let app: FastifyInstance | null = null;

afterEach(async () => {
  await app?.close();
  app = null;
  vi.unstubAllEnvs();
});

const auth = { 'x-admin-token': TOKEN };

describe('admin-guard', () => {
  it('thiếu header → 401, không đụng được gì', async () => {
    app = await bootApp();
    const res = await app.inject({ method: 'GET', url: '/api/admin/rounds' });
    expect(res.statusCode).toBe(401);
  });

  it('sai token → 401', async () => {
    app = await bootApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/rounds',
      headers: { 'x-admin-token': 'sai-bet' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('đúng token → qua', async () => {
    app = await bootApp();
    const res = await app.inject({ method: 'GET', url: '/api/admin/rounds', headers: auth });
    expect(res.statusCode).toBe(200);
  });

  it('PRODUCTION mà quên đặt ADMIN_TOKEN → chặn hết (503), KHÔNG mở toang', async () => {
    // Hỏng theo kiểu ồn ào còn hơn hỏng im lặng: quên biến môi trường mà vẫn cho
    // mọi người bấm BẮT ĐẦU thì cả sự kiện chạy trong trạng thái không ai biết.
    app = await bootApp({ ADMIN_TOKEN: '', NODE_ENV: 'production' });
    const res = await app.inject({ method: 'GET', url: '/api/admin/rounds' });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ error: 'ADMIN_NOT_CONFIGURED' });
  });

  it('chế độ dev thiếu token thì cho qua — chạy thử không cần cấu hình gì', async () => {
    app = await bootApp({ ADMIN_TOKEN: '' });
    const res = await app.inject({ method: 'GET', url: '/api/admin/rounds' });
    expect(res.statusCode).toBe(200);
  });

  it('BẮT ĐẦU LƯỢT cũng đòi token — không phải chỉ mấy route /api/admin', async () => {
    app = await bootApp();
    const created = await app.inject({
      method: 'POST',
      url: '/api/admin/rounds',
      headers: auth,
      payload: { game: 'math' },
    });
    const { roundId } = created.json<{ roundId: string }>();
    await app.inject({ method: 'POST', url: '/api/rounds/join', payload: { name: 'An' } });

    const res = await app.inject({ method: 'POST', url: `/api/rounds/${roundId}/start` });
    expect(res.statusCode).toBe(401);
  });
});

describe('POST /api/admin/rounds', () => {
  it('tạo lượt và mở luôn trò đó', async () => {
    app = await bootApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/rounds',
      headers: auth,
      payload: { game: 'spot' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ game: 'spot' });

    const list = await app.inject({ method: 'GET', url: '/api/admin/rounds', headers: auth });
    expect(list.json()).toMatchObject({ activeGame: 'spot' });
  });

  it('tên trò không có thật → 400', async () => {
    app = await bootApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/rounds',
      headers: auth,
      payload: { game: 'co-tuong' },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('POST /api/admin/max-players', () => {
  it('đổi sức chứa của đúng một trò', async () => {
    app = await bootApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/max-players',
      headers: auth,
      payload: { game: 'draw', value: 3 },
    });

    expect(res.statusCode).toBe(200);
    const { maxPlayers } = res.json<{ maxPlayers: Record<string, number> }>();
    expect(maxPlayers.draw).toBe(3);
    expect(maxPlayers.math).not.toBe(3);
  });

  it.each([
    ['số 0', 0],
    ['số âm', -1],
    ['số lẻ', 2.5],
    ['quá trần', MAX_PLAYERS_CAP + 1],
  ])('giá trị hỏng (%s) → 400, không ghi vào store', async (_, value) => {
    app = await bootApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/max-players',
      headers: auth,
      payload: { game: 'math', value },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('vào lượt và bắt đầu', () => {
  it('người chơi KHÔNG chọn được trò — server quyết theo trò đang mở', async () => {
    app = await bootApp();
    await app.inject({
      method: 'POST',
      url: '/api/admin/rounds',
      headers: auth,
      payload: { game: 'memory' },
    });

    // Client cố tình khai `game: 'math'`; server phải bỏ qua.
    const res = await app.inject({
      method: 'POST',
      url: '/api/rounds/join',
      payload: { name: 'An', game: 'math' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ game: 'memory' });
  });

  it('tên rỗng → 400', async () => {
    app = await bootApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/rounds/join',
      payload: { name: '   ' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('BTC bắt đầu lượt rỗng → 409 EMPTY', async () => {
    app = await bootApp();
    const created = await app.inject({
      method: 'POST',
      url: '/api/admin/rounds',
      headers: auth,
      payload: { game: 'math' },
    });
    const { roundId } = created.json<{ roundId: string }>();

    const res = await app.inject({
      method: 'POST',
      url: `/api/rounds/${roundId}/start`,
      headers: auth,
    });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ error: 'EMPTY' });
  });

  it('BTC tạm đóng → người chơi nhận 409 GAME_CLOSED', async () => {
    app = await bootApp();
    await app.inject({
      method: 'POST',
      url: '/api/admin/active-game',
      headers: auth,
      payload: { game: null },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/rounds/join',
      payload: { name: 'An' },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ error: 'GAME_CLOSED' });
  });

  it('lượt không tồn tại → 404', async () => {
    app = await bootApp();
    const res = await app.inject({ method: 'GET', url: '/api/rounds/ZZZZZZ/state' });
    expect(res.statusCode).toBe(404);
  });
});
