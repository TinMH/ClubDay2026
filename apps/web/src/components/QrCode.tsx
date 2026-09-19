import { useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { X } from 'lucide-react';

/**
 * Mã QR để người chơi quét bằng điện thoại.
 *
 * Luôn vẽ trên NỀN TRẮNG với ô vuông màu mực đậm, kể cả khi cả trang là nền
 * tối: camera điện thoại dò mã bằng tương phản sáng/tối, QR sáng trên nền tối
 * (đảo màu) nhiều máy đọc không ra — nhất là dưới ánh đèn hội trường.
 *
 * Mức sửa lỗi 'M': chịu được khoảng 15% bề mặt bị che (ngón tay, vệt loá màn
 * hình) mà vẫn đọc được, đổi lại mã hơi dày hơn 'L' — với URL ngắn như ở đây
 * thì không đáng kể.
 */
export function QrCode({
  value,
  size = 160,
  className = '',
}: {
  value: string;
  size?: number;
  className?: string;
}) {
  return (
    <div className={`rounded-2xl bg-white p-3 ${className}`}>
      <QRCodeSVG
        value={value}
        size={size}
        level="M"
        marginSize={0}
        bgColor="#ffffff"
        fgColor="#0f0f23"
        // Cho SVG co theo bề ngang màn hình thay vì tràn ra ngoài thẻ.
        className="h-auto w-full"
        style={{ maxWidth: size }}
        aria-hidden="true"
      />
    </div>
  );
}

/**
 * Mã QR phóng to hết màn hình — để BTC giơ laptop lên hoặc chiếu lên máy chiếu
 * cho cả hàng người cùng quét một lúc.
 *
 * Đóng bằng: nút X, phím Esc, hoặc bấm ra ngoài.
 */
export function QrOverlay({
  value,
  title,
  onClose,
}: {
  value: string;
  title: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Mã QR: ${title}`}
      onClick={onClose}
      className="fixed inset-0 z-50 grid place-items-center bg-ink/95 p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="card w-full max-w-sm p-5 text-center"
      >
        <QrCode value={value} size={320} className="mx-auto" />
        <p className="mt-4 break-all font-mono text-sm font-bold">{value}</p>
        <button onClick={onClose} autoFocus className="btn btn-ghost mt-4 w-full">
          <X aria-hidden="true" className="h-5 w-5" />
          Đóng
        </button>
      </div>
    </div>
  );
}
