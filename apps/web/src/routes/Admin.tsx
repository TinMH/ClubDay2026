import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, House, KeyRound, TriangleAlert } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { loadAdminToken, saveAdminToken } from '../lib/session';
import { Shell } from '../components/Shell';
import { QrOverlay } from '../components/QrCode';
import { DscLogo } from '../components/Logo';
import { ActiveGamePanel } from '../components/admin/ActiveGamePanel';
import { GameTile } from '../components/admin/GameTile';
import { QrPanel } from '../components/admin/QrPanel';
import { RoundRow } from '../components/admin/RoundRow';
import {
  GAME_KINDS,
  DEFAULT_MAX_PLAYERS,
  MAX_PLAYERS_CAP,
  type GameKind,
  type RoundSummary,
} from '../lib/types';

const GAMES: readonly GameKind[] = GAME_KINDS;

/**
 * Số lượt hiện mỗi trang.
 *
 * Server trả tối đa 30 lượt gần nhất; đổ hết ra một danh sách thì cuối buổi
 * phải cuộn qua hai chục dòng đã xong mới thấy được lượt đang chờ. 8 dòng vừa
 * đủ một màn hình laptop, và lượt mới nhất luôn nằm trang đầu (danh sách đã
 * sắp theo thời gian tạo, mới nhất trước).
 */
const PAGE_SIZE = 8;

/**
 * Màn hình BTC: tạo lượt, xem ai đã vào, bắt đầu / bỏ qua, và in QR.
 * Bảo vệ bằng `x-admin-token` — đặt ADMIN_TOKEN trong .env trước sự kiện.
 *
 * File này giữ TRẠNG THÁI và các thao tác gọi server; phần vẽ nằm ở
 * `components/admin/`. Gộp cả hai vào một file thì mỗi lần sửa một khối lại
 * phải cuộn qua bốn khối không liên quan.
 */
export function Admin() {
  const [token, setToken] = useState(loadAdminToken);
  const [rounds, setRounds] = useState<RoundSummary[]>([]);
  /** Trò đang mở — chỉ MỘT trò tại một thời điểm, do màn hình này quyết định. */
  const [activeGame, setActiveGame] = useState<GameKind | null>(null);
  /** Sức chứa từng trò. Khởi đầu từ .env của server, BTC chỉnh ngay tại đây. */
  const [maxPlayers, setMaxPlayers] = useState<Record<GameKind, number> | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(0);
  /** URL đang được phóng to hết màn hình — `null` = không mở. */
  const [zoom, setZoom] = useState<{ value: string; title: string } | null>(null);
  const origin = window.location.origin;

  const refresh = useCallback(async () => {
    if (!token) {
      setRounds([]);
      return;
    }
    try {
      const res = await api.listRounds(token);
      setRounds(res.rounds);
      setActiveGame(res.activeGame);
      setMaxPlayers(res.maxPlayers);
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

  /**
   * Đổi sức chứa của một trò.
   *
   * Vẽ con số mới NGAY (không chờ vòng làm mới 2 giây): bấm + mà số đứng yên nửa
   * giây thì BTC bấm tiếp, và tăng hai bậc cho một cú bấm.
   */
  async function changeMaxPlayers(game: GameKind, value: number) {
    if (value < 1 || value > MAX_PLAYERS_CAP) return;
    setMaxPlayers((m) => (m ? { ...m, [game]: value } : m));
    try {
      const res = await api.setMaxPlayers(game, value, token);
      setMaxPlayers(res.maxPlayers);
    } catch {
      setError('Không đổi được số người.');
      void refresh(); // lấy lại con số thật của server
    }
  }

  /** Gọi một thao tác quản trị rồi nạp lại danh sách. */
  async function act(fn: () => Promise<unknown>, message = 'Thao tác thất bại.') {
    setBusy(true);
    try {
      await fn();
      await refresh();
    } catch {
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  const pageCount = Math.max(1, Math.ceil(rounds.length / PAGE_SIZE));
  const shown = useMemo(
    () => rounds.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE),
    [rounds, page],
  );

  /*
   * Danh sách tự làm mới mỗi 2 giây, nên KHÔNG được nhảy về trang 1 mỗi nhịp —
   * BTC đang xem trang 3 thì phải ở yên đó. Chỉ kéo lại khi trang hiện tại không
   * còn tồn tại (vừa bấm Xoá sạch, hoặc lượt cũ bị dọn).
   */
  useEffect(() => {
    if (page > pageCount - 1) setPage(pageCount - 1);
  }, [page, pageCount]);

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

      <ActiveGamePanel
        activeGame={activeGame}
        disabled={busy || !token}
        onClose={() => void act(() => api.setActiveGame(null, token))}
      />

      <section className="grid gap-3 sm:grid-cols-3">
        {GAMES.map((g) => (
          <GameTile
            key={g}
            game={g}
            active={g === activeGame}
            maxPlayers={maxPlayers?.[g] ?? DEFAULT_MAX_PLAYERS}
            disabled={busy || !token}
            onCreate={() => void act(() => api.createRound(g, token), 'Không tạo được lượt.')}
            onChangeMaxPlayers={(value) => void changeMaxPlayers(g, value)}
          />
        ))}
      </section>

      <QrPanel
        joinUrl={joinUrl}
        origin={origin}
        onZoom={(value, title) => setZoom({ value, title })}
      />

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-lg font-bold">
            Lượt gần đây
            {rounds.length > 0 && (
              <span className="ml-2 font-sans text-sm font-normal text-muted">
                {rounds.length} lượt
              </span>
            )}
          </h2>
          {pageCount > 1 && (
            <nav aria-label="Phân trang danh sách lượt" className="flex items-center gap-2">
              <button
                onClick={() => setPage((n) => n - 1)}
                disabled={page === 0}
                aria-label="Trang trước"
                className="btn btn-ghost btn-sm"
              >
                <ChevronLeft aria-hidden="true" className="h-4 w-4" />
              </button>
              <span role="status" className="text-sm font-semibold tabular-nums text-muted">
                Trang {page + 1}/{pageCount}
              </span>
              <button
                onClick={() => setPage((n) => n + 1)}
                disabled={page >= pageCount - 1}
                aria-label="Trang sau"
                className="btn btn-ghost btn-sm"
              >
                <ChevronRight aria-hidden="true" className="h-4 w-4" />
              </button>
            </nav>
          )}
        </div>
        {rounds.length === 0 ? (
          <p className="card p-6 text-center text-muted">Chưa có lượt nào.</p>
        ) : (
          <ul className="space-y-2">
            {shown.map((r) => (
              <RoundRow
                key={r.roundId}
                round={r}
                busy={busy}
                onStart={() => void act(() => api.startRound(r.roundId, token))}
                onSkip={() => void act(() => api.skipRound(r.roundId, token))}
                onQr={() =>
                  setZoom({ value: `${origin}/r/${r.roundId}`, title: `Lượt ${r.roundId}` })
                }
              />
            ))}
          </ul>
        )}
      </section>
      {zoom && (
        <QrOverlay value={zoom.value} title={zoom.title} onClose={() => setZoom(null)} />
      )}
    </Shell>
  );
}
