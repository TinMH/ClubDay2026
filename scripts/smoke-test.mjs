/**
 * Smoke test end-to-end — chạy được bằng MỘT lệnh, không cần bật server trước.
 *
 *   npm run smoke
 *
 * Script tự khởi động server trên cổng riêng (8799) và CSDL snapshot riêng
 * (data/smoke-test.json), chạy hết kiểm tra rồi tắt. Không đụng tới server thật.
 *
 * Gồm: nền tảng (lượt, SSE, đồng hồ, bảng hạng), Track A (Tính nhanh), và
 * Track B (Vẽ hình nhanh — có nạp model thật, nên lần chạy đầu chậm hơn).
 *
 * ⚠️ Khi viết thêm request: ĐỪNG gửi `content-type: application/json` mà không
 * có body — Fastify sẽ cố parse body rỗng và trả 400 cho một request hoàn toàn
 * hợp lệ. Hàm `call()` dưới đây chỉ gắn header đó khi thật sự có body.
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
    SIGNUP_FORM_URL: 'https://docs.google.com/forms/d/e/SMOKE/viewform',
    SIGNUP_NAME_ENTRY: 'entry.999',
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

  const cfg = await call('/api/config');
  check('GET /api/config trả link Form đăng ký', cfg.data?.signupFormUrl?.includes('SMOKE') === true, JSON.stringify(cfg.data));
  check('GET /api/config trả mã ô điền sẵn tên', cfg.data?.signupNameEntry === 'entry.999');
  check(
    '/api/config KHÔNG lộ ADMIN_TOKEN',
    !JSON.stringify(cfg.data ?? {}).includes(TOKEN),
    JSON.stringify(cfg.data),
  );

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

  // ── TRACK B: game Vẽ hình nhanh ──
  console.log('\n── 6. Track B — game Vẽ hình nhanh ──');

  const h2 = await call('/api/health');
  check('Model nhận diện sẵn sàng (health.model=ready)', h2.data?.model === 'ready', `model=${h2.data?.model}`);

  const d = await call('/api/admin/rounds', { method: 'POST', body: { game: 'draw' }, token: TOKEN });
  const dId = d.data.roundId;
  const dJoin = await call('/api/rounds/join', { method: 'POST', body: { name: 'An', roundId: dId } });
  const dPid = dJoin.data.playerId;
  const dStart = await call(`/api/rounds/${dId}/start`, { method: 'POST', body: {}, token: TOKEN });
  const dTarget = dStart.data?.state?.target;
  check('Lượt Vẽ có từ khoá do SERVER chọn', typeof dTarget?.id === 'string', JSON.stringify(dTarget));
  check(
    'Từ khoá kèm tên tiếng Việt',
    typeof dTarget?.labelVi === 'string' && dTarget.labelVi !== dTarget.id,
    JSON.stringify(dTarget),
  );

  /** Gửi một frame. `canvasW/H` chỉ để hợp lệ hoá — server tự chuẩn hoá theo bbox. */
  const frame = (body) =>
    call(`/api/rounds/${dId}/frame`, {
      method: 'POST',
      body: { canvasW: 300, canvasH: 300, ...body },
    });

  const okFrame = await frame({ playerId: dPid, seq: 1, strokes: [[[20, 20], [200, 200]]] });
  check('Frame hợp lệ → 200', okFrame.status === 200, `HTTP ${okFrame.status}`);
  check(
    'Trả về top-3 kèm tên tiếng Việt',
    Array.isArray(okFrame.data?.top) &&
      okFrame.data.top.length === 3 &&
      typeof okFrame.data.top[0]?.labelVi === 'string',
    JSON.stringify(okFrame.data?.top),
  );
  check(
    'Frame trả GỢI Ý (`hint`), không trả kết quả (`matched`)',
    typeof okFrame.data?.hint === 'boolean' && okFrame.data?.matched === undefined,
    `hint=${okFrame.data?.hint} matched=${okFrame.data?.matched}`,
  );
  check(
    'Frame KHÔNG cộng điểm — vẽ đúng cũng phải chờ NỘP',
    okFrame.data?.score === 0,
    `score=${okFrame.data?.score}`,
  );

  const fastFrame = await frame({ playerId: dPid, seq: 2, strokes: [[[20, 20], [200, 200]]] });
  check(
    '2 frame cách <1s → 429 TOO_FAST',
    fastFrame.status === 429 && fastFrame.data?.error === 'TOO_FAST',
    `HTTP ${fastFrame.status} ${fastFrame.data?.error}`,
  );

  await sleep(1100);
  const replay = await frame({ playerId: dPid, seq: 1, strokes: [[[20, 20], [200, 200]]] });
  check(
    'Gửi lại seq cũ → 409 SEQUENCE',
    replay.status === 409 && replay.data?.error === 'SEQUENCE',
    `HTTP ${replay.status} ${replay.data?.error}`,
  );

  await sleep(1100);
  const blankFrame = await frame({ playerId: dPid, seq: 3, strokes: [] });
  check(
    'Canvas trống → 200, hint=false, không crash',
    blankFrame.status === 200 &&
      blankFrame.data?.hint === false &&
      Array.isArray(blankFrame.data?.top) &&
      blankFrame.data.top.length === 0,
    `HTTP ${blankFrame.status} top=${JSON.stringify(blankFrame.data?.top)}`,
  );

  await sleep(1100);
  // Nhiều nét, mỗi nét dưới trần, nhưng TỔNG thì vượt — đây mới là kiểu tấn công thật.
  const manyStrokes = Array.from({ length: 200 }, () =>
    Array.from({ length: 100 }, (_, i) => [i, (i * 3) % 100]),
  );
  const huge = await frame({ playerId: dPid, seq: 4, strokes: manyStrokes });
  check('Tổng 20000 điểm → 413', huge.status === 413, `HTTP ${huge.status} ${huge.data?.error}`);

  const stranger = await frame({ playerId: 'khong-co-nguoi-nay', seq: 5, strokes: [] });
  check('Người chơi lạ → 404', stranger.status === 404, `HTTP ${stranger.status}`);

  const badCoords = await frame({ playerId: dPid, seq: 6, strokes: [[[1, 2], ['x', 3]]] });
  check('Toạ độ không phải số → 400', badCoords.status === 400, `HTTP ${badCoords.status}`);

  // ── đường THẮNG, chạy trên model thật qua HTTP ──
  //
  // Từ khoá do server chọn ngẫu nhiên theo mã lượt, nên chỉ kiểm được khi gặp
  // từ khoá mà script tự vẽ được. Không gặp thì BỎ QUA chứ không đánh trượt —
  // một test thất bại ngẫu nhiên còn tệ hơn không có test.
  const STROKES_FOR = {
    circle: () => {
      const pts = [];
      for (let i = 0; i <= 24; i++) {
        const a = (i / 24) * Math.PI * 2 - Math.PI / 2;
        pts.push([Math.round(150 + 90 * Math.cos(a)), Math.round(150 + 90 * Math.sin(a))]);
      }
      return [pts];
    },
    square: () => [[[30, 30], [270, 30], [270, 270], [30, 270], [30, 30]]],
    triangle: () => [[[150, 20], [280, 280], [20, 280], [150, 20]]],
    star: () => {
      const pts = [];
      for (let i = 0; i <= 10; i++) {
        const a = (i / 5) * Math.PI - Math.PI / 2;
        const r = i % 2 === 0 ? 110 : 45;
        pts.push([Math.round(150 + r * Math.cos(a)), Math.round(150 + r * Math.sin(a))]);
      }
      return [pts];
    },
    lightning: () => [[[160, 20], [70, 150], [140, 150], [40, 280], [200, 120], [120, 120], [160, 20]]],
    rainbow: () => {
      const arcs = [];
      for (let k = 0; k < 3; k++) {
        const r = 120 - k * 30;
        const pts = [];
        for (let i = 0; i <= 16; i++) {
          const a = Math.PI + (i / 16) * Math.PI;
          pts.push([Math.round(150 + r * Math.cos(a)), Math.round(250 + r * Math.sin(a))]);
        }
        arcs.push(pts);
      }
      return arcs;
    },
    mountain: () => [
      [[10, 260], [95, 110], [175, 260]],
      [[150, 260], [225, 130], [290, 260]],
    ],
    tent: () => [
      [[150, 40], [270, 260], [30, 260], [150, 40]],
      [[150, 40], [150, 260]],
    ],
    sun: () => {
      const strokes = [[]];
      for (let i = 0; i <= 20; i++) {
        const a = (i / 20) * Math.PI * 2;
        strokes[0].push([Math.round(150 + 55 * Math.cos(a)), Math.round(150 + 55 * Math.sin(a))]);
      }
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        strokes.push([
          [Math.round(150 + 80 * Math.cos(a)), Math.round(150 + 80 * Math.sin(a))],
          [Math.round(150 + 125 * Math.cos(a)), Math.round(150 + 125 * Math.sin(a))],
        ]);
      }
      return strokes;
    },
  };

  /** Mở một lượt vẽ rồi VẼ ĐÚNG từ khoá của nó. Trả null nếu lượt này chưa dùng được. */
  async function openDrawableRound() {
    const c = await call('/api/admin/rounds', { method: 'POST', body: { game: 'draw' }, token: TOKEN });
    const rid = c.data.roundId;
    const jr = await call('/api/rounds/join', { method: 'POST', body: { name: 'An', roundId: rid } });
    const sr = await call(`/api/rounds/${rid}/start`, { method: 'POST', body: {}, token: TOKEN });
    const target = sr.data?.state?.target;
    const make = STROKES_FOR[target?.id];
    if (!make) return null;

    const pid = jr.data.playerId;
    const strokes = make();
    const res = await call(`/api/rounds/${rid}/frame`, {
      method: 'POST',
      body: { playerId: pid, seq: 1, strokes, canvasW: 300, canvasH: 300 },
    });
    // Chỉ dùng lượt mà model ĐỌC RA đúng từ khoá — có vậy đường thắng mới chắc.
    if (res.data?.hint !== true) return null;
    return { rid, pid, target, strokes, frame: res };
  }

  /** Thử tối đa 60 lượt; bỏ qua chứ không đánh trượt nếu không gặp lượt dùng được. */
  async function findDrawableRound() {
    for (let attempt = 0; attempt < 60; attempt++) {
      const found = await openDrawableRound();
      if (found) return found;
    }
    return null;
  }

  // ── đường 1: NỘP TAY — vẽ đúng từ khoá rồi bấm nút ──
  const won = await findDrawableRound();

  if (!won) {
    console.log('  ⏭  Bỏ qua đường thắng: 60 lượt liên tiếp không gặp từ khoá vẽ được');
  } else {
    check(
      `Vẽ đúng từ khoá "${won.target.labelVi}" → frame báo GỢI Ý nhận ra`,
      won.frame.status === 200 && won.frame.data?.hint === true,
      `HTTP ${won.frame.status} hint=${won.frame.data?.hint} top=${JSON.stringify(won.frame.data?.top)}`,
    );

    const beforeSubmit = (await call(`/api/rounds/${won.rid}/dashboard`)).data?.rows?.[0]?.score;
    check(
      'Gợi ý đúng nhưng CHƯA nộp → bảng hạng vẫn 0 điểm',
      beforeSubmit === 0,
      `score=${beforeSubmit}`,
    );

    const sub = await call(`/api/rounds/${won.rid}/submit`, {
      method: 'POST',
      body: { playerId: won.pid, strokes: won.strokes },
    });
    check(
      'NỘP bài → matched=true và có điểm',
      sub.status === 200 && sub.data?.matched === true && sub.data?.score > 0,
      `HTTP ${sub.status} matched=${sub.data?.matched} score=${sub.data?.score}`,
    );
    check(
      'Điểm do server tính (150 − số giây), nộp tay → reason=button',
      sub.data?.score > 0 && sub.data?.score <= 150 && sub.data?.reason === 'button',
      `score=${sub.data?.score} seconds=${sub.data?.seconds} reason=${sub.data?.reason}`,
    );

    const again = await call(`/api/rounds/${won.rid}/submit`, {
      method: 'POST',
      body: { playerId: won.pid, strokes: won.strokes },
    });
    check(
      'Nộp lần hai → trả lại kết quả cũ, KHÔNG chấm lại',
      again.status === 200 && again.data?.already === true && again.data?.score === sub.data?.score,
      `HTTP ${again.status} already=${again.data?.already} score=${again.data?.score}`,
    );

    const afterSubmit = (await call(`/api/rounds/${won.rid}/dashboard`)).data?.rows?.[0]?.score;
    check(
      'Bảng hạng thấy đúng điểm vừa nộp',
      afterSubmit === sub.data?.score,
      `${beforeSubmit} → ${afterSubmit}`,
    );
  }

  // ── đường 2: TỰ NỘP — không ai bấm nút, hết giờ server phải tự chấm ──
  const timeoutCase = await findDrawableRound();

  if (!timeoutCase) {
    console.log('  ⏭  Bỏ qua kiểm tự nộp: 60 lượt liên tiếp không gặp từ khoá vẽ được');
  } else {
    // KHÔNG gọi /submit lần nào, và cũng KHÔNG đóng lượt bằng admin: bỏ qua lượt
    // là HUỶ lượt (xem `skipRound`), còn ở đây phải là một lượt chơi thật hết giờ.
    //
    // ⏱ Đây là chỗ chậm nhất của bộ test: phải đợi trọn 15 giây của lượt rồi thêm
    // quãng ân hạn ~2.5s nữa server mới tự chấm. Không rút ngắn được — chính cái
    // đồng hồ đó là thứ đang được kiểm. Poll để xong ngay khi có kết quả.
    console.log('  ⏳  đợi hết 15 giây của lượt + quãng ân hạn (đường tự nộp)…');
    const waitStart = Date.now();
    const deadline = waitStart + 22_000;
    let row = null;
    while (Date.now() < deadline) {
      await sleep(500);
      row = (await call(`/api/rounds/${timeoutCase.rid}/dashboard`)).data?.rows?.[0];
      if (typeof row?.msToFinish === 'number') break;
    }

    check(
      'Không ai gọi /submit → server vẫn TỰ CHẤM bài từ nét cuối',
      typeof row?.score === 'number' && row.score > 0,
      `score=${row?.score} solved=${row?.solved} (sau ${((Date.now() - waitStart) / 1000).toFixed(1)}s)`,
    );
    check(
      'Người chơi được ghi nhận đã xong lượt',
      typeof row?.msToFinish === 'number',
      `msToFinish=${row?.msToFinish}`,
    );
  }

  // Đóng lượt bằng admin rồi thử frame muộn — tất định và nhanh hơn nhiều so với
  // ngồi chờ hết 15 giây. (Nếu để đồng hồ tự chạy, lượt có thể vẫn đang mở và
  // frame sẽ được chấp nhận, làm test này lúc đỏ lúc xanh.)
  await call(`/api/admin/rounds/${dId}/skip`, { method: 'POST', body: {}, token: TOKEN });

  const before = (await call(`/api/rounds/${dId}/dashboard`)).data?.rows?.[0]?.score;
  const late = await frame({ playerId: dPid, seq: 99, strokes: [[[20, 20], [200, 200]]] });
  const after = (await call(`/api/rounds/${dId}/dashboard`)).data?.rows?.[0]?.score;
  check(
    'Lượt đã đóng → frame bị từ chối (409)',
    late.status === 409,
    `HTTP ${late.status} ${late.data?.error}`,
  );
  check('Điểm không đổi sau frame bị từ chối', before === after, `${before} → ${after}`);

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
