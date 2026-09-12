import { useEffect, useState } from 'react';
import { serverNow } from './api';

/**
 * Đếm ngược tới `endsAt` — mốc thời gian do SERVER quyết định.
 *
 * Dùng `serverNow()` (đã bù lệch đồng hồ) chứ không dùng `Date.now()` trực tiếp,
 * nên sửa giờ trên máy người chơi không ảnh hưởng gì tới hiển thị.
 */
export function useCountdown(endsAt: number | null | undefined): number {
  const [remaining, setRemaining] = useState<number>(() => calc(endsAt));

  useEffect(() => {
    setRemaining(calc(endsAt));
    if (!endsAt) return;
    const t = setInterval(() => setRemaining(calc(endsAt)), 100);
    return () => clearInterval(t);
  }, [endsAt]);

  return remaining;
}

function calc(endsAt: number | null | undefined): number {
  if (!endsAt) return 0;
  return Math.max(0, endsAt - serverNow());
}
