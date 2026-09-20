import { useEffect, useRef } from 'react';
import { Circle, Plus, Square, Triangle } from 'lucide-react';

export interface MemoryPadProps {
  /** Ô đang SÁNG lúc này (server phát lại chuỗi), `null` = không ô nào. */
  lit: number | null;
  /** Ô người chơi vừa chạm — tô sáng ngay, không chờ server. */
  pressed: number | null;
  disabled: boolean;
  onTap: (pad: number) => void;
}

/**
 * Mỗi ô một màu + một hình — GIỐNG HỆT bảng đáp án của Tính nhanh.
 *
 * Dùng lại đúng bốn cặp màu–hình đó không phải để tiết kiệm code: người chơi
 * game trước đã quen "tròn tím, tam giác xanh, vuông vàng, cộng hồng", nên sang
 * game này họ nhận ô bằng phản xạ. Hình vẽ cũng là thứ giúp người mù màu chơi
 * được — chuỗi cần nhớ không bao giờ chỉ nằm ở màu.
 *
 * Cố tình tránh xanh lá / đỏ: hai màu đó dành cho phản hồi đúng / sai.
 */
const PADS = [
  { bg: 'var(--color-secondary)', Shape: Circle, name: 'tròn tím' },
  { bg: 'var(--color-math)', Shape: Triangle, name: 'tam giác xanh' },
  { bg: 'var(--color-accent)', Shape: Square, name: 'vuông vàng' },
  { bg: 'var(--color-draw)', Shape: Plus, name: 'cộng hồng' },
] as const;

export const PAD_COUNT = PADS.length;

/**
 * Bàn 4 ô: server phát chuỗi bằng cách nháy sáng, người chơi lặp lại bằng cách chạm.
 *
 * Ô TẮT HẲN (mờ 25% + rút màu) khi chưa tới lượt bấm, chứ không chỉ mờ nhẹ:
 * bốn ô vốn là bốn khối neon, để chúng còn 45% màu thì lúc phát chuỗi cả bàn vẫn
 * rực và ô đang nháy không nổi lên được. Tối hết rồi mới bật một ô chính là cách
 * trò Simon gốc làm, và đó là lý do nó dễ nhìn.
 *
 * Vẫn phải THẤY bốn ô ở nguyên vị trí trong lúc xem — tắt hẳn khác với biến mất,
 * không thì mỗi lần đổi lượt người chơi lại phải tìm lại ô.
 */
export function MemoryPad({ lit, pressed, disabled, onTap }: MemoryPadProps) {
  /** Giữ `onTap` mới nhất mà không phải đăng ký lại listener mỗi lần render. */
  const onTapRef = useRef(onTap);
  onTapRef.current = onTap;

  // Phím 1–4 cho máy tính, giống ChoicePad.
  useEffect(() => {
    if (disabled) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const pad = Number(e.key) - 1;
      if (!Number.isInteger(pad) || pad < 0 || pad >= PAD_COUNT) return;
      e.preventDefault();
      onTapRef.current(pad);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [disabled]);

  return (
    <div className="grid grid-cols-2 gap-3">
      {PADS.map(({ bg, Shape, name }, i) => {
        const isLit = lit === i;
        const isPressed = pressed === i;
        const outline = Shape === Plus;
        /**
         * Màu đặt bằng INLINE STYLE, không phải class.
         *
         * `.btn:disabled` trong styles.css đặt `--btn-bg` về xám, và nó thắng mọi
         * class tiện ích (độ đặc hiệu cao hơn). Mà suốt lúc phát chuỗi thì cả bốn
         * ô đều `disabled` — nên ô ĐANG SÁNG cũng bị tô xám, và người chơi phải
         * nhớ vị trí ô xám thay vì nhớ màu. Inline style thắng mọi selector.
         *
         * Ba ô còn lại vẫn để xám: tối hết rồi bật một ô chính là cách trò Simon
         * làm cho dễ nhìn.
         */
        const litStyle = isLit || isPressed ? { background: bg, color: 'var(--color-ink)' } : undefined;
        return (
          <button
            key={i}
            type="button"
            onPointerDown={() => !disabled && onTapRef.current(i)}
            disabled={disabled}
            aria-label={`Ô ${i + 1}: ${name}`}
            style={litStyle}
            className={`btn btn-tile min-h-28 w-full transition-all duration-100 sm:min-h-32 ${
              isLit || isPressed
                ? 'scale-[1.04] brightness-150 ring-4 ring-fg ring-offset-4 ring-offset-ink'
                : ''
            } ${disabled && !isLit ? 'opacity-25 grayscale' : ''}`}
          >
            <Shape
              aria-hidden="true"
              className="h-12 w-12 sm:h-14 sm:w-14"
              fill={outline ? 'none' : 'currentColor'}
              strokeWidth={outline ? 4 : 2}
            />
            <span
              aria-hidden="true"
              className="absolute right-3 top-2 font-sans text-xs font-bold opacity-60"
            >
              {i + 1}
            </span>
          </button>
        );
      })}
    </div>
  );
}
