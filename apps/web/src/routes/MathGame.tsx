import { useEffect, useState } from 'react';
import { CircleCheck, CircleX, Flame, Hash } from 'lucide-react';
import { ChoicePad } from '../components/ChoicePad';
import { Spinner } from '../components/Chips';
import { GameError, RoundOverCard } from '../components/GameStatus';
import { classifyGameError } from '../lib/game-errors';
import { Toast, ToastRegion, useToast } from '../components/Toast';
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
  /**
   * Tăng mỗi khi một câu trả lời KHÔNG được tính (server chặn vì gõ nhanh quá,
   * hoặc mạng lỗi). `ChoicePad` khoá lại ngay khi người chơi bấm và chỉ mở khi
   * `resetKey` đổi; mà những lần đó số câu KHÔNG đổi — thiếu con số này thì bàn
   * đáp án khoá cứng tới hết lượt, chỉ vì một cú bấm sớm 250ms.
   */
  const [retry, setRetry] = useState(0);
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
      switch (classifyGameError(err)) {
        // Hết giờ hoặc lượt đã đóng: SSE sẽ chuyển màn hình, không cần báo lỗi.
        case 'over':
          setRoundOver(true);
          return;
        // Gõ nhanh hơn 250ms: bỏ qua im lặng, mở lại bàn đáp án để gõ lại.
        case 'retry':
          setRetry((n) => n + 1);
          return;
      }
      setError('Có lỗi khi gửi đáp án, thử lại.');
      setRetry((n) => n + 1);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Spinner label="Đang lấy câu hỏi…" />;

  if (error) return <GameError message={error} />;

  // Hết đề mà chưa hết giờ — hiếm nhưng vẫn phải xử lý.
  if (!question) {
    return (
      <RoundOverCard
        title="Hết câu hỏi!"
        detail={roundOver ? 'Lượt đã kết thúc.' : 'Chờ hết giờ để xem kết quả.'}
      />
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
        <p className="break-words font-display text-5xl font-black leading-none tabular-nums sm:text-7xl">
          {question.prompt}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex items-center gap-3 rounded-2xl border-[3px] border-line bg-surface px-3 py-2.5">
          <Hash aria-hidden="true" className="h-5 w-5 shrink-0 text-secondary" />
          <div className="leading-tight">
            <p className="text-xs font-bold uppercase text-muted">Câu</p>
            <p className="font-display text-xl font-black tabular-nums">{index + 1}</p>
          </div>
        </div>
        <div
          className={`flex items-center gap-3 border-[3px] px-3 py-2.5 transition-colors ${
            streak > 0 ? 'border-line bg-warn text-ink' : 'border-line bg-surface'
          }`}
        >
          <Flame
            aria-hidden="true"
            className={`h-5 w-5 shrink-0 ${streak > 0 ? 'text-ink' : 'text-muted'}`}
            fill={streak > 0 ? 'currentColor' : 'none'}
          />
          <div className="min-w-0 leading-tight">
            <p className={`text-xs font-bold uppercase ${streak > 0 ? '' : 'text-muted'}`}>Chuỗi đúng</p>
            <p className="flex flex-wrap items-baseline gap-x-1.5">
              <span className="font-display text-xl font-black tabular-nums">{streak}</span>
              {bestStreak > 0 && (
                <span className={`text-xs ${streak > 0 ? '' : 'text-muted'}`}>
                  tốt nhất {bestStreak}
                </span>
              )}
            </p>
          </div>
        </div>
      </div>

      <ChoicePad
        options={question.options}
        onPick={submit}
        busy={busy}
        resetKey={`${index}-${retry}`}
        disabled={!playing}
      />
    </div>
  );
}
