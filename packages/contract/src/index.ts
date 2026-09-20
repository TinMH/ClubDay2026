/**
 * HỢP ĐỒNG SERVER ↔ WEB — nguồn sự thật DUY NHẤT.
 *
 * Trước đây file này tồn tại hai bản chép tay (`apps/server/src/store/types.ts`
 * và `apps/web/src/lib/types.ts`), mỗi bản có comment "phải khớp" nhưng không có
 * gì bắt chúng khớp. Lệch một con số là lỗi im lặng, và im theo kiểu tệ nhất:
 * lệch `MEMORY_STEP_MS` thì client phát chuỗi nhanh hơn server nghĩ, và người
 * chơi THẬT bị gắn cờ gian lận.
 *
 * Chỉ để ở đây những thứ HAI BÊN CÙNG PHẢI BIẾT. Kiểu chỉ server dùng (`Round`,
 * `Player`) ở lại server; thứ chỉ để hiển thị (`SCORE_LABEL`, `GameProps`) ở lại
 * web. Nhét tất cả vào đây thì package này thành một `types.ts` thứ ba.
 */

/**
 * Danh sách game — thêm game mới là thêm đúng một phần tử ở đây.
 *
 * Mọi bảng `Record<GameKind, …>` ở cả hai bên sẽ báo lỗi biên dịch cho tới khi
 * được khai đủ, nên không có đường nào quên một chỗ.
 */
export const GAME_KINDS = ['math', 'draw', 'memory', 'spot'] as const;
export type GameKind = (typeof GAME_KINDS)[number];

export type RoundStatus = 'lobby' | 'playing' | 'done';

/** Tên hiển thị của từng game. */
export const GAME_LABEL: Record<GameKind, string> = {
  math: 'Tính nhanh',
  draw: 'Vẽ hình nhanh',
  memory: 'Nhớ nhanh',
  spot: 'Ô khác màu',
};

/**
 * Thời lượng mỗi lượt.
 *
 * Client đếm ngược theo con số này, server chấm điểm cũng theo nó — lệch nhau là
 * đồng hồ trên màn hình nói một đằng, điểm tính một nẻo.
 */
export const DURATION_MS: Record<GameKind, number> = {
  math: 90_000,
  draw: 15_000,
  // Đủ để người giỏi lên tới cấp 8–10, mà vẫn ngắn hơn Tính nhanh để vòng quay
  // người chơi ở booth không bị chậm lại.
  memory: 60_000,
  // Mỗi cấp chỉ mất 1–3 giây nên 45s đã đủ tới cấp 12–15. Ngắn có chủ đích: đây
  // là trò quay vòng nhanh nhất.
  spot: 45_000,
};

/** Số người MẶC ĐỊNH mỗi lượt, dùng khi `.env` không nói gì khác. */
export const MAX_PLAYERS = 5;

/**
 * Trần cứng cho cấu hình sức chứa.
 *
 * Trên 20 người một lượt thì phòng chờ tràn màn hình điện thoại, bảng hạng thành
 * một danh sách dài vô nghĩa, và với game Vẽ thì mỗi frame là một lần chạy model.
 */
export const MAX_PLAYERS_CAP = 20;

// ── Nhớ nhanh ──
//
// Server dựa vào ĐÚNG `MEMORY_STEP_MS` này để biết một lượt lặp có kịp xem chuỗi
// hay không; client phát lại chuỗi cũng theo nó. Phát nhanh hơn là người chơi
// thật bị gắn cờ gian lận — đây chính là hằng số mà việc chép tay từng đe doạ.

/** Số ô trên bàn chơi. 4 ô vừa một lưới 2×2 to bằng ngón tay trên điện thoại. */
export const MEMORY_PAD_COUNT = 4;
/**
 * Một nhịp phát = 380ms sáng + 320ms tối (xem `MEMORY_LIT_MS` phía web).
 *
 * Trước là 600ms (400 sáng + 200 tối) và chơi thấy rối. Hai lý do, khe tối là
 * lý do lớn hơn: chuỗi CHO PHÉP hai ô giống nhau đứng liền nhau, mà 200ms tối
 * thì mắt đọc hai lần nháy đó thành MỘT lần nháy dài. Người chơi nhớ đúng vẫn
 * bấm thiếu một ô, và không hiểu mình sai ở đâu.
 */
export const MEMORY_STEP_MS = 700;

// ── Ô khác màu ──

/** Cạnh lưới nhỏ nhất (2×2) và lớn nhất (6×6 = 36 ô — nhỏ hơn nữa thì ngón tay không trúng). */
export const SPOT_MIN_SIZE = 2;
export const SPOT_MAX_SIZE = 6;

// ── Hình dạng dữ liệu đi trên dây ──

export interface RoundStatePlayer {
  id: string;
  name: string;
  score: number;
  finished: boolean;
}

/** View-model của một lượt, gửi qua REST và SSE. */
export interface RoundState {
  roundId: string;
  game: GameKind;
  status: RoundStatus;
  /** ⏱ Giờ của SERVER — client dùng để bù lệch đồng hồ máy người chơi. */
  serverNow: number;
  startedAt: number | null;
  endsAt: number | null;
  /** Số chỗ của RIÊNG lượt này — phòng chờ vẽ đúng bấy nhiêu ô. */
  maxPlayers: number;
  /** Chỉ có ở game vẽ. */
  target?: { id: string; labelVi: string };
  players: RoundStatePlayer[];
}

/** Một dòng bảng hạng. */
export interface DashboardRow {
  rank: number;
  playerId: string;
  name: string;
  score: number;
  correct: number;
  wrong: number;
  /** Thời gian (ms kể từ lúc bắt đầu lượt) để hoàn thành; null = chưa xong. */
  msToFinish: number | null;
  solved: boolean;
  flagged: boolean;
}
