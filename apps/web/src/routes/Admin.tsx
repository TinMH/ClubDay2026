import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Eye,
  House,
  KeyRound,
  Play as PlayIcon,
  Plus,
  QrCode,
  SkipForward,
  TriangleAlert,
} from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { loadAdminToken, saveAdminToken } from '../lib/session';
import { GAME_THEME } from '../lib/game-theme';
import { Shell } from '../components/Shell';
import { StatusBadge } from '../components/Chips';
import { DscLogo } from '../components/Logo';
import { DURATION_MS, GAME_LABEL, MAX_PLAYERS, type GameKind, type RoundSummary } from '../lib/types';

const GAMES: GameKind[] = ['math', 'draw'];

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
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <DscLogo size="sm" className="shrink-0" />
          <div>
            <h1 className="font-display text-2xl font-extrabold leading-none">Quản trị</h1>
            <p className="mt-1 text-sm text-muted">Tạo lượt, bắt đầu, in mã QR</p>
          </div>
        </div>
        <Link to="/" className="btn btn-ghost btn-sm shrink-0 whitespace-nowrap">
          <House aria-hidden="true" className="h-4 w-4" />
          Trang chủ
        </Link>
      </header>

      <div>
        <label htmlFor="admin-token" className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
          <KeyRound aria-hidden="true" className="h-4 w-4 text-secondary" />
          Mã quản trị
        </label>
        <input
          id="admin-token"
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="ADMIN_TOKEN"
          autoComplete="current-password"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'admin-error' : undefined}
          className="field"
        />
        {error && (
          <p id="admin-error" role="alert" className="mt-2 flex items-center gap-2 text-sm text-wrong">
            <TriangleAlert aria-hidden="true" className="h-4 w-4 shrink-0" />
            {error}
          </p>
        )}
      </div>

      <section className="grid gap-3 sm:grid-cols-2">
        {GAMES.map((g) => {
          const { icon: Icon, tile } = GAME_THEME[g];
          return (
            <button
              key={g}
              onClick={() => create(g)}
              disabled={busy || !token}
              className="btn btn-ghost w-full justify-start gap-3 p-4 text-left"
            >
              <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl ${tile}`}>
                <Icon aria-hidden="true" className="h-6 w-6" />
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-1 text-lg">
                  <Plus aria-hidden="true" className="h-5 w-5" />
                  Lượt {GAME_LABEL[g]}
                </span>
                <span className="block font-sans text-xs font-normal text-muted">
                  {DURATION_MS[g] / 1000} giây · tối đa {MAX_PLAYERS} người
                </span>
              </span>
            </button>
          );
        })}
      </section>

      {joinUrl && (
        <section className="card border-correct/50 bg-correct/10 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-correct">
            <QrCode aria-hidden="true" className="h-5 w-5 shrink-0" />
            Lượt đang mở — cho người chơi quét mã này:
          </p>
          <p className="mt-2 break-all font-mono text-lg font-bold">{joinUrl}</p>
          <p className="mt-1 text-sm text-muted">
            Hoặc dùng chung 1 mã cho cả sự kiện: <span className="font-mono">{origin}</span>
          </p>
        </section>
      )}

      <section>
        <h2 className="mb-3 font-display text-lg font-bold">Lượt gần đây</h2>
        {rounds.length === 0 ? (
          <p className="card p-6 text-center text-muted">Chưa có lượt nào.</p>
        ) : (
          <ul className="space-y-2">
            {rounds.map((r) => {
              const { icon: Icon, tile } = GAME_THEME[r.game];
              return (
                <li
                  key={r.roundId}
                  className={`card flex flex-wrap items-center gap-3 p-3 ${r.live ? '' : 'opacity-60'}`}
                >
                  <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${tile}`}>
                    <Icon aria-hidden="true" className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="flex items-center gap-2">
                      <span className="font-mono text-lg font-bold tracking-wider">{r.roundId}</span>
                      <StatusBadge status={r.status} />
                    </p>
                    <p className="text-xs text-muted">
                      {GAME_LABEL[r.game]} · {r.playerCount}/{MAX_PLAYERS} người
                      {!r.live && ' · cũ'}
                    </p>
                  </div>

                  <span className="ml-auto flex gap-2">
                    <Link to={`/lobby/${r.roundId}`} className="btn btn-ghost btn-sm">
                      <Eye aria-hidden="true" className="h-4 w-4" />
                      Xem
                    </Link>
                    <button
                      onClick={() => act(() => api.startRound(r.roundId, token))}
                      disabled={busy || r.status !== 'lobby' || r.playerCount === 0}
                      className="btn btn-correct btn-sm"
                    >
                      <PlayIcon aria-hidden="true" className="h-4 w-4" fill="currentColor" />
                      Bắt đầu
                    </button>
                    <button
                      onClick={() => act(() => api.skipRound(r.roundId, token))}
                      disabled={busy || r.status === 'done'}
                      className="btn btn-ghost btn-sm"
                    >
                      <SkipForward aria-hidden="true" className="h-4 w-4" />
                      Bỏ qua
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </Shell>
  );
}
