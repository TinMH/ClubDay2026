import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { join, startRound } from '../store/lobby.js';
import { getMaxPlayers, getRound, peekOpenRound } from '../store/store.js';
import { dashboard } from '../store/dashboard.js';
import { toRoundState } from '../store/state.js';
import { GAME_KINDS } from '../store/types.js';
import { requireAdmin } from './admin-guard.js';

/**
 * KHÔNG có trường `game`: loại trò do BTC chọn ở /admin, người chơi chỉ gửi tên
 * (và mã lượt nếu quét QR riêng khu vực).
 */
const JoinBody = z.object({
  name: z.string().trim().min(1).max(20),
  roundId: z.string().trim().length(6).optional(),
});

/** Mã lỗi nghiệp vụ → HTTP status. */
const STATUS: Record<string, number> = {
  NOT_FOUND: 404,
  ROUND_FULL: 409,
  ROUND_STARTED: 409,
  NOT_LOBBY: 409,
  EMPTY: 409,
  GAME_CLOSED: 409,
};

export async function roundRoutes(app: FastifyInstance): Promise<void> {
  /**
   * Vào lượt.
   *   - Không có `roundId` → Cách A: tự vào lượt đang mở (hoặc tạo nếu chưa có).
   *   - Có `roundId`       → Cách B: vào đúng lượt (QR riêng từng khu vực).
   */
  app.post('/api/rounds/join', async (req, reply) => {
    const parsed = JoinBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'BAD_REQUEST' });

    const result = join(parsed.data.name, {
      ...(parsed.data.roundId ? { roundId: parsed.data.roundId } : {}),
    });

    if (!result.ok) {
      return reply.code(STATUS[result.code] ?? 400).send({ error: result.code });
    }
    return {
      playerId: result.player.id,
      roundId: result.round.id,
      game: result.round.game,
      state: toRoundState(result.round),
    };
  });

  /**
   * Lượt đang chờ của từng game — để trang chủ hiện "3/5 đang chờ".
   *
   * CÔNG KHAI, không cần token: người chơi cần thấy trước khi nhập tên, và
   * thông tin ở đây họ vốn đã lấy được bằng cách cứ join thử.
   *
   * Dùng `peekOpenRound` nên KHÔNG tạo lượt mới chỉ vì có người mở trang, và
   * con số trả về đúng là lượt mà `join` sẽ đưa họ vào.
   */
  app.get('/api/rounds/open', async () => {
    const open: Record<string, { roundId: string; players: number } | null> = {};
    for (const game of GAME_KINDS) {
      const r = peekOpenRound(game);
      open[game] = r ? { roundId: r.id, players: r.players.size } : null;
    }
    // `max` theo TỪNG trò: sức chứa mỗi trò một khác (xem MAX_PLAYERS_BY_GAME).
    return { open, max: getMaxPlayers(), serverNow: Date.now() };
  });

  /** Trạng thái lượt — client poll khi cần, hoặc dùng SSE. */
  app.get('/api/rounds/:id/state', async (req, reply) => {
    const { id } = req.params as { id: string };
    const round = getRound(id);
    if (!round) return reply.code(404).send({ error: 'NOT_FOUND' });
    return toRoundState(round);
  });

  /** Bảng hạng của đúng 5 người trong lượt. */
  app.get('/api/rounds/:id/dashboard', async (req, reply) => {
    const { id } = req.params as { id: string };
    const round = getRound(id);
    if (!round) return reply.code(404).send({ error: 'NOT_FOUND' });
    return { roundId: round.id, game: round.game, status: round.status, rows: dashboard(round) };
  });

  /**
   * BTC bấm BẮT ĐẦU. Cần ≥ 1 người trong lượt.
   *
   * `requireAdmin` là chốt chặn duy nhất và là chốt chặn thật: người chơi có mở
   * DevTools gọi thẳng endpoint này cũng nhận 401. Nút BẮT ĐẦU ở phòng chờ chỉ
   * là lối tắt cho máy BTC, không phải thứ quyết định quyền.
   */
  app.post('/api/rounds/:id/start', { preHandler: requireAdmin }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const result = startRound(id);
    if (!result.ok) return reply.code(STATUS[result.code] ?? 400).send({ error: result.code });
    return { ok: true, state: toRoundState(result.round) };
  });
}
