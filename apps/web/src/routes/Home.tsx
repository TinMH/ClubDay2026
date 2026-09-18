import { useState, type FormEvent } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { ArrowRight, LoaderCircle, ShieldCheck, Sparkles, TriangleAlert } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { saveSession } from '../lib/session';
import { GAME_THEME } from '../lib/game-theme';
import { DURATION_MS, GAME_LABEL, MAX_PLAYERS, type GameKind } from '../lib/types';
import { Shell } from '../components/Shell';
import { DscLogo } from '../components/Logo';

const MESSAGES: Record<string, string> = {
  ROUND_FULL: 'Lượt này đủ 5 người rồi — chờ lượt sau nhé.',
  ROUND_STARTED: 'Lượt này đã bắt đầu rồi — chờ lượt sau nhé.',
  NOT_FOUND: 'Không tìm thấy lượt này. Kiểm tra lại mã.',
  BAD_REQUEST: 'Tên không hợp lệ (1–20 ký tự).',
};

const GAMES: GameKind[] = ['math', 'draw'];

/**
 * Nhập tên và vào lượt.
 *   - `/`          → Cách A: tự vào lượt đang mở
 *   - `/r/<mã>`    → Cách B: vào đúng lượt của khu vực đó
 */
export function Home() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [game, setGame] = useState<GameKind | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const roundId = code?.toUpperCase();

  // Cách B: game do chính lượt trong URL quyết định, người chơi không chọn.
  const needsGame = !roundId;
  const ready = name.trim().length > 0 && (!needsGame || game !== null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || !ready) return;
    setBusy(true);
    setError('');
    try {
      const res = await api.join(name.trim(), {
        ...(roundId ? { roundId } : {}),
        ...(game ? { game } : {}),
      });
      saveSession({ playerId: res.playerId, roundId: res.roundId, game: res.game, name: name.trim() });
      navigate(`/lobby/${res.roundId}`);
    } catch (err) {
      const key = err instanceof ApiError ? err.code : 'UNKNOWN';
      setError(MESSAGES[key] ?? 'Có lỗi xảy ra, thử lại nhé.');
      setBusy(false);
    }
  }

  return (
    <Shell>
      <header className="animate-rise pt-4 text-center">
        <DscLogo />
        <h1 className="mt-6 font-display text-6xl font-extrabold leading-none tracking-tight">
          Club<span className="text-accent">Day</span>
        </h1>
        <p className="mt-3 flex items-center justify-center gap-1.5 text-muted">
          <Sparkles aria-hidden="true" className="h-4 w-4 shrink-0 text-secondary" />
          Mini game CLB · tối đa {MAX_PLAYERS} người một lượt
        </p>
      </header>

      {/*
        Radio THẬT, không phải <div onClick>: bàn phím đi được bằng mũi trái/phải,
        trình đọc màn hình đọc ra "1 trong 2", và trạng thái đã chọn không phải tự
        dựng lại bằng aria. Input ẩn bằng `sr-only` nhưng vẫn nhận focus —
        `peer-focus-visible` vẽ viền lên thẻ card.

        Ở Cách B (`/r/<mã>`) thì game đã do lượt quyết định nên chỉ hiện thông tin,
        không cho chọn — chọn ở đó là lừa người chơi, vì server bỏ qua.
      */}
      <fieldset className="border-0 p-0">
        <legend className="mb-2 text-sm font-semibold">
          {needsGame ? 'Chọn trò chơi' : 'Trò chơi của lượt này'}
        </legend>
        <div className="grid grid-cols-2 gap-3">
          {GAMES.map((g, i) => {
            const { icon: Icon, tile, blurb } = GAME_THEME[g];
            const selected = game === g;
            return (
              <label
                key={g}
                className={`card animate-rise relative block cursor-pointer p-4 transition-all ${
                  selected ? 'ring-2 ring-accent' : ''
                } ${needsGame ? '' : 'cursor-default opacity-70'}`}
                style={{ animationDelay: `${80 + i * 70}ms` }}
              >
                <input
                  type="radio"
                  name="game"
                  value={g}
                  checked={selected}
                  disabled={!needsGame}
                  onChange={() => setGame(g)}
                  className="peer sr-only"
                />
                <span
                  aria-hidden="true"
                  className="absolute inset-0 rounded-[inherit] peer-focus-visible:ring-2 peer-focus-visible:ring-fg"
                />
                <span className={`grid h-11 w-11 place-items-center rounded-xl ${tile}`}>
                  <Icon aria-hidden="true" className="h-6 w-6" />
                </span>
                <p className="mt-3 font-display text-lg font-bold leading-tight">{GAME_LABEL[g]}</p>
                <p className="mt-1 text-xs text-muted">
                  {DURATION_MS[g] / 1000} giây · {blurb}
                </p>
              </label>
            );
          })}
        </div>
      </fieldset>

      <form
        onSubmit={submit}
        className="card animate-rise space-y-4 p-5"
        style={{ animationDelay: '220ms' }}
      >
        {roundId && (
          <p className="rounded-xl border-2 border-secondary/40 bg-secondary/10 px-3 py-2 text-center text-sm">
            Bạn đang vào lượt{' '}
            <span className="font-mono font-bold tracking-wider text-secondary">{roundId}</span>
          </p>
        )}

        <div>
          <label htmlFor="player-name" className="mb-2 block text-sm font-semibold">
            Tên của bạn
          </label>
          <input
            id="player-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={20}
            autoFocus
            autoComplete="nickname"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'join-error' : undefined}
            className="field"
          />
        </div>

        <button type="submit" disabled={busy || !ready} className="btn btn-accent btn-lg w-full">
          {busy ? (
            <>
              <LoaderCircle aria-hidden="true" className="h-6 w-6 animate-spin" />
              Đang vào…
            </>
          ) : (
            <>
              Vào chơi
              <ArrowRight aria-hidden="true" className="h-6 w-6" />
            </>
          )}
        </button>

        {/* Nút mờ mà không nói vì sao là bẫy — nói thẳng còn thiếu gì. */}
        {needsGame && game === null && name.trim().length > 0 && (
          <p className="text-center text-sm text-muted">Chọn một trò chơi ở trên để vào chơi</p>
        )}

        {error && (
          <p
            id="join-error"
            role="alert"
            className="flex items-center justify-center gap-2 text-sm font-medium text-wrong"
          >
            <TriangleAlert aria-hidden="true" className="h-4 w-4 shrink-0" />
            {error}
          </p>
        )}
      </form>

      <footer className="mt-auto text-center">
        <Link
          to="/admin"
          className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-sm text-muted transition-colors hover:text-fg"
        >
          <ShieldCheck aria-hidden="true" className="h-4 w-4" />
          Trang quản trị
        </Link>
      </footer>
    </Shell>
  );
}
