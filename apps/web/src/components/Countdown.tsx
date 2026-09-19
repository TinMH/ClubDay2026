import { Timer } from 'lucide-react';
import { useCountdown } from '../lib/useCountdown';
import { formatClock } from '../lib/format';

/**
 * Đồng hồ đếm ngược tới mốc `endsAt` do server ấn định.
 * Nhận `total` (tổng thời lượng) để vẽ thanh tiến độ.
 */
export function Countdown({ endsAt, total }: { endsAt: number | null; total: number }) {
  const remaining = useCountdown(endsAt);
  const ratio = total > 0 ? Math.max(0, Math.min(1, remaining / total)) : 0;
  const urgent = remaining > 0 && remaining <= 10_000;

  return (
    <div className={`card px-4 py-3 transition-colors ${urgent ? 'border-wrong' : ''}`}>
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-sm font-medium text-muted">
          <Timer aria-hidden="true" className={`h-5 w-5 ${urgent ? 'text-wrong' : 'text-secondary'}`} />
          Thời gian
        </span>
        <span
          role="timer"
          className={`inline-block text-3xl font-bold tabular-nums ${urgent ? 'animate-throb text-wrong' : 'text-fg'}`}
        >
          {formatClock(remaining)}
        </span>
      </div>
      <div className="mt-2.5 h-3 overflow-hidden rounded-full bg-surface-2">
        {/* scaleX thay vì width: chạy trên GPU, không bắt trình duyệt tính lại bố cục mỗi 100ms. */}
        <div
          className={`h-full w-full origin-left transition-transform duration-100 ease-linear ${
            urgent ? 'bg-wrong' : 'bg-linear-to-r from-primary to-math'
          }`}
          style={{ transform: `scaleX(${ratio})` }}
        />
      </div>
    </div>
  );
}
