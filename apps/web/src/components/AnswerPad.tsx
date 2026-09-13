import { useEffect, useRef, useState, type FormEvent } from 'react';

export interface AnswerPadProps {
  onSubmit: (value: number) => void;
  disabled?: boolean;
  busy?: boolean;
  /** Đổi giá trị này để ép ô nhập xoá trắng và focus lại (ví dụ khi sang câu mới). */
  resetKey?: string | number;
}

/**
 * Ô nhập đáp án — tối ưu cho chơi tốc độ trên điện thoại.
 *
 * Ba chi tiết quyết định cảm giác chơi:
 *   1. Ô nhập tự xoá và focus lại ngay sau khi gửi → gõ câu kế không cần chạm lại.
 *   2. `inputMode="numeric"` → bàn phím số hiện thẳng trên điện thoại.
 *   3. Tắt autocomplete / autocorrect / spellcheck → bàn phím không gợi ý, không sửa số.
 */
export function AnswerPad({ onSubmit, disabled = false, busy = false, resetKey }: AnswerPadProps) {
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Sang câu mới: xoá trắng và focus lại để gõ tiếp ngay.
  useEffect(() => {
    setText('');
    if (!disabled) inputRef.current?.focus();
  }, [resetKey, disabled]);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (disabled || busy) return;

    const trimmed = text.trim();
    if (trimmed === '') return;

    const value = Number(trimmed);
    if (!Number.isFinite(value)) return;

    setText(''); // xoá ngay, không chờ server trả lời
    onSubmit(value);
  }

  return (
    <form onSubmit={submit} className="flex gap-2">
      <input
        ref={inputRef}
        value={text}
        onChange={(e) => setText(e.target.value.replace(/[^0-9]/g, ''))}
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="send"
        maxLength={6}
        disabled={disabled}
        placeholder="?"
        aria-label="Đáp án"
        className="min-w-0 flex-1 rounded-xl border-2 border-white/15 bg-ink-soft px-4 py-4 text-center text-3xl font-bold tabular-nums outline-none transition placeholder:text-muted/40 focus:border-brand disabled:opacity-40"
      />
      <button
        type="submit"
        disabled={disabled || busy || text.trim() === ''}
        className="shrink-0 rounded-xl bg-brand px-6 text-lg font-semibold transition hover:brightness-110 disabled:opacity-30"
      >
        Gửi
      </button>
    </form>
  );
}
