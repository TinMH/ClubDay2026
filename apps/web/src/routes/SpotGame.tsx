import { useCallback, useEffect, useRef, useState } from 'react';
import { CircleCheck, CircleX, Eye } from 'lucide-react';
import { SpotGrid } from '../components/SpotGrid';
import { Spinner } from '../components/Chips';
import { GameError, RoundOverCard } from '../components/GameStatus';
import { classifyGameError } from '../lib/game-errors';
import { Toast, ToastRegion, useToast } from '../components/Toast';
import { spotApi, type SpotBoard } from '../lib/api-spot';
import type { GameProps } from '../lib/types';

/** Ô đúng sáng lên bao lâu sau khi chạm trượt, trước khi bàn mới hiện ra. */
const REVEAL_MS = 700;
/** Ô vừa chạm thu nhỏ lại bao lâu — chỉ là phản hồi, không tính giờ. */
const PRESS_MS = 120;

/**
 * TRACK D — Ô KHÁC MÀU (màn hình).
 *
 * Vòng chơi: server gửi bàn của cấp hiện tại → người chơi chạm ô mình cho là
 * lệch màu → server chấm và gửi bàn kế. Chạm trúng thì lên cấp (lưới dày thêm,
 * màu sát nhau hơn); chạm trượt thì về cấp 1 nhưng kỷ lục giữ nguyên.
 *
 * Không tự chấm, cũng không tự sinh bàn: mọi con số đến từ server. Bàn thì client
 * buộc phải biết đủ để vẽ ra (kể cả ô nào lệch) — giới hạn đã ghi rõ ở
 * services/spot-session.ts bên server.
 */
export function SpotGame({ roundId, playerId, state }: GameProps) {
  const [level, setLevel] = useState(1);
  const [board, setBoard] = useState<SpotBoard | null>(null);
  const [pressed, setPressed] = useState<number | null>(null);
  const [reveal, setReveal] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const [best, setBest] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [roundOver, setRoundOver] = useState(false);
  const [toast, showToast] = useToast<{ correct: boolean; level: number }>();

  const playing = state.status === 'playing';
  /** Hẹn giờ cho bàn kế tiếp — huỷ khi rời màn hình để không setState sau unmount. */
  const nextTimer = useRef<number | undefined>(undefined);
  /**
   * Chặn cú chạm thứ hai — NGUỒN SỰ THẬT là ref, `sending` chỉ để vẽ ra màn hình.
   *
   * Hai ngón chạm hai ô trong cùng một khung hình thì cả hai hàm xử lý cùng đọc
   * `sending` còn là false và gửi đi hai lần. Cú thứ hai mang đúng cấp cũ nên
   * server nhận cả hai, và người chơi mất một cấp vì một cú chạm họ không định làm.
   */
  const busyRef = useRef(false);

  /**
   * Lấy lại bàn từ server.
   *
   * Dùng cho cả lần vào đầu tiên lẫn mọi lúc client và server lệch nhau (mất mạng
   * một nhịp, bị chặn vì chạm quá nhanh). Server là bên giữ cấp thật, nên cách
   * sửa lệch luôn là hỏi lại nó chứ không đoán ở client.
   */
  const reload = useCallback(async () => {
    const s = await spotApi.board(roundId, playerId);
    setBest(s.score);
    setLevel(s.level);
    setBoard(s.board);
    setReveal(null);
    busyRef.current = false;
    setSending(false);
  }, [roundId, playerId]);

  useEffect(() => {
    if (!playing || !playerId) return;
    let alive = true;
    reload()
      .catch(() => {
        if (alive) setError('Không tải được bàn chơi.');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [playing, playerId, reload]);

  useEffect(() => () => window.clearTimeout(nextTimer.current), []);

  function tap(index: number) {
    if (busyRef.current || !board) return;
    busyRef.current = true;
    setSending(true);
    setPressed(index);
    window.setTimeout(() => setPressed(null), PRESS_MS);
    void send(index);
  }

  async function send(index: number) {
    try {
      const res = await spotApi.pick(roundId, playerId, level, index);
      setBest(res.score);
      showToast({ correct: res.correct, level: res.correct ? level : res.level });

      if (res.correct) {
        // Đúng thì chuyển bàn ngay: dừng lại ở đây chỉ làm mất nhịp.
        setLevel(res.level);
        setBoard(res.board);
        busyRef.current = false;
        setSending(false);
        return;
      }

      // Sai thì chỉ ra ô đúng trước khi về cấp 1 — trượt mà không biết trượt ở
      // đâu thì người chơi không học được gì, chỉ thấy bị phạt.
      setReveal(board?.oddIndex ?? null);
      nextTimer.current = window.setTimeout(() => {
        setReveal(null);
        setLevel(res.level);
        setBoard(res.board);
        busyRef.current = false;
        setSending(false);
      }, REVEAL_MS);
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

  if (loading) return <Spinner label="Đang lấy bàn chơi…" />;

  if (error) return <GameError message={error} />;

  if (roundOver) {
    return <RoundOverCard title="Hết giờ!" detail={`Cấp cao nhất của bạn: ${best}`} />;
  }

  if (!board) return <Spinner label="Đang lấy bàn chơi…" />;

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

      <div className="card flex items-center justify-between gap-3 border-spot/60 bg-spot/10 px-4 py-3">
        <p className="flex items-center gap-2 font-display text-lg font-extrabold">
          <Eye aria-hidden="true" className="h-5 w-5 shrink-0 text-spot" />
          Tìm ô khác màu
        </p>
        <p className="shrink-0 text-right leading-tight">
          <span className="block text-xs text-muted">Cấp</span>
          <span className="block font-display text-2xl font-extrabold tabular-nums">{level}</span>
        </p>
      </div>

      <SpotGrid
        board={board}
        disabled={sending}
        pressed={pressed}
        reveal={reveal}
        onTap={tap}
      />

      <p className="sr-only" aria-live="polite">
        Cấp {level}, lưới {board.size} nhân {board.size}
      </p>

      {best > 0 && <p className="text-center text-xs text-muted">Cấp cao nhất của bạn: {best}</p>}
    </div>
  );
}
