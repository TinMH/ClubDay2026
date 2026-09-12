/** Định dạng thời gian còn lại: 1:05 hoặc 0:09 */
export function formatClock(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Thời gian hoàn thành, ví dụ "12,3 giây" */
export function formatSeconds(ms: number | null): string {
  if (ms === null) return '—';
  return `${(ms / 1000).toFixed(1)}s`;
}
