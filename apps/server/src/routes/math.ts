import type { FastifyInstance } from 'fastify';

/**
 * TRACK A — TÍNH NHANH.  ← file này thuộc Track A, Phase F chỉ tạo stub.
 *
 * Việc của Track A:
 *   1. import { registerStartHook } from '../store/lobby.js'
 *      → registerStartHook('math', (round) => { round.questions = generateQuestions(...) })
 *   2. cài đặt POST /api/rounds/:id/answer  { playerId, idx, value }
 *      → KHÔNG được có field `score` trong request; server tự đếm.
 *
 * Hợp đồng: xem .hermes/plans/2026-09-12_201457-clubday-split-2-tracks.md mục 4.
 */
export async function mathRoutes(_app: FastifyInstance): Promise<void> {
  // TRACK A: implement ở đây. Đăng ký start hook ở đây luôn.
}
