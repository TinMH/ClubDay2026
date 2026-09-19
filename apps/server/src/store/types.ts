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
 *   - `level`, `levelSentAt`, `lastReplayAt`       (TRACK C — Nhớ nhanh)
 *   - `sequence` trên `Round`                      (TRACK C — chuỗi ô cần nhớ)
 *
 * TRACK D (Ô khác màu) KHÔNG thêm field nào: nó dùng lại `level` và `lastReplayAt`
 * đúng nghĩa cũ, còn bàn chơi thì suy ra được từ mã lượt + cấp nên không cần lưu.
 */

/**
 * Danh sách game, thời lượng, nhãn và mọi hằng số CHIA CHUNG với web nằm ở
 * `@clubday/contract` — MỘT nguồn sự thật cho cả hai app, thay cho hai bản chép
 * tay chỉ được canh bằng comment "phải khớp".
 *
 * Tái xuất ở đây để mọi `import … from './types.js'` sẵn có vẫn chạy.
 */
export * from '@clubday/contract';

import type { GameKind, RoundStatus } from '@clubday/contract';

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
   *   - Nhớ nhanh: CẤP CAO NHẤT đã vượt (chuỗi dài nhất lặp đúng).
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

  // ── TRACK C & D dùng (Nhớ nhanh, Ô khác màu) ──
  /**
   * Cấp ĐANG chơi (1-based).
   *
   * Nhớ nhanh: độ dài chuỗi phải lặp lại. Ô khác màu: độ khó của bàn chơi.
   *
   * Giữ riêng khỏi `score` vì `score` là cấp CAO NHẤT đã vượt: lặp sai thì cấp
   * hiện tại về 1 nhưng kỷ lục vẫn còn — cùng triết lý với `streak` của Tính nhanh.
   */
  level: number;
  /**
   * ⏱ Thời điểm SERVER gửi chuỗi của cấp hiện tại đi.
   *
   * Đây là mốc của chốt chống bot quan trọng nhất ở game này: muốn lặp đúng thì
   * phải XEM hết chuỗi đã, mà xem hết `level` ô mất `level × MEMORY_STEP_MS`.
   * Trả lời sớm hơn quãng đó nghĩa là không hề xem — xem services/memory-session.ts.
   */
  levelSentAt: number;
  /** ⏱ Server ghi mỗi lần nhận một lượt lặp / một cú chạm — dùng chống spam. */
  lastReplayAt: number;
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
  /**
   * Số người tối đa của RIÊNG lượt này, chốt lúc tạo lượt.
   *
   * Chốt lại thay vì đọc cấu hình mỗi lần kiểm tra: BTC đổi cấu hình giữa sự kiện
   * thì lượt đang chờ vẫn giữ nguyên luật nó sinh ra cùng — không có chuyện đang
   * 5/5 thì tụt xuống 5/3 và hai người bỗng thành thừa.
   */
  maxPlayers: number;
  /** TRACK A: sinh sẵn khi bắt đầu lượt. */
  questions: Question[] | null;
  /** TRACK B: từ khoá cần vẽ. */
  target: { id: string; labelVi: string } | null;
  /**
   * TRACK C: chuỗi ô cần nhớ, sinh sẵn khi bắt đầu lượt.
   *
   * Cấp n = n phần tử ĐẦU của chuỗi này, nên lên cấp chỉ là nối thêm đúng một ô
   * vào chuỗi cũ — giống trò Simon. Cả lượt dùng CHUNG một chuỗi để 5 người gặp
   * đúng một đề bài.
   */
  sequence: number[] | null;
  /** Tăng mỗi lần lượt đổi → SSE phát khi version đổi. */
  version: number;
  /** false = lượt khôi phục từ snapshot sau khi server restart. */
  live?: boolean;
}

/** Giới hạn tần suất do SERVER đo (không tin client). */
export const MIN_ANSWER_GAP_MS = 250;
export const MIN_FRAME_GAP_MS = 1_000;
export const MIN_REPLAY_GAP_MS = 250;
/**
 * Khoảng cách tối thiểu giữa hai cú chạm ở Ô khác màu.
 *
 * Người thật còn phải quét mắt tìm ô lệch màu; 150ms là đã nhanh hơn cả thời gian
 * phản xạ chạm của người bình thường (~250ms). Nhanh hơn nữa gần như chắc chắn là
 * script đọc màu từ DOM — xem ghi chú ở services/spot-session.ts.
 */
export const MIN_SPOT_GAP_MS = 150;
