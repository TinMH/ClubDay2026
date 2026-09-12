/**
 * `true` nếu lần gọi trước quá gần đây.
 *
 * Hàm thuần (nhận `now` từ ngoài) để test được mà không cần chờ thật.
 */
export function tooFast(lastAt: number, now: number, minGapMs: number): boolean {
  if (lastAt === 0) return false; // lần đầu
  return now - lastAt < minGapMs;
}
