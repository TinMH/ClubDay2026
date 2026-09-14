import { describe, expect, it } from 'vitest';
import { MAX_POINTS_PER_FRAME, StrokeRecorder } from './strokes';

describe('StrokeRecorder', () => {
  it('gom một nét từ lúc đặt tay tới lúc nhấc ra', () => {
    const r = new StrokeRecorder();
    r.begin(10, 10);
    r.extend(20, 10);
    r.extend(30, 10);
    r.end();

    expect(r.strokeCount).toBe(1);
    expect(r.pointCount).toBe(3);
    expect(r.payload()).toEqual([
      [
        [10, 10],
        [20, 10],
        [30, 10],
      ],
    ]);
  });

  it('bỏ điểm quá gần điểm trước — 120 event/giây không làm phình payload', () => {
    const r = new StrokeRecorder();
    r.begin(10, 10);
    r.extend(10.2, 10.2); // < 1.5px → bỏ
    r.extend(10.5, 10); // < 1.5px → bỏ
    r.extend(12, 10); // ≥ 1.5px → giữ

    expect(r.pointCount).toBe(2);
    expect(r.payload()).toEqual([
      [
        [10, 10],
        [12, 10],
      ],
    ]);
  });

  it('nhấc tay rồi đặt lại là hai nét riêng, không nối liền', () => {
    const r = new StrokeRecorder();
    r.begin(10, 10);
    r.extend(50, 10);
    r.end();
    r.begin(10, 90);
    r.extend(50, 90);
    r.end();

    expect(r.strokeCount).toBe(2);
    expect(r.payload()).toHaveLength(2);
  });

  it('một chấm cũng là một nét — khác hẳn canvas trống', () => {
    const r = new StrokeRecorder();
    r.begin(40, 40);
    r.end();

    expect(r.isEmpty).toBe(false);
    expect(r.payload()).toEqual([[[40, 40]]]);
  });

  it('extend khi chưa begin thì tự mở nét mới', () => {
    const r = new StrokeRecorder();
    r.extend(5, 5);
    r.extend(30, 5);

    expect(r.strokeCount).toBe(1);
    expect(r.pointCount).toBe(2);
  });

  it('canvas trống → payload rỗng, isEmpty = true', () => {
    const r = new StrokeRecorder();
    expect(r.isEmpty).toBe(true);
    expect(r.payload()).toEqual([]);
  });

  it('toạ độ làm tròn về số nguyên trước khi gửi', () => {
    const r = new StrokeRecorder();
    r.begin(10.4, 20.6);
    r.extend(40.7, 20.2);

    expect(r.payload()).toEqual([
      [
        [10, 21],
        [41, 20],
      ],
    ]);
  });

  it('vượt trần điểm thì lấy mẫu thưa, KHÔNG cắt cụt phần cuối hình', () => {
    const r = new StrokeRecorder();
    r.begin(0, 0);
    // Bước 10px để không điểm nào bị bộ lọc khoảng cách loại.
    for (let i = 1; i <= 400; i++) r.extend(i * 10, 0);
    r.end();

    expect(r.pointCount).toBe(401);
    expect(r.pointCount).toBeLessThan(MAX_POINTS_PER_FRAME * 2); // chưa vượt trần

    // Ép vượt trần: một nét 5000 điểm.
    const big = new StrokeRecorder();
    big.begin(0, 0);
    for (let i = 1; i <= 5_000; i++) big.extend(i * 10, 0);
    big.end();

    expect(big.pointCount).toBe(5_001);
    expect(big.pointCount).toBeGreaterThan(MAX_POINTS_PER_FRAME);

    const payload = big.payload();
    const sent = payload.reduce((n, s) => n + s.length, 0);
    expect(sent).toBeLessThanOrEqual(MAX_POINTS_PER_FRAME * 2);

    // Điểm cuối cùng của nét phải còn nguyên — mất nó là hình bị hụt đầu mút.
    const last = payload[0]?.[payload[0].length - 1];
    expect(last).toEqual([50_000, 0]);
  });

  it('clear xoá sạch để vẽ lại', () => {
    const r = new StrokeRecorder();
    r.begin(10, 10);
    r.extend(90, 10);
    r.end();
    r.clear();

    expect(r.isEmpty).toBe(true);
    expect(r.payload()).toEqual([]);
  });
});
