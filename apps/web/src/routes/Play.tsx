import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { api } from '../lib/api';
import { loadSession } from '../lib/session';
import { useRoundStream } from '../lib/sse';
import { Shell } from '../components/Shell';
import { Countdown } from '../components/Countdown';
import { MathGame } from './MathGame'; // TRACK A
import { DrawGame } from './DrawGame'; // TRACK B
import { DURATION_MS, type GameProps, type RoundState } from '../lib/types';

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
        <p className="text-muted">Đang tải lượt…</p>
      </Shell>
    );
  }

  if (state.status === 'lobby') {
    return (
      <Shell>
        <p className="text-muted">Lượt chưa bắt đầu.</p>
        <Link to={`/lobby/${roundId}`} className="text-brand underline-offset-4 hover:underline">
          Về phòng chờ
        </Link>
      </Shell>
    );
  }

  const playerId = session?.roundId === roundId ? session.playerId : '';
  const me = state.players.find((p) => p.id === playerId);
  const props: GameProps = { roundId, playerId, state };

  return (
    <Shell>
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted">
          {connected ? '' : 'mất kết nối…'}
        </span>
        <span>
          <span className="text-muted">Điểm của bạn: </span>
          <span className="text-xl font-bold tabular-nums">{me?.score ?? 0}</span>
        </span>
      </div>

      <Countdown endsAt={state.endsAt} total={DURATION_MS[state.game]} />

      {!playerId ? (
        <p className="rounded-xl border border-warn/40 bg-warn/10 p-4 text-sm">
          Bạn chưa tham gia lượt này (hoặc đã mở nhầm link). Hãy vào từ trang chủ để tính điểm.
        </p>
      ) : state.game === 'math' ? (
        <MathGame {...props} />
      ) : (
        <DrawGame {...props} />
      )}
    </Shell>
  );
}
