/**
 * TRACK B — client gọi API của game Vẽ hình nhanh.
 *
 * Vì sao không thêm vào `lib/api.ts`? Cùng lý do như `api-math.ts`: file đó là
 * 🔒 nền tảng, Track A cũng cần thêm API của nó — hai track cùng sửa một file là
 * conflict chắc chắn. Mỗi track giữ client riêng.
 */
import { ApiError, syncClock } from './api';
import type { RoundStatus } from './types';

/** Một dự đoán của model, kèm tên tiếng Việt để hiển thị thẳng lên màn hình. */
export interface PublicPrediction {
  label: string;
  labelVi: string;
  score: number;
}

/**
 * Kết quả một frame vẽ — chỉ là GỢI Ý.
 *
 * `hint` = model đang đọc hình này ra đúng từ khoá. Nó KHÔNG phải kết quả và
 * KHÔNG làm điểm thay đổi: điểm chỉ sinh ra ở `submit()`.
 */
export interface FrameResult {
  hint: boolean;
  top: PublicPrediction[];
  score: number;
  /** Số giây đã dùng tính từ lúc bắt đầu lượt — server đo, không phải client. */
  seconds: number;
  endsAt: number | null;
  serverNow: number;
}

/** Kết quả NỘP BÀI — con số duy nhất trên màn hình đến từ đây. */
export interface SubmitResult {
  committed: boolean;
  /** true = bài đã được chấm từ trước (bấm đúp, hoặc server đã tự nộp hộ). */
  already: boolean;
  /** 'button' = người chơi bấm nút; 'timeout' = hết giờ. Do SERVER suy ra. */
  reason: 'button' | 'timeout';
  matched: boolean;
  top: PublicPrediction[];
  score: number;
  seconds: number;
  endsAt: number | null;
  serverNow: number;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  const text = await res.text();
  const data: unknown = text ? JSON.parse(text) : null;

  if (!res.ok) {
    const code =
      data && typeof data === 'object' && 'error' in data
        ? String((data as { error: unknown }).error)
        : 'HTTP_ERROR';
    throw new ApiError(code, res.status);
  }

  if (data && typeof data === 'object' && 'serverNow' in data) {
    syncClock(Number((data as { serverNow: unknown }).serverNow));
  }
  return data as T;
}

export const drawApi = {
  /**
   * Gửi một frame vẽ để lấy GỢI Ý — không phải để chấm điểm.
   *
   * Gửi TOẠ ĐỘ NÉT, không gửi ảnh — nhẹ hơn nhiều lần, và server tự rasterize
   * nên không thể đưa lên một tấm ảnh không phải do mình vẽ.
   */
  frame: (
    roundId: string,
    playerId: string,
    seq: number,
    strokes: number[][][],
    canvasW: number,
    canvasH: number,
  ) =>
    request<FrameResult>(`/api/rounds/${roundId}/frame`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId, seq, strokes, canvasW, canvasH }),
    }),

  /**
   * NỘP BÀI — chấm điểm, đúng một lần.
   *
   * `strokes` bỏ trống khi canvas đang trống: server sẽ chấm bằng nét vẽ cuối
   * cùng nó đã nhận được. Gửi mảng rỗng ở đây là tự nộp một tờ giấy trắng.
   */
  submit: (roundId: string, playerId: string, strokes?: number[][][]) =>
    request<SubmitResult>(`/api/rounds/${roundId}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(strokes ? { playerId, strokes } : { playerId }),
    }),
};

export type { RoundStatus };
