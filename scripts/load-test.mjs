/**
 * Load test + stress test cho đường VẼ HÌNH — chỗ nghẽn duy nhất của hệ thống.
 *
 *   npm run loadtest
 *   npm run loadtest -- --levels 2,4,8 --repeat 2
 *
 * Tự khởi động server ở cổng riêng (8798) và snapshot riêng (data/load-test-snapshot.json),
 * chạy xong tự tắt. Không đụng tới server thật.
 *
 * ── VÌ SAO ĐO CÁI NÀY ──
 * Mỗi frame vẽ là một lần chạy model ONNX trên CPU. Client gửi frame mỗi ~1050ms
 * (`routes/DrawGame.tsx`), server chặn dưới 1000ms (`store/types.ts`). Nên 5 người
 * vẽ cùng lúc ≈ 5 lần chạy model mỗi giây. Đây là thứ duy nhất trong hệ thống có
 * thể không theo kịp — mọi đường khác chỉ là đọc/ghi Map trong RAM.
 *
 * ── ĐỌC KẾT QUẢ ──
 * Con số quan trọng nhất là **p95 của /frame**. Người chơi chỉ có 15 giây, và gợi ý
 * "AI nghĩ: …" phải kịp hiện trước khi họ vẽ xong. p95 vượt ~1000ms nghĩa là gợi ý
 * tới sau khi người chơi đã gửi frame tiếp theo — hàng đợi bắt đầu dồn.
 *
 * ⚠️ KHÔNG gửi frame nhanh hơn 1000ms/người: server trả 429 TOO_FAST và bài đo
 * thành đo tốc độ bị từ chối, không phải tốc độ nhận diện.
 *
 * Yêu cầu: đã chạy `npm run build`.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { dirname } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const PORT = Number(process.env.LOADTEST_PORT ?? 8798);
const TOKEN = 'loadtest-token';
const BASE = `http://127.0.0.1:${PORT}`;

/** Khớp client thật. Phải > MIN_FRAME_GAP_MS (1000) của server. */
const FRAME_INTERVAL_MS = 1_050;
/** Khớp DURATION_MS.draw. */
const ROUND_MS = 15_000;
const MAX_PLAYERS = 5;

// ── tham số dòng lệnh ──
const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
/** Mỗi "level" = số LƯỢT chạy song song. Mỗi lượt tối đa 5 người. */
const LEVELS = String(arg('levels', '2,4,8'))
  .split(',')
  .map((n) => Number(n.trim()))
  .filter((n) => Number.isInteger(n) && n > 0);
const REPEAT = Number(arg('repeat', '1'));
/** Kết quả thô để `npm run report:loadtest` dựng HTML. */
const JSON_OUT = arg('out', 'data/load-test-report.json');

if (!existsSync('apps/server/dist/index.js')) {
  console.error('❌ Chưa build. Chạy `npm run build` trước.');
  process.exit(1);
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

/**
 * Nét vẽ giống người thật: một vòng tròn dở dang, mỗi frame thêm một đoạn.
 *
 * Payload phải lớn dần theo thời gian — người vẽ càng lâu càng nhiều điểm, và
 * rasterize nhiều điểm thì tốn hơn. Gửi mãi một nét ngắn là đo nhẹ hơn thực tế.
 */
function strokesAt(step) {
  const pts = [];
  const n = 12 + step * 8; // frame đầu ~12 điểm, frame thứ 14 ~120 điểm
  for (let i = 0; i < n; i += 1) {
    const a = (i / n) * Math.PI * 1.8;
    pts.push([Math.round(150 + 60 * Math.cos(a)), Math.round(150 + 60 * Math.sin(a))]);
  }
  const strokes = [pts];
  if (step > 4) strokes.push([[110, 130], [120, 135], [130, 130]]);
  if (step > 8) strokes.push([[170, 130], [180, 135], [190, 130]]);
  return strokes;
}

// ── thống kê ──
function pct(sorted, p) {
  if (sorted.length === 0) return 0;
  const i = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[i];
}

function summarise(label, samples, errors, wallMs) {
  const sorted = [...samples].sort((a, b) => a - b);
  const total = samples.length + Object.values(errors).reduce((a, b) => a + b, 0);
  return {
    label,
    n: samples.length,
    p50: Math.round(pct(sorted, 50)),
    p95: Math.round(pct(sorted, 95)),
    p99: Math.round(pct(sorted, 99)),
    max: Math.round(sorted.at(-1) ?? 0),
    fps: total > 0 ? (total / (wallMs / 1000)).toFixed(1) : '0.0',
    errors,
  };
}

/** Một người chơi: gửi frame đúng nhịp cho tới khi hết giờ, rồi nộp bài. */
async function playerLoop(roundId, playerId, deadline, out) {
  // Lệch ngẫu nhiên như người thật — 5 người không bao giờ bấm cùng một mili giây.
  await sleep(Math.random() * 200);

  let seq = 1;
  while (Date.now() < deadline) {
    const t0 = performance.now();
    const res = await call(`/api/rounds/${roundId}/frame`, {
      method: 'POST',
      body: { playerId, seq, canvasW: 300, canvasH: 300, strokes: strokesAt(seq) },
    });
    const dt = performance.now() - t0;

    if (res.status === 200) {
      out.samples.push(dt);
      seq += 1;
    } else {
      const code = res.data?.error ?? `HTTP_${res.status}`;
      out.errors[code] = (out.errors[code] ?? 0) + 1;
      if (code === 'NOT_PLAYING' || code === 'TIME_UP') break;
      seq += 1; // seq phải tăng dù frame bị từ chối, không thì dính SEQUENCE
    }

    const wait = FRAME_INTERVAL_MS - (performance.now() - t0);
    if (wait > 0) await sleep(wait);
  }

  const t0 = performance.now();
  const sub = await call(`/api/rounds/${roundId}/submit`, {
    method: 'POST',
    body: { playerId },
  });
  if (sub.status === 200) out.submitMs.push(performance.now() - t0);
  else out.errors[`submit:${sub.data?.error ?? sub.status}`] = 1;
}

/** Dựng `rounds` lượt song song, mỗi lượt `perRound` người, chạy trọn 15 giây. */
async function runWave(rounds, perRound) {
  const out = { samples: [], submitMs: [], errors: {} };

  const setups = await Promise.all(
    Array.from({ length: rounds }, async () => {
      const c = await call('/api/admin/rounds', {
        method: 'POST',
        body: { game: 'draw' },
        token: TOKEN,
      });
      const roundId = c.data?.roundId;
      if (!roundId) throw new Error(`Không tạo được lượt: ${JSON.stringify(c.data)}`);

      const players = [];
      for (let i = 0; i < perRound; i += 1) {
        const j = await call('/api/rounds/join', {
          method: 'POST',
          body: { name: `LT${i}`, roundId },
        });
        if (j.data?.playerId) players.push(j.data.playerId);
      }
      return { roundId, players };
    }),
  );

  const wall0 = performance.now();
  // Bắt đầu tất cả các lượt gần như cùng lúc → dồn tải vào đúng một khoảnh khắc.
  await Promise.all(
    setups.map((s) =>
      call(`/api/rounds/${s.roundId}/start`, { method: 'POST', body: {}, token: TOKEN }),
    ),
  );

  const deadline = Date.now() + ROUND_MS - 1_200; // chừa chỗ cho lần nộp cuối
  await Promise.all(
    setups.flatMap((s) => s.players.map((p) => playerLoop(s.roundId, p, deadline, out))),
  );

  const wallMs = performance.now() - wall0;
  await sleep(500); // để hook tự-nộp của lượt chạy xong trước đợt sau
  return { out, wallMs, playerCount: setups.reduce((a, s) => a + s.players.length, 0) };
}

// ── khởi động server ──
const server = spawn(process.execPath, ['apps/server/dist/index.js'], {
  env: {
    ...process.env,
    PORT: String(PORT),
    HOST: '127.0.0.1',
    ADMIN_TOKEN: TOKEN,
    SNAPSHOT_FILE: 'data/load-test-snapshot.json',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverLog = '';
server.stdout.on('data', (d) => (serverLog += d));
server.stderr.on('data', (d) => (serverLog += d));

const rows = [];

try {
  // Chờ server VÀ model sẵn sàng — đo lúc model còn đang nạp là đo nhầm.
  let ready = false;
  for (let i = 0; i < 120; i += 1) {
    try {
      const h = await call('/api/health');
      if (h.data?.ok && h.data?.model === 'ready') {
        ready = true;
        break;
      }
    } catch {
      /* chưa lên */
    }
    await sleep(250);
  }
  if (!ready) throw new Error(`Server/model không sẵn sàng.\n${serverLog}`);

  console.log(`\n  Cổng ${PORT} · nhịp gửi ${FRAME_INTERVAL_MS}ms/người · lượt ${ROUND_MS / 1000}s`);
  console.log(`  Mỗi lượt tối đa ${MAX_PLAYERS} người. Mỗi frame = 1 lần chạy model.\n`);

  // ── 1. Nền: một người, không ai tranh CPU ──
  console.log('── 1. Nền (1 người) ──');
  for (let r = 0; r < REPEAT; r += 1) {
    const { out, wallMs } = await runWave(1, 1);
    rows.push({ ...summarise('1 người (nền)', out.samples, out.errors, wallMs), players: 1 });
    process.stdout.write(`  lượt ${r + 1}/${REPEAT} xong\n`);
  }

  // ── 2. Kịch bản thật: đúng 5 người một lượt ──
  console.log('\n── 2. Kịch bản sự kiện (5 người, 1 lượt) ──');
  for (let r = 0; r < REPEAT; r += 1) {
    const { out, wallMs } = await runWave(1, MAX_PLAYERS);
    rows.push({
      ...summarise('5 người (thật)', out.samples, out.errors, wallMs),
      players: MAX_PLAYERS,
    });
    process.stdout.write(`  lượt ${r + 1}/${REPEAT} xong\n`);
  }

  // ── 3. Stress: nhiều lượt song song cho tới khi gãy ──
  console.log('\n── 3. Stress (nhiều lượt song song) ──');
  for (const lv of LEVELS) {
    const { out, wallMs, playerCount } = await runWave(lv, MAX_PLAYERS);
    const s = summarise(`${lv} lượt = ${playerCount} người`, out.samples, out.errors, wallMs);
    rows.push({ ...s, players: playerCount });
    console.log(`  ${lv} lượt (${playerCount} người) → p95 ${s.p95}ms`);
  }
} catch (err) {
  console.error(`\n❌ ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
} finally {
  server.kill();
}

// ── báo cáo ──
const line = '─'.repeat(78);
console.log(`\n${line}`);
console.log(
  '  ' +
    'Kịch bản'.padEnd(22) +
    'n'.padStart(5) +
    'p50'.padStart(8) +
    'p95'.padStart(8) +
    'p99'.padStart(8) +
    'max'.padStart(8) +
    'frame/s'.padStart(9),
);
console.log(line);
for (const r of rows) {
  console.log(
    '  ' +
      r.label.padEnd(22) +
      String(r.n).padStart(5) +
      `${r.p50}ms`.padStart(8) +
      `${r.p95}ms`.padStart(8) +
      `${r.p99}ms`.padStart(8) +
      `${r.max}ms`.padStart(8) +
      String(r.fps).padStart(9),
  );
  const errs = Object.entries(r.errors);
  if (errs.length) {
    console.log(`      ⚠️  ${errs.map(([k, v]) => `${k}×${v}`).join('  ')}`);
  }
}
console.log(line);

// ── xuất JSON để dựng report ──
// Ghi RA FILE thay vì chỉ in ra màn hình: số đo này dùng để so giữa các lần chạy
// (đổi máy, đổi model, sửa đường vẽ), mà scroll ngược terminal thì không so được.
const real0 = rows.find((r) => r.label === '5 người (thật)');
const knee0 = rows.find((r) => r.players > MAX_PLAYERS && r.p95 >= FRAME_INTERVAL_MS);
const peak = rows.reduce((a, r) => (Number(r.fps) > Number(a?.fps ?? -1) ? r : a), null);

const report = {
  generatedAt: new Date().toISOString(),
  machine: {
    cpu: cpus()[0]?.model?.trim() ?? 'không rõ',
    threads: cpus().length,
    node: process.version,
  },
  config: {
    frameIntervalMs: FRAME_INTERVAL_MS,
    roundMs: ROUND_MS,
    maxPlayers: MAX_PLAYERS,
    levels: LEVELS,
    repeat: REPEAT,
  },
  rows,
  verdict: {
    eventOk: real0 ? real0.p95 < FRAME_INTERVAL_MS && Object.keys(real0.errors).length === 0 : null,
    eventP95: real0?.p95 ?? null,
    /** Mức đầu tiên p95 vượt nhịp gửi — từ đây hàng đợi bắt đầu dồn. */
    knee: knee0 ? { label: knee0.label, players: knee0.players, p95: knee0.p95 } : null,
    peakFps: peak ? Number(peak.fps) : null,
    /** Hệ thống chịu được gấp bao nhiêu lần nhu cầu thật (5 người). */
    headroom: peak ? Math.round(Number(peak.fps) / (MAX_PLAYERS / (FRAME_INTERVAL_MS / 1000))) : null,
  },
};

mkdirSync(dirname(JSON_OUT), { recursive: true });
writeFileSync(JSON_OUT, JSON.stringify(report, null, 2));
console.log(`  📄 Số liệu thô: ${JSON_OUT}`);
console.log('     Dựng báo cáo HTML:  npm run report:loadtest');

// ── kết luận ──
const real = rows.find((r) => r.label === '5 người (thật)');
if (real) {
  const ok = real.p95 < 1_000 && Object.keys(real.errors).length === 0;
  console.log(
    ok
      ? `\n  ✅ Kịch bản sự kiện ĐẠT — p95 ${real.p95}ms, còn dư trước mốc ${FRAME_INTERVAL_MS}ms.`
      : `\n  ❌ Kịch bản sự kiện KHÔNG đạt — p95 ${real.p95}ms. Gợi ý sẽ tới trễ hơn nhịp gửi.`,
  );
  if (!ok) process.exitCode = 1;
}

const broke = rows.find((r) => r.players > MAX_PLAYERS && r.p95 >= FRAME_INTERVAL_MS);
console.log(
  broke
    ? `  📈 Trần chịu tải: bắt đầu dồn hàng đợi ở ${broke.label} (p95 ${broke.p95}ms).\n`
    : `  📈 Chưa chạm trần ở mức cao nhất đã thử (${LEVELS.at(-1)} lượt).\n`,
);
