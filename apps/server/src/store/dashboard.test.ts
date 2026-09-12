import { beforeEach, describe, expect, it } from 'vitest';
import { dashboard } from './dashboard.js';
import { addPlayer, createRound, resetAll } from './store.js';
import type { Round } from './types.js';

/** Tạo lượt 3 người với điểm/thời điểm xong cho trước. */
function setup(): { round: Round; ids: string[] } {
  const round = createRound('math', 1_000);
  round.startedAt = 10_000;
  const ids = ['a', 'b', 'c'].map((n) => addPlayer(round, n.toUpperCase()).id);
  return { round, ids };
}

describe('dashboard', () => {
  beforeEach(() => resetAll());

  it('xếp theo điểm giảm dần', () => {
    const { round, ids } = setup();
    const [a, b, c] = ids;
    if (!a || !b || !c) throw new Error('thiếu id');

    const pa = round.players.get(a)!;
    const pb = round.players.get(b)!;
    const pc = round.players.get(c)!;

    pa.score = 3; pa.lastAnswerAt = 20_000;
    pb.score = 7; pb.lastAnswerAt = 25_000;
    pc.score = 1; pc.lastAnswerAt = 15_000;

    const rows = dashboard(round);
    expect(rows.map((r) => r.score)).toEqual([7, 3, 1]);
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3]);
  });

  it('bằng điểm thì ai XONG SỚM HƠN xếp trên', () => {
    const { round, ids } = setup();
    const [a, b, c] = ids;
    if (!a || !b || !c) throw new Error('thiếu id');

    const pa = round.players.get(a)!;
    const pb = round.players.get(b)!;
    const pc = round.players.get(c)!;

    pa.score = pb.score = pc.score = 5;
    pa.lastAnswerAt = 50_000; // chậm nhất
    pb.lastAnswerAt = 30_000; // nhanh nhất
    pc.lastAnswerAt = 40_000;

    const rows = dashboard(round);
    expect(rows.map((r) => r.name)).toEqual(['B', 'C', 'A']);
  });

  it('người chưa trả lời câu nào xếp cuối dù cùng điểm', () => {
    const { round, ids } = setup();
    const [a, b] = ids;
    if (!a || !b) throw new Error('thiếu id');

    const pa = round.players.get(a)!;
    const pb = round.players.get(b)!;
    pa.score = 5; pa.lastAnswerAt = 0; // chưa làm gì
    pb.score = 5; pb.lastAnswerAt = 99_000;

    const rows = dashboard(round);
    expect(rows[0]?.name).toBe('B');
    expect(rows[1]?.name).toBe('A');
  });

  it('A: msToFinish tính từ lúc bắt đầu lượt; null nếu chưa xong', () => {
    const { round, ids } = setup();
    const [a, b] = ids;
    if (!a || !b) throw new Error('thiếu id');

    round.players.get(a)!.lastAnswerAt = 25_000; // startedAt = 10_000
    round.players.get(b)!.lastAnswerAt = 0;

    const rows = dashboard(round);
    const rowA = rows.find((r) => r.name === 'A');
    const rowB = rows.find((r) => r.name === 'B');
    expect(rowA?.msToFinish).toBe(15_000);
    expect(rowB?.msToFinish).toBeNull(); // chưa xong → không bịa số
  });

  it('B: solvedAt được ưu tiên hơn lastAnswerAt', () => {
    const { round, ids } = setup();
    const [a] = ids;
    if (!a) throw new Error('thiếu id');

    const pa = round.players.get(a)!;
    pa.solved = true;
    pa.solvedAt = 12_000;
    pa.lastAnswerAt = 30_000;

    const rows = dashboard(round);
    expect(rows[0]?.msToFinish).toBe(2_000); // dùng solvedAt
    expect(rows[0]?.solved).toBe(true);
  });

  it('lượt chưa ai chơi thì trả mảng rỗng, không crash', () => {
    const round = createRound('math');
    expect(dashboard(round)).toEqual([]);
  });
});
