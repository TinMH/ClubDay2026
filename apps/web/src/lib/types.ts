/**
 * Bản sao hợp đồng từ server (apps/server/src/store/types.ts + store/state.ts).
 * Phase F sở hữu — hai track chỉ đọc.
 */
export type GameKind = 'math' | 'draw';
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
  target?: { id: string; labelVi: string };
  players: RoundStatePlayer[];
}

export interface RoundSummary {
  roundId: string;
  game: GameKind;
  status: RoundStatus;
  playerCount: number;
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
};

/** Phải khớp với server (apps/server/src/store/types.ts). */
export const MAX_PLAYERS = 5;

export const DURATION_MS: Record<GameKind, number> = {
  math: 90_000,
  draw: 15_000,
};
