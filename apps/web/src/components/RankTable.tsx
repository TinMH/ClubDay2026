import type { DashboardRow, GameKind } from '../lib/types';
import { formatSeconds } from '../lib/format';

const MEDALS = ['🥇', '🥈', '🥉'];

export function RankTable({ rows, game }: { rows: DashboardRow[]; game: GameKind }) {
  if (rows.length === 0) return <p className="text-muted">Chưa có ai tham gia lượt này.</p>;

  return (
    <ol className="space-y-2">
      {rows.map((r) => (
        <li
          key={r.playerId}
          className={`flex items-center gap-3 rounded-xl border p-3 ${
            r.rank === 1 ? 'border-brand/60 bg-brand/10' : 'border-white/10 bg-ink-soft'
          }`}
        >
          <span className="w-8 shrink-0 text-center text-lg tabular-nums">
            {MEDALS[r.rank - 1] ?? r.rank}
          </span>

          <span className="min-w-0 flex-1 truncate font-medium">{r.name}</span>

          <span className="shrink-0 text-right text-xs text-muted">
            {game === 'math' ? (
              <>
                {r.correct} đúng
                {r.wrong > 0 ? ` · ${r.wrong} sai` : ''}
              </>
            ) : (
              <>{r.solved ? 'đã giải' : 'chưa giải'}</>
            )}
            <br />
            {formatSeconds(r.msToFinish)}
          </span>

          <span className="w-14 shrink-0 text-right text-xl font-bold tabular-nums">{r.score}</span>
        </li>
      ))}
    </ol>
  );
}
