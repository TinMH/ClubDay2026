import { Check, Hourglass, LoaderCircle, Play, Wifi, WifiOff, type LucideIcon } from 'lucide-react';
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

/**
 * Ba trạng thái phải phân biệt được TỪ XA, ở màn hình BTC có hàng chục lượt xếp
 * chồng nhau. Nên mỗi trạng thái khác nhau ở BA thứ cùng lúc — màu, icon, và độ
 * đậm của nền — chứ không chỉ khác sắc tím/xám như trước:
 *   Đang chờ  → tím sáng, viền đặc, icon đồng hồ cát (cái DUY NHẤT bấm được)
 *   Đang chơi → vàng, khối đặc, icon play (đang chạy đồng hồ)
 *   Đã xong   → xám chìm, icon tick (chuyện đã rồi)
 */
const STATUS: Record<RoundStatus, { label: string; cls: string; icon: LucideIcon }> = {
  lobby: {
    label: 'Đang chờ',
    cls: 'border-secondary bg-secondary/25 text-secondary',
    icon: Hourglass,
  },
  playing: { label: 'Đang chơi', cls: 'border-accent bg-accent text-ink', icon: Play },
  done: { label: 'Đã xong', cls: 'border-line bg-surface-2 text-muted', icon: Check },
};

/** Trạng thái lượt, dịch sang tiếng Việt. */
export function StatusBadge({ status }: { status: RoundStatus }) {
  const { label, cls, icon: Icon } = STATUS[status];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border-2 px-2.5 py-0.5 text-xs font-bold ${cls}`}
    >
      <Icon
        aria-hidden="true"
        className={`h-3 w-3 shrink-0 ${status === 'playing' ? 'animate-throb' : ''}`}
        {...(status === 'playing' ? { fill: 'currentColor' } : {})}
      />
      {label}
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
