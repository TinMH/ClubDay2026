/**
 * Vòng đời một lượt: lobby → playing → done.
 * Cả 2 track gọi vào đây; không track nào tự đổi trạng thái lượt.
 */
import type { GameKind, Player, Round } from './types.js';
import { DURATION_MS, MAX_PLAYERS } from './types.js';
import { addPlayer, allRounds, createRound, getRound, openRound, touch } from './store.js';

// ─────────────── hook khi bắt đầu lượt ───────────────
//
// Mỗi track tự đăng ký phần chuẩn bị của mình, nên KHÔNG track nào phải sửa file này:
//   TRACK A:  registerStartHook('math', (round, now) => { round.questions = generateQuestions(...) })
//   TRACK B:  registerStartHook('draw', (round) => { round.target = pickTarget() })
type StartHook = (round: Round, now: number) => void;
const startHooks = new Map<GameKind, StartHook>();

export function registerStartHook(game: GameKind, fn: StartHook): void {
  startHooks.set(game, fn);
}

// ─────────────── join ───────────────

export type JoinResult =
  | { ok: true; round: Round; player: Player }
  | { ok: false; code: 'NOT_FOUND' | 'ROUND_FULL' | 'ROUND_STARTED' };

/**
 * Cách A (không có roundId): tự vào lượt đang mở, hoặc tạo lượt mới nếu chưa có.
 * Cách B (có roundId):    vào đúng lượt chỉ định — dùng cho QR riêng từng khu vực.
 */
export function join(
  name: string,
  opts: { game?: GameKind; roundId?: string } = {},
  now = Date.now(),
): JoinResult {
  let round: Round;
  if (opts.roundId) {
    const found = getRound(opts.roundId);
    if (!found) return { ok: false, code: 'NOT_FOUND' };
    round = found;
  } else {
    round = openRound(opts.game ?? 'math', now);
  }

  // Chặn join sau khi bắt đầu → không ai bị thiếu giờ so với người khác.
  if (round.live === false) return { ok: false, code: 'ROUND_STARTED' };
  if (round.status !== 'lobby') return { ok: false, code: 'ROUND_STARTED' };
  if (round.players.size >= MAX_PLAYERS) return { ok: false, code: 'ROUND_FULL' };

  const player = addPlayer(round, name, now);
  return { ok: true, round, player };
}

// ─────────────── bắt đầu ───────────────

export type StartResult =
  | { ok: true; round: Round }
  | { ok: false; code: 'NOT_FOUND' | 'NOT_LOBBY' | 'EMPTY' };

/** BTC bấm BẮT ĐẦU. Cần ≥ 1 người, không có timeout tự động. */
export function startRound(roundId: string, now = Date.now()): StartResult {
  const round = getRound(roundId);
  if (!round) return { ok: false, code: 'NOT_FOUND' };
  if (round.live === false) return { ok: false, code: 'NOT_LOBBY' };
  if (round.status !== 'lobby') return { ok: false, code: 'NOT_LOBBY' };
  if (round.players.size === 0) return { ok: false, code: 'EMPTY' };

  round.startedAt = now;
  round.endsAt = now + DURATION_MS[round.game];
  round.status = 'playing';

  startHooks.get(round.game)?.(round, now);
  touch(round);
  return { ok: true, round };
}

/** BTC bỏ qua lượt đang chờ/dở → kết thúc ngay. */
export function skipRound(roundId: string, now = Date.now()): StartResult {
  const round = getRound(roundId);
  if (!round) return { ok: false, code: 'NOT_FOUND' };
  round.endsAt = now;
  round.status = 'done';
  for (const p of round.players.values()) p.finished = true;
  touch(round);
  return { ok: true, round };
}

// ─────────────── kết thúc ───────────────

function allPlayersFinished(round: Round): boolean {
  if (round.players.size === 0) return false;
  for (const p of round.players.values()) if (!p.finished) return false;
  return true;
}

/**
 * Chuyển lượt sang 'done' khi HẾT GIỜ hoặc MỌI NGƯỜI đã xong.
 *
 * Cả 2 track gọi hàm này sau mỗi thao tác của người chơi, NHƯNG không được ỷ lại vào nó:
 * đồng hồ nền `startRoundClock()` đảm bảo lượt vẫn kết thúc đúng giờ kể cả khi
 * không còn ai gửi request nào.
 *
 * @returns true nếu lượt vừa chuyển sang 'done'.
 */
export function syncRoundStatus(round: Round, now = Date.now()): boolean {
  if (round.status !== 'playing') return false;

  const timeUp = round.endsAt !== null && now > round.endsAt;
  if (!timeUp && !allPlayersFinished(round)) return false;

  round.status = 'done';
  for (const p of round.players.values()) p.finished = true;
  touch(round);
  return true;
}

/** Đồng hồ nền: quét mọi lượt đang chơi, kết thúc đúng giờ kể cả khi không có request. */
export function startRoundClock(intervalMs = 500): NodeJS.Timeout {
  const t = setInterval(() => {
    const now = Date.now();
    for (const round of allRounds()) syncRoundStatus(round, now);
  }, intervalMs);
  t.unref();
  return t;
}

export { createRound };
