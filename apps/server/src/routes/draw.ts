import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { registerHealth } from '../lib/health.js';
import { registerEndHook, registerStartHook } from '../store/lobby.js';
import { findPlayer } from '../store/store.js';
import { classify, loadModel, modelState } from '../services/classifier.js';
import {
  SUBMIT_GRACE_MS,
  commitDrawing,
  finalizeStragglers,
  previewFrame,
} from '../services/draw-session.js';
import { labelVi, pickTarget } from '../services/labels.js';

/**
 * TRACK B — VẼ HÌNH NHANH (API).
 *
 * Client gửi TOẠ ĐỘ NÉT, không bao giờ gửi ảnh. Server tự rasterize rồi tự nhận
 * diện — nên không có đường nào để đưa lên một tấm ảnh không phải do mình vẽ.
 *
 * Hai đường vào, và chỉ MỘT trong hai sinh ra điểm:
 *   POST /api/rounds/:id/frame   → gợi ý ("AI nghĩ: …") theo từng giây, KHÔNG điểm
 *   POST /api/rounds/:id/submit  → NỘP BÀI, chấm đúng một lần
 * Hết giờ thì server tự gọi đường thứ hai cho những ai chưa bấm nút.
 *
 * File này Track B sở hữu hoàn toàn. Không sửa file nền tảng 🔒 nào.
 */

/** Trần số điểm cho một lần gửi. PHẢI khớp `apps/web/src/lib/strokes.ts`. */
const MAX_POINTS_PER_FRAME = 2_000;
/** Trần số nét rời — người chơi chấm nhiều cái cũng tới vài chục nét, không hơn. */
const MAX_STROKES = 200;

const Point = z.tuple([z.number().finite(), z.number().finite()]);
const Strokes = z.array(z.array(Point).min(1).max(MAX_POINTS_PER_FRAME)).max(MAX_STROKES);

const FrameBody = z.object({
  playerId: z.string().min(1).max(64),
  /** Phải TĂNG DẦN; server chặn frame gửi lại. Bắt đầu từ 1. */
  seq: z.number().int().min(1).max(100_000),
  // Chỉ để kiểm tra hợp lệ — rasterizer chuẩn hoá theo bounding box nên kích
  // thước canvas không ảnh hưởng kết quả nhận diện.
  canvasW: z.number().finite().positive().max(20_000),
  canvasH: z.number().finite().positive().max(20_000),
  strokes: Strokes,
});

const SubmitBody = z.object({
  playerId: z.string().min(1).max(64),
  /**
   * KHÔNG bắt buộc. Thiếu thì server chấm bằng nét vẽ gần nhất nó đã nhận được —
   * đúng đường đi của người chơi bị treo tab. Gửi `[]` là NỘP canvas trống thật,
   * và bị chấm 0 điểm.
   */
  strokes: Strokes.optional(),
});

const CODE_STATUS: Record<string, number> = {
  NOT_PLAYING: 409,
  TIME_UP: 409,
  TOO_FAST: 429,
  SEQUENCE: 409,
  NO_TARGET: 500,
};

/** Kèm tên tiếng Việt để client hiện được "AI nghĩ: con mèo 62%". */
function publicTop(top: { label: string; score: number }[]): unknown[] {
  return top.map((p) => ({ label: p.label, labelVi: labelVi(p.label), score: p.score }));
}

/** Tra người chơi và xác nhận họ thuộc ĐÚNG lượt này (không thì trả null). */
function locate(roundId: string, playerId: string) {
  const found = findPlayer(playerId);
  if (!found) return null;
  if (found.round.id.toUpperCase() !== roundId.toUpperCase()) return null;
  if (found.round.game !== 'draw') return null;
  return found;
}

/** Tổng số điểm vượt trần thì chặn — zod chỉ giới hạn được từng nét. */
function tooManyPoints(strokes: readonly (readonly unknown[])[]): boolean {
  let total = 0;
  for (const s of strokes) total += s.length;
  return total > MAX_POINTS_PER_FRAME;
}

export async function drawRoutes(app: FastifyInstance): Promise<void> {
  // BTC bấm BẮT ĐẦU → chọn từ khoá. Cả 5 người trong lượt vẽ CÙNG một hình, nếu
  // mỗi người một hình thì không so điểm được nữa.
  registerStartHook('draw', (round) => {
    round.target = pickTarget(round.id);
  });

  // Hết giờ → TỰ NỘP cho những ai chưa bấm nút.
  //
  // Đợi hết quãng ân hạn rồi mới chấm: bài nộp thật của client (bấm nút, hoặc tự
  // nộp lúc đồng hồ chạm 0) thường tới sau mốc hết giờ vài trăm ms — chấm trước
  // là cướp mất bài của họ và biến một hình rõ ràng thành 0 điểm.
  //
  // Lượt bị BTC BỎ QUA thì không đi qua đây: bỏ qua là huỷ lượt, xem `skipRound`.
  registerEndHook('draw', (round, now) => {
    const due = (round.endsAt ?? now) + SUBMIT_GRACE_MS;
    const timer = setTimeout(
      () => {
        void finalizeStragglers(round, Date.now(), classify).catch((err: unknown) => {
          app.log.error(`Tự nộp bài lỗi: ${err instanceof Error ? err.message : String(err)}`);
        });
      },
      Math.max(0, due - Date.now()) + 50,
    );
    timer.unref();
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
   * Nhận một frame vẽ và trả về GỢI Ý.
   *
   * KHÔNG chấm điểm: trước đây hễ model đọc ra hình đúng là cộng điểm ngay, nên
   * người chơi đang vẽ dở cũng bị "thắng" mà không hiểu vì sao. Điểm chỉ sinh ra
   * ở `/submit`. Xem services/draw-session.ts.
   */
  app.post('/api/rounds/:id/frame', async (req, reply) => {
    const { id } = req.params as { id: string };

    const parsed = FrameBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'BAD_REQUEST' });

    const located = locate(id, parsed.data.playerId);
    if (!located) return reply.code(404).send({ error: 'NOT_FOUND' });

    if (tooManyPoints(parsed.data.strokes)) {
      return reply.code(413).send({ error: 'TOO_MANY_POINTS' });
    }

    const { round, player } = located;
    const now = Date.now();

    let outcome;
    try {
      outcome = await previewFrame(
        round,
        player,
        { seq: parsed.data.seq, strokes: parsed.data.strokes },
        now,
        classify,
      );
    } catch (err) {
      // Model chưa nạp xong hoặc lỗi. Trả 503 để client thử lại ở frame sau,
      // TUYỆT ĐỐI không âm thầm cho điểm.
      req.log.error(`Nhận diện lỗi: ${err instanceof Error ? err.message : String(err)}`);
      return reply.code(503).send({ error: 'MODEL_UNAVAILABLE', serverNow: now });
    }

    if (!outcome.ok) {
      return reply.code(CODE_STATUS[outcome.code] ?? 400).send({
        error: outcome.code,
        score: player.score,
        committed: player.committed,
        serverNow: now,
      });
    }

    return {
      /** GỢI Ý, không phải kết quả — điểm không phụ thuộc giá trị này. */
      hint: outcome.hint,
      top: publicTop(outcome.top),
      score: outcome.score,
      seconds: outcome.seconds,
      endsAt: outcome.endsAt,
      serverNow: now,
    };
  });

  /**
   * NỘP BÀI — chấm điểm, đúng một lần cho mỗi người.
   *
   * Gọi từ hai phía: người chơi bấm nút, và client tự gọi lúc đồng hồ chạm 0.
   * Ai không gọi được (treo tab, mất mạng) thì hook kết thúc lượt tự nộp hộ.
   *
   * Nộp lại lần nữa KHÔNG chấm lại: server trả về đúng kết quả cũ kèm
   * `already: true`, nên client bấm đúp hay mạng bắn lại cũng không đổi điểm.
   */
  app.post('/api/rounds/:id/submit', async (req, reply) => {
    const { id } = req.params as { id: string };

    const parsed = SubmitBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'BAD_REQUEST' });

    const located = locate(id, parsed.data.playerId);
    if (!located) return reply.code(404).send({ error: 'NOT_FOUND' });

    const { strokes } = parsed.data;
    if (strokes && tooManyPoints(strokes)) {
      return reply.code(413).send({ error: 'TOO_MANY_POINTS' });
    }

    const { round, player } = located;
    const now = Date.now();

    let outcome;
    try {
      outcome = await commitDrawing(
        round,
        player,
        strokes ? { strokes } : {},
        now,
        classify,
      );
    } catch (err) {
      req.log.error(`Chấm bài lỗi: ${err instanceof Error ? err.message : String(err)}`);
      // Chưa chấm được thì người chơi VẪN còn quyền nộp lại (committed = false).
      return reply.code(503).send({ error: 'MODEL_UNAVAILABLE', serverNow: now });
    }

    if (!outcome.ok) {
      return reply.code(CODE_STATUS[outcome.code] ?? 400).send({
        error: outcome.code,
        score: player.score,
        committed: player.committed,
        serverNow: now,
      });
    }

    return {
      committed: true,
      /** true = bài đã được chấm từ trước, lần này không chấm lại. */
      already: outcome.already,
      reason: outcome.reason,
      matched: outcome.matched,
      top: publicTop(outcome.top),
      score: outcome.score,
      seconds: outcome.seconds,
      endsAt: outcome.endsAt,
      serverNow: now,
    };
  });
}
