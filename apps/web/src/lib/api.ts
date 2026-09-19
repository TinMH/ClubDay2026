import { getJson as get, postJson as json, request } from './http';
import type { DashboardRow, GameKind, RoundState, RoundSummary } from './types';

/**
 * Phần gọi HTTP nằm ở `lib/http.ts` và dùng chung cho mọi file api-*.
 *
 * Tái xuất ở đây vì màn hình nào cũng đang `import { ApiError } from '../lib/api'`
 * — đổi hết đường import chỉ để dịch chỗ một class là churn không đổi lấy gì.
 */
export { ApiError, serverNow, syncClock } from './http';

export interface ClientConfig {
  signupFormUrl: string;
  signupNameEntry: string;
  /** Trò BTC đang mở. `null` = đang đóng, chưa cho vào lượt mới. */
  activeGame: GameKind | null;
  /** Số người tối đa mỗi lượt, theo từng trò. */
  maxPlayers: Record<GameKind, number>;
}

/** `null` = game đó chưa có lượt nào đang chờ. */
export interface OpenRounds {
  open: Record<GameKind, { roundId: string; players: number } | null>;
  /** Sức chứa mỗi trò một khác → tra theo game, đừng dùng một con số chung. */
  max: Record<GameKind, number>;
}

export interface JoinResponse {
  playerId: string;
  roundId: string;
  game: GameKind;
  state: RoundState;
}

export const api = {
  /**
   * Vào lượt. KHÔNG có `game`: loại trò do BTC chọn ở /admin, server quyết định —
   * client gửi lên cũng không đổi được trò đang chạy.
   */
  join: (name: string, opts: { roundId?: string } = {}) =>
    request<JoinResponse>(
      '/api/rounds/join',
      json({ name, ...(opts.roundId ? { roundId: opts.roundId } : {}) }),
    ),

  state: (roundId: string) => get<RoundState>(`/api/rounds/${roundId}/state`),

  /** Cấu hình công khai (link Form đăng ký). Không chứa gì bí mật. */
  config: () => get<ClientConfig>('/api/config'),

  /** Lượt đang chờ của từng game — trang chủ hiện "3/5 đang chờ". */
  openRounds: () => get<OpenRounds>('/api/rounds/open'),

  dashboard: (roundId: string) =>
    get<{ rows: DashboardRow[] }>(`/api/rounds/${roundId}/dashboard`),

  /** BTC: bắt đầu lượt. */
  startRound: (roundId: string, token: string) =>
    request<{ ok: true }>(`/api/rounds/${roundId}/start`, json({}, token)),

  /** BTC: tạo lượt mới với game chỉ định. */
  createRound: (game: GameKind, token: string) =>
    request<{ roundId: string }>('/api/admin/rounds', json({ game }, token)),

  listRounds: (token: string) =>
    get<{
      activeGame: GameKind | null;
      maxPlayers: Record<GameKind, number>;
      rounds: RoundSummary[];
    }>('/api/admin/rounds', token),

  /** BTC: đổi số người mỗi lượt của một trò. Áp cho lượt tạo từ đây về sau. */
  setMaxPlayers: (game: GameKind, value: number, token: string) =>
    request<{ maxPlayers: Record<GameKind, number> }>(
      '/api/admin/max-players',
      json({ game, value }, token),
    ),

  /** BTC: chọn trò được chơi lúc này (`null` = tạm đóng). */
  setActiveGame: (game: GameKind | null, token: string) =>
    request<{ activeGame: GameKind | null; closed: string[] }>(
      '/api/admin/active-game',
      json({ game }, token),
    ),

  skipRound: (roundId: string, token: string) =>
    request<{ ok: true }>(`/api/admin/rounds/${roundId}/skip`, json({}, token)),
};
