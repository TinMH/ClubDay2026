/**
 * TRACK A — client gọi API của game Tính nhanh.
 *
 * Vì sao không thêm vào `lib/api.ts`? File đó là 🔒 nền tảng, Track B cũng sẽ cần
 * thêm API của nó — hai track cùng sửa một file là conflict chắc chắn. Mỗi track
 * giữ client riêng, `api.ts` chỉ chứa thứ dùng chung (join / state / dashboard).
 */
import { postJson, request } from './http';
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
  /** Chuỗi đúng DÀI NHẤT — con số bảng hạng xếp theo. */
  score: number;
  /** Chuỗi đúng LIÊN TIẾP hiện tại; sai một câu là về 0. */
  streak: number;
  correct: number;
  wrong: number;
  endsAt: number | null;
  serverNow: number;
}

export interface AnswerResult {
  correct: boolean;
  score: number;
  /** Chuỗi đúng LIÊN TIẾP hiện tại sau câu vừa trả lời. */
  streak: number;
  correctCount: number;
  wrongCount: number;
  index: number;
  question: PublicQuestion | null;
  serverNow: number;
}

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
