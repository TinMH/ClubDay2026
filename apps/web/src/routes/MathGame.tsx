import type { GameProps } from '../lib/types';

/**
 * TRACK A — TÍNH NHANH.  ← file này thuộc Track A.
 *
 * Việc của Track A ở đây:
 *   - hiển thị phép toán + ô nhập đáp án (inputMode="numeric", Enter để gửi)
 *   - gọi POST /api/rounds/:id/answer { playerId, idx, value }
 *   - hiện điểm / streak; hết giờ thì Play.tsx tự chuyển sang Dashboard
 *   - KHÔNG tự tính điểm: server trả về `score` sau mỗi câu
 *
 * `state` được cập nhật realtime qua SSE — không cần tự poll.
 */
export function MathGame({ roundId, playerId, state }: GameProps) {
  return (
    <div className="rounded-xl border border-dashed border-white/20 p-6 text-center">
      <p className="text-lg font-semibold">Tính nhanh</p>
      <p className="mt-1 text-sm text-muted">Track A implement màn hình này.</p>
      <pre className="mt-4 overflow-x-auto rounded-lg bg-black/30 p-3 text-left text-xs text-muted">
        {JSON.stringify(
          { roundId, playerId, status: state.status, playerCount: state.players.length },
          null,
          2,
        )}
      </pre>
    </div>
  );
}
