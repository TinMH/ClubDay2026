/**
 * TRACK C — client gọi API của game Nhớ nhanh.
 *
 * Giữ riêng khỏi `lib/api.ts` (phần dùng chung của cả app): mỗi track sở hữu
 * đường dẫn và kiểu dữ liệu của mình. Phần gọi HTTP thì dùng chung ở `lib/http.ts`.
*/
import { postJson, request } from './http';
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
