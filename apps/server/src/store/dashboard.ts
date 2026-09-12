import type { Player, Round } from './types.js';

export interface DashboardRow {
  rank: number;
  playerId: string;
  name: string;
  score: number;
  correct: number;
  wrong: number;
  /** Thời gian (ms kể từ lúc bắt đầu lượt) để hoàn thành; null = chưa xong. */
  msToFinish: number | null;
  solved: boolean;
  flagged: boolean;
}

/**
 * Thời điểm người chơi hoàn thành lượt; +∞ = chưa xong (xếp cuối).
 * Dùng +∞ thay vì 0 để người chưa xong không nhảy lên đầu khi so sánh.
 */
function finishAt(p: Player): number {
  if (p.solvedAt !== null) return p.solvedAt;
  if (p.lastAnswerAt > 0) return p.lastAnswerAt;
  return Number.POSITIVE_INFINITY;
}

/**
 * Bảng hạng của đúng 5 người trong lượt — thay cho `ORDER BY` của bản có database.
 * Xếp theo: điểm cao hơn → xong sớm hơn → vào lượt sớm hơn.
 */
export function dashboard(round: Round): DashboardRow[] {
  const started = round.startedAt ?? round.createdAt;

  return [...round.players.values()]
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const fa = finishAt(a);
      const fb = finishAt(b);
      // So sánh có guard: tránh Infinity - Infinity = NaN làm hỏng sort.
      if (fa !== fb) return fa - fb;
      return a.joinedAt - b.joinedAt;
    })
    .map((p, i) => {
      const f = finishAt(p);
      return {
        rank: i + 1,
        playerId: p.id,
        name: p.name,
        score: p.score,
        correct: p.correct,
        wrong: p.wrong,
        msToFinish: Number.isFinite(f) ? f - started : null,
        solved: p.solved,
        flagged: p.flagged,
      };
    });
}
