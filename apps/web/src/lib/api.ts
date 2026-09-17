import type { DashboardRow, GameKind, RoundState, RoundSummary } from './types';

// ── bù lệch đồng hồ ──
// Máy người chơi có thể lệch giờ so với server. Mọi response đều mang `serverNow`,
// nên ta tính offset một lần rồi quy đổi. Nhờ vậy đồng hồ đếm ngược luôn khớp server.
let clockOffset = 0;

export function serverNow(): number {
  return Date.now() + clockOffset;
}

export function syncClock(serverTime: number): void {
  clockOffset = serverTime - Date.now();
}

export class ApiError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
  ) {
    super(code);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  const text = await res.text();
  const data: unknown = text ? JSON.parse(text) : null;

  if (!res.ok) {
    const code =
      data && typeof data === 'object' && 'error' in data
        ? String((data as { error: unknown }).error)
        : 'HTTP_ERROR';
    throw new ApiError(code, res.status);
  }

  // Mọi payload từ server đều có serverNow → đồng bộ lại đồng hồ.
  if (data && typeof data === 'object' && 'serverNow' in data) {
    syncClock(Number((data as { serverNow: unknown }).serverNow));
  }
  return data as T;
}

const json = (body: unknown, token?: string): RequestInit => ({
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    ...(token ? { 'x-admin-token': token } : {}),
  },
  body: JSON.stringify(body),
});

const get = <T>(path: string, token?: string): Promise<T> =>
  request<T>(path, token ? { headers: { 'x-admin-token': token } } : undefined);

export interface ClientConfig {
  signupFormUrl: string;
  signupNameEntry: string;
}

export interface JoinResponse {
  playerId: string;
  roundId: string;
  game: GameKind;
  state: RoundState;
}

export const api = {
  join: (name: string, roundId?: string) =>
    request<JoinResponse>('/api/rounds/join', json({ name, ...(roundId ? { roundId } : {}) })),

  state: (roundId: string) => get<RoundState>(`/api/rounds/${roundId}/state`),

  /** Cấu hình công khai (link Form đăng ký). Không chứa gì bí mật. */
  config: () => get<ClientConfig>('/api/config'),

  dashboard: (roundId: string) =>
    get<{ rows: DashboardRow[] }>(`/api/rounds/${roundId}/dashboard`),

  /** BTC: bắt đầu lượt. */
  startRound: (roundId: string, token: string) =>
    request<{ ok: true }>(`/api/rounds/${roundId}/start`, json({}, token)),

  /** BTC: tạo lượt mới với game chỉ định. */
  createRound: (game: GameKind, token: string) =>
    request<{ roundId: string }>('/api/admin/rounds', json({ game }, token)),

  listRounds: (token: string) => get<{ rounds: RoundSummary[] }>('/api/admin/rounds', token),

  skipRound: (roundId: string, token: string) =>
    request<{ ok: true }>(`/api/admin/rounds/${roundId}/skip`, json({}, token)),
};
