import { Maximize2, QrCode as QrIcon } from 'lucide-react';
import { QrCode } from '../QrCode';

export interface QrPanelProps {
  /** Link của lượt đang mở, `null` khi chưa có lượt nào. */
  joinUrl: string | null;
  /** Link chung cho cả sự kiện. */
  origin: string;
  onZoom: (value: string, title: string) => void;
}

/** Một mã QR kèm link và nút phóng to. */
function QrBlock({
  label,
  value,
  onZoom,
}: {
  label: string;
  value: string;
  onZoom: () => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <QrCode value={value} size={132} className="shrink-0" />
      <div className="min-w-0">
        <p className="text-xs font-bold uppercase tracking-wide text-muted">{label}</p>
        <p className="break-all font-mono text-sm font-bold">{value}</p>
        <button onClick={onZoom} className="btn btn-ghost btn-sm mt-2">
          <Maximize2 aria-hidden="true" className="h-4 w-4" />
          Phóng to
        </button>
      </div>
    </div>
  );
}

/**
 * Mã QR, không chỉ đường link: ở booth người chơi cầm điện thoại, gõ lại một URL
 * dài là rào cản thật.
 *
 * Hiện luôn hai mã — mã của LƯỢT đang mở (vào thẳng lượt đó) và mã CHUNG cho cả
 * sự kiện (in một lần, dán lên bàn, luôn đưa vào trò BTC đang mở).
 */
export function QrPanel({ joinUrl, origin, onZoom }: QrPanelProps) {
  return (
    <section className={`card p-4 ${joinUrl ? 'border-correct bg-correct/10' : ''}`}>
      <p className={`flex items-center gap-2 text-sm font-semibold ${joinUrl ? 'text-correct' : ''}`}>
        <QrIcon aria-hidden="true" className="h-5 w-5 shrink-0" />
        {joinUrl ? 'Lượt đang mở — cho người chơi quét mã này:' : 'Mã QR vào chơi'}
      </p>

      {/*
        Một mã thì trải hết bề ngang thẻ (để trống nửa bên phải trông như hỏng);
        hai mã thì chia đôi từ `sm` trở lên.
      */}
      <div className={`mt-3 grid gap-4 ${joinUrl ? 'sm:grid-cols-2' : ''}`}>
        {joinUrl && (
          <QrBlock
            label="Lượt này"
            value={joinUrl}
            onZoom={() => onZoom(joinUrl, 'Lượt đang mở')}
          />
        )}
        <QrBlock label="Cả sự kiện" value={origin} onZoom={() => onZoom(origin, 'Cả sự kiện')} />
      </div>
    </section>
  );
}
