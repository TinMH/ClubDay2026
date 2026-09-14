/**
 * Đo accuracy THẬT của model nhận diện hình vẽ, rồi SINH RA ALLOWLIST.
 *
 *   npm run eval:model                  # toàn bộ 345 class (chạy vài phút)
 *   npm run eval:model -- --classes=cat,dog,house --samples=5
 *
 * Vì sao phải chạy cái này thay vì tin README của model:
 *
 *   - Model chỉ đúng trên giấy tờ. Số cần biết là số đo trên ĐÚNG phân bố lúc
 *     chơi: nét vẽ tay thật, đi qua ĐÚNG rasterizer mà app dùng.
 *   - Accuracy trung bình là con số marketing. Thứ ship đi là hành vi TỪNG
 *     class — trung bình 76% vẫn có thể giấu một class 0%.
 *   - Nó là .ts chứ không phải .mjs (lệch so với plan) để import TRỰC TIẾP
 *     `raster.ts` và `classifier.ts` của app. Bản sao chép sẽ trôi lệch khỏi
 *     code thật, và khi đó mọi số đo ở đây thành vô nghĩa.
 *
 * Dữ liệu lấy bằng HTTP Range — không bao giờ tải cả file. `line.ndjson` có
 * 143.549 hình; tải trọn là ~110MB chỉ để đọc 20 hình.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { classify, loadModel } from '../apps/server/src/services/classifier.ts';
import { rasterize, toAscii } from '../apps/server/src/services/raster.ts';
import type { Stroke } from '../apps/server/src/services/raster.ts';

const MODEL_REPO = 'Xenova/quickdraw-mobilevit-small';
const DATA_BASE = 'https://storage.googleapis.com/quickdraw_dataset/full/raw';
const RANGE_BYTES = 400_000;

// `--out` cho phép chạy thử trên vài class mà KHÔNG ghi đè allowlist thật bằng
// một danh sách đo thiếu. Một lần chạy 6 class không được phép thay thế kết quả
// của 345 class.
const OUT_FILE =
  process.argv.find((a) => a.startsWith('--out='))?.slice('--out='.length) ??
  'apps/server/src/services/allowlist.generated.ts';
const CACHE_DIR = process.env.EVAL_CACHE_DIR ?? join(tmpdir(), 'clubday-quickdraw-cache');
const STATUS_FILE = join(CACHE_DIR, 'status.json');
const RESULTS_FILE = join(CACHE_DIR, 'results.json');

/** Ngưỡng top-1 để một class được phép làm từ khoá trong game. */
const DEFAULT_THRESHOLD = 0.65;

// ─────────────────────────── tham số dòng lệnh ───────────────────────────

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.slice(name.length + 3);
}

const SAMPLES = Number(arg('samples') ?? 20);
const CONCURRENCY = Number(arg('concurrency') ?? 12);
const THRESHOLD = Number(arg('threshold') ?? DEFAULT_THRESHOLD);
const ONLY = arg('classes')
  ?.split(',')
  .map((s) => s.trim())
  .filter(Boolean);

/** `--dump=cat,house` → in hình ra ký tự rồi thoát, không đo. */
const DUMP = process.argv.some((a) => a === '--dump' || a.startsWith('--dump='))
  ? (arg('dump')
      ?.split(',')
      .map((s) => s.trim())
      .filter(Boolean) ?? [])
  : null;

// ─────────────────────────── lấy dữ liệu ───────────────────────────

/** Dòng cuối luôn bị Range cắt cụt giữa chừng → bỏ đi, đừng parse. */
function parseJsonl(text: string): unknown[] {
  const lines = text.split('\n');
  const out: unknown[] = [];
  for (let i = 0; i < lines.length - 1; i++) {
    const line = lines[i]?.trim();
    if (!line) continue;
    try {
      out.push(JSON.parse(line));
    } catch {
      /* dòng hỏng thì bỏ, không đáng để chết cả lượt đo */
    }
  }
  return out;
}

/**
 * Một hình QuickDraw → nét vẽ.
 *
 * ⚠️ `drawing` lưu theo CỘT: `[xs[], ys[], ts[]]`, KHÔNG phải `[[x,y,t], ...]`.
 * Giải nén theo cách trực giác cho ra nét rác và **0% accuracy mà không có lỗi
 * và không có warning nào**.
 *
 * ⚠️⚠️ Toạ độ KHÔNG phải 0–255. Đo trên `line.ndjson` thật: toạ độ là số THỰC
 * trong không gian canvas gốc của lúc vẽ, trải từ **−1013 tới 2232** (ví dụ
 * 617.3299560546875). Đây là bản `full/raw` — bản `simplified` mới được chuẩn
 * hoá về 256×256.
 *
 * Hệ quả: TUYỆT ĐỐI không được hard-code kích thước canvas, và không được kiểm
 * tra toạ độ nằm trong 0–255. Chính việc rasterizer chuẩn hoá theo bounding box
 * là thứ khiến dữ liệu này dùng được — bỏ bước đó là accuracy về 0.
 */
function toStrokes(record: unknown): Stroke[] | null {
  if (!record || typeof record !== 'object') return null;
  const drawing = (record as { drawing?: unknown }).drawing;
  if (!Array.isArray(drawing)) return null;

  const strokes: Stroke[] = [];
  for (const s of drawing) {
    if (!Array.isArray(s) || s.length < 2) continue;
    const xs = s[0];
    const ys = s[1];
    if (!Array.isArray(xs) || !Array.isArray(ys)) return null;
    // xs và ys phải là hai mảng số CÙNG ĐỘ DÀI (mỗi phần tử là một điểm).
    if (xs.length === 0 || xs.length !== ys.length) return null;

    const stroke: Array<readonly [number, number]> = [];
    for (let i = 0; i < xs.length; i++) {
      const x = xs[i];
      const y = ys[i];
      if (typeof x !== 'number' || typeof y !== 'number') continue;
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      stroke.push([x, y]);
    }
    if (stroke.length > 0) strokes.push(stroke);
  }

  return strokes.length > 0 ? strokes : null;
}

async function fetchRecords(cls: string): Promise<unknown[]> {
  const cacheFile = join(CACHE_DIR, `${cls}.ndjson`);
  if (existsSync(cacheFile)) return parseJsonl(await readFile(cacheFile, 'utf8'));

  const url = `${DATA_BASE}/${encodeURIComponent(cls)}.ndjson`;
  const res = await fetch(url, { headers: { Range: `bytes=0-${RANGE_BYTES - 1}` } });
  if (!res.ok && res.status !== 206) throw new Error(`${cls}: HTTP ${res.status}`);

  const text = await res.text();
  await writeFile(cacheFile, text);
  return parseJsonl(text);
}

async function loadClassNames(): Promise<string[]> {
  const res = await fetch(`https://huggingface.co/${MODEL_REPO}/raw/main/config.json`);
  if (!res.ok) throw new Error(`Không lấy được config.json: HTTP ${res.status}`);
  const cfg = (await res.json()) as { id2label?: Record<string, string> };
  const map = cfg.id2label ?? {};
  // Khoá là chuỗi số; sắp theo SỐ để chỉ số khớp đúng thứ tự của model.
  return Object.keys(map)
    .sort((a, b) => Number(a) - Number(b))
    .map((k) => map[k] as string);
}

// ─────────────────────────── đo ───────────────────────────

interface ClassResult {
  cls: string;
  samples: number;
  top1: number;
  top3: number;
  failed: string | null;
}

interface Results {
  measuredAt: string;
  model: string;
  dtype: string;
  samplesPerClass: number;
  threshold: number;
  classes: Record<string, ClassResult>;
}

async function evalClass(cls: string): Promise<ClassResult> {
  const blank: ClassResult = { cls, samples: 0, top1: 0, top3: 0, failed: null };
  try {
    const records = await fetchRecords(cls);
    const strokesList: Stroke[][] = [];
    for (const rec of records) {
      if (strokesList.length >= SAMPLES) break;
      const strokes = toStrokes(rec);
      if (strokes) strokesList.push(strokes);
    }
    if (strokesList.length === 0) return { ...blank, failed: 'không có mẫu hợp lệ' };

    let top1 = 0;
    let top3 = 0;
    for (const strokes of strokesList) {
      const top = await classify(rasterize(strokes), 3);
      if (top[0]?.label === cls) top1++;
      if (top.some((p) => p.label === cls)) top3++;
    }

    return { cls, samples: strokesList.length, top1, top3, failed: null };
  } catch (err) {
    return { ...blank, failed: err instanceof Error ? err.message : String(err) };
  }
}

/** Chạy tối đa `limit` việc cùng lúc, giữ nguyên thứ tự kết quả. */
async function pool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;

  const worker = async (): Promise<void> => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i] as T);
    }
  };

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

// ─────────────────────────── soi bằng mắt ───────────────────────────

/**
 * In hình ĐÃ rasterize ra ký tự, kèm dự đoán của model.
 *
 * Bước này KHÔNG được bỏ qua. Mọi lần accuracy sụp về 0 đều vì hình đưa vào
 * model không giống thứ mình tưởng — âm bản, bôi đen, hoặc rỗng — và cả ba
 * trường hợp đó đều KHÔNG báo lỗi. Nhìn một mẫu mất 2 giây; đoán mò mất hàng giờ.
 */
async function dumpSamples(classes: string[], count: number): Promise<void> {
  await loadModel();

  for (const cls of classes) {
    let records: unknown[];
    try {
      records = await fetchRecords(cls);
    } catch (err) {
      console.log(`\n=== ${cls}: không lấy được dữ liệu — ${err instanceof Error ? err.message : err}`);
      continue;
    }

    let shown = 0;
    for (const rec of records) {
      if (shown >= count) break;
      const strokes = toStrokes(rec);
      if (!strokes) continue;

      const px = rasterize(strokes);
      const top = await classify(px, 3);
      const guess = top.map((p) => `${p.label} ${(p.score * 100).toFixed(0)}%`).join(' · ');

      console.log(`\n=== ${cls} — mẫu ${shown + 1} → model đoán: ${guess}`);
      console.log(toAscii(px));
      shown++;
    }
  }
}

// ─────────────────────────── sinh file ───────────────────────────

function assertNoFailure(results: Results): string | null {
  const failed = Object.values(results.classes).filter((c) => c.failed);
  if (failed.length === 0) return null;
  return `${failed.length} class đo lỗi (ví dụ: ${failed[0]?.cls} — ${failed[0]?.failed})`;
}

function renderAllowlistFile(results: Results): { text: string; allowlist: string[] } {
  const measured = Object.values(results.classes).filter((c) => c.failed === null && c.samples > 0);

  const allowlist = measured
    .filter((c) => c.top1 / c.samples >= results.threshold)
    .sort((a, b) => b.top1 / b.samples - a.top1 / a.samples)
    .map((c) => c.cls);

  const top1Map = Object.fromEntries(
    measured.map((c) => [c.cls, Number((c.top1 / c.samples).toFixed(4))]),
  );

  const text = `/**
 * SINH TỰ ĐỘNG — ĐỪNG SỬA TAY.
 *
 * Sinh bởi:  npm run eval:model
 * Đo lúc:    ${results.measuredAt}
 * Model:     ${results.model} @ ${results.dtype}
 * Mẫu:       ${results.samplesPerClass} hình THẬT mỗi class, lấy từ QuickDraw
 *            full/raw — đúng phân bố của lúc chơi (nét vẽ tay, không phải ảnh
 *            đã rasterize sẵn của Google).
 * Ngưỡng:    top-1 ≥ ${results.threshold}
 *
 * ALLOWLIST là SỐ ĐO, không phải danh sách chọn tay. Sửa nó mà không chạy lại
 * \`npm run eval:model\` nghĩa là đang đoán — và model thì không đoán theo bạn.
 *
 * Muốn thêm từ khoá cho game: chạy lại eval, đừng thêm tay.
 */

/** Ngày đo + tham số, để biết số liệu cũ tới mức nào. */
export const EVAL_META = {
  measuredAt: '${results.measuredAt}',
  model: '${results.model}',
  dtype: '${results.dtype}',
  samplesPerClass: ${results.samplesPerClass},
  threshold: ${results.threshold},
} as const;

/** Class mà model nhận đúng ≥ ${results.threshold} ở top-1. Chỉ những class này được làm từ khoá. */
export const ALLOWLIST: readonly string[] = ${JSON.stringify(allowlist, null, 2)};

/** Accuracy top-1 đo được của MỌI class đã đo — vết để soi lại, không dùng lúc chạy. */
export const MEASURED_TOP1: Readonly<Record<string, number>> = ${JSON.stringify(top1Map, null, 2)};
`;

  return { text, allowlist };
}

// ─────────────────────────── chạy ───────────────────────────

async function main(): Promise<void> {
  await mkdir(CACHE_DIR, { recursive: true });

  console.log(`Rasterizer + classifier: import trực tiếp từ apps/server/src/services`);
  console.log(`Cache dữ liệu: ${CACHE_DIR}`);
  console.log(`Mẫu mỗi class: ${SAMPLES} | song song: ${CONCURRENCY} | ngưỡng top-1: ${THRESHOLD}`);

  const allClasses = await loadClassNames();
  const classes = ONLY ? allClasses.filter((c) => ONLY.includes(c)) : allClasses;

  if (ONLY) {
    const missing = ONLY.filter((c) => !allClasses.includes(c));
    if (missing.length > 0) console.warn(`⚠️  Không có trong model: ${missing.join(', ')}`);
  }
  console.log(`Số class sẽ đo: ${classes.length}\n`);

  if (DUMP) {
    const targets = DUMP.length > 0 ? DUMP : [classes[0] as string];
    await dumpSamples(targets, 2);
    return;
  }

  // Nạp model TRƯỚC khi đo — nếu model không load được thì đừng tốn 5 phút tải dữ liệu.
  const tLoad = Date.now();
  await loadModel();
  console.log(`Model sẵn sàng sau ${Date.now() - tLoad}ms\n`);

  const results: Results = {
    measuredAt: new Date().toISOString().slice(0, 10),
    model: MODEL_REPO,
    dtype: 'fp32',
    samplesPerClass: SAMPLES,
    threshold: THRESHOLD,
    classes: {},
  };

  const t0 = Date.now();
  let done = 0;

  await pool(classes, CONCURRENCY, async (cls) => {
    const r = await evalClass(cls);
    results.classes[cls] = r;

    // ⚠️ Lấy số thứ tự NGAY, trước mọi `await`. Nếu đọc biến `done` sau khi
    // await writeFile thì mọi worker đều thấy `done === tổng số class` (vì các
    // worker khác đã kịp tăng nó trong lúc mình chờ ghi file) → in N dòng
    // "N/N class" giống hệt nhau thay vì một dòng tiến độ.
    const n = ++done;

    // Ghi kết quả NGAY sau mỗi class: timeout hay Ctrl-C cũng không mất công đo.
    await writeFile(RESULTS_FILE, JSON.stringify(results, null, 1));
    await writeFile(
      STATUS_FILE,
      JSON.stringify({ done: n, total: classes.length, updatedAt: new Date().toISOString() }),
    );

    if (n % 10 === 0 || n === classes.length) {
      console.log(`  ${n}/${classes.length} class ... ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    }
    return r;
  });

  // ── báo cáo ──
  const measured = Object.values(results.classes).filter((c) => c.failed === null && c.samples > 0);
  const { text, allowlist } = renderAllowlistFile(results);

  console.log(`\n${'─'.repeat(64)}`);
  console.log(`Đo xong ${measured.length} class trong ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  console.log(`${'─'.repeat(64)}`);

  // Bảng xếp hạng: class tốt nhất và class tệ nhất.
  const sorted = [...measured].sort((a, b) => b.top1 / b.samples - a.top1 / a.samples);
  const fmt = (c: ClassResult): string =>
    `${c.cls.padEnd(18)} top-1 ${(c.top1 / c.samples).toFixed(2)}  top-3 ${(c.top3 / c.samples).toFixed(2)}`;

  console.log('\nTỐT NHẤT (15):');
  for (const c of sorted.slice(0, 15)) console.log(`  ${fmt(c)}`);

  // Chỉ liệt kê những class TRƯỢT ngưỡng — với lượt đo ít class thì "15 class tệ
  // nhất" sẽ trùng với danh sách tốt nhất và chẳng nói lên điều gì.
  const below = sorted.filter((c) => c.top1 / c.samples < THRESHOLD);
  if (below.length > 0) {
    console.log(`\nDƯỚI NGƯỠNG ${THRESHOLD} — KHÔNG dùng làm từ khoá (${below.length} class):`);
    for (const c of below.slice(0, 15)) console.log(`  ${fmt(c)}`);
  }

  const meanTop1 = measured.reduce((s, c) => s + c.top1 / c.samples, 0) / (measured.length || 1);
  const meanTop3 = measured.reduce((s, c) => s + c.top3 / c.samples, 0) / (measured.length || 1);
  console.log(
    `\nTrung bình ${measured.length} class: top-1 ${(meanTop1 * 100).toFixed(1)}% · top-3 ${(meanTop3 * 100).toFixed(1)}%`,
  );
  console.log(`ALLOWLIST (top-1 ≥ ${THRESHOLD}): ${allowlist.length} class`);

  await writeFile(OUT_FILE, text);
  console.log(`\nĐã ghi ${OUT_FILE}`);

  const problem = assertNoFailure(results);
  if (problem) console.warn(`\n⚠️  ${problem}`);
}

await main();
