import { useEffect, useRef, useState } from 'react';
import { DrawCanvas, type DrawCanvasHandle } from '../components/DrawCanvas';
import { ApiError } from '../lib/api';
import { drawApi, type PublicPrediction } from '../lib/api-draw';
import { StrokeRecorder } from '../lib/strokes';
import type { GameProps } from '../lib/types';

/**
 * TRACK B — VẼ HÌNH NHANH (màn hình).
 *
 * Điểm hiển thị ở đầu màn hình do Play.tsx vẽ từ SSE; ở đây chỉ quản lý nét vẽ,
 * việc gửi frame, và phản hồi của AI.
 *
 * Không tự tính điểm và không tự quyết định thắng: mọi con số đến từ server.
 */

/**
 * Chu kỳ gửi frame.
 *
 * KHÔNG dùng đúng 1000ms dù server cho phép 1 frame/giây: server đo khoảng cách
 * theo GIỜ NHẬN, mà độ trễ mạng dao động vài chục ms, nên 1000ms sẽ thỉnh
 * thoảng bị 429 TOO_FAST và mất một lượt nhận diện. 50ms biên là quá đủ.
 */
const FRAME_INTERVAL_MS = 1050;

export function DrawGame({ roundId, playerId, state }: GameProps) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<DrawCanvasHandle | null>(null);

  // Bộ ghi nét sống ngoài React state: nó thay đổi ở mỗi pointermove (60–120
  // lần/giây), đưa vào state là re-render liên tục không cần thiết.
  const recorder = useRef(new StrokeRecorder()).current;

  const seqRef = useRef(0);
  const inflightRef = useRef(false);
  const solvedRef = useRef(false);

  const [guess, setGuess] = useState<PublicPrediction | null>(null);
  const [result, setResult] = useState<{ score: number; seconds: number } | null>(null);
  const [error, setError] = useState('');

  const target = state.target;
  const playing = state.status === 'playing';
  const me = state.players.find((p) => p.id === playerId);
  // Người chơi có thể đã thắng ở tab khác (hoặc ở lần tải trang trước).
  const won = result !== null || solvedRef.current || me?.finished === true;

  useEffect(() => {
    if (!playing || !playerId || !target || won) return;

    let alive = true;

    const tick = async (): Promise<void> => {
      // Không gửi chồng: mạng chậm mà vẫn bắn tiếp thì chỉ xếp hàng ở server.
      if (inflightRef.current) return;
      // Canvas trống thì không tốn một vòng request nào.
      if (recorder.isEmpty) return;

      const box = wrapperRef.current;
      const w = box?.clientWidth ?? 300;
      const h = box?.clientHeight ?? 300;

      inflightRef.current = true;
      seqRef.current += 1;

      try {
        const res = await drawApi.frame(
          roundId,
          playerId,
          seqRef.current,
          recorder.payload(),
          w,
          h,
        );
        if (!alive) return;

        setGuess(res.top[0] ?? null);
        setError('');

        if (res.matched) {
          solvedRef.current = true;
          setResult({ score: res.score, seconds: res.seconds });
        }
      } catch (err) {
        if (!alive) return;

        if (err instanceof ApiError) {
          // Gửi hơi sớm: bỏ qua im lặng, tick sau gửi lại. Người chơi không cần biết.
          if (err.code === 'TOO_FAST') return;
          // Lượt đã hết hoặc đã đóng: SSE sẽ chuyển màn hình.
          if (err.code === 'TIME_UP' || err.code === 'NOT_PLAYING') return;
          // Frame cũ bị chặn: tick sau với seq cao hơn sẽ qua.
          if (err.code === 'SEQUENCE') return;
          if (err.code === 'MODEL_UNAVAILABLE') {
            setError('AI đang khởi động, chờ chút…');
            return;
          }
        }
        setError('Không gửi được nét vẽ, thử lại.');
      } finally {
        inflightRef.current = false;
      }
    };

    const timer = setInterval(() => void tick(), FRAME_INTERVAL_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [playing, playerId, target, roundId, won, recorder]);

  if (!target) {
    return <p className="py-10 text-center text-muted">Lượt này chưa có từ khoá.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border-2 border-brand/40 bg-brand/10 px-4 py-5 text-center">
        <p className="text-sm text-muted">Hãy vẽ</p>
        <p className="text-4xl font-bold">{target.labelVi}</p>
      </div>

      {result ? (
        <div className="rounded-2xl border-2 border-correct/60 bg-correct/10 px-4 py-6 text-center">
          <p className="text-2xl font-bold text-correct">AI đã nhận ra! 🎉</p>
          <p className="mt-2 text-lg">
            +<span className="font-bold tabular-nums">{result.score}</span> điểm
            <span className="ml-2 text-sm text-muted">({result.seconds} giây)</span>
          </p>
          <p className="mt-1 text-sm text-muted">Chờ những người khác vẽ xong…</p>
        </div>
      ) : (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted">
            {guess ? (
              <>
                AI nghĩ:{' '}
                <span className="font-semibold text-paper">{guess.labelVi}</span>{' '}
                <span className="tabular-nums">{Math.round(guess.score * 100)}%</span>
              </>
            ) : (
              'AI chưa thấy gì — hãy vẽ to và rõ'
            )}
          </span>
          <button
            type="button"
            onClick={() => canvasRef.current?.clear()}
            disabled={!playing}
            className="rounded-lg border border-white/15 px-3 py-1 text-xs text-muted transition hover:border-white/30 hover:text-paper disabled:opacity-30"
          >
            Xoá hết
          </button>
        </div>
      )}

      <div
        ref={wrapperRef}
        className="h-[46vh] min-h-[260px] w-full overflow-hidden rounded-xl border border-white/10"
      >
        <DrawCanvas ref={canvasRef} recorder={recorder} disabled={!playing || won} />
      </div>

      {error && <p className="text-center text-sm text-warn">{error}</p>}

      {/* Gợi ý cho người chơi biết vì sao bị đánh giá là sai. */}
      {!result && guess && guess.score < 0.5 && (
        <p className="text-center text-xs text-muted">
          Vẽ to hơn, một nét liền, đừng nhấc tay giữa chừng.
        </p>
      )}
    </div>
  );
}
