import { Link } from 'react-router-dom';
import { Eye, Play as PlayIcon, QrCode as QrIcon, SkipForward } from 'lucide-react';
import { GAME_THEME } from '../../lib/game-theme';
import { StatusBadge } from '../Chips';
import { GAME_LABEL, type RoundStatus, type RoundSummary } from '../../lib/types';

/**
 * Viền của MỘT DÒNG LƯỢT theo trạng thái.
 *
 * Danh sách này dài và mọi dòng trông như nhau, nên cái duy nhất BTC cần tìm —
 * lượt còn bấm BẮT ĐẦU được — phải nổi lên trước: chờ thì viền tím sáng, đang
 * chơi thì viền vàng, xong rồi thì chìm xuống nhường chỗ.
 */
const ROW: Record<RoundStatus, string> = {
  lobby: 'border-secondary',
  playing: 'border-accent',
  done: 'opacity-70',
};

export interface RoundRowProps {
  round: RoundSummary;
  busy: boolean;
  onStart: () => void;
  onSkip: () => void;
  onQr: () => void;
}

/** Một lượt trong danh sách "Lượt gần đây" ở màn hình BTC. */
export function RoundRow({ round: r, busy, onStart, onSkip, onQr }: RoundRowProps) {
  const { icon: Icon, tile } = GAME_THEME[r.game];

  return (
    <li
      className={`card-row flex flex-wrap items-center gap-3 p-4 ${ROW[r.status]} ${
        r.live ? '' : 'opacity-50'
      }`}
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
          {GAME_LABEL[r.game]} · {r.playerCount}/{r.maxPlayers} người
          {!r.live && ' · cũ'}
        </p>
      </div>

      <span className="ml-auto flex gap-2">
        {/* Chỉ lượt còn nhận người mới cần QR — lượt đã xong thì quét vào cũng vô ích. */}
        {r.status === 'lobby' && r.live && (
          <button onClick={onQr} aria-label={`Mã QR lượt ${r.roundId}`} className="btn btn-ghost btn-sm">
            <QrIcon aria-hidden="true" className="h-4 w-4" />
          </button>
        )}
        <Link to={`/lobby/${r.roundId}`} className="btn btn-ghost btn-sm">
          <Eye aria-hidden="true" className="h-4 w-4" />
          Xem
        </Link>
        <button
          onClick={onStart}
          disabled={busy || r.status !== 'lobby' || r.playerCount === 0}
          className="btn btn-correct btn-sm"
        >
          <PlayIcon aria-hidden="true" className="h-4 w-4" fill="currentColor" />
          Bắt đầu
        </button>
        <button onClick={onSkip} disabled={busy || r.status === 'done'} className="btn btn-ghost btn-sm">
          <SkipForward aria-hidden="true" className="h-4 w-4" />
          Bỏ qua
        </button>
      </span>
    </li>
  );
}
