import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  CircleCheck,
  CircleX,
  Eraser,
  LoaderCircle,
  Pencil,
  PartyPopper,
  Send,
  Sparkles,
  TriangleAlert,
} from 'lucide-react';
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
      <div className="animate-pop rounded-3xl border-2 border-draw/50 bg-draw/10 px-4 py-4 text-center shadow-[0_5px_0_var(--color-edge)]">
        <p className="flex items-center justify-center gap-1.5 text-xs font-bold uppercase tracking-[0.2em] text-draw">
          <Pencil aria-hidden="true" className="h-4 w-4" />
          Hãy vẽ
        </p>
        <p className="mt-1 font-display text-4xl font-extrabold leading-tight sm:text-5xl">
          {target.labelVi}
        </p>
      </div>

      {finished ? (
        <ResultPanel commit={commit} fallbackScore={me?.score ?? 0} />
      ) : (
        <>
          <div className="flex items-stretch gap-2">
            <p
              className={`flex min-h-12 min-w-0 flex-1 items-center gap-2 rounded-2xl border-2 px-3 py-2 text-sm transition-colors ${
                hint ? 'border-correct/60 bg-correct/10' : 'border-line bg-surface'
              }`}
            >
              <Sparkles
                aria-hidden="true"
                className={`h-5 w-5 shrink-0 ${hint ? 'text-correct' : 'text-secondary'}`}
              />
              <span className="min-w-0 text-muted">
                {hint ? (
                  <>
                    AI đã nhận ra{' '}
                    <span className="font-semibold text-correct">{target.labelVi}</span> — nộp
                    được rồi!
                  </>
                ) : guess ? (
                  <>
                    AI nghĩ:{' '}
                    <span className="font-semibold text-fg">{guess.labelVi}</span>{' '}
                    <span className="tabular-nums">{Math.round(guess.score * 100)}%</span>
                  </>
                ) : (
                  'AI chưa thấy gì — hãy vẽ to và rõ'
                )}
              </span>
            </p>
            <button
              type="button"
              onClick={() => canvasRef.current?.clear()}
              disabled={!playing}
              className="btn btn-ghost btn-sm shrink-0"
            >
              <Eraser aria-hidden="true" className="h-4 w-4" />
              <span className="max-[380px]:sr-only">Xoá hết</span>
            </button>
          </div>

          <div
            ref={wrapperRef}
            className="h-[42vh] min-h-[240px] w-full overflow-hidden rounded-3xl border-4 border-line shadow-[0_5px_0_var(--color-edge)]"
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
            className={`btn btn-lg w-full ${
              hint ? 'btn-correct ring-4 ring-correct/40 ring-offset-2 ring-offset-ink' : 'btn-primary'
            }`}
          >
            {sending ? (
              <>
                <LoaderCircle aria-hidden="true" className="h-6 w-6 animate-spin" />
                Đang chấm…
              </>
            ) : (
              <>
                <Send aria-hidden="true" className="h-6 w-6" />
                NỘP BÀI
              </>
            )}
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

          {error && (
            <p role="alert" className="flex items-center justify-center gap-2 text-sm text-warn">
              <TriangleAlert aria-hidden="true" className="h-4 w-4 shrink-0" />
              {error}
            </p>
          )}
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
      <ResultCard tone="neutral" icon={<CircleCheck className="h-8 w-8" />}>
        <p className="font-display text-2xl font-extrabold">Bài đã nộp</p>
        <p className="mt-2 text-lg">
          <span className="font-display text-4xl font-extrabold tabular-nums">{fallbackScore}</span> điểm
        </p>
        <p className="mt-1 text-sm text-muted">Chờ những người khác vẽ xong…</p>
      </ResultCard>
    );
  }

  const auto = commit.reason === 'timeout' ? 'Hết giờ — bài được tự động nộp. ' : '';

  if (!commit.matched) {
    return (
      <ResultCard tone="wrong" icon={<CircleX className="h-8 w-8" />}>
        <p className="font-display text-2xl font-extrabold text-wrong">AI không nhận ra hình này</p>
        <p className="mt-2 text-lg">
          <span className="font-display text-4xl font-extrabold tabular-nums">0</span> điểm
        </p>
        <p className="mt-1 text-sm text-muted">{auto}Chờ những người khác vẽ xong…</p>
      </ResultCard>
    );
  }

  return (
    <ResultCard tone="correct" icon={<PartyPopper className="h-8 w-8" />}>
      <p className="font-display text-2xl font-extrabold text-correct">AI đã nhận ra!</p>
      <p className="mt-2 flex items-baseline justify-center gap-1 text-lg">
        +<span className="font-display text-5xl font-extrabold tabular-nums text-correct">{commit.score}</span>{' '}
        điểm
      </p>
      <p className="mt-1">
        <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-sm tabular-nums text-muted">
          {commit.seconds} giây
        </span>
      </p>
      <p className="mt-2 text-sm text-muted">{auto}Chờ những người khác vẽ xong…</p>
    </ResultCard>
  );
}

const RESULT_TONE = {
  neutral: { card: 'border-line bg-surface', badge: 'bg-secondary text-ink' },
  wrong: { card: 'border-wrong/60 bg-wrong/10', badge: 'bg-wrong text-ink' },
  correct: { card: 'border-correct/70 bg-correct/10', badge: 'bg-correct text-ink' },
} as const;

function ResultCard({
  tone,
  icon,
  children,
}: {
  tone: keyof typeof RESULT_TONE;
  icon: ReactNode;
  children: ReactNode;
}) {
  const t = RESULT_TONE[tone];
  return (
    <div
      className={`animate-pop rounded-3xl border-2 px-4 py-7 text-center shadow-[0_5px_0_var(--color-edge)] ${t.card}`}
    >
      <span
        aria-hidden="true"
        className={`mx-auto mb-3 grid h-14 w-14 -rotate-3 place-items-center rounded-2xl ${t.badge}`}
      >
        {icon}
      </span>
      {children}
    </div>
  );
}
