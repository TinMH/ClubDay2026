import { describe, expect, it } from 'vitest';
import { rasterize, toAscii, type Stroke } from './raster.js';

const SIZE = 28;

function at(px: Uint8Array, x: number, y: number): number {
  return px[y * SIZE + x] ?? 0;
}

/** Số pixel có mực (bất kể đậm nhạt). */
function inkCount(px: Uint8Array): number {
  let n = 0;
  for (const v of px) if (v > 0) n++;
  return n;
}

/** Tổng lượng mực — đại lượng tăng theo độ dày nét. */
function inkMass(px: Uint8Array): number {
  let sum = 0;
  for (const v of px) sum += v;
  return sum;
}

/** Chỉ số các hàng / cột có mực. */
function inkRows(px: Uint8Array): number[] {
  const out: number[] = [];
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      if (at(px, x, y) > 0) {
        out.push(y);
        break;
      }
    }
  }
  return out;
}

function inkCols(px: Uint8Array): number[] {
  const out: number[] = [];
  for (let x = 0; x < SIZE; x++) {
    for (let y = 0; y < SIZE; y++) {
      if (at(px, x, y) > 0) {
        out.push(x);
        break;
      }
    }
  }
  return out;
}

/** Lật hình qua trục tung. */
function mirrorX(strokes: readonly Stroke[]): Stroke[] {
  return strokes.map((s) => s.map(([x, y]) => [-x, y] as const));
}

describe('rasterize', () => {
  it('không có nét nào → ảnh đen thui, không được crash', () => {
    const px = rasterize([]);
    expect(px.length).toBe(SIZE * SIZE);
    expect(inkCount(px)).toBe(0);
  });

  it('nét toàn toạ độ rác → cũng là ảnh rỗng', () => {
    const px = rasterize([[[Number.NaN, Number.NaN]], [[Infinity, -Infinity]]]);
    expect(inkCount(px)).toBe(0);
  });

  it('nét ngang → mực ở dải giữa, trải gần hết bề ngang', () => {
    const px = rasterize([[[0, 50], [100, 50]]]);

    // Canh giữa theo trục dọc: nét nằm quanh hàng 13–14.
    const rows = inkRows(px);
    expect(rows.length).toBeGreaterThan(0);
    for (const y of rows) {
      expect(y).toBeGreaterThanOrEqual(11);
      expect(y).toBeLessThanOrEqual(16);
    }

    // Canh vừa khung theo trục ngang: 0.85 × 28 ≈ 24px, chừa lề mỗi bên.
    const cols = inkCols(px);
    expect(cols[0]).toBeLessThanOrEqual(4);
    expect(cols[cols.length - 1]).toBeGreaterThanOrEqual(23);
  });

  it('255 = NÉT, nền = 0 — đảo lại là mất model', () => {
    const thin = rasterize([[[10, 50], [90, 50]]]);
    expect(at(thin, 0, 0)).toBe(0); // góc = nền
    expect(Math.max(...thin)).toBeGreaterThan(150); // mực sáng hơn hẳn nền
    // Nét mảnh: mực phải là thiểu số, không phải bôi đen cả khung.
    expect(inkCount(thin)).toBeLessThan(SIZE * SIZE * 0.5);

    // Nét đủ dày để phủ kín trọn một ô 4×4 → ô đó phải đạt đúng 255.
    // (Nét 1.5px mặc định KHÔNG đạt 255: bút tròn 6px ở hệ 4× chỉ phủ được 3/4
    //  ô lọc hộp → 191. Đó là làm mượt cạnh, không phải lỗi — và mọi số accuracy
    //  đã đo đều đo trên chính cách vẽ này.)
    const thick = rasterize([[[10, 50], [90, 50]]], { lineWidth: 8 });
    expect(Math.max(...thick)).toBe(255);
  });

  it('toạ độ rác bị bỏ qua, không kéo lệch khung', () => {
    const dirty: Stroke[] = [
      [
        [Number.NaN, 10],
        [20, 20],
        [80, 20],
        [Number.POSITIVE_INFINITY, 90],
      ],
    ];
    const clean: Stroke[] = [[[20, 20], [80, 20]]];
    expect(Array.from(rasterize(dirty))).toEqual(Array.from(rasterize(clean)));
  });

  it('bất biến với tỉ lệ và vị trí canvas (phóng 8×, dịch 1024)', () => {
    // 8 và 1024 là luỹ thừa của 2 → phép biến đổi biểu diễn CHÍNH XÁC trong
    // số thực nhị phân, nên hai ảnh phải giống nhau từng byte. Đây là điều kiện
    // để điện thoại (canvas nhỏ) và máy chiếu (canvas lớn) cho cùng kết quả.
    const base: Stroke[] = [
      [
        [20, 30],
        [80, 35],
        [45, 90],
        [20, 30],
      ],
    ];
    const moved: Stroke[] = base.map((s) =>
      s.map(([x, y]) => [x * 8 + 1024, y * 8 - 1024] as const),
    );

    expect(Array.from(rasterize(moved))).toEqual(Array.from(rasterize(base)));
  });

  it('lật hình thì ảnh lật theo, đúng trục giữa', () => {
    const shape: Stroke[] = [
      [
        [50, 10],
        [10, 90],
        [90, 90],
        [50, 10],
      ],
    ];
    const a = rasterize(shape);
    const b = rasterize(mirrorX(shape));

    let diff = 0;
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        if (at(a, x, y) !== at(b, SIZE - 1 - x, y)) diff++;
      }
    }
    expect(diff).toBeLessThanOrEqual(4); // chỉ vài pixel lệch do làm tròn
  });

  it('nét dày hơn → nhiều mực hơn (bảng hiệu chỉnh ở đầu raster.ts)', () => {
    const square: Stroke[] = [
      [
        [10, 10],
        [90, 10],
        [90, 90],
        [10, 90],
        [10, 10],
      ],
    ];

    // So TỔNG mực chứ không so số pixel: nét dày hơn không nhất thiết trải ra
    // nhiều pixel hơn (bút 4px và 6px đều tràn qua đúng 2 hàng ô), nó làm mực
    // đậm hơn. Đây đúng là biến mà độ dày nét tác động vào.
    const w10 = inkMass(rasterize(square, { lineWidth: 1.0 }));
    const w15 = inkMass(rasterize(square, { lineWidth: 1.5 }));
    const w25 = inkMass(rasterize(square, { lineWidth: 2.5 }));

    expect(w15).toBeGreaterThan(w10);
    expect(w25).toBeGreaterThan(w15);
  });

  it('một điểm duy nhất → một chấm ở chính giữa', () => {
    const px = rasterize([[[50, 50]]]);
    expect(inkRows(px)).toEqual([13, 14]);
    expect(inkCols(px)).toEqual([13, 14]);
    expect(at(px, 13, 13)).toBeGreaterThan(0);
  });

  it('toAscii trả về lưới 28×28 để soi bằng mắt', () => {
    const text = toAscii(new Uint8Array(SIZE * SIZE));
    const lines = text.split('\n');
    expect(lines.length).toBe(SIZE);
    for (const line of lines) expect(line.length).toBe(SIZE);
  });
});
