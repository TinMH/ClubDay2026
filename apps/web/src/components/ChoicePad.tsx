import { useEffect, useRef, useState } from 'react';

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
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-3">
        {options.map((value, i) => {
          const isPicked = picked === value;
          return (
            <button
              key={`${value}-${i}`}
              type="button"
              onClick={() => pick(value)}
              disabled={locked}
              aria-label={`Đáp án ${i + 1}: ${value}`}
              className={`relative rounded-2xl border-2 py-6 text-3xl font-bold tabular-nums transition ${
                isPicked
                  ? 'border-brand bg-brand/20 text-paper'
                  : 'border-white/15 bg-ink-soft hover:border-white/30'
              } ${locked && !isPicked ? 'opacity-40' : ''} disabled:cursor-default`}
            >
              {value}
              <span className="absolute left-2 top-1 text-xs font-normal text-muted">
                {i + 1}
              </span>
            </button>
          );
        })}
      </div>
      <p className="text-center text-xs text-muted">Bấm nút, hoặc dùng phím 1–4</p>
    </div>
  );
}
