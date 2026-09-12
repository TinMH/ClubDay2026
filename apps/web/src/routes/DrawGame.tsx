import type { GameProps } from '../lib/types';

/**
 * TRACK B — VẼ HÌNH NHANH.  ← file này thuộc Track B.
 *
 * Việc của Track B ở đây:
 *   - hiển thị từ khoá cần vẽ: state.target.labelVi
 *   - canvas vẽ (dùng <DrawCanvas/>, class 'draw-canvas' đã có touch-action:none)
 *   - gửi frame mỗi 1000ms: POST /api/rounds/:id/frame { playerId, seq, strokes, canvasW, canvasH }
 *   - hiện "AI nghĩ: <label> <score>%" từ response
 *   - khi server trả matched=true → màn hình thắng
 *
 * `state` được cập nhật realtime qua SSE — không cần tự poll.
 */
export function DrawGame({ roundId, playerId, state }: GameProps) {
  return (
    <div className="rounded-xl border border-dashed border-white/20 p-6 text-center">
      <p className="text-lg font-semibold">Vẽ hình nhanh</p>
      <p className="mt-1 text-sm text-muted">Track B implement màn hình này.</p>
      <p className="mt-2 text-sm">
        Từ khoá: <span className="font-semibold">{state.target?.labelVi ?? '(chưa chọn)'}</span>
      </p>
      <pre className="mt-4 overflow-x-auto rounded-lg bg-black/30 p-3 text-left text-xs text-muted">
        {JSON.stringify(
          { roundId, playerId, status: state.status, target: state.target ?? null },
          null,
          2,
        )}
      </pre>
    </div>
  );
}
