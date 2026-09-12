import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { loadAdminToken, loadSession } from '../lib/session';
import { useRoundStream } from '../lib/sse';
import { Shell } from '../components/Shell';
import { GAME_LABEL, MAX_PLAYERS, type RoundState } from '../lib/types';

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
        <p className="text-wrong">{error}</p>
        <Link to="/" className="text-brand underline-offset-4 hover:underline">
          Về trang chủ
        </Link>
      </Shell>
    );
  }

  return (
    <Shell>
      <header className="text-center">
        <p className="text-sm text-muted">
          {state ? GAME_LABEL[state.game] : 'Đang tải…'} · {connected ? 'đã kết nối' : 'đang kết nối…'}
        </p>
        <h1 className="mt-1 text-3xl font-bold">
          Mã lượt <span className="font-mono tracking-widest">{roundId}</span>
        </h1>
      </header>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-muted">
          Người chơi ({players.length}/{MAX_PLAYERS})
        </h2>
        <ul className="space-y-2">
          {slots.map((p, i) => (
            <li
              key={p?.id ?? `empty-${i}`}
              className={`flex items-center gap-3 rounded-xl border p-3 ${
                p ? 'border-white/10 bg-ink-soft' : 'border-dashed border-white/10'
              }`}
            >
              <span className="w-6 text-center text-sm text-muted tabular-nums">{i + 1}</span>
              <span className={p ? 'font-medium' : 'text-muted'}>
                {p ? p.name : 'Đang chờ…'}
                {p && p.id === session?.playerId && (
                  <span className="ml-2 text-xs text-brand">(bạn)</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <p className="text-center text-muted">Đang chờ BTC bắt đầu…</p>

      {adminToken && (
        <button
          onClick={start}
          disabled={players.length === 0}
          className="rounded-xl bg-correct py-4 text-lg font-semibold text-ink transition hover:brightness-110 disabled:opacity-40"
        >
          BẮT ĐẦU ({players.length} người)
        </button>
      )}

      {error && <p className="text-center text-sm text-wrong">{error}</p>}
    </Shell>
  );
}
