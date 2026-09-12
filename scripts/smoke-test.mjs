/**
 * Smoke test nền tảng (Wave 1) — chạy được bằng MỘT lệnh, không cần bật server trước.
 *
 *   npm run smoke
 *
 * Script tự khởi động server trên cổng riêng (8799) và CSDL snapshot riêng
 * (data/smoke-test.json), chạy hết kiểm tra rồi tắt. Không đụng tới server thật.
 *
 * Yêu cầu: đã chạy `npm run build` (cần apps/server/dist).
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = Number(process.env.SMOKE_PORT ?? 8799);
const TOKEN = 'smoke-token';
const BASE = `http://127.0.0.1:${PORT}`;

if (!existsSync('apps/server/dist/index.js')) {
  console.error('❌ Chưa build. Chạy `npm run build` trước.');
  process.exit(1);
}

let pass = 0;
let fail = 0;

function check(name, ok, detail = '') {
  if (ok) {
    pass += 1;
    console.log(`  ✅ ${name}`);
  } else {
    fail += 1;
    console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

async function call(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { 'x-admin-token': token } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  return { status: res.status, data: text ? JSON.parse(text) : null };
}

/** Đọc sự kiện SSE đầu tiên rồi ngắt kết nối. */
async function readSse(path, timeoutMs = 3000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE}${path}`, { signal: ctrl.signal });
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    while (!buf.includes('\n\n')) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
    }
    void reader.cancel();
    const line = buf.split('\n').find((l) => l.startsWith('data: '));
    return line ? JSON.parse(line.slice(6)) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const server = spawn(process.execPath, ['apps/server/dist/index.js'], {
  env: {
    ...process.env,
    PORT: String(PORT),
    HOST: '127.0.0.1',
    ADMIN_TOKEN: TOKEN,
    SNAPSHOT_FILE: 'data/smoke-test.json',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverLog = '';
server.stdout.on('data', (d) => (serverLog += d));
server.stderr.on('data', (d) => (serverLog += d));

try {
  // ── chờ server sẵn sàng ──
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try {
      const r = await call('/api/health');
      if (r.status === 200) {
        ready = true;
        break;
      }
    } catch {
      /* chưa lên */
    }
    await sleep(250);
  }
  if (!ready) throw new Error(`Server không khởi động được.\n${serverLog}`);
  console.log('\n── 1. Health ──');
  const health = await call('/api/health');
  check('GET /api/health trả ok:true', health.data?.ok === true);

  // ── xác thực admin ──
  console.log('\n── 2. Bảo vệ route admin ──');
  const noAuth = await call('/api/admin/rounds', { method: 'POST', body: { game: 'math' } });
  check('Tạo lượt KHÔNG có token → 401', noAuth.status === 401, `nhận ${noAuth.status}`);
  const badAuth = await call('/api/admin/rounds', {
    method: 'POST',
    body: { game: 'math' },
    token: 'sai-token',
  });
  check('Tạo lượt với token SAI → 401', badAuth.status === 401, `nhận ${badAuth.status}`);

  // ── lượt Tính nhanh ──
  console.log('\n── 3. Lượt Tính nhanh (90s) ──');
  const created = await call('/api/admin/rounds', {
    method: 'POST',
    body: { game: 'math' },
    token: TOKEN,
  });
  check('Tạo lượt với token ĐÚNG → 200', created.status === 200);
  const roundId = created.data?.roundId;
  check('Mã lượt 6 ký tự, dễ đọc', /^[A-HJ-NP-Z2-9]{6}$/.test(roundId ?? ''), roundId);

  const players = [];
  for (let i = 1; i <= 5; i++) {
    const res = await call('/api/rounds/join', { method: 'POST', body: { name: `P${i}`, roundId } });
    if (res.status === 200) players.push(res.data.playerId);
  }
  check('5 người join được', players.length === 5, `nhận ${players.length}`);

  const sixth = await call('/api/rounds/join', { method: 'POST', body: { name: 'P6', roundId } });
  check('Người thứ 6 bị từ chối (ROUND_FULL)', sixth.data?.error === 'ROUND_FULL', JSON.stringify(sixth.data));

  // ── SSE phải phát được trạng thái ──
  const sseLobby = await readSse(`/api/rounds/${roundId}/stream`);
  check('SSE phát trạng thái lobby', sseLobby?.status === 'lobby', JSON.stringify(sseLobby?.status));
  check('SSE gửi kèm serverNow (để bù lệch giờ)', typeof sseLobby?.serverNow === 'number');
  check('SSE có đủ 5 người chơi', sseLobby?.players?.length === 5);

  // ── đồng hồ chung ──
  const started = await call(`/api/rounds/${roundId}/start`, {
    method: 'POST',
    body: {},
    token: TOKEN,
  });
  check('BTC bắt đầu được', started.status === 200);

  const afterStart = await call(`/api/rounds/${roundId}/state`);
  check('Trạng thái chuyển sang playing', afterStart.data?.status === 'playing');
  const span = (afterStart.data?.endsAt ?? 0) - (afterStart.data?.startedAt ?? 0);
  check('Đồng hồ dùng chung = 90s', span === 90_000, `${span}ms`);

  const lateJoin = await call('/api/rounds/join', { method: 'POST', body: { name: 'Muộn', roundId } });
  check('Join sau khi bắt đầu bị chặn (ROUND_STARTED)', lateJoin.data?.error === 'ROUND_STARTED');

  // ── bỏ qua lượt → kết thúc ngay ──
  await call(`/api/admin/rounds/${roundId}/skip`, { method: 'POST', body: {}, token: TOKEN });
  const dash = await call(`/api/rounds/${roundId}/dashboard`);
  check('Bỏ qua lượt → status done', dash.data?.status === 'done');
  check('Bảng hạng đủ 5 người', dash.data?.rows?.length === 5, `${dash.data?.rows?.length} dòng`);
  const ranks = (dash.data?.rows ?? []).map((r) => r.rank);
  check('Bảng hạng đánh số 1..5 liên tục', JSON.stringify(ranks) === JSON.stringify([1, 2, 3, 4, 5]));

  // ── đồng hồ nền tự kết thúc lượt (không cần request nào) ──
  console.log('\n── 4. Đồng hồ nền tự kết thúc (lượt Vẽ 15s) ──');
  const draw = await call('/api/admin/rounds', {
    method: 'POST',
    body: { game: 'draw' },
    token: TOKEN,
  });
  const drawId = draw.data?.roundId;
  for (let i = 1; i <= 2; i++) {
    await call('/api/rounds/join', { method: 'POST', body: { name: `D${i}`, roundId: drawId } });
  }
  await call(`/api/rounds/${drawId}/start`, { method: 'POST', body: {}, token: TOKEN });

  const t0 = Date.now();
  await sleep(16_500); // KHÔNG gửi request nào trong lúc chờ
  const drawState = await call(`/api/rounds/${drawId}/state`);
  check(
    'Tự chuyển sang done sau 15s (dù không ai gọi API)',
    drawState.data?.status === 'done',
    `sau ${Date.now() - t0}ms, status=${drawState.data?.status}`,
  );

  // ── kết luận ──
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`  ${pass} passed, ${fail} failed`);
  console.log(`${'─'.repeat(50)}\n`);
} catch (err) {
  console.error('\n❌ Smoke test lỗi:', err instanceof Error ? err.message : err);
  fail += 1;
} finally {
  server.kill();
}

process.exit(fail === 0 ? 0 : 1);
