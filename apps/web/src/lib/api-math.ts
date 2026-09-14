/**
 * TRACK A — client gọi API của game Tính nhanh.
 *
 * Vì sao không thêm vào `lib/api.ts`? File đó là 🔒 nền tảng, Track B cũng sẽ cần
 * thêm API của nó — hai track cùng sửa một file là conflict chắc chắn. Mỗi track
 * giữ client riêng, `api.ts` chỉ chứa thứ dùng chung (join / state / dashboard).
 */
import { ApiError, syncClock } from './api';
import type { RoundStatus } from './types';

/** Câu hỏi server gửi ra — CỐ Ý không có `answer`. */
export interface PublicQuestion {
  prompt: string;
  /**
   * Bốn lựa chọn ĐÃ XÁO TRỘN, do server sinh. Client biết bốn con số nhưng KHÔNG
   * biết con nào đúng — muốn biết thì phải tự tính, hoặc đoán.
   */
  options: number[];
}

export interface QuestionState {
  roundId: string;
  status: RoundStatus;
  index: number;
  question: PublicQuestion | null;
  score: number;
  correct: number;
  wrong: number;
  endsAt: number | null;
  serverNow: number;
}

export interface AnswerResult {
  correct: boolean;
  score: number;
  correctCount: number;
  wrongCount: number;
  index: number;
  question: PublicQuestion | null;
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

export const mathApi = {
  /** Câu hỏi đang mở — dùng khi vào lượt và khi tải lại trang giữa chừng. */
  question: (roundId: string, playerId: string) =>
    request<QuestionState>(
      `/api/rounds/${roundId}/question?playerId=${encodeURIComponent(playerId)}`,
    ),

  /** Gửi đáp án. Không gửi điểm — server tự chấm. */
  answer: (roundId: string, playerId: string, idx: number, value: number) =>
    request<AnswerResult>(
      `/api/rounds/${roundId}/answer`,
      postJson({ playerId, idx, value }),
    ),
};
