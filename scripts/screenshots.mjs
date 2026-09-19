/**
 * Chụp ảnh màn hình cho README — TỰ ĐỘNG, không ai phải cầm điện thoại chụp tay.
 *
 *   npm run screenshots
 *
 * Script tự dựng một sự kiện nhỏ rồi chụp lại: bật server riêng ở cổng khác,
 * tạo lượt, cho vài người chơi giả vào, chơi thật (trả lời đúng/sai có chủ đích
 * để bảng hạng có số), rồi chụp bốn màn hình vào docs/screenshots/.
 *
 * Vì sao đáng viết thay vì chụp tay: giao diện còn đổi nhiều, mà ảnh chụp tay
 * thì lần sau lại phải mở máy chụp lại từ đầu — và không ai nhớ lần trước đã
 * chụp ở khổ nào, tên người chơi là gì. Chạy lại script là ra đúng bộ ảnh cũ.
 *
 * KHÔNG đụng vào server thật hay file snapshot thật: cổng riêng, snapshot riêng
 * trong thư mục tạm, và `NODE_ENV=test` để khỏi nạp model nhận diện.
 */
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright';

const PORT = 8799;
const BASE = `http://localhost:${PORT}`;
const TOKEN = 'screenshot-only-token';
const OUT = 'docs/screenshots';
/** Khổ điện thoại: app vốn làm cho điện thoại, chụp khổ máy tính là sai sự thật. */
const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 900 };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const api = async (path, init) => {
  const res = await fetch(BASE + path, init);
  if (!res.ok) throw new Error(`${path} → ${res.status} ${await res.text()}`);
  return res.json();
};
const adminPost = (path, body) =>
  api(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-admin-token': TOKEN },
    body: JSON.stringify(body ?? {}),
  });

/** Tính đáp án từ chính đề bài server gửi ra — để người chơi giả ăn điểm thật. */
function solve(prompt) {
  const [, a, op, b] = /^(\d+) ([+\-×÷]) (\d+)$/.exec(prompt) ?? [];
  const x = Number(a);
  const y = Number(b);
  if (op === '+') return x + y;
  if (op === '-') return x - y;
  if (op === '×') return x * y;
  if (op === '÷') return x / y;
  throw new Error(`Đề lạ: ${prompt}`);
}

/** Một người chơi giả trả lời `correct` câu đúng rồi sai một câu cho bảng hạng có chuỗi. */
async function playMath(roundId, playerId, correct) {
  for (let i = 0; i < correct; i++) {
    const s = await api(`/api/rounds/${roundId}/question?playerId=${playerId}`);
    if (!s.question) return;
    await api(`/api/rounds/${roundId}/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId, idx: s.index, value: solve(s.question.prompt) }),
    });
    await sleep(300); // server chặn nhanh hơn 250ms/câu
  }
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const snapshot = join(tmpdir(), `clubday-screenshots-${Date.now()}.json`);

  const server = spawn(process.execPath, ['apps/server/dist/index.js'], {
    env: {
      ...process.env,
      PORT: String(PORT),
      ADMIN_TOKEN: TOKEN,
      NODE_ENV: 'test', // bỏ qua nạp model nhận diện — ảnh này không cần tới nó
      SNAPSHOT_FILE: snapshot,
    },
    stdio: 'ignore',
  });

  const browser = await chromium.launch();
  try {
    for (let i = 0; ; i++) {
      try {
        await api('/api/health');
        break;
      } catch {
        if (i > 60) throw new Error('Server không lên');
        await sleep(250);
      }
    }

    // ── Dựng cảnh: một lượt Tính nhanh đang chờ, đã có hai người ──
    const { roundId } = await adminPost('/api/admin/rounds', { game: 'math' });
    const waiting = [];
    for (const name of ['Minh Anh', 'Quốc Bảo']) {
      waiting.push(await api('/api/rounds/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      }));
    }

    const phone = await browser.newContext({ viewport: PHONE, deviceScaleFactor: 2 });
    const page = await phone.newPage();

    // ── 1. Trang chủ ──
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.getByLabel('Tên của bạn').fill('Thu Hà');
    // Gõ vào ô tên làm trình duyệt CUỘN ô đó vào tầm nhìn, nên chụp thẳng là mất
    // nửa cái logo ở trên. Cuộn về đầu rồi chụp cả trang.
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}/home.png`, fullPage: true });

    // ── 2. Đang chơi ──
    await page.getByRole('button', { name: /vào chơi/i }).click();
    await page.waitForURL(/\/lobby\//);
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${OUT}/lobby.png`, fullPage: true });

    await adminPost(`/api/rounds/${roundId}/start`);
    await page.waitForURL(/\/play\//, { timeout: 10_000 });
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${OUT}/play.png` });

    // ── 3. Bảng hạng: cho hai người kia ăn điểm rồi đóng lượt ──
    await playMath(roundId, waiting[0].playerId, 7);
    await playMath(roundId, waiting[1].playerId, 4);
    // Người đang xem cũng trả lời vài câu bằng chuột, để ảnh có nét người thật.
    for (let i = 0; i < 3; i++) {
      const prompt = await page.locator('p.tabular-nums').first().textContent();
      const answer = String(solve((prompt ?? '').trim()));
      await page.getByRole('button', { name: new RegExp(`: ${answer}$`) }).click();
      await page.waitForTimeout(450);
    }
    await adminPost(`/api/admin/rounds/${roundId}/skip`);
    await page.waitForURL(/\/dashboard\//, { timeout: 10_000 });
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${OUT}/dashboard.png`, fullPage: true });

    // ── 4. Quản trị ──
    const desktop = await browser.newContext({ viewport: DESKTOP, deviceScaleFactor: 2 });
    const admin = await desktop.newPage();
    await admin.addInitScript((t) => localStorage.setItem('clubday.adminToken.v1', t), TOKEN);
    await adminPost('/api/admin/rounds', { game: 'math' }); // một lượt đang chờ cho đẹp
    await admin.goto(`${BASE}/admin`, { waitUntil: 'networkidle' });
    await admin.waitForTimeout(1_200);
    await admin.screenshot({ path: `${OUT}/admin.png`, fullPage: true });

    console.log(`\n  Đã chụp xong vào ${OUT}/ — home, lobby, play, dashboard, admin\n`);
  } finally {
    await browser.close();
    server.kill();
    rmSync(snapshot, { force: true });
  }
}

await main();
