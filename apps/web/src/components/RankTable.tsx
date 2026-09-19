import { Crown, UserRound } from 'lucide-react';
import { SCORE_LABEL, type DashboardRow, type GameKind } from '../lib/types';
import { formatSeconds } from '../lib/format';
import { Avatar } from './Avatar';

/**
 * Bục nhận giải: cột giữa là hạng 1, trái hạng 2, phải hạng 3. Chỉ đổi VỊ TRÍ bằng
 * grid — thứ tự trong DOM vẫn là 1-2-3 cho trình đọc màn hình.
 */
const PODIUM = [
  { place: 'col-start-2', block: 'h-36 border-line bg-accent text-ink', badge: 'bg-ink text-accent' },
  { place: 'col-start-1', block: 'h-28 border-silver bg-surface', badge: 'bg-silver text-ink' },
  { place: 'col-start-3', block: 'h-24 border-bronze bg-surface', badge: 'bg-bronze text-ink' },
] as const;

/**
 * Hai dòng chi tiết dưới tên: kết quả + thời gian hoàn thành.
 *
 * Chỉ VẼ HÌNH có khái niệm "giải được / không" (`solved`); mọi trò còn lại đếm
 * đúng–sai. Điều kiện phải bắt theo trò đặc biệt chứ không liệt kê trò thường —
 * liệt kê thì thêm trò mới là nó lặng lẽ rơi vào nhánh `solved`, và cả bảng hạng
 * ghi "chưa giải" cho tất cả mọi người.
 */
function details(r: DashboardRow, game: GameKind): [string, string] {
  const what =
    game === 'draw'
      ? r.solved
        ? 'đã giải'
        : 'chưa giải'
      : `${r.correct} đúng${r.wrong > 0 ? ` · ${r.wrong} sai` : ''}`;
  return [what, formatSeconds(r.msToFinish)];
}

export function RankTable({ rows, game }: { rows: DashboardRow[]; game: GameKind }) {
  if (rows.length === 0) {
    return (
      <div className="card p-8 text-center">
        <UserRound aria-hidden="true" className="mx-auto h-10 w-10 text-muted" />
        <p className="mt-3 text-muted">Chưa có ai tham gia lượt này.</p>
      </div>
    );
  }

  const podium = rows.slice(0, 3);
  const rest = rows.slice(3);

  return (
    <div className="space-y-4">
      <ol className="grid grid-cols-3 items-end gap-2 pt-2 sm:gap-4">
        {podium.map((r, i) => {
          const p = PODIUM[i]!;
          const [what, time] = details(r, game);
          return (
            <li
              key={r.playerId}
              className={`${p.place} row-start-1 flex min-w-0 animate-rise flex-col items-center text-center`}
              style={{ animationDelay: `${i * 90}ms` }}
            >
              {i === 0 && (
                <Crown aria-hidden="true" className="mb-1 h-7 w-7 text-accent" fill="currentColor" />
              )}
              <Avatar name={r.name} seed={r.playerId} size={i === 0 ? 'lg' : 'md'} />
              <p className="mt-2 w-full truncate px-1 text-sm font-semibold">{r.name}</p>
              <p className="text-xs text-muted">{what}</p>
              <p className="text-xs tabular-nums text-muted">{time}</p>
              <div
                className={`mt-2 flex w-full flex-col items-center rounded-t-2xl border-2 border-b-0 pt-2 ${p.block}`}
              >
                <span
                  className={`grid h-7 w-7 place-items-center font-display text-sm font-black ${p.badge}`}
                >
                  {r.rank}
                </span>
                <span className="mt-1 font-display text-3xl font-black leading-none tabular-nums">
                  {r.score}
                </span>
                {/* Con số này mỗi game một nghĩa — không ghi rõ thì Tính nhanh trông
                    như bị lỗi: đúng 12 câu mà ô điểm ghi "3". */}
                <span className="mt-1 px-1 text-xs leading-tight text-muted">{SCORE_LABEL[game]}</span>
              </div>
            </li>
          );
        })}
      </ol>

      {rest.length > 0 && (
        <ol start={4} className="space-y-2">
          {rest.map((r, i) => {
            const [what, time] = details(r, game);
            return (
              <li
                key={r.playerId}
                className="card flex animate-rise items-center gap-3 p-3"
                style={{ animationDelay: `${270 + i * 70}ms` }}
              >
                <span className="w-6 shrink-0 text-center font-display text-lg font-black uppercase tabular-nums text-muted">
                  {r.rank}
                </span>
                <Avatar name={r.name} seed={r.playerId} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{r.name}</span>
                  <span className="block text-xs text-muted">
                    {what} · {time}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block font-display text-2xl font-black uppercase tracking-tight leading-none tabular-nums">
                    {r.score}
                  </span>
                  <span className="block text-xs text-muted">{SCORE_LABEL[game]}</span>
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
