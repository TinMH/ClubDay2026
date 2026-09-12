import { useCountdown } from '../lib/useCountdown';
import { formatClock } from '../lib/format';

/**
 * Đồng hồ đếm ngược tới mốc `endsAt` do server ấn định.
 * Nhận `total` (tổng thời lượng) để vẽ thanh tiến độ.
 */
export function Countdown({ endsAt, total }: { endsAt: number | null; total: number }) {
  const remaining = useCountdown(endsAt);
  const pct = total > 0 ? Math.max(0, Math.min(100, (remaining / total) * 100)) : 0;
  const urgent = remaining > 0 && remaining <= 10_000;

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-sm text-muted">Thời gian</span>
        <span className={`tabular-nums ${urgent ? 'text-2xl font-bold text-wrong' : 'text-xl font-semibold'}`}>
          {formatClock(remaining)}
        </span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
        <div
          className={`h-full rounded-full transition-[width] duration-100 ease-linear ${urgent ? 'bg-wrong' : 'bg-brand'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
