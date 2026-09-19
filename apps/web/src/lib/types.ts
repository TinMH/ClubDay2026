/**
 * Bản sao hợp đồng từ server (apps/server/src/store/types.ts + store/state.ts).
 * Phase F sở hữu — hai track chỉ đọc.
 */
/** Phải khớp GAME_KINDS ở server (apps/server/src/store/types.ts). */
export const GAME_KINDS = ['math', 'draw', 'memory', 'spot'] as const;
export type GameKind = (typeof GAME_KINDS)[number];
export type RoundStatus = 'lobby' | 'playing' | 'done';

export interface RoundStatePlayer {
  id: string;
  name: string;
  score: number;
  finished: boolean;
}

export interface RoundState {
  roundId: string;
  game: GameKind;
  status: RoundStatus;
  serverNow: number;
  startedAt: number | null;
  endsAt: number | null;
  /** Số chỗ của RIÊNG lượt này. */
  maxPlayers: number;
  target?: { id: string; labelVi: string };
  players: RoundStatePlayer[];
}

export interface RoundSummary {
  roundId: string;
  game: GameKind;
  status: RoundStatus;
  playerCount: number;
  maxPlayers: number;
  createdAt: number;
  live: boolean;
}

export interface DashboardRow {
  rank: number;
  playerId: string;
  name: string;
  score: number;
  correct: number;
  wrong: number;
  msToFinish: number | null;
  solved: boolean;
  flagged: boolean;
}

/**
 * Props mà Play.tsx truyền cho MathGame / DrawGame.
 * ĐÂY LÀ HỢP ĐỒNG của 2 track — đổi nó là đổi cả hai bên.
 */
export interface GameProps {
  roundId: string;
  playerId: string;
  state: RoundState;
}

export const GAME_LABEL: Record<GameKind, string> = {
  math: 'Tính nhanh',
  draw: 'Vẽ hình nhanh',
  memory: 'Nhớ nhanh',
  spot: 'Ô khác màu',
};

/**
 * Nhãn cho con số mà BẢNG HẠNG xếp theo.
 *
 * Con số này mỗi game một nghĩa — Tính nhanh là chuỗi đúng dài nhất, Vẽ hình là
 * điểm theo thời gian — nên hiện trơ ra mà không có nhãn thì người chơi sẽ hiểu
 * sai. Ví dụ: trả lời đúng 12 câu mà ô điểm ghi "3" thì trông như lỗi.
 *
 * Chỉ dùng ở client; server không render chữ nào.
 */
export const SCORE_LABEL: Record<GameKind, string> = {
  math: 'Chuỗi dài nhất',
  draw: 'Điểm',
  memory: 'Cấp cao nhất',
  spot: 'Cấp cao nhất',
};

/**
 * Số người mỗi lượt khi CHƯA biết cấu hình thật (lúc trang vừa mở, hoặc mất mạng).
 *
 * Con số thật đến từ server và mỗi trò một khác — BTC đặt trong `.env`. Lấy ở:
 *   - phòng chờ  → `state.maxPlayers` (của chính lượt đó)
 *   - trang chủ  → `config.maxPlayers[game]` / `openRounds.max[game]`
 *   - /admin     → `maxPlayers` trong danh sách lượt
 * Dùng hằng số này để vẽ "x/5" là nói sai với người chơi khi BTC đặt khác 5.
 */
export const DEFAULT_MAX_PLAYERS = 5;

export const DURATION_MS: Record<GameKind, number> = {
  math: 90_000,
  draw: 15_000,
  memory: 60_000,
  spot: 45_000,
};

// ── Nhớ nhanh: hằng số CHIA CHUNG với server ──
//
// Server dựa vào đúng `MEMORY_STEP_MS` này để biết một lượt lặp có kịp xem chuỗi
// hay không. Phát lại NHANH HƠN con số ở đây là người chơi thật bị gắn cờ gian
// lận — đổi thì phải đổi cả apps/server/src/store/types.ts.

/** Số ô trên bàn chơi. */
export const MEMORY_PAD_COUNT = 4;
/** Nhịp phát lại mỗi ô: sáng 400ms + tối 200ms. */
export const MEMORY_STEP_MS = 600;
export const MEMORY_LIT_MS = 400;
