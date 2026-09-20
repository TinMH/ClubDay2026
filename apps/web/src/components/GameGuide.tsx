import { useEffect, useState } from 'react';
import { CircleQuestionMark, Lightbulb, Trophy, X } from 'lucide-react';
import { GAME_GUIDE } from '../lib/game-guide';
import { GAME_THEME } from '../lib/game-theme';
import { DURATION_MS, GAME_LABEL, type GameKind } from '../lib/types';

/**
 * Hướng dẫn chơi, hai kiểu hiện tuỳ chỗ đứng của người chơi:
 *
 *   PHÒNG CHỜ  → `GameGuideCard`: bày sẵn ra, không phải bấm gì.
 *                Lúc đứng đợi BTC là khoảng thời gian chết duy nhất trong cả
 *                lượt; giấu luật sau một cái nút ở đây là bỏ phí đúng lúc người
 *                ta rảnh nhất.
 *   ĐANG CHƠI  → `GameGuideButton`: một nút nhỏ, mở ra lớp phủ.
 *                Đồng hồ đang chạy nên luật KHÔNG được chiếm chỗ của bàn chơi.
 */

/** Nội dung luật, dùng chung cho cả thẻ ở phòng chờ lẫn lớp phủ trong lượt. */
function GuideBody({ game }: { game: GameKind }) {
  const { steps, scoring, tip } = GAME_GUIDE[game];

  return (
    <div className="space-y-3">
      <ol className="space-y-2">
        {steps.map((step, i) => (
          <li key={i} className="flex gap-2.5 text-sm">
            <span
              aria-hidden="true"
              className={`grid h-6 w-6 shrink-0 place-items-center font-display text-xs font-black ${GAME_THEME[game].tile}`}
            >
              {i + 1}
            </span>
            <span className="min-w-0 pt-0.5">{step}</span>
          </li>
        ))}
      </ol>

      <p className="flex items-start gap-2 border-2 border-accent bg-accent px-2.5 py-1.5 text-sm font-bold text-ink">
        <Trophy aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
        {scoring}
      </p>

      {/* Icon SVG chứ không phải emoji — emoji mỗi hệ máy vẽ một kiểu, và repo
          này đã chọn lucide cho toàn bộ icon. */}
      {tip && (
        <p className="flex items-start gap-1.5 text-xs text-muted">
          <Lightbulb aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {tip}
        </p>
      )}
    </div>
  );
}

/** Thẻ luật bày sẵn — dùng ở phòng chờ. */
export function GameGuideCard({ game }: { game: GameKind }) {
  return (
    <section className="card p-5" aria-labelledby="guide-heading">
      <h2 id="guide-heading" className="mb-3 font-display text-lg font-black uppercase tracking-tight">
        Cách chơi {GAME_LABEL[game]}
        <span className="ml-2 font-sans text-sm font-normal text-muted">
          {DURATION_MS[game] / 1000} giây
        </span>
      </h2>
      <GuideBody game={game} />
    </section>
  );
}

/** Nút mở luật — dùng trong lượt, khi đồng hồ đang chạy. */
export function GameGuideButton({ game }: { game: GameKind }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label={`Cách chơi ${GAME_LABEL[game]}`}
        className="btn btn-ghost btn-sm shrink-0 px-2"
      >
        <CircleQuestionMark aria-hidden="true" className="h-5 w-5" />
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Cách chơi ${GAME_LABEL[game]}`}
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-ink/95 p-4"
        >
          <div onClick={(e) => e.stopPropagation()} className="card w-full max-w-sm p-5">
            <h2 className="mb-3 font-display text-lg font-black uppercase tracking-tight">
              Cách chơi {GAME_LABEL[game]}
            </h2>
            <GuideBody game={game} />

            {/*
              Nói thẳng là đồng hồ KHÔNG dừng. Người chơi mở bảng luật giữa lượt
              rất dễ tưởng nó tạm dừng giúp mình, rồi đóng ra thì mất mươi giây mà
              không hiểu vì sao.
            */}
            <p className="mt-3 text-xs font-bold text-warn">Đồng hồ vẫn đang chạy.</p>

            <button onClick={() => setOpen(false)} autoFocus className="btn btn-accent mt-4 w-full">
              <X aria-hidden="true" className="h-5 w-5" />
              Chơi tiếp
            </button>
          </div>
        </div>
      )}
    </>
  );
}
