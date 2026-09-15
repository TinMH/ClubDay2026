import { useCallback, useEffect, useRef, useState } from 'react';
import { DrawCanvas, type DrawCanvasHandle } from '../components/DrawCanvas';
import { ApiError } from '../lib/api';
import { drawApi, type PublicPrediction } from '../lib/api-draw';
import { StrokeRecorder } from '../lib/strokes';
import { useCountdown } from '../lib/useCountdown';
import type { GameProps } from '../lib/types';

/**
 * TRACK B — VẼ HÌNH NHANH (màn hình).
 *
 * Người chơi vẽ tự do trong 15 giây. Mỗi giây client gửi một frame để lấy GỢI Ý
 * ("AI nghĩ: …") — gợi ý KHÔNG cho điểm. Trước đây hễ model đọc ra hình đúng là
 * cộng điểm ngay, nên người đang vẽ dở cũng bị tính là đã thắng.
 *
 * Điểm chỉ đến từ đúng một chỗ: `drawApi.submit()`, gọi khi người chơi bấm NỘP
 * BÀI hoặc khi đồng hồ chạm 0. Ở đây không tự tính điểm và không tự quyết định
 * thắng — mọi con số đều từ server.
 */

/**
 * Chu kỳ gửi frame.
 *
 * KHÔNG dùng đúng 1000ms dù server cho phép 1 frame/giây: server đo khoảng cách
 * theo GIỜ NHẬN, mà độ trễ mạng dao động vài chục ms, nên 1000ms sẽ thỉnh
 * thoảng bị 429 TOO_FAST và mất một lượt nhận diện. 50ms biên là quá đủ.
 */
const FRAME_INTERVAL_MS = 1050;

/** Kết quả NỘP BÀI — giữ lại để vẽ màn hình kết quả. */
interface Commit {
  score: number;
  seconds: number;
  matched: boolean;
  reason: 'button' | 'timeout';
}

export function DrawGame({ roundId, playerId, state }: GameProps) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<DrawCanvasHandle | null>(null);

  // Bộ ghi nét sống ngoài React state: nó thay đổi ở mỗi pointermove (60–120
  // lần/giây), đưa vào state là re-render liên tục không cần thiết.
  const recorder = useRef(new StrokeRecorder()).current;

  const seqRef = useRef(0);
  const inflightRef = useRef(false);
  /** Đã bắn request NỘP chưa — chặn bấm đúp, và chặn tự nộp chồng lên bài nộp tay. */
  const submittedRef = useRef(false);

  const [guess, setGuess] = useState<PublicPrediction | null>(null);
  /** Model đang đọc ra đúng từ khoá. GỢI Ý, không phải kết quả. */
  const [hint, setHint] = useState(false);
  const [commit, setCommit] = useState<Commit | null>(null);
  const [hasInk, setHasInk] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const target = state.target;
  const playing = state.status === 'playing';
  const me = state.players.find((p) => p.id === playerId);
  // Người chơi có thể đã nộp ở tab khác, hoặc nộp xong rồi mới tải lại trang.
  const finished = commit !== null || me?.finished === true;
  const remaining = useCountdown(state.endsAt);

  /**
   * NỘP BÀI và chấm điểm. Gọi từ hai chỗ: nút bấm, và đồng hồ chạm 0.
   *
   * Không gửi điểm lên — chỉ gửi nét vẽ. Server tự rasterize, tự nhận diện, tự
   * tính điểm từ đồng hồ của nó.
   */
  const submit = useCallback(async (): Promise<void> => {
    if (submittedRef.current || !playerId) return;
    submittedRef.current = true;
    setSending(true);

    try {
      // Canvas trắng thì KHÔNG gửi nét: để server chấm bằng nét cuối cùng nó đã
      // nhận được. Gửi mảng rỗng ở đây là tự biến bài đang vẽ dở thành 0 điểm.
      const strokes = recorder.isEmpty ? undefined : recorder.payload();
      const res = await drawApi.submit(roundId, playerId, strokes);
      setCommit({
        score: res.score,
        seconds: res.seconds,
        matched: res.matched,
        reason: res.reason,
      });
      setError('');
    } catch (err) {
      // Lỗi thì VẪN còn quyền nộp lại — server cũng chưa đánh dấu là đã nộp.
      submittedRef.current = false;

      if (err instanceof ApiError && (err.code === 'TIME_UP' || err.code === 'NOT_PLAYING')) {
        // Quá giờ: server đã tự nộp hộ, điểm sẽ hiện ở bảng điểm.
        setError('Hết giờ rồi — điểm sẽ hiện ở bảng điểm.');
        return;
      }
      if (err instanceof ApiError && err.code === 'MODEL_UNAVAILABLE') {
        setError('AI đang khởi động, bấm nộp lại nhé…');
        return;
      }
      setError('Không nộp được bài, thử lại.');
    } finally {
      setSending(false);
    }
  }, [playerId, recorder, roundId]);

  // HẾT GIỜ → TỰ NỘP. Đồng hồ đếm ngược chạm 0 đúng mốc server quy định, nên gửi
  // ngay lúc đó để những nét vẽ cuối cùng còn kịp tới server. (Ai treo tab thì
  // server tự nộp hộ ở phía nó — xem services/draw-session.ts.)
  useEffect(() => {
    if (!playing || !playerId || !target) return;
    if (remaining > 0) return;
    void submit();
  }, [playing, playerId, target, remaining, submit]);

  // Vòng gửi frame để lấy gợi ý. KHÔNG cho điểm — chỉ để hiện "AI nghĩ: …".
  useEffect(() => {
    if (!playing || !playerId || !target || finished) return;

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
        setHint(res.hint);
        setError('');
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
  }, [playing, playerId, target, roundId, finished, recorder]);

  if (!target) {
    return <p className="py-10 text-center text-muted">Lượt này chưa có từ khoá.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border-2 border-brand/40 bg-brand/10 px-4 py-5 text-center">
        <p className="text-sm text-muted">Hãy vẽ</p>
        <p className="text-4xl font-bold">{target.labelVi}</p>
      </div>

      {finished ? (
        <ResultPanel commit={commit} fallbackScore={me?.score ?? 0} />
      ) : (
        <>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted">
              {hint ? (
                <>
                  AI đã nhận ra{' '}
                  <span className="font-semibold text-correct">{target.labelVi}</span> — nộp
                  được rồi!
                </>
              ) : guess ? (
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

          <div
            ref={wrapperRef}
            className="h-[46vh] min-h-[260px] w-full overflow-hidden rounded-xl border border-white/10"
          >
            <DrawCanvas
              ref={canvasRef}
              recorder={recorder}
              disabled={!playing}
              onInkChange={setHasInk}
            />
          </div>

          <button
            type="button"
            onClick={() => void submit()}
            disabled={!playing || sending || !hasInk}
            className={`w-full rounded-2xl py-4 text-lg font-bold transition disabled:opacity-40 ${
              hint
                ? 'bg-correct text-ink ring-2 ring-correct'
                : 'bg-brand text-paper hover:bg-brand/90'
            }`}
          >
            {sending ? 'Đang chấm…' : 'NỘP BÀI'}
          </button>

          <p className="text-center text-xs text-muted">
            Hết giờ là tự nộp. Bài chỉ chấm MỘT lần — bấm khi hình đã xong.
          </p>

          {/* Gợi ý cho người chơi biết vì sao bị đánh giá là sai. */}
          {!hint && guess && guess.score < 0.5 && (
            <p className="text-center text-xs text-muted">
              Vẽ to hơn, một nét liền, đừng nhấc tay giữa chừng.
            </p>
          )}

          {error && <p className="text-center text-sm text-warn">{error}</p>}
        </>
      )}
    </div>
  );
}

/**
 * Màn hình sau khi bài đã được chấm.
 *
 * `commit` là kết quả vừa nhận từ server. Nó vắng mặt khi người chơi tải lại
 * trang giữa lượt (kết quả nằm ở lần request trước) — lúc đó vẫn còn điểm trong
 * state của lượt, chỉ mất chi tiết đúng/sai.
 */
function ResultPanel({ commit, fallbackScore }: { commit: Commit | null; fallbackScore: number }) {
  if (!commit) {
    return (
      <div className="rounded-2xl border-2 border-white/15 bg-ink-soft px-4 py-6 text-center">
        <p className="text-2xl font-bold">Bài đã nộp</p>
        <p className="mt-2 text-lg">
          <span className="font-bold tabular-nums">{fallbackScore}</span> điểm
        </p>
        <p className="mt-1 text-sm text-muted">Chờ những người khác vẽ xong…</p>
      </div>
    );
  }

  const auto = commit.reason === 'timeout' ? 'Hết giờ — bài được tự động nộp. ' : '';

  if (!commit.matched) {
    return (
      <div className="rounded-2xl border-2 border-wrong/50 bg-wrong/10 px-4 py-6 text-center">
        <p className="text-2xl font-bold text-wrong">AI không nhận ra hình này</p>
        <p className="mt-2 text-lg">
          <span className="font-bold tabular-nums">0</span> điểm
        </p>
        <p className="mt-1 text-sm text-muted">{auto}Chờ những người khác vẽ xong…</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border-2 border-correct/60 bg-correct/10 px-4 py-6 text-center">
      <p className="text-2xl font-bold text-correct">AI đã nhận ra! 🎉</p>
      <p className="mt-2 text-lg">
        +<span className="font-bold tabular-nums">{commit.score}</span> điểm
        <span className="ml-2 text-sm text-muted">({commit.seconds} giây)</span>
      </p>
      <p className="mt-1 text-sm text-muted">{auto}Chờ những người khác vẽ xong…</p>
    </div>
  );
}
