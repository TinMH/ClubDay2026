import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import {
  ArrowRight,
  LoaderCircle,
  Lock,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  Users,
} from 'lucide-react';
import { api, ApiError, type OpenRounds } from '../lib/api';
import { saveSession } from '../lib/session';
import { GAME_THEME } from '../lib/game-theme';
import { DEFAULT_MAX_PLAYERS, DURATION_MS, GAME_KINDS, GAME_LABEL, type GameKind } from '../lib/types';
import { Shell } from '../components/Shell';
import { ClubLinks } from '../components/ClubLinks';
import { DscLogo } from '../components/Logo';

const MESSAGES: Record<string, string> = {
  ROUND_FULL: 'Lượt này đủ 5 người rồi — chờ lượt sau nhé.',
  ROUND_STARTED: 'Lượt này đã bắt đầu rồi — chờ lượt sau nhé.',
  NOT_FOUND: 'Không tìm thấy lượt này. Kiểm tra lại mã.',
  BAD_REQUEST: 'Tên không hợp lệ (1–20 ký tự).',
  GAME_CLOSED: 'BTC vừa đổi trò — chờ một chút rồi thử lại nhé.',
};

const GAMES: readonly GameKind[] = GAME_KINDS;

/**
 * Tình hình lượt của một game: "3/5 đang chờ · còn 2 người nữa".
 *
 * Nói cả số còn thiếu chứ không chỉ số hiện có: "3/5" là dữ liệu, "còn 2 người
 * nữa là bắt đầu" mới là thứ khiến người ta đứng lại chờ.
 *
 * `data === null` là chưa nạp xong — giữ chỗ bằng dòng rỗng để thẻ card không
 * bị giật chiều cao khi số về.
 */
function WaitingLine({ game, data }: { game: GameKind; data: OpenRounds | null }) {
  if (!data) return <p className="mt-2 h-5" aria-hidden="true" />;

  const room = data.open[game];
  const max = data.max[game];

  // Chưa có lượt nào → chưa có mã để hiện, và người chơi là người đầu tiên.
  if (!room) {
    return <p className="mt-2 h-5 text-xs text-muted">chưa có ai — bạn vào là người đầu tiên</p>;
  }

  const left = max - room.players;
  return (
    <p className="mt-2 flex min-h-5 flex-wrap items-center gap-x-1.5 text-xs font-semibold text-secondary">
      {/*
        MÃ LƯỢT, hiện ngay ở đây.
        BTC hô "lượt CP9ESB" hoặc chỉ vào mã trên màn hình máy họ; người chơi phải
        đối chiếu được mình sắp vào đúng lượt đó. Mã vốn đã có sẵn trong
        `/api/rounds/open`, chỉ là trước giờ không ai hiện ra.
      */}
      <span className="border-2 border-line bg-surface-2 px-1.5 font-mono font-black tracking-wider text-fg">
        {room.roundId}
      </span>
      {/*
        Lượt vừa tạo mà chưa ai vào thì nói lời MỜI, không đọc ra con số 0: "0/8
        đang chờ" trông như chỗ này vắng, còn "bạn vào là người đầu tiên" là lý do
        để bước tới.
      */}
      {room.players === 0 ? (
        <span className="font-normal text-muted">chưa có ai — bạn vào là người đầu tiên</span>
      ) : (
        <>
          <Users aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
          {room.players}/{max} đang chờ
          {left > 0 && <span className="font-normal text-muted">· còn {left} nữa</span>}
        </>
      )}
    </p>
  );
}

/**
 * Nhập tên và vào lượt.
 *   - `/`          → Cách A: tự vào lượt đang mở
 *   - `/r/<mã>`    → Cách B: vào đúng lượt của khu vực đó
 */
export function Home() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  /**
   * Trò BTC đang mở. `undefined` = chưa nạp xong, `null` = BTC đang tạm đóng.
   *
   * NGƯỜI CHƠI KHÔNG CHỌN TRÒ: mỗi thời điểm cả booth chơi đúng một trò, do BTC
   * quyết ở /admin. Màn hình này chỉ hiển thị lại quyết định đó.
   */
  const [activeGame, setActiveGame] = useState<GameKind | null | undefined>(undefined);
  /** Sức chứa mỗi trò, do BTC đặt trong .env — `null` = chưa nạp xong. */
  const [maxPlayers, setMaxPlayers] = useState<Record<GameKind, number> | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [waiting, setWaiting] = useState<OpenRounds | null>(null);
  const roundId = code?.toUpperCase();

  // Cách B: game do chính lượt trong URL quyết định.
  const closed = !roundId && activeGame === null;
  const ready = name.trim().length > 0 && !closed;

  /**
   * Cấu hình: trò BTC đang mở, và SỨC CHỨA TỪNG TRÒ.
   *
   * Chạy ở CẢ HAI cách vào. Trước đây nó nằm chung với vòng lấy số người chờ —
   * mà vòng đó bị tắt ở Cách B, nên vào bằng `/r/<mã>` thì sức chứa không bao
   * giờ được nạp và màn hình kẹt ở con số mặc định.
   */
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const cfg = await api.config();
        if (!alive) return;
        setActiveGame(cfg.activeGame);
        setMaxPlayers(cfg.maxPlayers);
      } catch {
        /* mất mạng một nhịp thì giữ số cũ — không xoá đi làm màn hình nhảy */
      }
    };
    void tick();
    const t = setInterval(() => void tick(), 3_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  /**
   * Số người đang chờ, cập nhật mỗi 2 giây.
   *
   * Đây là thứ giữ cho luồng người KHÔNG bị xẻ đôi: thấy "3/5 đang chờ" thì
   * người mới có lý do dồn vào lượt đó thay vì mở lượt thứ hai, nên đủ chỗ nhanh
   * hơn và booth ít thời gian chết. Cũng làm việc chờ có nghĩa nên ít ai bỏ đi.
   *
   * Không cần ở Cách B: game và lượt đã do URL quyết định.
   */
  useEffect(() => {
    if (roundId) return;
    let alive = true;
    const tick = async () => {
      try {
        const res = await api.openRounds();
        if (alive) setWaiting(res);
      } catch {
        /* giữ số cũ */
      }
    };
    void tick();
    const t = setInterval(() => void tick(), 2_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [roundId]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || !ready) return;
    setBusy(true);
    setError('');
    try {
      const res = await api.join(name.trim(), { ...(roundId ? { roundId } : {}) });
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
        <h1 className="mt-6 font-display text-6xl font-black leading-none tracking-tight">
          Club<span className="text-accent">Day</span>
        </h1>
        <p className="mt-3 flex items-center justify-center gap-1.5 text-muted">
          <Sparkles aria-hidden="true" className="h-4 w-4 shrink-0 text-secondary" />
          Mini game CLB · chơi theo lượt, xong là có bảng hạng ngay
        </p>
      </header>

      {/*
        DANH SÁCH, không phải bộ chọn: trò nào được chơi là do BTC bấm ở /admin.
        Vẫn hiện đủ các trò để người chơi biết booth có gì, nhưng phải NHÌN PHÁT
        RA NGAY đâu là trò đang chơi — nên trò đang mở được viền màu của chính
        nó + nhãn "ĐANG MỞ", còn trò chưa tới lượt bị rút hết màu (grayscale) và
        nói thẳng lý do. Mờ mà không giải thích là bẫy.
      */}
      <section aria-label="Các trò chơi">
        <p className="mb-2 text-sm font-semibold">
          {roundId ? 'Trò chơi của lượt này' : 'Trò đang chơi'}
        </p>
        <div className="grid grid-cols-2 gap-3">
          {GAMES.map((g, i) => {
            const { icon: Icon, tile, blurb, active, chip } = GAME_THEME[g];
            // Cách B: lượt trong URL tự quyết game, không có trò nào bị mờ.
            const open = !!roundId || g === activeGame;
            return (
              <div
                key={g}
                aria-current={open && !roundId ? 'true' : undefined}
                className={`card animate-rise relative block p-4 transition-all ${
                  open ? active : 'opacity-50 grayscale'
                } ${
                  /* Số game lẻ: thẻ cuối trải hết hàng, không để lại một ô trống
                     trông như thiếu mất một game. */
                  GAMES.length % 2 === 1 && i === GAMES.length - 1 ? 'col-span-2' : ''
                }`}
                style={{ animationDelay: `${80 + i * 70}ms` }}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className={`grid h-11 w-11 place-items-center rounded-xl ${tile}`}>
                    <Icon aria-hidden="true" className="h-6 w-6" />
                  </span>
                  {open && !roundId && (
                    <span
                      className={`border-2 px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide ${chip}`}
                    >
                      Đang mở
                    </span>
                  )}
                </div>
                <p className="mt-3 font-display text-lg font-black uppercase tracking-tight leading-tight">{GAME_LABEL[g]}</p>
                <p className="mt-1 text-xs text-muted">
                  {DURATION_MS[g] / 1000} giây · tối đa{' '}
                  {maxPlayers?.[g] ?? DEFAULT_MAX_PLAYERS} người
                </p>
                <p className="mt-0.5 text-xs text-muted">{blurb}</p>
                {!roundId &&
                  (open ? (
                    <WaitingLine game={g} data={waiting} />
                  ) : (
                    <p className="mt-2 flex h-5 items-center gap-1 text-xs text-muted">
                      <Lock aria-hidden="true" className="h-3 w-3 shrink-0" />
                      chưa tới lượt
                    </p>
                  ))}
              </div>
            );
          })}
        </div>
      </section>

      <form
        onSubmit={submit}
        className="card animate-rise space-y-4 p-5"
        style={{ animationDelay: '220ms' }}
      >
        {roundId && (
          <p className="rounded-xl border-2 border-secondary bg-secondary/10 px-3 py-2 text-center text-sm">
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

        {/* Nút mờ mà không nói vì sao là bẫy — nói thẳng vì sao chưa vào được. */}
        {closed && (
          <p className="text-center text-sm text-muted">BTC chưa mở trò nào — chờ một chút nhé.</p>
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

      <ClubLinks className="mt-auto" />

      <footer className="text-center">
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
