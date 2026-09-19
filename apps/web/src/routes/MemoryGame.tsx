import { useCallback, useEffect, useRef, useState } from 'react';
import { CircleCheck, CircleX, Eye, Hand } from 'lucide-react';
import { MemoryPad } from '../components/MemoryPad';
import { Spinner } from '../components/Chips';
import { GameError, RoundOverCard } from '../components/GameStatus';
import { classifyGameError } from '../lib/game-errors';
import { Toast, ToastRegion, useToast } from '../components/Toast';
import { memoryApi } from '../lib/api-memory';
import { MEMORY_LIT_MS, MEMORY_STEP_MS, type GameProps } from '../lib/types';

/** Nghỉ sau khi chấm, đủ để đọc "Đúng rồi!" trước khi chuỗi mới nháy lên. */
const RESULT_PAUSE_MS = 800;
/** Ô sáng lên bao lâu khi người chơi chạm — chỉ là phản hồi, không tính giờ. */
const PRESS_MS = 140;

type Phase = 'watch' | 'input' | 'sending';

/**
 * TRACK C — NHỚ NHANH (màn hình).
 *
 * Vòng chơi: server gửi chuỗi của cấp hiện tại → màn hình nháy lại từng ô →
 * người chơi chạm lặp lại → server chấm và gửi chuỗi cấp kế.
 *
 * Không tự tính điểm, cũng KHÔNG tự sinh chuỗi: mọi con số đến từ server. Client
 * chỉ biết chuỗi của đúng cấp đang chơi, nên không có gì để đọc trước.
 *
 * Nhịp phát lại phải đúng `MEMORY_STEP_MS` — server dựa vào chính con số đó để
 * biết người chơi có kịp XEM chuỗi hay không. Phát nhanh hơn là người chơi thật
 * bị chặn vì nghi gian lận.
 */
export function MemoryGame({ roundId, playerId, state }: GameProps) {
  const [level, setLevel] = useState(1);
  const [sequence, setSequence] = useState<number[]>([]);
  /** Tăng mỗi lần có chuỗi mới — kể cả khi chuỗi giống hệt lần trước (lặp sai, về cấp 1). */
  const [cue, setCue] = useState(0);
  const [phase, setPhase] = useState<Phase>('watch');
  const [taps, setTaps] = useState<number[]>([]);
  const [lit, setLit] = useState<number | null>(null);
  const [pressed, setPressed] = useState<number | null>(null);
  const [best, setBest] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [roundOver, setRoundOver] = useState(false);
  const [toast, showToast] = useToast<{ correct: boolean; level: number }>();

  const playing = state.status === 'playing';
  /** Hẹn giờ cho chuỗi kế tiếp — huỷ khi rời màn hình để không setState sau unmount. */
  const nextTimer = useRef<number | undefined>(undefined);
  /**
   * Các ô đã chạm — NGUỒN SỰ THẬT là ref, `taps` chỉ để vẽ ra màn hình.
   *
   * Hai ngón chạm hai ô trong cùng một khung hình thì cả hai hàm xử lý cùng đọc
   * một giá trị `taps` cũ, và cú chạm sau ghi đè cú trước — người chơi bấm 5 ô mà
   * màn hình chỉ đếm 4. Ref cập nhật ngay nên không có khe hở đó.
   */
  const tapsRef = useRef<number[]>([]);

  const show = useCallback((nextLevel: number, seq: number[]) => {
    setLevel(nextLevel);
    setSequence(seq);
    setCue((c) => c + 1);
  }, []);

  /**
   * Lấy lại chuỗi từ server.
   *
   * Dùng cho cả lần vào đầu tiên lẫn mọi lúc client và server lệch nhau (mất
   * mạng một nhịp, bị chặn vì nộp quá nhanh). Server là bên giữ cấp thật, nên
   * cách sửa lệch luôn là hỏi lại nó chứ không đoán ở client.
   */
  const reload = useCallback(async () => {
    const s = await memoryApi.sequence(roundId, playerId);
    setBest(s.score);
    if (s.sequence) show(s.level, s.sequence);
  }, [roundId, playerId, show]);

  useEffect(() => {
    if (!playing || !playerId) return;
    let alive = true;
    reload()
      .catch(() => {
        if (alive) setError('Không tải được chuỗi.');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [playing, playerId, reload]);

  useEffect(() => () => window.clearTimeout(nextTimer.current), []);

  // Phát lại chuỗi: nháy từng ô, xong mới mở cho người chơi chạm.
  useEffect(() => {
    if (cue === 0 || sequence.length === 0) return;
    setPhase('watch');
    tapsRef.current = [];
    setTaps([]);
    setLit(null);

    const timers = sequence.flatMap((pad, i) => [
      window.setTimeout(() => setLit(pad), i * MEMORY_STEP_MS),
      window.setTimeout(() => setLit(null), i * MEMORY_STEP_MS + MEMORY_LIT_MS),
    ]);
    timers.push(window.setTimeout(() => setPhase('input'), sequence.length * MEMORY_STEP_MS));

    return () => timers.forEach(window.clearTimeout);
  }, [cue, sequence]);

  async function send(all: number[]) {
    setPhase('sending');
    try {
      const res = await memoryApi.replay(roundId, playerId, level, all);
      setBest(res.score);
      showToast({ correct: res.correct, level: res.correct ? level : res.level });
      if (res.sequence.length > 0) {
        nextTimer.current = window.setTimeout(() => show(res.level, res.sequence), RESULT_PAUSE_MS);
      }
    } catch (err) {
      switch (classifyGameError(err)) {
        // Hết giờ hoặc lượt đã đóng: SSE sẽ chuyển sang bảng hạng.
        case 'over':
          setRoundOver(true);
          return;
        // Lệch với server (sai cấp, hoặc bị chặn vì quá nhanh): hỏi lại nó.
        case 'retry':
          reload().catch(() => setError('Mất kết nối với máy chủ.'));
          return;
      }
      setError('Có lỗi khi gửi kết quả, thử lại.');
    }
  }

  function tap(pad: number) {
    if (phase !== 'input' || tapsRef.current.length >= level) return;
    setPressed(pad);
    window.setTimeout(() => setPressed(null), PRESS_MS);

    const all = [...tapsRef.current, pad];
    tapsRef.current = all;
    setTaps(all);
    if (all.length === level) void send(all);
  }

  if (loading) return <Spinner label="Đang lấy chuỗi…" />;

  if (error) return <GameError message={error} />;

  if (roundOver) {
    return <RoundOverCard title="Hết giờ!" detail={`Cấp cao nhất của bạn: ${best}`} />;
  }

  const watching = phase === 'watch';

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
              detail={`Qua cấp ${toast.value.level}`}
            />
          ) : (
            <Toast
              key={toast.id}
              tone="wrong"
              icon={<CircleX className="h-6 w-6" />}
              title="Sai mất rồi"
              detail="Làm lại từ cấp 1"
            />
          ))}
      </ToastRegion>

      {/*
        Một dòng trạng thái DUY NHẤT, đổi hẳn màu giữa hai lượt.
        Người chơi phải biết ngay lúc nào được chạm: chạm nhầm lúc đang xem là mất
        cả cấp, mà lỗi đó hoàn toàn do màn hình không nói rõ.
      */}
      <div
        aria-live="polite"
        className={`card flex items-center justify-between gap-3 px-4 py-3 transition-colors ${
          watching ? 'border-line bg-memory text-ink' : 'border-line bg-accent text-ink'
        }`}
      >
        <p className="flex items-center gap-2 font-display text-lg font-black uppercase">
          {watching ? (
            <>
              <Eye aria-hidden="true" className="h-5 w-5 shrink-0" />
              Nhìn kỹ nhé…
            </>
          ) : (
            <>
              <Hand aria-hidden="true" className="h-5 w-5 shrink-0" />
              Lặp lại đi!
            </>
          )}
        </p>
        <p className="shrink-0 text-right leading-tight">
          <span className="block text-xs font-bold uppercase">Cấp</span>
          <span className="block font-display text-2xl font-black uppercase tracking-tight tabular-nums">{level}</span>
        </p>
      </div>

      <MemoryPad lit={lit} pressed={pressed} disabled={phase !== 'input'} onTap={tap} />

      {/* Đã bấm mấy ô trên tổng số mấy — không có nó thì ở cấp 7 người chơi mất dấu. */}
      <div className="flex items-center justify-center gap-2" aria-hidden="true">
        {Array.from({ length: level }, (_, i) => (
          <span
            key={i}
            className={`h-2.5 w-2.5 rounded-full transition-colors ${
              i < taps.length ? 'bg-accent' : 'bg-line'
            }`}
          />
        ))}
      </div>
      <p className="sr-only" aria-live="polite">
        Đã bấm {taps.length} trên {level} ô
      </p>

      {best > 0 && (
        <p className="text-center text-xs text-muted">Cấp cao nhất của bạn: {best}</p>
      )}
    </div>
  );
}
