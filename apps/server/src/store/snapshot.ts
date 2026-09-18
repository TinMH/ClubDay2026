/**
 * Ghi state ra JSON để không mất kết quả nếu server restart giữa sự kiện.
 *
 * Đây là lưới an toàn, KHÔNG phải database: lúc boot chỉ khôi phục để xem lại,
 * các lượt dở dang bị đánh dấu 'done' (đồng hồ của chúng đã trôi qua từ lâu).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Player, Round } from './types.js';
import { allRounds, restoreRound } from './store.js';

interface SerializedRound extends Omit<Round, 'players'> {
  players: Player[];
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
      for (const p of r.players) {
        // Field thêm sau thì snapshot cũ không có. Điền mặc định NGAY TẠI ĐÂY: chỗ
        // này spread JSON thẳng vào kiểu `Player`, không điền thì kiểu đó thành lời
        // nói dối và người đọc sau phải tự đoán `undefined` nghĩa là gì.
        players.set(p.id, {
          ...p,
          committed: p.committed ?? false,
          commitReason: p.commitReason ?? null,
          committedAt: p.committedAt ?? null,
          level: p.level ?? 1,
          levelSentAt: p.levelSentAt ?? 0,
          lastReplayAt: p.lastReplayAt ?? 0,
        });
      }
      // Đồng hồ của lượt cũ đã trôi qua → không thể tiếp tục, chỉ giữ để xem kết quả.
      restoreRound({
        ...r,
        players,
        sequence: r.sequence ?? null,
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
