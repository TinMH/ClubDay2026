import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { House, Trophy } from 'lucide-react';
import { api } from '../lib/api';
import { clearSession } from '../lib/session';
import { useRoundStream } from '../lib/sse';
import { Shell } from '../components/Shell';
import { RankTable } from '../components/RankTable';
import { GameChip, Spinner, WaitDots } from '../components/Chips';
import { DscLogo } from '../components/Logo';
import type { DashboardRow, GameKind, RoundState } from '../lib/types';

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
        <DscLogo size="sm" className="mb-5" />
        <div className="flex flex-wrap items-center justify-center gap-2 text-sm text-muted">
          <GameChip game={game} />
          <span>
            lượt <span className="font-mono font-bold text-fg">{roundId}</span>
          </span>
        </div>
        <span className="mx-auto mt-6 grid h-16 w-16 -rotate-6 place-items-center rounded-2xl bg-accent text-ink shadow-[0_5px_0_var(--color-accent-deep)]">
          <Trophy aria-hidden="true" className="h-9 w-9" />
        </span>
        <h1 className="mt-4 font-display text-4xl font-extrabold">
          {stillPlaying ? 'Đang thi đấu…' : 'Kết quả'}
        </h1>
        {stillPlaying && (
          <p className="mt-1 flex items-center justify-center gap-2 text-sm text-muted">
            Bảng tự cập nhật khi có điểm mới
            <WaitDots />
          </p>
        )}
      </header>

      {loading ? <Spinner label="Đang tải…" /> : <RankTable rows={rows} game={game} />}

      <button
        onClick={() => {
          clearSession();
          navigate('/');
        }}
        className="btn btn-ghost mt-auto w-full"
      >
        <House aria-hidden="true" className="h-5 w-5" />
        Về trang chủ
      </button>
    </Shell>
  );
}
