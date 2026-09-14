import { describe, expect, it } from 'vitest';
import { ALLOWLIST, CONFUSIONS, EVAL_META } from './allowlist.generated.js';
import { accepted, DROPPED, labelVi, pickTarget, TARGETS } from './labels.js';
import type { Prediction } from '../store/types.js';

const p = (label: string, score: number): Prediction => ({ label, score });

describe('bộ từ khoá', () => {
  it('mọi tên tiếng Việt đều trỏ tới class model nhận đủ tốt', () => {
    // Danh sách này phải RỖNG. Có phần tử nghĩa là một khoá trong LABEL_VI gõ
    // sai hoặc đã bị eval đánh tụt xuống dưới ngưỡng — cả hai đều là lỗi lập
    // trình, không phải chuyện của lúc chạy sự kiện.
    expect(DROPPED).toEqual([]);
  });

  it('từ khoá dùng được không rỗng và đủ nhiều để chơi nhiều lượt', () => {
    expect(TARGETS.length).toBeGreaterThanOrEqual(50);
  });

  it('mọi từ khoá đều nằm trong ALLOWLIST đã đo', () => {
    const allowed = new Set(ALLOWLIST);
    for (const t of TARGETS) expect(allowed.has(t.id)).toBe(true);
  });

  it('tên hiển thị không trùng nhau và không phải tiếng Anh', () => {
    const seen = new Set<string>();
    for (const t of TARGETS) {
      expect(t.labelVi).not.toBe(t.id);
      expect(t.labelVi.trim()).not.toBe('');
      expect(seen.has(t.labelVi)).toBe(false);
      seen.add(t.labelVi);
    }
  });

  it('EVAL_META ghi lại nguồn gốc của danh sách', () => {
    expect(EVAL_META.dtype).toBe('fp32');
    expect(EVAL_META.threshold).toBeGreaterThan(0);
    expect(EVAL_META.samplesPerClass).toBeGreaterThanOrEqual(10);
  });
});

describe('pickTarget', () => {
  it('cùng mã lượt → cùng từ khoá (tra lại được lượt cũ)', () => {
    expect(pickTarget('ABC123')).toEqual(pickTarget('ABC123'));
  });

  it('mã lượt khác nhau cho ra nhiều từ khoá khác nhau', () => {
    const ids = ['A1B2C3', 'D4E5F6', 'G7H8I9', 'J1K2L3', 'M4N5O6', 'P7Q8R9', 'S1T2U3', 'V4W5X6'];
    const picked = new Set(ids.map((id) => pickTarget(id).id));
    expect(picked.size).toBeGreaterThan(1);
  });

  it('luôn trả về một từ khoá có thật trong TARGETS', () => {
    const valid = new Set(TARGETS.map((t) => t.id));
    for (let i = 0; i < 200; i++) {
      expect(valid.has(pickTarget(`R${i}`).id)).toBe(true);
    }
  });
});

describe('accepted', () => {
  it('đoán trúng ngay top-1 thì nhận, kể cả khi điểm tự tin thấp', () => {
    expect(accepted([p('fish', 0.31), p('whale', 0.2)], 'fish')).toBe(true);
    expect(accepted([p('fish', 0.99)], 'fish')).toBe(true);
  });

  it('nằm trong top-3 và model chưa quá tự tin → nhận', () => {
    expect(accepted([p('whale', 0.55), p('fish', 0.4)], 'fish')).toBe(true);
  });

  it('nằm trong top-3 nhưng model rất tự tin vào nhãn khác → KHÔNG nhận', () => {
    // Phải chọn nhãn KHÔNG nằm trong bảng lẫn nhau, nếu không luật 3 sẽ nhận và
    // test này không còn kiểm tra luật 2 nữa. `whale` là cặp lẫn nhau của `fish`
    // nên không dùng được ở đây — dùng một nhãn chẳng liên quan.
    expect(CONFUSIONS.fish ?? []).not.toContain('washing machine');
    // 0.90 > ngưỡng 0.85: model thật sự nhìn thấy cái máy giặt, không được tha.
    expect(accepted([p('washing machine', 0.9), p('fish', 0.05)], 'fish')).toBe(false);
  });

  it('nhãn đoán là cặp hay lẫn nhau ĐO ĐƯỢC → nhận', () => {
    // fish ↔ whale là cặp có trong CONFUSIONS (đo từ dữ liệu thật).
    expect(CONFUSIONS.fish).toContain('whale');
    expect(accepted([p('whale', 0.7)], 'fish')).toBe(true);
  });

  it('cặp lẫn nhau vẫn được tha kể cả khi model rất tự tin', () => {
    // Cố ý: bảng CONFUSIONS chỉ chứa cặp đã đo được là lẫn nhau ≥ 10% số mẫu,
    // nên tha là đúng. Người chơi vẽ "con cá" mà bị báo sai vì model gọi "cá
    // mập" là lỗi của game, không phải của họ.
    expect(accepted([p('whale', 0.98)], 'fish')).toBe(true);
  });

  it('đoán sang một nhãn KHÔNG liên quan → không nhận', () => {
    expect(accepted([p('washing machine', 0.6)], 'fish')).toBe(false);
    expect(accepted([p('washing machine', 0.6), p('ladder', 0.3)], 'fish')).toBe(false);
  });

  it('không có dự đoán nào → không nhận, không crash', () => {
    expect(accepted([], 'fish')).toBe(false);
  });
});

describe('labelVi', () => {
  it('trả về tên tiếng Việt, và tự lùi về id nếu chưa có bản dịch', () => {
    expect(labelVi('fish')).toBe('con cá');
    expect(labelVi('chưa-có-trong-bảng')).toBe('chưa-có-trong-bảng');
  });
});
