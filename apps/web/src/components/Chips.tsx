import { LoaderCircle, Wifi, WifiOff } from 'lucide-react';
import { GAME_THEME } from '../lib/game-theme';
import { GAME_LABEL, type GameKind, type RoundStatus } from '../lib/types';

/** Nhãn tên game kèm icon + màu nhận diện. */
export function GameChip({ game }: { game: GameKind }) {
  const { icon: Icon, chip } = GAME_THEME[game];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border-2 px-3 py-1 text-sm font-bold ${chip}`}
    >
      <Icon aria-hidden="true" className="h-4 w-4" />
      {GAME_LABEL[game]}
    </span>
  );
}

/** Trạng thái kết nối realtime (SSE). */
export function ConnectionPill({
  connected,
  offlineLabel = 'Đang kết nối…',
}: {
  connected: boolean;
  offlineLabel?: string;
}) {
  return (
    <span
      role="status"
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
        connected ? 'bg-correct/15 text-correct' : 'bg-warn/15 text-warn'
      }`}
    >
      {connected ? (
        <Wifi aria-hidden="true" className="h-3.5 w-3.5" />
      ) : (
        <WifiOff aria-hidden="true" className="h-3.5 w-3.5 animate-pulse" />
      )}
      {connected ? 'Đã kết nối' : offlineLabel}
    </span>
  );
}

const STATUS: Record<RoundStatus, { label: string; cls: string }> = {
  lobby: { label: 'Đang chờ', cls: 'bg-secondary/15 text-secondary' },
  playing: { label: 'Đang chơi', cls: 'bg-accent/15 text-accent' },
  done: { label: 'Đã xong', cls: 'bg-surface-2 text-muted' },
};

/** Trạng thái lượt, dịch sang tiếng Việt. */
export function StatusBadge({ status }: { status: RoundStatus }) {
  const s = STATUS[status];
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold ${s.cls}`}>
      {s.label}
    </span>
  );
}

/** Ba chấm nhấp nháy cho trạng thái "đang chờ". */
export function WaitDots() {
  return (
    <span aria-hidden="true" className="inline-flex gap-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 animate-blink rounded-full bg-current"
          style={{ animationDelay: `${i * 160}ms` }}
        />
      ))}
    </span>
  );
}

/** Dòng "đang tải" có vòng xoay. */
export function Spinner({ label }: { label: string }) {
  return (
    <p role="status" className="flex items-center justify-center gap-2 py-10 text-muted">
      <LoaderCircle aria-hidden="true" className="h-5 w-5 animate-spin" />
      {label}
    </p>
  );
}
