/**
 * HỢP ĐỒNG ĐÓNG BĂNG — Phase F sở hữu, hai track CHỈ ĐỌC.
 *
 * File này chứa đủ field cho CẢ HAI game. Nếu bạn thấy cần thêm field,
 * dừng lại và nhắn người kia: đó là dấu hiệu hợp đồng thiếu.
 * Chi tiết: .hermes/plans/2026-09-12_201457-clubday-split-2-tracks.md
 *
 * ĐÃ MỞ MỘT LẦN, theo đúng cách hợp đồng cho phép — CHỈ thêm field mới, không đổi
 * nghĩa field cũ, nên track còn lại không phải sửa gì:
 *   - `streak`                                     (TRACK A — điểm là chuỗi đúng dài nhất)
 *   - `committed`, `commitReason`, `committedAt`   (TRACK B — chấm bài lúc NỘP)
 */

export type GameKind = 'math' | 'draw';
export type RoundStatus = 'lobby' | 'playing' | 'done';

export interface Question {
  prompt: string;
  answer: number;
}

export interface Prediction {
  label: string;
  score: number;
}

export interface Player {
  id: string;
  name: string;
  joinedAt: number;
  /**
   * Số mà BẢNG HẠNG xếp theo — mỗi game một công thức, và đây là chỗ duy nhất
   * `dashboard.ts` đọc để so:
   *   - Tính nhanh: CHUỖI ĐÚNG DÀI NHẤT (không phải tổng số câu đúng).
   *   - Vẽ hình:  150 − số giây đã dùng.
   * Đổi công thức của một game là đổi luôn thứ tự bảng hạng của game đó.
   */
  score: number;
  flagged: boolean;
  /** Cả 2 game set = true khi người chơi xong lượt của mình. */
  finished: boolean;
  /** Dùng cho bảng hạng: đúng / sai. TRACK A ghi, track B để 0. */
  correct: number;
  wrong: number;

  // ── TRACK A dùng (Tính nhanh) ──
  /**
   * Chuỗi đúng LIÊN TIẾP hiện tại. Trả lời sai là về 0 ngay.
   *
   * Giữ riêng khỏi `score` vì `score` là chuỗi DÀI NHẤT đã đạt — sai một câu
   * không lấy đi kỷ lục đã lập.
   */
  streak: number;
  /** Đang ở câu số mấy (0-based). */
  qIndex: number;
  /** ⏱ Server ghi mỗi lần nhận đáp án — dùng chống spam. */
  lastAnswerAt: number;

  // ── TRACK B dùng (Vẽ hình) ──
  /** Số thứ tự frame gần nhất. */
  seq: number;
  /** ⏱ Server ghi mỗi lần nhận frame — dùng chống spam. */
  lastFrameAt: number;
  solved: boolean;
  /**
   * ⏱ Thời điểm lượt của người này KẾT THÚC — tức lúc bài được nộp, đúng hay sai
   * đều tính. Dùng để xếp hạng khi bằng điểm. Đúng/sai nằm ở `solved`.
   */
  solvedAt: number | null;
  lastGuess: Prediction | null;
  /**
   * ĐÃ NỘP BÀI chưa. Mỗi người nộp ĐÚNG MỘT lần: bấm nút, hoặc server tự nộp khi
   * hết giờ. Điểm chỉ sinh ra ở đúng lúc này — trước đó model có đọc ra hình đúng
   * cũng KHÔNG cho điểm. Xem services/draw-session.ts.
   */
  committed: boolean;
  /** Nộp bằng cách nào. `null` = chưa nộp. */
  commitReason: 'button' | 'timeout' | null;
  /** ⏱ Thời điểm SERVER chấm bài. */
  committedAt: number | null;
}

export interface Round {
  id: string;
  /** ⭐ Quyết định Play.tsx render MathGame hay DrawGame. */
  game: GameKind;
  status: RoundStatus;
  createdAt: number;
  startedAt: number | null;
  /** ⏱ MỘT đồng hồ chung cho cả lượt — không phải mỗi người một cái. */
  endsAt: number | null;
  players: Map<string, Player>;
  /** TRACK A: sinh sẵn khi bắt đầu lượt. */
  questions: Question[] | null;
  /** TRACK B: từ khoá cần vẽ. */
  target: { id: string; labelVi: string } | null;
  /** Tăng mỗi lần lượt đổi → SSE phát khi version đổi. */
  version: number;
  /** false = lượt khôi phục từ snapshot sau khi server restart. */
  live?: boolean;
}

export const MAX_PLAYERS = 5;

export const DURATION_MS: Record<GameKind, number> = {
  math: 90_000,
  draw: 15_000,
};

/** Giới hạn tần suất do SERVER đo (không tin client). */
export const MIN_ANSWER_GAP_MS = 250;
export const MIN_FRAME_GAP_MS = 1_000;

/** Tên hiển thị của từng game — dùng chung ở lobby và admin. */
export const GAME_LABEL: Record<GameKind, string> = {
  math: 'Tính nhanh',
  draw: 'Vẽ hình nhanh',
};
