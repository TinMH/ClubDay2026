/**
 * TRACK C — client gọi API của game Nhớ nhanh.
 *
 * Giữ riêng khỏi `lib/api.ts` (file 🔒 dùng chung) theo đúng cách api-math.ts và
 * api-draw.ts đang làm.
 */
import { ApiError, syncClock } from './api';
import type { RoundStatus } from './types';

export interface SequenceState {
  roundId: string;
  status: RoundStatus;
  /** Cấp đang chơi = độ dài chuỗi phải lặp lại. */
  level: number;
  /** Chuỗi của ĐÚNG cấp này. Server không gửi phần sau của chuỗi cả lượt. */
  sequence: number[] | null;
  pads: number;
  stepMs: number;
  /** Cấp CAO NHẤT đã vượt — con số bảng hạng xếp theo. */
  score: number;
  correct: number;
  wrong: number;
  endsAt: number | null;
  serverNow: number;
}

export interface ReplayResult {
  correct: boolean;
  score: number;
  /** Cấp TIẾP THEO sẽ chơi: +1 nếu vừa đúng, về 1 nếu vừa sai. */
  level: number;
  sequence: number[];
  correctCount: number;
  wrongCount: number;
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

const postJson = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

export const memoryApi = {
  /** Chuỗi của cấp đang chơi — dùng khi vào lượt và khi tải lại trang giữa chừng. */
  sequence: (roundId: string, playerId: string) =>
    request<SequenceState>(
      `/api/rounds/${roundId}/sequence?playerId=${encodeURIComponent(playerId)}`,
    ),

  /** Gửi các ô đã bấm. Không gửi điểm — server tự chấm. */
  replay: (roundId: string, playerId: string, level: number, taps: number[]) =>
    request<ReplayResult>(`/api/rounds/${roundId}/replay`, postJson({ playerId, level, taps })),
};
