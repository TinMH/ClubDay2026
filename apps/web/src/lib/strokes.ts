/**
 * TRACK B — gom nét vẽ từ pointer event.
 *
 * Cố ý KHÔNG đụng tới DOM: mọi hàm ở đây thuần tuý nên test được, còn phần nối
 * vào canvas nằm ở `components/DrawCanvas.tsx`.
 *
 * Client gửi TOẠ ĐỘ NÉT, không gửi ảnh. Hai lý do:
 *   1. Ảnh base64 mỗi giây rất nặng, còn toạ độ nét thì nhẹ hơn nhiều lần.
 *   2. Server tự rasterize từ toạ độ nên người chơi không thể gửi lên một tấm
 *      ảnh không phải do mình vẽ.
 */

export interface Point {
  x: number;
  y: number;
}

/** Một nét liền mạch (từ lúc đặt ngón tay tới lúc nhấc ra). */
export type Stroke = Point[];

/**
 * Khoảng cách tối thiểu giữa hai điểm liên tiếp, tính bằng px CSS.
 *
 * `pointermove` bắn 60–120 lần/giây; giữ hết thì một nét nguệch ngoạc đã đủ đầy
 * payload mà hình thì không khác gì. Dưới 1.5px thì mắt không phân biệt được.
 */
const MIN_POINT_DISTANCE = 1.5;

/** Trần số điểm cho MỘT frame. PHẢI khớp giới hạn zod ở server (routes/draw.ts). */
export const MAX_POINTS_PER_FRAME = 2_000;

/**
 * Bộ gom nét vẽ.
 *
 * Vòng đời một nét: `begin` → `extend` (nhiều lần) → `end`.
 * Nét chỉ có 1 điểm vẫn được giữ — người chơi chấm một cái cũng là một nét, và
 * với model thì một chấm ở giữa khác hoàn toàn với canvas trống.
 */
export class StrokeRecorder {
  private strokes: Stroke[] = [];
  private current: Stroke | null = null;

  /** Bắt đầu nét mới tại (x, y). */
  begin(x: number, y: number): void {
    this.current = [{ x, y }];
    this.strokes.push(this.current);
  }

  /** Nối tiếp nét đang vẽ. Điểm quá gần điểm trước đó bị bỏ qua. */
  extend(x: number, y: number): void {
    const cur = this.current;
    if (!cur || cur.length === 0) {
      this.begin(x, y);
      return;
    }

    const last = cur[cur.length - 1];
    if (!last) return;
    if (Math.hypot(x - last.x, y - last.y) < MIN_POINT_DISTANCE) return;

    cur.push({ x, y });
  }

  /** Kết thúc nét đang vẽ (nhấc ngón tay). */
  end(): void {
    this.current = null;
  }

  /** Xoá sạch để vẽ lại. */
  clear(): void {
    this.strokes = [];
    this.current = null;
  }

  get isEmpty(): boolean {
    return this.pointCount === 0;
  }

  get pointCount(): number {
    let n = 0;
    for (const s of this.strokes) n += s.length;
    return n;
  }

  /** Số nét đã vẽ — dùng để quyết định có gửi frame hay không. */
  get strokeCount(): number {
    return this.strokes.length;
  }

  /**
   * Dạng gửi lên server: `[[[x, y], ...], ...]`.
   *
   * Nếu tổng số điểm vượt trần thì LẤY MẪU THƯA dần thay vì cắt cụt — cắt cụt
   * làm mất hẳn phần cuối của hình, còn lấy mẫu thưa chỉ làm nét thô hơn. Điểm
   * cuối của mỗi nét luôn được giữ để hình không bị hụt đầu mút.
   */
  payload(): number[][][] {
    const total = this.pointCount;
    const stride = total > MAX_POINTS_PER_FRAME ? Math.ceil(total / MAX_POINTS_PER_FRAME) : 1;

    const out: number[][][] = [];
    for (const stroke of this.strokes) {
      const kept: number[][] = [];
      for (let i = 0; i < stroke.length; i++) {
        const p = stroke[i];
        if (!p) continue;
        if (stride === 1 || i % stride === 0 || i === stroke.length - 1) {
          kept.push([Math.round(p.x), Math.round(p.y)]);
        }
      }
      if (kept.length > 0) out.push(kept);
    }

    return out;
  }
}
