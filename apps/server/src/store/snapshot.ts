/**
 * Ghi state ra JSON để không mất kết quả nếu server restart giữa sự kiện.
 *
 * Đây là lưới an toàn, KHÔNG phải database: lúc boot chỉ khôi phục để xem lại,
 * các lượt dở dang bị đánh dấu 'done' (đồng hồ của chúng đã trôi qua từ lâu).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { MAX_PLAYERS, type Player, type Round } from './types.js';
import { allRounds, restoreRound } from './store.js';

interface SerializedRound extends Omit<Round, 'players'> {
  players: Player[];
}

/**
 * Điền mặc định cho những túi mà file snapshot không có.
 *
 * Snapshot là JSON thô đổ thẳng vào kiểu `Player`; thiếu một túi mà cứ nhận thì
 * kiểu đó thành lời nói dối, và chỗ đọc nó sau này nổ vì `undefined`.
 *
 * KHÔNG dịch ngược hình dạng phẳng đời trước (`p.streak`, `p.solved`, …). Lượt
 * khôi phục luôn bị đánh dấu `done` + `live: false` — nó chỉ để xem lại điểm, mà
 * điểm thì nằm ở `score` / `correct` / `wrong` ở cấp ngoài cùng và không đổi chỗ.
 * Viết cả một lớp dịch cho một lần deploy duy nhất là nuôi code chết.
 */
function restorePlayer(raw: Player): Player {
  return {
    ...raw,
    lastActionAt: raw.lastActionAt ?? 0,
    math: raw.math ?? { streak: 0, qIndex: 0 },
    draw: raw.draw ?? {
      seq: 0,
      lastFrameAt: 0,
      solved: false,
      solvedAt: null,
      lastGuess: null,
      committed: false,
      commitReason: null,
      committedAt: null,
    },
    memory: raw.memory ?? { level: 1, levelSentAt: 0, lastReplayAt: 0 },
    spot: raw.spot ?? { level: 1, lastPickAt: 0 },
  };
}

export function saveSnapshot(file: string): number {
  const rounds: SerializedRound[] = allRounds().map((r) => ({
    ...r,
    players: [...r.players.values()],
  }));
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify({ savedAt: Date.now(), rounds }, null, 0));
  return rounds.length;
}

export function loadSnapshot(file: string, now = Date.now()): number {
  if (!existsSync(file)) return 0;
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as { rounds?: SerializedRound[] };
    let count = 0;
    for (const r of parsed.rounds ?? []) {
      const players = new Map<string, Player>();
      for (const p of r.players) players.set(p.id, restorePlayer(p));
      // Đồng hồ của lượt cũ đã trôi qua → không thể tiếp tục, chỉ giữ để xem kết quả.
      restoreRound({
        ...r,
        players,
        // Snapshot cũ không có field này — lượt khôi phục chỉ để xem lại kết quả
        // nên con số chỉ dùng cho hiển thị.
        maxPlayers: r.maxPlayers ?? MAX_PLAYERS,
        math: r.math ?? { questions: null },
        draw: r.draw ?? { target: null },
        memory: r.memory ?? { sequence: null },
        status: 'done',
        endsAt: r.endsAt ?? now,
        live: false,
      });
      count += 1;
    }
    return count;
  } catch (err) {
    console.warn('Không đọc được snapshot, bỏ qua:', err instanceof Error ? err.message : err);
    return 0;
  }
}
