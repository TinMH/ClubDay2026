import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { loadAdminToken, saveAdminToken } from '../lib/session';
import { Shell } from '../components/Shell';
import { GAME_LABEL, type GameKind, type RoundSummary } from '../lib/types';

/**
 * Màn hình BTC: tạo lượt, xem ai đã vào, bắt đầu / bỏ qua, và in QR.
 * Bảo vệ bằng `x-admin-token` — đặt ADMIN_TOKEN trong .env trước sự kiện.
 */
export function Admin() {
  const [token, setToken] = useState(loadAdminToken);
  const [rounds, setRounds] = useState<RoundSummary[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const origin = window.location.origin;

  const refresh = useCallback(async () => {
    if (!token) {
      setRounds([]);
      return;
    }
    try {
      const res = await api.listRounds(token);
      setRounds(res.rounds);
      setError('');
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 401
          ? 'Sai mã quản trị (ADMIN_TOKEN).'
          : 'Không tải được danh sách lượt.',
      );
    }
  }, [token]);

  useEffect(() => {
    saveAdminToken(token);
    void refresh();
    const t = setInterval(refresh, 2_000);
    return () => clearInterval(t);
  }, [token, refresh]);

  async function create(game: GameKind) {
    setBusy(true);
    try {
      await api.createRound(game, token);
      await refresh();
    } catch {
      setError('Không tạo được lượt.');
    } finally {
      setBusy(false);
    }
  }

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    try {
      await fn();
      await refresh();
    } catch {
      setError('Thao tác thất bại.');
    } finally {
      setBusy(false);
    }
  }

  // Lượt đang mở gần nhất → hiện URL để BTC in QR.
  const openRound = rounds.find((r) => r.status === 'lobby' && r.live);
  const joinUrl = openRound ? `${origin}/r/${openRound.roundId}` : null;

  return (
    <Shell wide>
      <header className="flex items-baseline justify-between">
        <h1 className="text-2xl font-bold">Quản trị</h1>
        <Link to="/" className="text-sm text-brand underline-offset-4 hover:underline">
          Trang chủ
        </Link>
      </header>

      <input
        type="password"
        value={token}
        onChange={(e) => setToken(e.target.value)}
        placeholder="Mã quản trị (ADMIN_TOKEN)"
        className="w-full rounded-xl border border-white/15 bg-ink-soft px-4 py-3 outline-none placeholder:text-muted focus:border-brand"
      />

      {error && <p className="text-sm text-wrong">{error}</p>}

      <section className="grid gap-3 sm:grid-cols-2">
        <button
          onClick={() => create('math')}
          disabled={busy || !token}
          className="rounded-xl bg-brand py-4 font-semibold transition hover:brightness-110 disabled:opacity-40"
        >
          + Lượt Tính nhanh
        </button>
        <button
          onClick={() => create('draw')}
          disabled={busy || !token}
          className="rounded-xl bg-brand py-4 font-semibold transition hover:brightness-110 disabled:opacity-40"
        >
          + Lượt Vẽ hình
        </button>
      </section>

      {joinUrl && (
        <section className="rounded-xl border border-correct/40 bg-correct/10 p-4">
          <p className="text-sm text-muted">Lượt đang mở — cho người chơi quét mã này:</p>
          <p className="mt-2 break-all font-mono text-lg font-bold">{joinUrl}</p>
          <p className="mt-1 text-sm text-muted">
            Hoặc dùng chung 1 mã cho cả sự kiện: <span className="font-mono">{origin}</span>
          </p>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-sm font-semibold text-muted">Lượt gần đây</h2>
        {rounds.length === 0 ? (
          <p className="text-muted">Chưa có lượt nào.</p>
        ) : (
          <ul className="space-y-2">
            {rounds.map((r) => (
              <li
                key={r.roundId}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-ink-soft p-3"
              >
                <span className="font-mono font-bold tracking-wider">{r.roundId}</span>
                <span className="text-sm text-muted">{GAME_LABEL[r.game]}</span>
                <span className="text-sm text-muted">
                  {r.playerCount}/5 · {r.status}
                  {!r.live && ' (cũ)'}
                </span>

                <span className="ml-auto flex gap-2">
                  <Link
                    to={`/lobby/${r.roundId}`}
                    className="rounded-lg border border-white/15 px-3 py-1 text-sm hover:bg-white/5"
                  >
                    Xem
                  </Link>
                  <button
                    onClick={() => act(() => api.startRound(r.roundId, token))}
                    disabled={busy || r.status !== 'lobby' || r.playerCount === 0}
                    className="rounded-lg bg-correct px-3 py-1 text-sm font-medium text-ink disabled:opacity-30"
                  >
                    Bắt đầu
                  </button>
                  <button
                    onClick={() => act(() => api.skipRound(r.roundId, token))}
                    disabled={busy || r.status === 'done'}
                    className="rounded-lg border border-white/15 px-3 py-1 text-sm disabled:opacity-30"
                  >
                    Bỏ qua
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </Shell>
  );
}
