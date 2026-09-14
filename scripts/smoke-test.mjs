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

  // ── TRACK A: game Tính nhanh ──
  console.log('\n── 5. Track A — Tính nhanh (chọn 1 trong 4, điểm theo chuỗi) ──');
  const m = await call('/api/admin/rounds', { method: 'POST', body: { game: 'math' }, token: TOKEN });
  const mId = m.data.roundId;
  const mJoin = await call('/api/rounds/join', { method: 'POST', body: { name: 'An', roundId: mId } });
  const mPid = mJoin.data.playerId;
  await call(`/api/rounds/${mId}/start`, { method: 'POST', body: {}, token: TOKEN });

  /** Tính đáp án chỉ từ chuỗi hiển thị — giống cách người chơi nhìn đề. */
  const solve = (prompt) => {
    const p = /^(\d+) ([+\-×÷]) (\d+)$/.exec(prompt ?? '');
    if (!p) return null;
    const a = Number(p[1]);
    const b = Number(p[3]);
    return p[2] === '+' ? a + b : p[2] === '-' ? a - b : p[2] === '×' ? a * b : a / b;
  };

  const q0 = await call(`/api/rounds/${mId}/question?playerId=${mPid}`);
  check('Lấy được câu hỏi đầu tiên', typeof q0.data?.question?.prompt === 'string', JSON.stringify(q0.data?.question));
  // Regression cho lỗi rò rỉ: client TUYỆT ĐỐI không được thấy đáp án
  check(
    'Câu hỏi KHÔNG lộ đáp án ra client',
    q0.data?.question != null && !('answer' in q0.data.question),
    JSON.stringify(q0.data?.question),
  );

  const truth0 = solve(q0.data?.question?.prompt);
  const opts0 = q0.data?.question?.options ?? [];
  check(
    'Câu hỏi kèm ĐÚNG 4 lựa chọn, khác nhau từng đôi',
    opts0.length === 4 && new Set(opts0).size === 4,
    JSON.stringify(opts0),
  );
  check(
    'Đáp án LUÔN nằm trong 4 lựa chọn — thiếu là không ai trả lời đúng được',
    opts0.includes(truth0),
    `đáp án=${truth0} lựa chọn=${JSON.stringify(opts0)}`,
  );
  check(
    'Mọi lựa chọn đều là số nguyên không âm',
    opts0.every((v) => Number.isInteger(v) && v >= 0),
    JSON.stringify(opts0),
  );

  // Lựa chọn phải ỔN ĐỊNH giữa các lần hỏi: hỏi lại mà đổi thứ tự thì người chơi
  // đang nhắm nút này sẽ bấm nhầm nút khác.
  const q0again = await call(`/api/rounds/${mId}/question?playerId=${mPid}`);
  check(
    'Hỏi lại cùng câu → cùng bộ lựa chọn, cùng thứ tự',
    JSON.stringify(q0again.data?.question?.options) === JSON.stringify(opts0),
    JSON.stringify(q0again.data?.question?.options),
  );

  // Sai vì CHỌN NHẦM một lựa chọn có thật trên màn hình — đúng kiểu sai của người chơi.
  const wrongPick = opts0.find((v) => v !== truth0);
  const wrong = await call(`/api/rounds/${mId}/answer`, {
    method: 'POST',
    body: { playerId: mPid, idx: 0, value: wrongPick },
  });
  check('Chọn nhầm lựa chọn sai → correct=false, score=0', wrong.data?.correct === false && wrong.data?.score === 0, JSON.stringify(wrong.data));

  await sleep(350); // vượt ngưỡng chống spam 250ms
  const q1 = await call(`/api/rounds/${mId}/question?playerId=${mPid}`);
  const truth = solve(q1.data?.question?.prompt);
  check('Câu kế tiếp cũng KHÔNG lộ đáp án', q1.data?.question != null && !('answer' in q1.data.question));
  check('Đáp án tính được từ đề hiển thị', truth !== null && Number.isInteger(truth), `prompt=${q1.data?.question?.prompt}`);
  check(
    'Câu kế tiếp cũng có 4 lựa chọn chứa đáp án',
    q1.data?.question?.options?.length === 4 && q1.data?.question?.options?.includes(truth),
    JSON.stringify(q1.data?.question?.options),
  );

  const right = await call(`/api/rounds/${mId}/answer`, {
    method: 'POST',
    body: { playerId: mPid, idx: 1, value: truth },
  });
  check('Trả lời đúng → correct=true, score=1', right.data?.correct === true && right.data?.score === 1, JSON.stringify(right.data));
  check(
    'Câu kế tiếp trong chính response đó cũng có 4 lựa chọn, không lộ đáp án',
    right.data?.question?.options?.length === 4 &&
      !('answer' in (right.data?.question ?? {})) &&
      right.data.question.options.includes(solve(right.data.question.prompt)),
    JSON.stringify(right.data?.question),
  );

  const spam = await call(`/api/rounds/${mId}/answer`, {
    method: 'POST',
    body: { playerId: mPid, idx: 2, value: 1 },
  });
  check('Spam nhanh hơn 250ms → 429 TOO_FAST', spam.status === 429 && spam.data?.error === 'TOO_FAST', `HTTP ${spam.status}`);

  await sleep(350);
  // `value: -1` giờ còn là ca "client gửi một số KHÔNG có trong 4 lựa chọn" —
  // giao diện không cho bấm ra ngoài, nhưng sửa request thì bấm được số nào cũng
  // xong, nên server vẫn phải tự chấm theo đáp án của nó.
  const cheat = await call(`/api/rounds/${mId}/answer`, {
    method: 'POST',
    body: { playerId: mPid, idx: 2, value: -1, score: 9999 },
  });
  check('Body kèm "score":9999 bị server bỏ qua', cheat.data?.score === 1, `server trả score=${cheat.data?.score}`);

  await sleep(350);
  const jump = await call(`/api/rounds/${mId}/answer`, {
    method: 'POST',
    body: { playerId: mPid, idx: 40, value: 1 },
  });
  check('Nhảy câu → 400 BAD_INDEX', jump.status === 400 && jump.data?.error === 'BAD_INDEX', `HTTP ${jump.status}`);

  // ── ĐIỂM = CHUỖI ĐÚNG DÀI NHẤT, không phải tổng số câu đúng ──
  //
  // Chuỗi cố ý có một câu sai ở GIỮA để phân biệt hai cách tính: nếu điểm là
  // tổng số câu đúng thì cuối lượt phải là 5, còn nếu là chuỗi dài nhất thì là 3.
  console.log('   (kiểm điểm theo chuỗi — 6 câu, ~2 giây)');

  /** Trả lời câu `idx`; tự chờ vượt ngưỡng chống spam 250ms. */
  const answerRight = async (idx, right) => {
    const st = await call(`/api/rounds/${mId}/question?playerId=${mPid}`);
    const nowTruth = solve(st.data?.question?.prompt);
    check(`  câu ${idx} tính được đáp án từ đề`, typeof nowTruth === 'number', JSON.stringify(st.data?.question?.prompt));
    await sleep(350);
    return call(`/api/rounds/${mId}/answer`, {
      method: 'POST',
      body: { playerId: mPid, idx, value: right ? nowTruth : nowTruth + 1000 },
    });
  };

  await answerRight(3, true); // chuỗi 1
  await answerRight(4, false); // chuỗi đứt
  await answerRight(5, true); // chuỗi 1
  await answerRight(6, true); // chuỗi 2
  const aRun = await answerRight(7, true); // chuỗi 3 — dài nhất
  const aBreak = await answerRight(8, false); // chuỗi đứt lần nữa

  check('Đúng 3 câu liên tiếp → chuỗi hiện tại = 3', aRun.data?.streak === 3, `streak=${aRun.data?.streak}`);
  check(
    'Điểm = 3 chứ KHÔNG phải 4 (tổng số câu đúng tính đến lúc đó)',
    aRun.data?.score === 3,
    `score=${aRun.data?.score}`,
  );
  check('Trả lời sai → chuỗi hiện tại về 0', aBreak.data?.streak === 0, `streak=${aBreak.data?.streak}`);
  check(
    'Sai KHÔNG lấy đi chuỗi dài nhất đã lập — vẫn còn động lực chơi tiếp',
    aBreak.data?.score === 3,
    `score=${aBreak.data?.score}`,
  );

  const mDash = await call(`/api/rounds/${mId}/dashboard`);
  const row = mDash.data?.rows?.find((r) => r.playerId === mPid);
  check('Bảng hạng ghi đúng đúng/sai', row?.correct === 5 && row?.wrong === 4, JSON.stringify(row));
  check(
    'Bảng hạng xếp theo CHUỖI (3), không phải tổng câu đúng (5)',
    row?.score === 3,
    `score=${row?.score} correct=${row?.correct}`,
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
