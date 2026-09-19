import { Trophy, TriangleAlert } from 'lucide-react';

/**
 * Hai khung trạng thái mà mọi màn hình game đều cần, vẽ y hệt nhau ở cả bốn
 * game. Tách ra để sửa một lần là cả bốn đổi theo.
 */

/** Lỗi ngoài dự tính — nói thẳng, đừng để người chơi ngồi nhìn màn hình đứng im. */
export function GameError({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="card flex items-center justify-center gap-2 border-wrong/60 bg-wrong/10 p-4 text-wrong"
    >
      <TriangleAlert aria-hidden="true" className="h-5 w-5 shrink-0" />
      {message}
    </p>
  );
}

/** Màn kết của một người chơi: hết giờ, hoặc hết đề. */
export function RoundOverCard({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="card p-8 text-center">
      <Trophy aria-hidden="true" className="mx-auto h-10 w-10 text-accent" />
      <p className="mt-3 font-display text-2xl font-extrabold">{title}</p>
      <p className="mt-1 text-sm text-muted">{detail}</p>
    </div>
  );
}
