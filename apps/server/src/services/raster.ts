/**
 * Rasterizer: nét vẽ (toạ độ canvas bất kỳ) → ảnh 28×28 cho model nhận diện.
 *
 * ⚠️ MỌI HẰNG SỐ Ở ĐÂY ĐÃ ĐO THẬT — xem scripts/eval-model.mjs.
 * Đổi chúng là đổi accuracy, KHÔNG phải đổi "chất lượng hình":
 *
 *   boxFrac  lineWidth@28  top-1   top-3
 *   0.85     1.0           60.9%   84.4%
 *   0.85     1.5           70.3%   95.3%   ✅ ĐANG DÙNG
 *   1.00     1.5           57.8%   89.1%
 *   0.85     2.0           35.9%   70.3%
 *   1.00     2.5           18.8%   50.0%
 *
 * Nét dày 2.5px làm accuracy sụp còn 18.8%. Vẽ "cho đẹp" ở độ phân giải cao rồi
 * thu nhỏ tuỳ tiện là cách nhanh nhất để phá model — độ dày nét TẠI 28px mới là
 * thứ quyết định, không phải độ dày trên màn hình.
 *
 * Quy ước polarity: QuickDraw dùng 255 = NÉT trên nền 0. Đảo lại → ~0% accuracy.
 */
import { MODEL_INPUT_SIZE } from '../model.js';

export type Point = readonly [number, number];
export type Stroke = readonly Point[];

/** Hệ số phóng đại khi vẽ, trước khi thu nhỏ. */
const SS = 4;
/** Cạnh DÀI nhất của hình chiếm bao nhiêu phần khung. ĐÃ ĐO. */
const BOX_FRAC = 0.85;
/** Độ dày nét tại độ phân giải 28px. ĐÃ ĐO. */
const LINE_WIDTH = 1.5;

const SIZE = MODEL_INPUT_SIZE;
const SUP = SIZE * SS;

export interface RasterOptions {
  /**
   * Chỉ dùng khi HIỆU CHỈNH LẠI — scripts/eval-model.mjs quét giá trị này để dựng
   * bảng ở đầu file. Code chạy thật luôn dùng mặc định.
   */
  lineWidth?: number;
  boxFrac?: number;
}

/**
 * Đóng dấu một hình tròn đặc (đầu bút tròn) lên buffer.
 *
 * `buf` là 0 = giấy, 1 = mực. Ghi đè chứ không cộng dồn, nên chỗ nét chồng nhau
 * không bị đậm gấp đôi — bút mực đặc, không phải bút chì.
 */
function stampDisc(buf: Uint8Array, cx: number, cy: number, r: number): void {
  const x0 = Math.max(0, Math.floor(cx - r));
  const x1 = Math.min(SUP - 1, Math.ceil(cx + r));
  const y0 = Math.max(0, Math.floor(cy - r));
  const y1 = Math.min(SUP - 1, Math.ceil(cy + r));
  const r2 = r * r;

  for (let y = y0; y <= y1; y++) {
    const dy = y + 0.5 - cy;
    const row = y * SUP;
    for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - cx;
      if (dx * dx + dy * dy <= r2) buf[row + x] = 1;
    }
  }
}

/** Vẽ đoạn thẳng bằng các hình tròn chồng nhau dọc theo đoạn. */
function stampSegment(
  buf: Uint8Array,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  r: number,
): void {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy);

  // Bước ≤ r/2 để các hình tròn phủ kín đoạn, không hở "eo" ở giữa.
  const step = Math.max(1, r / 2);
  const n = Math.max(1, Math.ceil(len / step));

  for (let i = 0; i <= n; i++) {
    const t = i / n;
    stampDisc(buf, x0 + dx * t, y0 + dy * t, r);
  }
}

/**
 * Nét vẽ → mảng `SIZE*SIZE` byte, **255 = nét** (đúng quy ước QuickDraw).
 *
 * Quy trình — mọi bước đều load-bearing, bỏ bước nào cũng mất accuracy:
 *   1. vẽ ở 4× (112px) bằng bút tròn đường kính `lineWidth * 4`
 *   2. canh theo bounding box: cạnh dài nhất → `boxFrac * 112`, giữ tỉ lệ, căn giữa
 *   3. lọc hộp 4×4 → 28×28
 *   4. đảo ảnh → 255 = nét
 *
 * Toạ độ vào chuẩn hoá theo bounding box nên kích thước canvas không ảnh hưởng:
 * cùng một hình vẽ trên canvas 300×150 hay 800×400 đều cho cùng kết quả.
 */
export function rasterize(strokes: readonly Stroke[], opts: RasterOptions = {}): Uint8Array {
  const out = new Uint8Array(SIZE * SIZE);
  const boxFrac = opts.boxFrac ?? BOX_FRAC;

  // ── 1. bounding box ──
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let points = 0;

  for (const stroke of strokes) {
    for (const p of stroke) {
      const x = p[0];
      const y = p[1];
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      points++;
    }
  }

  // Canvas trống → ảnh đen thui. Người gọi phải tự chặn trước khi tốn 3ms inference.
  if (points === 0) return out;

  const boxW = maxX - minX;
  const boxH = maxY - minY;
  const longest = Math.max(boxW, boxH);
  const target = boxFrac * SUP;

  // Hình suy biến (1 điểm, hoặc nét thẳng đứng/ngang) → longest = 0 → giữ tỉ lệ 1:1.
  const scale = longest > 0 ? target / longest : 1;
  const offX = (SUP - boxW * scale) / 2 - minX * scale;
  const offY = (SUP - boxH * scale) / 2 - minY * scale;

  // ── 2. vẽ ở 112px ──
  const sup = new Uint8Array(SUP * SUP);
  const r = ((opts.lineWidth ?? LINE_WIDTH) * SS) / 2;

  for (const stroke of strokes) {
    let prevX = 0;
    let prevY = 0;
    let has = false;

    for (const p of stroke) {
      const x = p[0];
      const y = p[1];
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;

      const sx = x * scale + offX;
      const sy = y * scale + offY;

      if (has) stampSegment(sup, prevX, prevY, sx, sy, r);
      else stampDisc(sup, sx, sy, r); // điểm đầu — và cả nét chỉ có 1 điểm

      prevX = sx;
      prevY = sy;
      has = true;
    }
  }

  // ── 3+4. lọc hộp 4×4 rồi đảo: mực (1) → 255 ──
  //
  // Lưu ý khi debug: nét 1.5px KHÔNG cho ra 255. Bút tròn 6px ở hệ 4× phủ được
  // nhiều nhất 3/4 một ô lọc hộp → giá trị cao nhất là 191. Đó là làm mượt cạnh
  // chứ không phải lỗi, và mọi số accuracy đã đo đều đo trên chính cách vẽ này.
  const cell = SS * SS;
  for (let oy = 0; oy < SIZE; oy++) {
    for (let ox = 0; ox < SIZE; ox++) {
      let sum = 0;
      for (let sy = 0; sy < SS; sy++) {
        const row = (oy * SS + sy) * SUP + ox * SS;
        for (let sx = 0; sx < SS; sx++) sum += sup[row + sx] ?? 0;
      }
      out[oy * SIZE + ox] = Math.round((sum / cell) * 255);
    }
  }

  return out;
}

/**
 * Dump ảnh ra ký tự để soi bằng mắt.
 *
 * Dùng khi accuracy bỗng dưng về 0: in một mẫu thật ra rồi nhìn xem có phải
 * hình bị âm bản, bị bôi đen, hay rỗng. Nhanh hơn mọi cách debug khác.
 */
export function toAscii(px: Uint8Array, size = SIZE): string {
  const ramp = ' .:-=+*#%@';
  const lines: string[] = [];

  for (let y = 0; y < size; y++) {
    let line = '';
    for (let x = 0; x < size; x++) {
      const v = px[y * size + x] ?? 0;
      line += ramp[Math.min(ramp.length - 1, Math.floor((v / 256) * ramp.length))];
    }
    lines.push(line);
  }

  return lines.join('\n');
}
