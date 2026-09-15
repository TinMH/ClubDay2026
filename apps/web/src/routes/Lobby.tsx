import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { House, Play as PlayIcon, TriangleAlert, Users } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { loadAdminToken, loadSession } from '../lib/session';
import { useRoundStream } from '../lib/sse';
import { Shell } from '../components/Shell';
import { Avatar } from '../components/Avatar';
import { ConnectionPill, GameChip, WaitDots } from '../components/Chips';
import { MAX_PLAYERS, type RoundState } from '../lib/types';

/** Phòng chờ: 5 slot, cập nhật realtime. BTC bấm BẮT ĐẦU từ đây hoặc từ /admin. */
export function Lobby() {
  const { roundId = '' } = useParams<{ roundId: string }>();
  const navigate = useNavigate();
  const [state, setState] = useState<RoundState | null>(null);
  const [error, setError] = useState('');
  const session = loadSession();
  const adminToken = loadAdminToken();
  const connected = useRoundStream(roundId, setState);

  useEffect(() => {
    api.state(roundId).then(setState).catch(() => setError('Không tải được lượt này.'));
  }, [roundId]);

  // Tự chuyển màn hình khi lượt đổi trạng thái — không cần người chơi bấm gì.
  useEffect(() => {
    if (!state) return;
    if (state.status === 'playing') navigate(`/play/${roundId}`);
    else if (state.status === 'done') navigate(`/dashboard/${roundId}`);
  }, [state, roundId, navigate]);

  async function start() {
    try {
      await api.startRound(roundId, adminToken);
    } catch (err) {
      setError(err instanceof ApiError && err.status === 401 ? 'Sai mã quản trị.' : 'Không bắt đầu được.');
    }
  }

  const players = state?.players ?? [];
  const slots = Array.from({ length: MAX_PLAYERS }, (_, i) => players[i]);

  if (error && !state) {
    return (
      <Shell>
        <div className="card mt-10 p-6 text-center">
          <TriangleAlert aria-hidden="true" className="mx-auto h-10 w-10 text-wrong" />
          <p className="mt-3 font-semibold text-wrong">{error}</p>
          <Link to="/" className="btn btn-ghost mt-5 w-full">
            <House aria-hidden="true" className="h-5 w-5" />
            Về trang chủ
          </Link>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <header className="text-center">
        <div className="flex flex-wrap items-center justify-center gap-2">
          {state ? <GameChip game={state.game} /> : <span className="text-sm text-muted">Đang tải…</span>}
          <ConnectionPill connected={connected} />
        </div>
        <p className="mt-6 text-xs font-bold uppercase tracking-[0.2em] text-muted">Mã lượt</p>
        <h1 className="mt-2 flex flex-wrap justify-center gap-1.5" aria-label={`Mã lượt ${roundId}`}>
          {Array.from(roundId).map((ch, i) => (
            <span
              key={i}
              aria-hidden="true"
              className="grid h-14 w-11 place-items-center rounded-xl border-2 border-line bg-surface font-mono text-3xl font-bold shadow-[0_4px_0_var(--color-edge)]"
            >
              {ch}
            </span>
          ))}
        </h1>
      </header>

      <section className="card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-display text-lg font-bold">
            <Users aria-hidden="true" className="h-5 w-5 text-secondary" />
            Người chơi
          </h2>
          <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-sm font-bold tabular-nums">
            {players.length}/{MAX_PLAYERS}
          </span>
        </div>
        <ul className="space-y-2">
          {slots.map((p, i) =>
            p ? (
              <li key={p.id} className="flex animate-pop items-center gap-3 rounded-2xl bg-surface-2 p-2.5">
                <Avatar name={p.name} seed={p.id} />
                <span className="min-w-0 flex-1 truncate font-semibold">{p.name}</span>
                {p.id === session?.playerId && (
                  <span className="shrink-0 rounded-full bg-primary px-2.5 py-0.5 text-xs font-bold text-white">
                    Bạn
                  </span>
                )}
              </li>
            ) : (
              <li
                key={`empty-${i}`}
                className="flex items-center gap-3 rounded-2xl border-2 border-dashed border-line p-2"
              >
                <span className="grid h-10 w-10 place-items-center rounded-xl text-sm font-bold tabular-nums text-muted">
                  {i + 1}
                </span>
                <span className="text-muted">Đang chờ…</span>
              </li>
            ),
          )}
        </ul>
      </section>

      <p role="status" className="flex items-center justify-center gap-2 text-muted">
        Đang chờ BTC bắt đầu
        <WaitDots />
      </p>

      {adminToken && (
        <button onClick={start} disabled={players.length === 0} className="btn btn-correct btn-lg w-full">
          <PlayIcon aria-hidden="true" className="h-6 w-6" fill="currentColor" />
          BẮT ĐẦU ({players.length} người)
        </button>
      )}

      {error && (
        <p role="alert" className="flex items-center justify-center gap-2 text-sm text-wrong">
          <TriangleAlert aria-hidden="true" className="h-4 w-4 shrink-0" />
          {error}
        </p>
      )}
    </Shell>
  );
}
