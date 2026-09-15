import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

/** Thời gian một thông báo nằm trên màn hình. Animation dùng đúng con số này. */
export const TOAST_MS = 1200;

export interface ToastItem<T> {
  /** Tăng mỗi lần `show` — hai thông báo giống hệt nhau vẫn là hai lần hiện riêng. */
  id: number;
  value: T;
}

/**
 * Thông báo tự tắt. `show` gọi liên tiếp thì cái mới thay cái cũ và đếm giờ lại
 * từ đầu — người chơi Tính nhanh bấm mỗi 1–2 giây, không được xếp hàng thông báo.
 */
export function useToast<T>(ms: number = TOAST_MS) {
  const [toast, setToast] = useState<ToastItem<T> | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), ms);
    return () => clearTimeout(t);
  }, [toast, ms]);

  const show = useCallback((value: T) => {
    seq.current += 1;
    setToast({ id: seq.current, value });
  }, []);

  return [toast, show] as const;
}

/**
 * Góc trên bên phải màn hình. Luôn có mặt (kể cả khi trống) để trình đọc màn hình
 * đọc được thông báo mới; `pointer-events-none` để không chặn ngón tay bấm đáp án.
 */
export function ToastRegion({ children }: { children: ReactNode }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed right-4 top-4 z-50 flex flex-col items-end sm:right-6 sm:top-6"
    >
      {children}
    </div>
  );
}

const TONE = {
  correct: 'bg-correct text-ink shadow-[0_4px_0_var(--color-correct-deep)]',
  wrong: 'bg-wrong text-ink shadow-[0_4px_0_#9f1239]',
} as const;

export function Toast({
  tone,
  icon,
  title,
  detail,
}: {
  tone: keyof typeof TONE;
  icon: ReactNode;
  title: string;
  detail?: string;
}) {
  return (
    <div
      className={`flex animate-toast items-center gap-2.5 rounded-2xl px-4 py-2.5 ${TONE[tone]}`}
      style={{ animationDuration: `${TOAST_MS}ms` }}
    >
      <span aria-hidden="true">{icon}</span>
      <span className="leading-tight">
        <span className="block font-display text-lg font-extrabold">{title}</span>
        {detail && <span className="block text-xs font-semibold opacity-80">{detail}</span>}
      </span>
    </div>
  );
}
