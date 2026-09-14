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

export interface FrameResult {
  matched: boolean;
  top: PublicPrediction[];
  score: number;
  solved: boolean;
  /** Số giây đã dùng tính từ lúc bắt đầu lượt — server đo, không phải client. */
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
   * Gửi một frame vẽ.
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
};

export type { RoundStatus };
