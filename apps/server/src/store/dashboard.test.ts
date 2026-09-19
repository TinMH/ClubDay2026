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

    pa.score = 3; pa.lastActionAt = 20_000;
    pb.score = 7; pb.lastActionAt = 25_000;
    pc.score = 1; pc.lastActionAt = 15_000;

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
    pa.lastActionAt = 50_000; // chậm nhất
    pb.lastActionAt = 30_000; // nhanh nhất
    pc.lastActionAt = 40_000;

    const rows = dashboard(round);
    expect(rows.map((r) => r.name)).toEqual(['B', 'C', 'A']);
  });

  it('người chưa trả lời câu nào xếp cuối dù cùng điểm', () => {
    const { round, ids } = setup();
    const [a, b] = ids;
    if (!a || !b) throw new Error('thiếu id');

    const pa = round.players.get(a)!;
    const pb = round.players.get(b)!;
    pa.score = 5; pa.lastActionAt = 0; // chưa làm gì
    pb.score = 5; pb.lastActionAt = 99_000;

    const rows = dashboard(round);
    expect(rows[0]?.name).toBe('B');
    expect(rows[1]?.name).toBe('A');
  });

  it('A: msToFinish tính từ lúc bắt đầu lượt; null nếu chưa xong', () => {
    const { round, ids } = setup();
    const [a, b] = ids;
    if (!a || !b) throw new Error('thiếu id');

    round.players.get(a)!.lastActionAt = 25_000; // startedAt = 10_000
    round.players.get(b)!.lastActionAt = 0;

    const rows = dashboard(round);
    const rowA = rows.find((r) => r.name === 'A');
    const rowB = rows.find((r) => r.name === 'B');
    expect(rowA?.msToFinish).toBe(15_000);
    expect(rowB?.msToFinish).toBeNull(); // chưa xong → không bịa số
  });

  it('B: solvedAt được ưu tiên hơn lastActionAt', () => {
    const { round, ids } = setup();
    const [a] = ids;
    if (!a) throw new Error('thiếu id');

    const pa = round.players.get(a)!;
    pa.draw.solved = true;
    pa.draw.solvedAt = 12_000;
    pa.lastActionAt = 30_000;

    const rows = dashboard(round);
    expect(rows[0]?.msToFinish).toBe(2_000); // dùng solvedAt
    expect(rows[0]?.solved).toBe(true);
  });

  it('Tính nhanh: bằng CHUỖI thì ai ĐÚNG NHIỀU HƠN xếp trên, không phải ai xong sớm', () => {
    // Điểm của Tính nhanh là chuỗi dài nhất nên bằng điểm là chuyện thường. Nếu
    // rơi xuống so thời gian thì người trả lời ít câu hơn lại xếp trên — ngược
    // hẳn với điều ai cũng nghĩ là công bằng.
    const { round, ids } = setup(); // lượt 'math'
    const [a, b] = ids;
    if (!a || !b) throw new Error('thiếu id');

    const pa = round.players.get(a)!;
    const pb = round.players.get(b)!;

    pa.score = pb.score = 5; // cùng chuỗi dài nhất
    pa.correct = 9;
    pa.lastActionAt = 50_000; // nhiều câu đúng nhưng "xong" muộn nhất
    pb.correct = 4;
    pb.lastActionAt = 30_000; // ít câu đúng hơn, xong sớm hơn

    const rows = dashboard(round);
    // setup() tạo 3 người; C không được cấu hình nên đứng cuối. Điều cần khẳng
    // định là THỨ TỰ giữa A và B.
    expect(rows.slice(0, 2).map((r) => r.name)).toEqual(['A', 'B']); // ⬅ A thắng nhờ 9 > 4
  });

  it('Vẽ hình: bằng điểm vẫn xếp theo ai giải SỚM HƠN, không dính luật của Tính nhanh', () => {
    // Luật tie-break theo số câu đúng là của RIÊNG Tính nhanh. Nếu nó rò sang
    // game Vẽ thì thứ tự bảng hạng của Track B đổi mà không ai ngờ.
    const round = createRound('draw', 1_000);
    round.startedAt = 10_000;
    const a = addPlayer(round, 'A').id;
    const b = addPlayer(round, 'B').id;

    const pa = round.players.get(a)!;
    const pb = round.players.get(b)!;

    pa.score = pb.score = 140;
    pa.correct = 99; // rác với game Vẽ — không được ảnh hưởng gì
    pa.draw.solved = true;
    pa.draw.solvedAt = 20_000;
    pb.correct = 0;
    pb.draw.solved = true;
    pb.draw.solvedAt = 14_000; // giải sớm hơn

    const rows = dashboard(round);
    expect(rows.map((r) => r.name)).toEqual(['B', 'A']);
  });

  it('lượt chưa ai chơi thì trả mảng rỗng, không crash', () => {
    const round = createRound('math');
    expect(dashboard(round)).toEqual([]);
  });
});
