/**
 * Kiểu trong RAM của server: một lượt và những người chơi trong đó.
 *
 * MỖI TRACK SỞ HỮU MỘT TÚI RIÊNG (`player.math`, `player.draw`, …) thay vì đổ
 * hết field vào một `Player` phẳng. Bản phẳng cũ khiến hai chuyện xảy ra:
 *   - đọc `Player` không biết field nào thuộc game nào, phải tra ngược ra
 *     service mới hiểu `seq` hay `qIndex` là của ai;
 *   - thêm game thứ tư thì nó DÙNG KÉ `level` và `lastReplayAt` của Nhớ nhanh,
 *     vì thêm field thứ mười lăm vào một kiểu phẳng trông còn tệ hơn. Hai game
 *     không liên quan chia chung một field là bẫy đặt sẵn cho người sửa sau.
 *
 * Bốn túi LUÔN có mặt (không optional): mỗi lượt chỉ chạy một game nên ba túi
 * kia chỉ tốn vài chục byte cho mỗi người chơi, đổi lại không chỗ nào phải viết
 * `?.` hay kiểm tra null cho một thứ chắc chắn tồn tại.
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

/** TRACK A — Tính nhanh. */
export interface MathPlayerState {
  /**
   * Chuỗi đúng LIÊN TIẾP hiện tại. Trả lời sai là về 0 ngay.
   *
   * Giữ riêng khỏi `score` vì `score` là chuỗi DÀI NHẤT đã đạt — sai một câu
   * không lấy đi kỷ lục đã lập.
   */
  streak: number;
  /** Đang ở câu số mấy (0-based). */
  qIndex: number;
}

/** TRACK B — Vẽ hình nhanh. */
export interface DrawPlayerState {
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

/** TRACK C — Nhớ nhanh. */
export interface MemoryPlayerState {
  /**
   * Cấp ĐANG chơi (1-based) = độ dài chuỗi phải lặp lại.
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
  /** ⏱ Server ghi mỗi lần nhận một lượt lặp — dùng chống spam. */
  lastReplayAt: number;
}

/** TRACK D — Ô khác màu. */
export interface SpotPlayerState {
  /** Cấp ĐANG chơi (1-based) = độ khó của bàn: lưới dày thêm, màu sát nhau hơn. */
  level: number;
  /** ⏱ Server ghi mỗi lần nhận một cú chạm — dùng chống spam. */
  lastPickAt: number;
}

export interface Player {
  id: string;
  name: string;
  joinedAt: number;
  /**
   * Số mà BẢNG HẠNG xếp theo — mỗi game một công thức, và đây là chỗ duy nhất
   * `dashboard.ts` đọc để so:
   *   - Tính nhanh:  CHUỖI ĐÚNG DÀI NHẤT (không phải tổng số câu đúng).
   *   - Vẽ hình:     150 − số giây đã dùng.
   *   - Nhớ nhanh:   CẤP CAO NHẤT đã vượt (chuỗi dài nhất lặp đúng).
   *   - Ô khác màu:  CẤP CAO NHẤT đã vượt.
   * Đổi công thức của một game là đổi luôn thứ tự bảng hạng của game đó.
   */
  score: number;
  flagged: boolean;
  /** Mọi game set = true khi người chơi xong lượt của mình. */
  finished: boolean;
  /** Dùng cho bảng hạng: đúng / sai. Game Vẽ để 0. */
  correct: number;
  wrong: number;
  /**
   * ⏱ Lần cuối người này LÀM ĐƯỢC MỘT VIỆC được tính (trả lời, lặp chuỗi, chạm ô).
   *
   * Bảng hạng dùng nó làm mốc "xong lúc nào" khi bằng điểm. Tên cũ là
   * `lastAnswerAt` — đúng với Tính nhanh, sai với ba game còn lại.
   */
  lastActionAt: number;

  // Mỗi game một túi. Xem ghi chú đầu file về việc vì sao không để phẳng.
  math: MathPlayerState;
  draw: DrawPlayerState;
  memory: MemoryPlayerState;
  spot: SpotPlayerState;
}

export interface Round {
  id: string;
  /** ⭐ Quyết định Play.tsx render màn hình của game nào. */
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
  /** TRACK A: đề bài, sinh sẵn khi bắt đầu lượt. */
  math: { questions: Question[] | null };
  /** TRACK B: từ khoá cần vẽ. */
  draw: { target: { id: string; labelVi: string } | null };
  /**
   * TRACK C: chuỗi ô cần nhớ, sinh sẵn khi bắt đầu lượt.
   *
   * Cấp n = n phần tử ĐẦU của chuỗi này, nên lên cấp chỉ là nối thêm đúng một ô
   * vào chuỗi cũ — giống trò Simon. Cả lượt dùng CHUNG một chuỗi để mọi người
   * gặp đúng một đề bài.
   */
  memory: { sequence: number[] | null };
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
