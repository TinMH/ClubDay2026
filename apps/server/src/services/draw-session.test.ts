import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SOLVE_BASE_SCORE, submitFrame, type ClassifyFn } from './draw-session.js';
import { addPlayer, createRound, resetAll } from '../store/store.js';
import { MIN_FRAME_GAP_MS, type Player, type Prediction, type Round } from '../store/types.js';
import type { Stroke } from './raster.js';

const T0 = 1_000_000;
const DURATION = 15_000;

/** Hình tròn — fixture để test đường đi thật của rasterizer. */
function circleStrokes(cx = 128, cy = 128, r = 90, n = 24): Stroke[] {
  const pts: Array<readonly [number, number]> = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return [pts];
}

/** Bộ nhận diện giả — trả về đúng nhãn mình muốn, không nạp model thật. */
function fakeClassifier(top: Prediction[]): ClassifyFn {
  return () => Promise.resolve(top);
}

/** Bộ nhận diện giả có đếm số lần bị gọi. */
function countingClassifier(top: Prediction[]): { fn: ClassifyFn; calls: () => number } {
  let n = 0;
  return {
    fn: () => {
      n++;
      return Promise.resolve(top);
    },
    calls: () => n,
  };
}

function setup(targetId = 'circle'): { round: Round; player: Player } {
  const round = createRound('draw', T0);
  const player = addPlayer(round, 'An', T0);
  round.target = { id: targetId, labelVi: 'hình tròn' };
  round.startedAt = T0;
  round.endsAt = T0 + DURATION;
  round.status = 'playing';
  return { round, player };
}

const hit = (id: string): Prediction[] => [
  { label: id, score: 0.92 },
  { label: 'oval', score: 0.03 },
];
const miss = (): Prediction[] => [
  { label: 'washing machine', score: 0.7 },
  { label: 'ladder', score: 0.1 },
];

describe('draw-session — chấm điểm', () => {
  beforeEach(() => resetAll());

  it('nhận diện đúng → thắng, điểm = 150 − số giây đã dùng', async () => {
    const { round, player } = setup('circle');
    const res = await submitFrame(
      round,
      player,
      { seq: 1, strokes: circleStrokes() },
      T0 + 4_500,
      fakeClassifier(hit('circle')),
    );

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.matched).toBe(true);
      expect(res.solved).toBe(true);
      expect(res.seconds).toBe(5); // làm tròn LÊN
      expect(res.score).toBe(SOLVE_BASE_SCORE - 5);
    }
    expect(player.score).toBe(145);
    expect(player.solved).toBe(true);
    expect(player.solvedAt).toBe(T0 + 4_500);
    expect(player.finished).toBe(true);
  });

  it('vẽ nhanh hơn thì điểm cao hơn', async () => {
    const a = setup('circle');
    const fast = await submitFrame(a.round, a.player, { seq: 1, strokes: circleStrokes() }, T0 + 1_000, fakeClassifier(hit('circle')));

    const b = setup('circle');
    const slow = await submitFrame(b.round, b.player, { seq: 1, strokes: circleStrokes() }, T0 + 12_000, fakeClassifier(hit('circle')));

    expect(fast.ok && slow.ok).toBe(true);
    if (fast.ok && slow.ok) expect(fast.score).toBeGreaterThan(slow.score);
  });

  it('nhận diện sai → không thắng, không đổi điểm', async () => {
    const { round, player } = setup('circle');
    const res = await submitFrame(
      round,
      player,
      { seq: 1, strokes: circleStrokes() },
      T0 + 2_000,
      fakeClassifier(miss()),
    );

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.matched).toBe(false);
      expect(res.solved).toBe(false);
      expect(res.top[0]?.label).toBe('washing machine');
    }
    expect(player.score).toBe(0);
    expect(player.solved).toBe(false);
    expect(player.finished).toBe(false);
  });

  it('ghi lại dự đoán gần nhất để hiện "AI nghĩ: …"', async () => {
    const { round, player } = setup('circle');
    await submitFrame(round, player, { seq: 1, strokes: circleStrokes() }, T0 + 2_000, fakeClassifier(hit('circle')));
    expect(player.lastGuess).toEqual({ label: 'circle', score: 0.92 });
  });

  it('từ khoá lấy từ server: đổi round.target là đổi kết quả', async () => {
    const { round, player } = setup('ladder');
    const res = await submitFrame(
      round,
      player,
      { seq: 1, strokes: circleStrokes() },
      T0 + 2_000,
      fakeClassifier(hit('circle')),
    );
    // Model nhận ra "circle" nhưng lượt này hỏi "ladder" → không tính là thắng.
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.matched).toBe(false);
    expect(player.score).toBe(0);
  });

  it('cả 5 người cùng giải xong → lượt kết thúc luôn, không chờ hết 15 giây', async () => {
    const { round, player } = setup('circle');
    for (let i = 0; i < 4; i++) {
      const p = addPlayer(round, `P${i}`, T0);
      await submitFrame(round, p, { seq: 1, strokes: circleStrokes() }, T0 + 3_000, fakeClassifier(hit('circle')));
    }
    // 4/5 người xong thì lượt PHẢI còn đang chơi — nếu nó kết thúc sớm ở đây thì
    // người thứ 5 bị tước mất lượt.
    expect(round.status).toBe('playing');
    expect(player.finished).toBe(false);

    await submitFrame(round, player, { seq: 1, strokes: circleStrokes() }, T0 + 3_000, fakeClassifier(hit('circle')));
    expect(round.status).toBe('done');
  });
});

describe('draw-session — CHỐNG GIAN LẬN', () => {
  beforeEach(() => resetAll());

  it('HẾT GIỜ: frame sau mốc kết thúc bị từ chối', async () => {
    const { round, player } = setup('circle');
    const res = await submitFrame(
      round,
      player,
      { seq: 1, strokes: circleStrokes() },
      T0 + DURATION + 1,
      fakeClassifier(hit('circle')),
    );

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('TIME_UP');
    expect(player.score).toBe(0); // ⬅ không được cộng
    expect(player.finished).toBe(true);
  });

  it('gửi đúng tại mốc hết giờ thì VẪN được tính', async () => {
    const { round, player } = setup('circle');
    const res = await submitFrame(
      round,
      player,
      { seq: 1, strokes: circleStrokes() },
      T0 + DURATION,
      fakeClassifier(hit('circle')),
    );
    expect(res.ok).toBe(true);
    expect(player.score).toBeGreaterThan(0);
  });

  it('SPAM: 2 frame cách nhau 200ms → chặn và đánh cờ', async () => {
    const { round, player } = setup('circle');
    const first = await submitFrame(round, player, { seq: 1, strokes: circleStrokes() }, T0 + 1_000, fakeClassifier(miss()));
    expect(first.ok).toBe(true);

    const second = await submitFrame(round, player, { seq: 2, strokes: circleStrokes() }, T0 + 1_200, fakeClassifier(hit('circle')));
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.code).toBe('TOO_FAST');
    expect(player.flagged).toBe(true);
    expect(player.score).toBe(0); // ⬅ không lọt được điểm
  });

  it('cách nhau đúng ngưỡng 1 giây thì hợp lệ', async () => {
    const { round, player } = setup('circle');
    await submitFrame(round, player, { seq: 1, strokes: circleStrokes() }, T0 + 1_000, fakeClassifier(miss()));
    const res = await submitFrame(
      round,
      player,
      { seq: 2, strokes: circleStrokes() },
      T0 + 1_000 + MIN_FRAME_GAP_MS,
      fakeClassifier(hit('circle')),
    );
    expect(res.ok).toBe(true);
  });

  it('KHÔNG cho gửi lại cùng số seq', async () => {
    const { round, player } = setup('circle');
    await submitFrame(round, player, { seq: 1, strokes: circleStrokes() }, T0 + 1_000, fakeClassifier(miss()));
    const again = await submitFrame(round, player, { seq: 1, strokes: circleStrokes() }, T0 + 2_000, fakeClassifier(hit('circle')));

    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.code).toBe('SEQUENCE');
    expect(player.score).toBe(0);
  });

  it('KHÔNG cho seq lùi về trước', async () => {
    const { round, player } = setup('circle');
    await submitFrame(round, player, { seq: 5, strokes: circleStrokes() }, T0 + 1_000, fakeClassifier(miss()));
    const back = await submitFrame(round, player, { seq: 2, strokes: circleStrokes() }, T0 + 2_000, fakeClassifier(hit('circle')));

    expect(back.ok).toBe(false);
    if (!back.ok) expect(back.code).toBe('SEQUENCE');
  });

  it('2 frame gửi CHỒNG NHAU → chỉ một cái được chấm', async () => {
    const { round, player } = setup('circle');
    const counter = countingClassifier(hit('circle'));

    // Gọi cùng lúc, cùng mốc thời gian. Phần kiểm tra chạy đồng bộ trước `await
    // classify`, nên cái thứ hai phải bị chốt tần suất chặn.
    const [a, b] = await Promise.all([
      submitFrame(round, player, { seq: 1, strokes: circleStrokes() }, T0 + 2_000, counter.fn),
      submitFrame(round, player, { seq: 2, strokes: circleStrokes() }, T0 + 2_000, counter.fn),
    ]);

    expect(a.ok).toBe(true);
    expect(b.ok).toBe(false);
    if (!b.ok) expect(b.code).toBe('TOO_FAST');
    expect(counter.calls()).toBe(1); // ⬅ chỉ tốn đúng một lần inference
  });

  it('người đã thắng rồi thì không gửi frame thêm được', async () => {
    const { round, player } = setup('circle');
    await submitFrame(round, player, { seq: 1, strokes: circleStrokes() }, T0 + 2_000, fakeClassifier(hit('circle')));

    const again = await submitFrame(round, player, { seq: 2, strokes: circleStrokes() }, T0 + 4_000, fakeClassifier(hit('circle')));
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.code).toBe('NOT_PLAYING');
    expect(player.score).toBe(148); // ⬅ điểm không bị ghi đè thêm lần nữa
  });

  it('lượt chưa bắt đầu / đã kết thúc thì từ chối', async () => {
    const lobby = setup('circle');
    lobby.round.status = 'lobby';
    const r1 = await submitFrame(lobby.round, lobby.player, { seq: 1, strokes: circleStrokes() }, T0 + 1_000, fakeClassifier(hit('circle')));
    expect(r1.ok).toBe(false);
    if (!r1.ok) expect(r1.code).toBe('NOT_PLAYING');

    const done = setup('circle');
    done.round.status = 'done';
    const r2 = await submitFrame(done.round, done.player, { seq: 1, strokes: circleStrokes() }, T0 + 1_000, fakeClassifier(hit('circle')));
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.code).toBe('NOT_PLAYING');
  });

  it('lượt chưa có từ khoá thì từ chối, không crash', async () => {
    const { round, player } = setup('circle');
    round.target = null;
    const res = await submitFrame(round, player, { seq: 1, strokes: circleStrokes() }, T0 + 1_000, fakeClassifier(hit('circle')));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('NO_TARGET');
  });
});

describe('draw-session — canvas trống', () => {
  beforeEach(() => resetAll());

  it('không có nét nào → matched false, KHÔNG crash, KHÔNG tốn inference', async () => {
    const { round, player } = setup('circle');
    const counter = countingClassifier(hit('circle'));

    const res = await submitFrame(round, player, { seq: 1, strokes: [] }, T0 + 2_000, counter.fn);

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.matched).toBe(false);
      expect(res.top).toEqual([]);
    }
    expect(counter.calls()).toBe(0); // ⬅ không chạy model cho ảnh đen thui
    expect(player.score).toBe(0);
  });

  it('nét toàn toạ độ rác cũng tính là canvas trống', async () => {
    const { round, player } = setup('circle');
    const counter = countingClassifier(hit('circle'));

    const res = await submitFrame(
      round,
      player,
      { seq: 1, strokes: [[[Number.NaN, Number.NaN]]] },
      T0 + 2_000,
      counter.fn,
    );

    expect(res.ok).toBe(true);
    expect(counter.calls()).toBe(0);
  });

  it('canvas trống không xoá dự đoán trước đó', async () => {
    const { round, player } = setup('circle');
    await submitFrame(round, player, { seq: 1, strokes: circleStrokes() }, T0 + 1_000, fakeClassifier(miss()));
    expect(player.lastGuess?.label).toBe('washing machine');

    await submitFrame(round, player, { seq: 2, strokes: [] }, T0 + 3_000, fakeClassifier(hit('circle')));
    expect(player.lastGuess?.label).toBe('washing machine'); // ⬅ giữ nguyên
  });
});

describe('draw-session — gọi model thật', () => {
  beforeEach(() => resetAll());

  it('model lỗi thì ném ra ngoài để route trả 503, không âm thầm cho điểm', async () => {
    const { round, player } = setup('circle');
    const boom: ClassifyFn = () => Promise.reject(new Error('MODEL_NOT_LOADED'));

    await expect(
      submitFrame(round, player, { seq: 1, strokes: circleStrokes() }, T0 + 2_000, boom),
    ).rejects.toThrow('MODEL_NOT_LOADED');

    expect(player.score).toBe(0);
    expect(player.solved).toBe(false);
  });

  it('model được gọi đúng một lần cho mỗi frame hợp lệ', async () => {
    const { round, player } = setup('circle');
    const spy = vi.fn(fakeClassifier(miss()));

    await submitFrame(round, player, { seq: 1, strokes: circleStrokes() }, T0 + 1_000, spy);
    await submitFrame(round, player, { seq: 2, strokes: circleStrokes() }, T0 + 2_000, spy);

    expect(spy).toHaveBeenCalledTimes(2);
    // Ảnh đưa vào model phải là 784 byte (28×28).
    expect(spy.mock.calls[0]?.[0]).toBeInstanceOf(Uint8Array);
    expect((spy.mock.calls[0]?.[0] as Uint8Array).length).toBe(784);
  });
});
