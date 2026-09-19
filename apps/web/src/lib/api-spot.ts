/**
 * TRACK D — client gọi API của game Ô khác màu.
 *
 * Giữ riêng khỏi `lib/api.ts` (file 🔒 dùng chung) theo đúng cách api-math.ts,
 * api-draw.ts và api-memory.ts đang làm.
 */
import { ApiError, syncClock } from './api';
import type { RoundStatus } from './types';

export interface SpotBoard {
  /** Cạnh lưới — bàn có `size × size` ô. */
  size: number;
  /** Màu các ô thường (chuỗi CSS). */
  base: string;
  /** Màu ô khác. */
  odd: string;
  /** Vị trí ô khác (0-based). */
  oddIndex: number;
}

export interface BoardState {
  roundId: string;
  status: RoundStatus;
  level: number;
  board: SpotBoard;
  /** Cấp CAO NHẤT đã vượt — con số bảng hạng xếp theo. */
  score: number;
  correct: number;
  wrong: number;
  endsAt: number | null;
  serverNow: number;
}

export interface PickResult {
  correct: boolean;
  score: number;
  /** Cấp TIẾP THEO sẽ chơi: +1 nếu vừa đúng, về 1 nếu vừa sai. */
  level: number;
  board: SpotBoard;
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

export const spotApi = {
  /** Bàn chơi của cấp đang chơi — dùng khi vào lượt và khi tải lại trang giữa chừng. */
  board: (roundId: string, playerId: string) =>
    request<BoardState>(`/api/rounds/${roundId}/board?playerId=${encodeURIComponent(playerId)}`),

  /** Gửi ô vừa chạm. Không gửi đúng/sai — server tự chấm. */
  pick: (roundId: string, playerId: string, level: number, index: number) =>
    request<PickResult>(`/api/rounds/${roundId}/pick`, postJson({ playerId, level, index })),
};
