import { useEffect, useState } from 'react';
import { CircleCheck, CircleX, Flame, Hash, TriangleAlert, Trophy } from 'lucide-react';
import { ChoicePad } from '../components/ChoicePad';
import { Spinner } from '../components/Chips';
import { Toast, ToastRegion, useToast } from '../components/Toast';
import { ApiError } from '../lib/api';
import { mathApi, type PublicQuestion } from '../lib/api-math';
import type { GameProps } from '../lib/types';

/**
 * TRACK A — TÍNH NHANH (màn hình).
 *
 * Điểm hiển thị ở đầu màn hình do Play.tsx vẽ từ SSE; ở đây chỉ quản lý câu hỏi
 * đang mở, chuỗi đúng liên tiếp, và phản hồi đúng/sai.
 *
 * Không tự tính điểm: mọi con số đến từ server. Cũng KHÔNG tự sinh lựa chọn —
 * bốn đáp án do server gửi xuống, và client không được biết con nào đúng.
 */
export function MathGame({ roundId, playerId, state }: GameProps) {
  const [question, setQuestion] = useState<PublicQuestion | null>(null);
  const [index, setIndex] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [lastResult, setLastResult] = useState<'correct' | 'wrong' | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [roundOver, setRoundOver] = useState(false);
  /** Thông báo đúng/sai ở góc màn hình — tự tắt, không chiếm chỗ của câu hỏi. */
  const [toast, showToast] = useToast<{ correct: boolean; streak: number }>();

  const playing = state.status === 'playing';

  // Nạp câu hỏi đang mở khi vào lượt (và khi tải lại trang giữa chừng).
  useEffect(() => {
    if (!playing || !playerId) return;
    let alive = true;
    mathApi
      .question(roundId, playerId)
      .then((s) => {
        if (!alive) return;
        setQuestion(s.question);
        setIndex(s.index);
        // Chuỗi lấy từ SERVER. Tự đếm ở client thì tải lại trang giữa lượt là
        // chuỗi hiện tại về 0, trong khi server vẫn đang giữ chuỗi thật.
        setStreak(s.streak);
        setBestStreak(s.score);
      })
      .catch(() => {
        if (alive) setError('Không tải được câu hỏi.');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [roundId, playerId, playing]);

  async function submit(value: number) {
    if (busy) return;
    setBusy(true);
    try {
      const res = await mathApi.answer(roundId, playerId, index, value);
      setIndex(res.index);
      setQuestion(res.question);

      setStreak(res.streak);
      setBestStreak(res.score);
      setLastResult(res.correct ? 'correct' : 'wrong');
      showToast({ correct: res.correct, streak: res.streak });
    } catch (err) {
      if (err instanceof ApiError) {
        // Gõ nhanh hơn 250ms: bỏ qua im lặng, người chơi chỉ cần gõ lại.
        if (err.code === 'TOO_FAST') return;
        // Hết giờ hoặc lượt đã đóng: SSE sẽ chuyển màn hình, không cần báo lỗi.
        if (err.code === 'TIME_UP' || err.code === 'NOT_PLAYING') {
          setRoundOver(true);
          return;
        }
      }
      setError('Có lỗi khi gửi đáp án, thử lại.');
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Spinner label="Đang lấy câu hỏi…" />;

  if (error) {
    return (
      <p
        role="alert"
        className="card flex items-center justify-center gap-2 border-wrong/60 bg-wrong/10 p-4 text-wrong"
      >
        <TriangleAlert aria-hidden="true" className="h-5 w-5 shrink-0" />
        {error}
      </p>
    );
  }

  // Hết đề mà chưa hết giờ — hiếm nhưng vẫn phải xử lý.
  if (!question) {
    return (
      <div className="card p-8 text-center">
        <Trophy aria-hidden="true" className="mx-auto h-10 w-10 text-accent" />
        <p className="mt-3 font-display text-2xl font-extrabold">Hết câu hỏi!</p>
        <p className="mt-1 text-sm text-muted">
          {roundOver ? 'Lượt đã kết thúc.' : 'Chờ hết giờ để xem kết quả.'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <ToastRegion>
        {toast &&
          (toast.value.correct ? (
            <Toast
              key={toast.id}
              tone="correct"
              icon={<CircleCheck className="h-6 w-6" />}
              title="Đúng rồi!"
              detail={`Chuỗi ${toast.value.streak}`}
            />
          ) : (
            <Toast
              key={toast.id}
              tone="wrong"
              icon={<CircleX className="h-6 w-6" />}
              title="Sai mất rồi"
              detail="Chuỗi về 0"
            />
          ))}
      </ToastRegion>

      {/* key = số câu: sang câu mới là dựng lại thẻ → animation chạy lại một lần
          (nảy khi đúng, rung khi sai) rồi thôi — không để lại màu đúng/sai. */}
      <div
        key={index}
        className={`card px-4 py-10 text-center ${lastResult === 'wrong' ? 'animate-shake' : 'animate-pop'}`}
      >
        <p className="break-words font-display text-5xl font-extrabold leading-none tabular-nums sm:text-7xl">
          {question.prompt}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex items-center gap-3 rounded-2xl border-2 border-line bg-surface px-3 py-2.5">
          <Hash aria-hidden="true" className="h-5 w-5 shrink-0 text-secondary" />
          <div className="leading-tight">
            <p className="text-xs text-muted">Câu</p>
            <p className="font-display text-xl font-extrabold tabular-nums">{index + 1}</p>
          </div>
        </div>
        <div
          className={`flex items-center gap-3 rounded-2xl border-2 px-3 py-2.5 transition-colors ${
            streak > 0 ? 'border-warn/60 bg-warn/10' : 'border-line bg-surface'
          }`}
        >
          <Flame
            aria-hidden="true"
            className={`h-5 w-5 shrink-0 ${streak > 0 ? 'text-warn' : 'text-muted'}`}
            fill={streak > 0 ? 'currentColor' : 'none'}
          />
          <div className="min-w-0 leading-tight">
            <p className="text-xs text-muted">Chuỗi đúng</p>
            <p className="flex flex-wrap items-baseline gap-x-1.5">
              <span
                className={`font-display text-xl font-extrabold tabular-nums ${streak > 0 ? 'text-warn' : ''}`}
              >
                {streak}
              </span>
              {bestStreak > 0 && (
                <span className="text-xs text-muted">tốt nhất {bestStreak}</span>
              )}
            </p>
          </div>
        </div>
      </div>

      <ChoicePad
        options={question.options}
        onPick={submit}
        busy={busy}
        resetKey={index}
        disabled={!playing}
      />
    </div>
  );
}
