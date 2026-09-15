import { useEffect, useRef, useState } from 'react';
import { Circle, Plus, Square, Triangle } from 'lucide-react';

export interface ChoicePadProps {
  /** Bốn lựa chọn do SERVER sinh và xáo trộn — client không biết con nào đúng. */
  options: number[];
  onPick: (value: number) => void;
  disabled?: boolean;
  busy?: boolean;
  /** Đổi giá trị này để bỏ trạng thái "vừa bấm" (ví dụ khi sang câu mới). */
  resetKey?: string | number;
}

/**
 * Mỗi ô một màu + một hình. Chơi tốc độ thì nhận ô bằng mắt nhanh hơn đọc số, và
 * hình giúp người mù màu phân biệt được — không dựa riêng vào màu. Cố tình tránh
 * xanh lá / đỏ: hai màu đó dành cho phản hồi đúng / sai.
 */
const TILES = [
  { color: '[--btn-bg:var(--color-secondary)] [--btn-edge:#6d28d9]', Shape: Circle },
  { color: '[--btn-bg:var(--color-math)] [--btn-edge:#0e7490]', Shape: Triangle },
  { color: '[--btn-bg:var(--color-accent)] [--btn-edge:var(--color-accent-deep)]', Shape: Square },
  { color: '[--btn-bg:var(--color-draw)] [--btn-edge:#be185d]', Shape: Plus },
] as const;

/**
 * Bốn nút đáp án — thay cho ô nhập số.
 *
 * Ba chi tiết quyết định cảm giác chơi:
 *   1. Bấm là tô sáng NGAY, không chờ server trả lời. Chờ 100ms cũng đủ để người
 *      chơi tưởng máy không nhận và bấm lại.
 *   2. Lưới 2×2 cỡ lớn — ngón tay trên điện thoại không nhắm được vào nút nhỏ.
 *   3. Phím 1–4 cho máy tính. Chơi tốc độ mà phải rê chuột thì thua người gõ phím.
 */
export function ChoicePad({
  options,
  onPick,
  disabled = false,
  busy = false,
  resetKey,
}: ChoicePadProps) {
  const [picked, setPicked] = useState<number | null>(null);
  /** Giữ `onPick` mới nhất mà không phải đăng ký lại listener mỗi lần render. */
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;

  // Sang câu mới: bỏ trạng thái đã bấm để bốn nút sáng lại như nhau.
  useEffect(() => {
    setPicked(null);
  }, [resetKey]);

  const locked = disabled || busy || picked !== null;

  function pick(value: number): void {
    if (disabled || busy || picked !== null) return;
    setPicked(value); // phản hồi trước, gửi server sau
    onPickRef.current(value);
  }

  useEffect(() => {
    if (locked) return;

    const onKey = (e: KeyboardEvent): void => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const index = Number(e.key) - 1;
      if (!Number.isInteger(index) || index < 0 || index >= options.length) return;

      const value = options[index];
      if (value === undefined) return;
      e.preventDefault();
      setPicked(value);
      onPickRef.current(value);
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [locked, options]);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        {options.map((value, i) => {
          const isPicked = picked === value;
          const { color, Shape } = TILES[i % TILES.length]!;
          const outline = Shape === Plus;
          return (
            <button
              key={`${value}-${i}`}
              type="button"
              onClick={() => pick(value)}
              disabled={locked}
              aria-pressed={isPicked}
              aria-label={`Đáp án ${i + 1}: ${value}`}
              className={`btn btn-tile min-h-24 w-full text-4xl tabular-nums sm:min-h-28 sm:text-5xl ${color} ${
                isPicked ? 'ring-4 ring-fg ring-offset-4 ring-offset-ink' : ''
              }`}
            >
              <Shape
                aria-hidden="true"
                className="absolute left-3 top-3 h-4 w-4"
                fill={outline ? 'none' : 'currentColor'}
                strokeWidth={outline ? 4 : 2}
              />
              <span aria-hidden="true" className="absolute right-3 top-2 font-sans text-xs font-bold opacity-60">
                {i + 1}
              </span>
              {value}
            </button>
          );
        })}
      </div>
      <p className="text-center text-xs text-muted">
        Bấm nút, hoặc dùng phím{' '}
        <kbd className="rounded-md bg-surface-2 px-1.5 py-0.5 font-sans font-semibold text-fg">1</kbd>–
        <kbd className="rounded-md bg-surface-2 px-1.5 py-0.5 font-sans font-semibold text-fg">4</kbd>
      </p>
    </div>
  );
}
