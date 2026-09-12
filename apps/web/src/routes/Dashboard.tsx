import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { clearSession } from '../lib/session';
import { useRoundStream } from '../lib/sse';
import { Shell } from '../components/Shell';
import { RankTable } from '../components/RankTable';
import { GAME_LABEL, type DashboardRow, type GameKind, type RoundState } from '../lib/types';

/** Kết quả của đúng 5 người trong lượt. Tự cập nhật khi có điểm mới. */
export function Dashboard() {
  const { roundId = '' } = useParams<{ roundId: string }>();
  const navigate = useNavigate();
  const [rows, setRows] = useState<DashboardRow[]>([]);
  const [game, setGame] = useState<GameKind>('math');
  const [state, setState] = useState<RoundState | null>(null);
  const [loading, setLoading] = useState(true);

  useRoundStream(roundId, setState);

  // Nạp lại bảng hạng mỗi 2 giây — màn hình kết quả, tải rất nhẹ.
  useEffect(() => {
    let alive = true;
    const fetchDash = async () => {
      try {
        const res = await api.dashboard(roundId);
        if (!alive) return;
        setRows(res.rows);
      } catch {
        /* giữ dữ liệu cũ */
      } finally {
        if (alive) setLoading(false);
      }
    };
    void fetchDash();
    const t = setInterval(fetchDash, 2_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [roundId]);

  useEffect(() => {
    if (state) setGame(state.game);
  }, [state]);

  const stillPlaying = state?.status === 'playing';

  return (
    <Shell>
      <header className="text-center">
        <p className="text-sm text-muted">{GAME_LABEL[game]} · lượt {roundId}</p>
        <h1 className="mt-1 text-3xl font-bold">
          {stillPlaying ? 'Đang thi đấu…' : 'Kết quả'}
        </h1>
      </header>

      {loading ? <p className="text-muted">Đang tải…</p> : <RankTable rows={rows} game={game} />}

      <button
        onClick={() => {
          clearSession();
          navigate('/');
        }}
        className="mt-auto rounded-xl border border-white/15 py-3 font-medium transition hover:bg-white/5"
      >
        Về trang chủ
      </button>
    </Shell>
  );
}
