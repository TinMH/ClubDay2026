/**
 * Dựng báo cáo HTML từ số liệu thô của `npm run loadtest`.
 *
 *   npm run loadtest            # sinh data/load-test-report.json
 *   npm run report:loadtest     # đọc JSON đó -> data/load-test-report.html
 *
 * Tách hẳn khỏi load-test.mjs: đo và trình bày là hai việc khác nhau. Sửa cách
 * trình bày thì không phải chạy lại bài đo 2 phút, và ngược lại số liệu cũ vẫn
 * dựng lại được sau khi đổi layout.
 *
 * Trang tự chứa — không CDN, không font ngoài — vì nó phải mở được trên máy BTC
 * lúc không có internet, đúng tinh thần phần còn lại của dự án.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const IN = process.argv[2] ?? 'data/load-test-report.json';
const OUT = process.argv[3] ?? 'data/load-test-report.html';

if (!existsSync(IN)) {
  console.error(`❌ Chưa có ${IN}. Chạy \`npm run loadtest\` trước.`);
  process.exit(1);
}

const r = JSON.parse(readFileSync(IN, 'utf8'));
const rows = r.rows ?? [];
const cfg = r.config ?? {};
const THRESHOLD = cfg.frameIntervalMs ?? 1050;

const esc = (v) =>
  String(v).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );

const fmtDate = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? String(iso) : d.toLocaleString('vi-VN');
};

/**
 * Trục X dùng vị trí ĐỀU theo thứ tự, không theo giá trị số người.
 *
 * Các mức đo là 1, 5, 80, 160, 320… — vẽ theo thang tuyến tính thì 1 và 5 chồng
 * lên nhau ở sát gốc và không đọc được gì. Thang đều theo hạng giữ mọi mức nhìn
 * rõ như nhau; nhãn trục vẫn ghi số người thật nên không ai đọc nhầm khoảng cách.
 */
const W = 680;
const H = 260;
const PAD = { t: 18, r: 18, b: 42, l: 54 };
const plotW = W - PAD.l - PAD.r;
const plotH = H - PAD.t - PAD.b;

const xAt = (i, n) => PAD.l + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);

/**
 * Chọn mốc trục Y "tròn" để nhãn đọc được, thay vì chia đều giá trị max.
 *
 * ⚠️ Mốc cuối PHẢI >= max. Bản đầu dừng ở mốc tròn cuối cùng còn nhỏ hơn max
 * (882ms với bước 250 → dừng ở 750), nên đỉnh biểu đồ bị đẩy lên toạ độ âm và
 * đường ngưỡng 1050ms biến mất khỏi khung. Làm tròn LÊN mới đúng.
 */
function niceTicks(max, count = 4) {
  if (max <= 0) return [0];
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? mag * 10;
  const topTick = Math.ceil(max / step) * step;
  const out = [];
  for (let v = 0; v <= topTick + step * 0.001; v += step) out.push(Math.round(v * 100) / 100);
  return out;
}

/**
 * Một biểu đồ đường, MỘT chuỗi số liệu.
 *
 * Cố ý không gộp độ trễ và throughput vào cùng một khung: hai đại lượng khác
 * đơn vị mà chung một trục Y thì tỉ lệ giữa chúng là tuỳ tiện, và người đọc sẽ
 * thấy một mối tương quan không có thật. Hai khung riêng, mỗi khung một trục.
 */
function lineChart({ values, labels, unit, threshold, thresholdLabel }) {
  const maxV = Math.max(...values, threshold ?? 0);
  const ticks = niceTicks(maxV);
  const top = ticks.at(-1) || 1;
  const yAt = (v) => PAD.t + plotH - (v / top) * plotH;

  const pts = values.map((v, i) => [xAt(i, values.length), yAt(v)]);
  const path = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');

  const grid = ticks
    .map(
      (t) =>
        `<line class="grid" x1="${PAD.l}" y1="${yAt(t).toFixed(1)}" x2="${W - PAD.r}" y2="${yAt(t).toFixed(1)}"/>` +
        `<text class="tick" x="${PAD.l - 8}" y="${(yAt(t) + 4).toFixed(1)}" text-anchor="end">${t}</text>`,
    )
    .join('');

  const xlabels = labels
    .map(
      (l, i) =>
        `<text class="tick" x="${xAt(i, labels.length).toFixed(1)}" y="${H - PAD.b + 18}" text-anchor="middle">${esc(l)}</text>`,
    )
    .join('');

  // Ngưỡng = nhịp gửi frame. Vượt nó nghĩa là gợi ý tới sau frame kế tiếp.
  const thr =
    threshold != null && threshold <= top
      ? `<line class="threshold" x1="${PAD.l}" y1="${yAt(threshold).toFixed(1)}" x2="${W - PAD.r}" y2="${yAt(threshold).toFixed(1)}"/>` +
        `<text class="thr-label" x="${W - PAD.r}" y="${(yAt(threshold) - 7).toFixed(1)}" text-anchor="end">${esc(thresholdLabel)}</text>`
      : '';

  // Nhãn trực tiếp ở điểm đầu và điểm cuối — không dán số lên mọi điểm.
  const ends = [0, values.length - 1]
    .filter((i, k, a) => values.length > 1 && a.indexOf(i) === k)
    .map((i) => {
      const [x, y] = pts[i];
      const anchor = i === 0 ? 'start' : 'end';
      return `<text class="point-label" x="${x.toFixed(1)}" y="${(y - 12).toFixed(1)}" text-anchor="${anchor}">${values[i]}${esc(unit)}</text>`;
    })
    .join('');

  const dots = pts
    .map(
      ([x, y], i) =>
        `<circle class="dot" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4.5"><title>${esc(labels[i])} — ${values[i]}${esc(unit)}</title></circle>`,
    )
    .join('');

  return `<svg viewBox="0 0 ${W} ${H}" role="img" preserveAspectRatio="xMidYMid meet">
    ${grid}
    <line class="axis" x1="${PAD.l}" y1="${PAD.t}" x2="${PAD.l}" y2="${PAD.t + plotH}"/>
    <line class="axis" x1="${PAD.l}" y1="${PAD.t + plotH}" x2="${W - PAD.r}" y2="${PAD.t + plotH}"/>
    ${thr}
    <path class="series" d="${path}"/>
    ${dots}${ends}${xlabels}
  </svg>`;
}

const labels = rows.map((x) => String(x.players));
const p95 = rows.map((x) => x.p95);
const fps = rows.map((x) => Number(x.fps));

const v = r.verdict ?? {};
const ok = v.eventOk === true;

const tableRows = rows
  .map((x) => {
    const errs = Object.entries(x.errors ?? {});
    const isEvent = x.players === (cfg.maxPlayers ?? 5) && x.label.includes('thật');
    const over = x.p95 >= THRESHOLD;
    return `<tr${isEvent ? ' class="is-event"' : ''}>
      <td>${esc(x.label)}</td>
      <td class="num">${x.n}</td>
      <td class="num">${x.p50}ms</td>
      <td class="num${over ? ' over' : ''}">${x.p95}ms</td>
      <td class="num">${x.p99}ms</td>
      <td class="num">${x.max}ms</td>
      <td class="num">${esc(x.fps)}</td>
      <td>${errs.length ? errs.map(([k, n]) => `${esc(k)}×${n}`).join(', ') : '<span class="muted">không</span>'}</td>
    </tr>`;
  })
  .join('');

const html = `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Load test ClubDay</title>
<style>
  :root {
    color-scheme: light;
    --surface: #fcfcfb;
    --card: #ffffff;
    --border: #e4e3de;
    --text: #0b0b0b;
    --text-2: #52514e;
    --muted: #8a8880;
    --series: #2a78d6;
    --good: #0ca30c;
    --critical: #d03b3b;
    --grid: #eceae4;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      color-scheme: dark;
      --surface: #1a1a19;
      --card: #232322;
      --border: #38383550;
      --text: #ffffff;
      --text-2: #c3c2b7;
      --muted: #8e8d84;
      --series: #3987e5;
      --good: #0ca30c;
      --critical: #d03b3b;
      --grid: #33332f;
    }
  }
  :root[data-theme="dark"] {
    color-scheme: dark;
    --surface: #1a1a19; --card: #232322; --border: #38383550;
    --text: #ffffff; --text-2: #c3c2b7; --muted: #8e8d84;
    --series: #3987e5; --good: #0ca30c; --critical: #d03b3b; --grid: #33332f;
  }

  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--surface); color: var(--text);
    font: 15px/1.6 ui-sans-serif, system-ui, "Segoe UI", Roboto, sans-serif;
    padding: 40px 16px 64px;
  }
  .wrap { max-width: 860px; margin: 0 auto; }
  h1 { font-size: 1.6rem; margin: 0 0 4px; letter-spacing: -0.01em; }
  .sub { color: var(--text-2); margin: 0 0 28px; font-size: 0.92rem; }
  h2 { font-size: 1.05rem; margin: 34px 0 4px; }
  .note { color: var(--text-2); font-size: 0.88rem; margin: 0 0 14px; }

  .verdict {
    display: flex; gap: 14px; align-items: baseline; flex-wrap: wrap;
    border: 1px solid var(--border); border-left: 3px solid var(--${ok ? 'good' : 'critical'});
    background: var(--card); border-radius: 10px; padding: 20px 22px; margin-bottom: 8px;
  }
  .hero { font-size: 2.6rem; font-weight: 700; letter-spacing: -0.02em; line-height: 1; }
  .verdict-text strong { color: var(--${ok ? 'good' : 'critical'}); }
  .verdict-text { color: var(--text-2); font-size: 0.95rem; }

  .tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; margin: 12px 0 8px; }
  .tile { border: 1px solid var(--border); background: var(--card); border-radius: 10px; padding: 14px 16px; }
  .tile .k { color: var(--muted); font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.04em; }
  .tile .val { font-size: 1.4rem; font-weight: 650; margin-top: 3px; }

  figure { margin: 0 0 10px; border: 1px solid var(--border); background: var(--card); border-radius: 10px; padding: 14px 8px 6px; }
  figcaption { color: var(--muted); font-size: 0.8rem; text-align: center; padding: 2px 0 8px; }
  svg { width: 100%; height: auto; display: block; }
  .grid { stroke: var(--grid); stroke-width: 1; }
  .axis { stroke: var(--border); stroke-width: 1; }
  .tick { fill: var(--muted); font-size: 11px; }
  .series { fill: none; stroke: var(--series); stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }
  .dot { fill: var(--series); stroke: var(--card); stroke-width: 2; }
  .point-label { fill: var(--text-2); font-size: 11px; font-weight: 600; }
  .threshold { stroke: var(--critical); stroke-width: 1.5; opacity: 0.75; }
  .thr-label { fill: var(--critical); font-size: 11px; font-weight: 600; }

  table { width: 100%; border-collapse: collapse; font-size: 0.9rem; margin-top: 6px; }
  th, td { text-align: left; padding: 9px 10px; border-bottom: 1px solid var(--border); }
  th { color: var(--muted); font-weight: 600; font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.03em; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .over { color: var(--critical); font-weight: 650; }
  .is-event { background: color-mix(in srgb, var(--series) 8%, transparent); }
  .is-event td:first-child { font-weight: 650; }
  .muted { color: var(--muted); }
  footer { color: var(--muted); font-size: 0.82rem; margin-top: 30px; border-top: 1px solid var(--border); padding-top: 14px; }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.86em; }
  @media (max-width: 560px) { body { padding: 24px 12px 48px; } .hero { font-size: 2rem; } }
</style>
</head>
<body>
<div class="wrap">
  <h1>Load test — đường vẽ hình</h1>
  <p class="sub">${esc(fmtDate(r.generatedAt))} · ${esc(r.machine?.cpu ?? '')} · ${esc(r.machine?.threads ?? r.machine?.cores ?? '?')} luồng · Node ${esc(r.machine?.node ?? '')}</p>

  <div class="verdict">
    <span class="hero">${v.eventP95 ?? '—'}ms</span>
    <span class="verdict-text">
      p95 ở kịch bản sự kiện (${cfg.maxPlayers ?? 5} người vẽ đồng thời) —
      <strong>${ok ? 'ĐẠT' : 'KHÔNG ĐẠT'}</strong>.
      Ngưỡng là ${THRESHOLD}ms, tức nhịp client gửi frame.
    </span>
  </div>

  <div class="tiles">
    <div class="tile"><div class="k">Trần thông lượng</div><div class="val">${v.peakFps ?? '—'} frame/s</div></div>
    <div class="tile"><div class="k">Khoảng dư</div><div class="val">~${v.headroom ?? '—'}×</div></div>
    <div class="tile"><div class="k">Bắt đầu dồn hàng đợi</div><div class="val">${v.knee ? `${v.knee.players} người` : 'chưa chạm'}</div></div>
  </div>

  <h2>Độ trễ p95 theo số người vẽ đồng thời</h2>
  <p class="note">Vượt đường ${THRESHOLD}ms nghĩa là gợi ý "AI nghĩ: …" tới sau khi người chơi đã gửi frame kế tiếp.</p>
  <figure>
    ${lineChart({ values: p95, labels, unit: 'ms', threshold: THRESHOLD, thresholdLabel: `nhịp gửi ${THRESHOLD}ms` })}
    <figcaption>Trục ngang: số người vẽ đồng thời (khoảng cách đều theo mức đo, không theo tỉ lệ)</figcaption>
  </figure>

  <h2>Thông lượng thực tế</h2>
  <p class="note">Đường nằm ngang ở cuối là dấu hiệu bão hoà: thêm người không thêm được frame nào nữa, chỉ làm hàng đợi dài ra.</p>
  <figure>
    ${lineChart({ values: fps, labels, unit: '/s' })}
    <figcaption>Trục ngang: số người vẽ đồng thời · Trục dọc: frame nhận diện mỗi giây</figcaption>
  </figure>

  <h2>Số liệu đầy đủ</h2>
  <table>
    <thead><tr><th>Kịch bản</th><th class="num">n</th><th class="num">p50</th><th class="num">p95</th><th class="num">p99</th><th class="num">max</th><th class="num">frame/s</th><th>Lỗi</th></tr></thead>
    <tbody>${tableRows}</tbody>
  </table>

  <footer>
    Sinh bằng <code>npm run report:loadtest</code> từ <code>${esc(IN)}</code>.
    Mỗi "người" gửi frame mỗi ${THRESHOLD}ms suốt lượt ${(cfg.roundMs ?? 15000) / 1000} giây, đúng nhịp client thật.
  </footer>
</div>
</body>
</html>
`;

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, html);
console.log(`  📊 Báo cáo: ${OUT}`);
