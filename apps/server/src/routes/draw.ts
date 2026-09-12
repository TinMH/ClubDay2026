import type { FastifyInstance } from 'fastify';

/**
 * TRACK B — VẼ HÌNH NHANH.  ← file này thuộc Track B, Phase F chỉ tạo stub.
 *
 * Việc của Track B:
 *   1. import { registerStartHook } from '../store/lobby.js'
 *      → registerStartHook('draw', (round) => { round.target = pickTarget() })
 *   2. cài đặt POST /api/rounds/:id/frame  { playerId, seq, strokes, canvasW, canvasH }
 *      → client gửi TOẠ ĐỘ NÉT, không gửi ảnh; server tự rasterize 28×28.
 *
 * Hợp đồng: xem .hermes/plans/2026-09-12_201457-clubday-split-2-tracks.md mục 4.
 */
export async function drawRoutes(_app: FastifyInstance): Promise<void> {
  // TRACK B: implement ở đây. Đăng ký start hook ở đây luôn.
}
