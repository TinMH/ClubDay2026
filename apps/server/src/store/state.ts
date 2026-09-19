/**
 * View-model gửi cho client qua REST và SSE.
 * Hợp đồng đóng băng — đổi shape ở đây là đổi cả 2 track.
 */
import type { GameKind, Round, RoundStatus } from './types.js';

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

export function toRoundState(round: Round, now = Date.now()): RoundState {
  const state: RoundState = {
    roundId: round.id,
    game: round.game,
    status: round.status,
    serverNow: now,
    startedAt: round.startedAt,
    endsAt: round.endsAt,
    maxPlayers: round.maxPlayers,
    players: [...round.players.values()].map((p) => ({
      id: p.id,
      name: p.name,
      score: p.score,
      finished: p.finished,
    })),
  };
  if (round.game === 'draw' && round.target) {
    state.target = { id: round.target.id, labelVi: round.target.labelVi };
  }
  return state;
}
