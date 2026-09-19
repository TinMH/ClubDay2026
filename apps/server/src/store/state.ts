/**
 * View-model gửi cho client qua REST và SSE.
 *
 * HÌNH DẠNG nằm ở `@clubday/contract` — web đọc đúng kiểu đó, nên đổi shape là
 * TypeScript bắt lỗi ở cả hai bên ngay lập tức.
 */
import type { Round } from './types.js';
import { type RoundState } from '@clubday/contract';

export type { RoundState, RoundStatePlayer } from '@clubday/contract';

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
