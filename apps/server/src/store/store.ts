/**
 * "DATABASE" của dự án — toàn bộ state nằm trong RAM.
 *
 * Cố ý KHÔNG dùng SQLite/ORM: mỗi lượt chỉ 5 người, xem kết quả rồi thôi,
 * không cần truy vấn lịch sử. Xem plan v2 mục 0 để biết lý do.
 */
import type { GameKind, Player, Round } from './types.js';
import { MAX_PLAYERS_BY_GAME } from '../config.js';
import { newPlayerId, newRoundId } from '../lib/id.js';

const rounds = new Map<string, Round>();

/**
 * GAME ĐANG MỞ — mỗi thời điểm chỉ MỘT loại game được chơi.
 *
 * BTC chọn loại game ở trang /admin; người chơi không được tự chọn. Nhờ vậy cả
 * khu vực cùng chơi một trò, không có chuyện nửa hàng người chờ "Tính nhanh"
 * còn nửa kia đã nhảy sang "Vẽ hình".
 *
 * `null` = đang đóng, không cho ai vào lượt mới (giải lao giữa hai trò).
 */
let activeGame: GameKind | null = 'math';

/**
 * SỨC CHỨA từng trò, sống trong RAM như mọi thứ khác ở đây.
 *
 * Khởi đầu bằng giá trị trong `.env`, rồi BTC chỉnh trực tiếp ở /admin — giữa sự
 * kiện không ai muốn mở terminal sửa file rồi khởi động lại server. Khởi động
 * lại thì về lại giá trị `.env`, đúng như mọi state khác của app này.
 *
 * Đổi con số ở đây KHÔNG đụng tới lượt đã tạo: mỗi lượt chốt sức chứa của nó
 * lúc sinh ra (xem `Round.maxPlayers`).
 */
const maxPlayers: Record<GameKind, number> = { ...MAX_PLAYERS_BY_GAME };

/**
 * Trò được mở GẦN ĐÂY NHẤT — vẫn nhớ cả khi đang tạm đóng.
 *
 * Để màn hình BTC có nút "Mở lại <trò>" đối xứng với nút "Tạm đóng". Thiếu nó
 * thì đóng xong không còn đường quay lại nào ngoài việc tạo một lượt mới, mà
 * tạo lượt là một việc khác hẳn với mở lại.
 */
let lastGame: GameKind = 'math';
/** playerId -> roundId, để tra ngược nhanh. */
const playerIndex = new Map<string, string>();

type Listener = (round: Round) => void;
/** Mỗi lượt một kênh riêng — SSE subscribe vào đây. */
const listeners = new Map<string, Set<Listener>>();

// ─────────────────────────── đọc ───────────────────────────

export function getRound(id: string): Round | null {
  return rounds.get(id.toUpperCase()) ?? null;
}

export function getActiveGame(): GameKind | null {
  return activeGame;
}

/** Sức chứa hiện hành của từng trò — bản sao, người gọi sửa không ảnh hưởng store. */
export function getMaxPlayers(): Record<GameKind, number> {
  return { ...maxPlayers };
}

/**
 * BTC đổi sức chứa của một trò. Người gọi phải kiểm giá trị trước (route dùng zod).
 *
 * Chỉ ảnh hưởng lượt TẠO TỪ ĐÂY VỀ SAU — lượt đang chờ giữ nguyên luật của nó,
 * nếu không thì một lượt đang 3/3 bỗng thành 3/2 và hai người đã xếp hàng thành
 * thừa.
 */
/** Trò mở gần đây nhất — dùng cho nút "Mở lại" ở /admin. */
export function getLastGame(): GameKind {
  return lastGame;
}

export function setMaxPlayers(game: GameKind, value: number): void {
  maxPlayers[game] = value;
}

/**
 * Đổi game đang mở — CHỈ store ghi biến này.
 *
 * Dùng qua `selectActiveGame()` ở lobby.ts (nó còn đóng nốt các lượt của game cũ),
 * đừng gọi thẳng từ route.
 */
export function setActiveGame(game: GameKind | null): void {
  activeGame = game;
  if (game !== null) lastGame = game;
}

export function allRounds(): Round[] {
  return [...rounds.values()];
}

/** Tra ngược từ playerId ra lượt + người chơi. Dùng ở mọi route cần xác thực. */
export function findPlayer(playerId: string): { round: Round; player: Player } | null {
  const roundId = playerIndex.get(playerId);
  if (!roundId) return null;
  const round = rounds.get(roundId);
  const player = round?.players.get(playerId);
  return round && player ? { round, player } : null;
}

// ─────────────────────────── tạo ───────────────────────────

export function createRound(game: GameKind, now = Date.now()): Round {
  let id = newRoundId();
  while (rounds.has(id)) id = newRoundId();

  const round: Round = {
    id,
    game,
    status: 'lobby',
    createdAt: now,
    startedAt: null,
    endsAt: null,
    players: new Map(),
    maxPlayers: maxPlayers[game],
    math: { questions: null },
    draw: { target: null },
    memory: { sequence: null },
    version: 0,
    live: true,
  };
  rounds.set(id, round);
  // Tạo lượt cho game nào thì game đó thành game đang mở — BTC chỉ cần một thao tác.
  activeGame = game;
  lastGame = game;
  return round;
}

/**
 * "Lượt này còn nhận người không?" — ĐỊNH NGHĨA DUY NHẤT, cả hai hàm dưới dùng chung.
 *
 * Viết một lần chứ không chép hai lần: `peekOpenRound` là con số trang chủ hiện
 * ra, `openRound` là lượt người chơi thật sự rơi vào. Hai điều kiện lệch nhau
 * một chữ là hiện lượt này rồi đẩy họ sang lượt khác.
 *
 * Chỗ còn trống so với `r.maxPlayers` của CHÍNH lượt đó, không phải cấu hình
 * hiện tại — BTC đổi cấu hình giữa sự kiện thì lượt đang chờ giữ nguyên luật cũ.
 */
function hasRoom(r: Round, game: GameKind): boolean {
  return r.live !== false && r.game === game && r.status === 'lobby' && r.players.size < r.maxPlayers;
}

/**
 * Lượt đang mở còn chỗ, hoặc `null` nếu không có — KHÔNG tạo mới.
 *
 * Tách khỏi `openRound` để trang chủ hiện được "3/5 đang chờ" mà không vô tình
 * sinh ra một lượt rỗng chỉ vì có người mở trang.
 */
export function peekOpenRound(game: GameKind): Round | null {
  for (const r of rounds.values()) {
    if (hasRoom(r, game)) return r;
  }
  return null;
}

/** Lượt đang mở còn chỗ — dùng cho Cách A (1 QR duy nhất, tự vào lượt đang mở). */
export function openRound(game: GameKind, now = Date.now()): Round {
  return peekOpenRound(game) ?? createRound(game, now);
}

export function addPlayer(round: Round, name: string, now = Date.now()): Player {
  const player: Player = {
    id: newPlayerId(),
    name: name.trim().slice(0, 20) || 'Ẩn danh',
    joinedAt: now,
    score: 0,
    flagged: false,
    finished: false,
    correct: 0,
    wrong: 0,
    lastActionAt: 0,
    math: { streak: 0, qIndex: 0 },
    draw: {
      seq: 0,
      lastFrameAt: 0,
      solved: false,
      solvedAt: null,
      lastGuess: null,
      committed: false,
      commitReason: null,
      committedAt: null,
    },
    memory: { level: 1, levelSentAt: 0, lastReplayAt: 0 },
    spot: { level: 1, lastPickAt: 0 },
  };
  round.players.set(player.id, player);
  playerIndex.set(player.id, round.id);
  touch(round);
  return player;
}

// ───────────────────── thay đổi & thông báo ─────────────────────

/** Đánh dấu lượt đã đổi → version++ → SSE phát cho mọi client đang xem. */
export function touch(round: Round): void {
  round.version += 1;
  const subs = listeners.get(round.id);
  if (!subs) return;
  for (const fn of subs) {
    try {
      fn(round);
    } catch {
      /* một subscriber lỗi không được làm sập cả vòng phát */
    }
  }
}

export function subscribe(roundId: string, fn: Listener): () => void {
  const key = roundId.toUpperCase();
  let subs = listeners.get(key);
  if (!subs) {
    subs = new Set();
    listeners.set(key, subs);
  }
  subs.add(fn);
  return () => {
    subs.delete(fn);
    if (subs.size === 0) listeners.delete(key);
  };
}

// ───────────────────── dọn dẹp & khôi phục ─────────────────────

function removeRound(id: string): void {
  const r = rounds.get(id);
  if (!r) return;
  for (const pid of r.players.keys()) playerIndex.delete(pid);
  rounds.delete(id);
  listeners.delete(id);
}

/** Giữ RAM phẳng suốt sự kiện dài: bỏ lượt đã xong quá lâu và lượt khôi phục từ snapshot. */
export function pruneRounds(keepMs: number, now = Date.now()): void {
  for (const [id, r] of [...rounds]) {
    if (r.live === false) {
      removeRound(id); // khôi phục sau restart — chỉ để xem lại, không cần giữ
      continue;
    }
    const ref = r.endsAt ?? r.createdAt;
    if (r.status === 'done' && now - ref > keepMs) removeRound(id);
  }
}

export function startGc(keepMs = 2 * 60 * 60 * 1_000, intervalMs = 5 * 60 * 1_000): NodeJS.Timeout {
  const t = setInterval(() => pruneRounds(keepMs), intervalMs);
  t.unref();
  return t;
}

export function resetAll(): void {
  for (const r of rounds.values()) for (const pid of r.players.keys()) playerIndex.delete(pid);
  rounds.clear();
  activeGame = 'math';
  lastGame = 'math';
  Object.assign(maxPlayers, MAX_PLAYERS_BY_GAME);
}

/** Dùng khi khôi phục từ snapshot lúc boot. */
export function restoreRound(round: Round): void {
  rounds.set(round.id, round);
  for (const pid of round.players.keys()) playerIndex.set(pid, round.id);
}
