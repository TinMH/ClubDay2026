import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { registerHealth } from '../lib/health.js';
import { registerStartHook } from '../store/lobby.js';
import { findPlayer } from '../store/store.js';
import { classify, loadModel, modelState } from '../services/classifier.js';
import { submitFrame } from '../services/draw-session.js';
import { labelVi, pickTarget } from '../services/labels.js';

/**
 * TRACK B — VẼ HÌNH NHANH (API).
 *
 * Client gửi TOẠ ĐỘ NÉT, không bao giờ gửi ảnh. Server tự rasterize rồi tự nhận
 * diện — nên không có đường nào để đưa lên một tấm ảnh không phải do mình vẽ.
 *
 * File này Track B sở hữu hoàn toàn. Không sửa file nền tảng 🔒 nào.
 */

/** Trần số điểm cho một frame. PHẢI khớp `apps/web/src/lib/strokes.ts`. */
const MAX_POINTS_PER_FRAME = 2_000;
/** Trần số nét rời — người chơi chấm nhiều cái cũng tới vài chục nét, không hơn. */
const MAX_STROKES = 200;

const Point = z.tuple([z.number().finite(), z.number().finite()]);
const FrameBody = z.object({
  playerId: z.string().min(1).max(64),
  /** Phải TĂNG DẦN; server chặn frame gửi lại. Bắt đầu từ 1. */
  seq: z.number().int().min(1).max(100_000),
  // Chỉ để kiểm tra hợp lệ — rasterizer chuẩn hoá theo bounding box nên kích
  // thước canvas không ảnh hưởng kết quả nhận diện.
  canvasW: z.number().finite().positive().max(20_000),
  canvasH: z.number().finite().positive().max(20_000),
  strokes: z.array(z.array(Point).min(1).max(MAX_POINTS_PER_FRAME)).max(MAX_STROKES),
});

const CODE_STATUS: Record<string, number> = {
  NOT_PLAYING: 409,
  TIME_UP: 409,
  TOO_FAST: 429,
  SEQUENCE: 409,
  NO_TARGET: 500,
};

/** Tra người chơi và xác nhận họ thuộc ĐÚNG lượt này (không thì trả null). */
function locate(roundId: string, playerId: string) {
  const found = findPlayer(playerId);
  if (!found) return null;
  if (found.round.id.toUpperCase() !== roundId.toUpperCase()) return null;
  if (found.round.game !== 'draw') return null;
  return found;
}

export async function drawRoutes(app: FastifyInstance): Promise<void> {
  // BTC bấm BẮT ĐẦU → chọn từ khoá. Cả 5 người trong lượt vẽ CÙNG một hình, nếu
  // mỗi người một hình thì không so điểm được nữa.
  registerStartHook('draw', (round) => {
    round.target = pickTarget(round.id);
  });

  // Để /api/health cho biết model đã sẵn sàng chưa (loading / ready / error).
  registerHealth('model', () => modelState());

  // Nạp model ở NỀN ngay khi khởi động, KHÔNG chờ: server phải listen được ngay
  // lập tức, còn model cần ~700ms cộng warmup. Từ lúc bật server tới lúc người
  // chơi đầu tiên bấm BẮT ĐẦU luôn dài hơn thế rất nhiều.
  void loadModel().catch((err: unknown) => {
    app.log.error(
      `Không nạp được model nhận diện: ${err instanceof Error ? err.message : String(err)}`,
    );
  });

  /**
   * Nhận một frame vẽ và chấm ngay.
   * Điểm do server quyết định — xem services/draw-session.ts.
   */
  app.post('/api/rounds/:id/frame', async (req, reply) => {
    const { id } = req.params as { id: string };

    const parsed = FrameBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'BAD_REQUEST' });

    const located = locate(id, parsed.data.playerId);
    if (!located) return reply.code(404).send({ error: 'NOT_FOUND' });

    // zod giới hạn từng nét; tổng số điểm phải chặn riêng ở đây.
    let totalPoints = 0;
    for (const s of parsed.data.strokes) totalPoints += s.length;
    if (totalPoints > MAX_POINTS_PER_FRAME) {
      return reply.code(413).send({ error: 'TOO_MANY_POINTS' });
    }

    const { round, player } = located;
    const now = Date.now();

    let outcome;
    try {
      outcome = await submitFrame(
        round,
        player,
        { seq: parsed.data.seq, strokes: parsed.data.strokes },
        now,
        classify,
      );
    } catch (err) {
      // Model chưa nạp xong hoặc lỗi. Trả 503 để client thử lại ở frame sau,
      // TUYỆT ĐỐI không âm thầm cho điểm.
      req.log.error(
        `Nhận diện lỗi: ${err instanceof Error ? err.message : String(err)}`,
      );
      return reply.code(503).send({ error: 'MODEL_UNAVAILABLE', serverNow: now });
    }

    if (!outcome.ok) {
      return reply.code(CODE_STATUS[outcome.code] ?? 400).send({
        error: outcome.code,
        score: player.score,
        serverNow: now,
      });
    }

    return {
      matched: outcome.matched,
      // Kèm tên tiếng Việt để client hiện được "AI nghĩ: con mèo 62%".
      top: outcome.top.map((p) => ({
        label: p.label,
        labelVi: labelVi(p.label),
        score: p.score,
      })),
      score: outcome.score,
      solved: outcome.solved,
      seconds: outcome.seconds,
      endsAt: outcome.endsAt,
      serverNow: now,
    };
  });
}
