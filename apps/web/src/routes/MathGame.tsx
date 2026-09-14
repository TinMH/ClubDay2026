import { useEffect, useState } from 'react';
import { ChoicePad } from '../components/ChoicePad';
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

  if (loading) return <p className="py-10 text-center text-muted">Đang lấy câu hỏi…</p>;

  if (error) {
    return (
      <div className="rounded-xl border border-wrong/40 bg-wrong/10 p-4 text-center">
        <p className="text-wrong">{error}</p>
      </div>
    );
  }

  // Hết đề mà chưa hết giờ — hiếm nhưng vẫn phải xử lý.
  if (!question) {
    return (
      <div className="rounded-xl border border-white/10 bg-ink-soft p-8 text-center">
        <p className="text-lg font-semibold">Hết câu hỏi!</p>
        <p className="mt-1 text-sm text-muted">
          {roundOver ? 'Lượt đã kết thúc.' : 'Chờ hết giờ để xem kết quả.'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div
        className={`rounded-2xl border-2 px-4 py-10 text-center transition-colors ${
          lastResult === 'correct'
            ? 'border-correct/60 bg-correct/10'
            : lastResult === 'wrong'
              ? 'border-wrong/60 bg-wrong/10'
              : 'border-white/10 bg-ink-soft'
        }`}
      >
        <p className="text-5xl font-bold tabular-nums sm:text-6xl">{question.prompt}</p>
        <p className="mt-3 h-5 text-sm">
          {lastResult === 'correct' && <span className="text-correct">✓ đúng</span>}
          {lastResult === 'wrong' && <span className="text-wrong">✗ sai</span>}
        </p>
      </div>

      <div className="flex justify-between text-sm text-muted">
        <span>
          Câu <span className="font-semibold text-paper">{index + 1}</span>
        </span>
        <span>
          Chuỗi đúng:{' '}
          <span className={`font-semibold ${streak > 0 ? 'text-correct' : 'text-paper'}`}>
            {streak}
          </span>
          {bestStreak > 0 && <span className="ml-2">(tốt nhất {bestStreak})</span>}
        </span>
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
