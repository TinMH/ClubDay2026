import { useEffect, useState, type ComponentType } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { ArrowLeft, House, TriangleAlert } from 'lucide-react';
import { api } from '../lib/api';
import { loadSession } from '../lib/session';
import { useRoundStream } from '../lib/sse';
import { Shell } from '../components/Shell';
import { Countdown } from '../components/Countdown';
import { ConnectionPill, GameChip, Spinner } from '../components/Chips';
import { MathGame } from './MathGame'; // TRACK A
import { DrawGame } from './DrawGame'; // TRACK B
import { MemoryGame } from './MemoryGame'; // TRACK C
import { SpotGame } from './SpotGame'; // TRACK D
import {
  DURATION_MS,
  SCORE_LABEL,
  type GameKind,
  type GameProps,
  type RoundState,
} from '../lib/types';

/**
 * Bảng tra game → màn hình.
 *
 * Là `Record<GameKind, …>` nên thêm game vào `GAME_KINDS` mà quên khai ở đây là
 * TypeScript báo lỗi ngay — chuỗi if/else thì lặng lẽ rơi vào nhánh cuối và
 * người chơi nhận nhầm game.
 *
 * Kiểu là `ComponentType`, và bên dưới nó được render bằng JSX (`<Screen …/>`),
 * KHÔNG phải gọi như hàm thường. Gọi `SCREENS[game](props)` thì màn hình game
 * không có fiber riêng: hook của nó bị nối thẳng vào danh sách hook của `Play`.
 * Mà `Play` có nhánh thoát sớm (chưa có state, lượt còn ở phòng chờ, chưa tham
 * gia lượt), nên số hook đổi giữa hai lần render → React error #310
 * "Rendered more hooks than during the previous render", trắng màn hình đúng
 * lúc lượt vừa bắt đầu.
 */
const SCREENS: Record<GameKind, ComponentType<GameProps>> = {
  math: MathGame,
  draw: DrawGame,
  memory: MemoryGame,
  spot: SpotGame,
};

/**
 * Dispatcher: đọc `state.game` rồi render game tương ứng.
 *
 * Nhờ file này mà `App.tsx` KHÔNG cần biết MathGame/DrawGame tồn tại,
 * và 2 track không bao giờ đụng nhau ở router.
 */
export function Play() {
  const { roundId = '' } = useParams<{ roundId: string }>();
  const navigate = useNavigate();
  const [state, setState] = useState<RoundState | null>(null);
  const session = loadSession();
  const connected = useRoundStream(roundId, setState);

  useEffect(() => {
    api.state(roundId).then(setState).catch(() => undefined);
  }, [roundId]);

  useEffect(() => {
    if (state?.status === 'done') navigate(`/dashboard/${roundId}`);
  }, [state, roundId, navigate]);

  if (!state) {
    return (
      <Shell>
        <Spinner label="Đang tải lượt…" />
      </Shell>
    );
  }

  if (state.status === 'lobby') {
    return (
      <Shell>
        <div className="card mt-10 p-6 text-center">
          <p className="font-semibold">Lượt chưa bắt đầu.</p>
          <Link to={`/lobby/${roundId}`} className="btn btn-primary mt-5 w-full">
            <ArrowLeft aria-hidden="true" className="h-5 w-5" />
            Về phòng chờ
          </Link>
        </div>
      </Shell>
    );
  }

  const playerId = session?.roundId === roundId ? session.playerId : '';
  const me = state.players.find((p) => p.id === playerId);
  const Screen = SCREENS[state.game];

  return (
    <Shell>
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <GameChip game={state.game} />
          {!connected && <ConnectionPill connected={false} offlineLabel="Mất kết nối…" />}
        </div>
        <div className="shrink-0 border-2 border-line bg-accent px-3 py-1.5 text-right text-ink shadow-[4px_4px_0_var(--color-edge)]">
          <span className="block text-xs font-bold uppercase">{SCORE_LABEL[state.game]}</span>
          <span className="block font-display text-2xl font-black leading-none tabular-nums">
            {me?.score ?? 0}
          </span>
        </div>
      </div>

      <Countdown endsAt={state.endsAt} total={DURATION_MS[state.game]} />

      {!playerId ? (
        <div role="alert" className="card border-warn bg-warn/10 p-4 text-sm">
          <p className="flex gap-2">
            <TriangleAlert aria-hidden="true" className="h-5 w-5 shrink-0 text-warn" />
            Bạn chưa tham gia lượt này (hoặc đã mở nhầm link). Hãy vào từ trang chủ để tính điểm.
          </p>
          <Link to="/" className="btn btn-ghost btn-sm mt-3 w-full">
            <House aria-hidden="true" className="h-4 w-4" />
            Về trang chủ
          </Link>
        </div>
      ) : (
        <Screen roundId={roundId} playerId={playerId} state={state} />
      )}
    </Shell>
  );
}
