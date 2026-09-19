import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SOLVE_BASE_SCORE,
  SUBMIT_GRACE_MS,
  commitDrawing,
  finalizeStragglers,
  previewFrame,
  type ClassifyFn,
} from './draw-session.js';
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

/** Nét khác hẳn — dùng để chứng minh nét trong request được ưu tiên hơn nét cũ. */
function zigzagStrokes(): Stroke[] {
  return [[[20, 20], [120, 200], [220, 20], [260, 260]]];
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
  round.draw.target = { id: targetId, labelVi: 'hình tròn' };
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

// ─────────────────────────────────────────────────────────────────────────────
// Điều quan trọng nhất của cả file: FRAME KHÔNG CHO ĐIỂM.
// Bộ test cũ chỉ có đường "gửi frame đúng → có điểm" nên đổi luật xong nó vẫn
// xanh — nó không hề kiểm tra điều vừa đổi. Đây là test phân biệt hai luật.
// ─────────────────────────────────────────────────────────────────────────────
describe('draw-session — frame chỉ là GỢI Ý, không phải kết quả', () => {
  beforeEach(() => resetAll());

  it('frame đọc ra hình đúng → KHÔNG cộng điểm, chỉ bật cờ gợi ý', async () => {
    const { round, player } = setup('circle');
    const res = await previewFrame(
      round,
      player,
      { seq: 1, strokes: circleStrokes() },
      T0 + 4_500,
      fakeClassifier(hit('circle')),
    );

    expect(res.ok).toBe(true);
    if (res.ok) expect(res.hint).toBe(true);

    expect(player.score).toBe(0);
    expect(player.draw.solved).toBe(false);
    expect(player.draw.committed).toBe(false);
    expect(player.finished).toBe(false);
    expect(player.draw.solvedAt).toBeNull();
  });

  it('trả top-3 kèm điểm tin cậy để client hiện "AI nghĩ: …"', async () => {
    const { round, player } = setup('circle');
    const res = await previewFrame(
      round,
      player,
      { seq: 1, strokes: circleStrokes() },
      T0 + 2_000,
      fakeClassifier(miss()),
    );

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.hint).toBe(false);
      expect(res.top[0]?.label).toBe('washing machine');
      expect(res.top).toHaveLength(2);
    }
  });

  it('ghi lại dự đoán gần nhất để hiện "AI nghĩ: …"', async () => {
    const { round, player } = setup('circle');
    await previewFrame(round, player, { seq: 1, strokes: circleStrokes() }, T0 + 2_000, fakeClassifier(hit('circle')));
    expect(player.draw.lastGuess).toEqual({ label: 'circle', score: 0.92 });
  });

  it('từ khoá lấy từ server: đổi round.draw.target là đổi cờ gợi ý', async () => {
    const { round, player } = setup('ladder');
    const res = await previewFrame(
      round,
      player,
      { seq: 1, strokes: circleStrokes() },
      T0 + 2_000,
      fakeClassifier(hit('circle')),
    );
    // Model nhận ra "circle" nhưng lượt này hỏi "ladder" → gợi ý phải là KHÔNG.
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.hint).toBe(false);
    expect(player.score).toBe(0);
  });
});

describe('draw-session — NỘP BÀI mới sinh ra điểm', () => {
  beforeEach(() => resetAll());

  it('nộp bài đúng → điểm = 150 − số giây đã dùng', async () => {
    const { round, player } = setup('circle');
    const res = await commitDrawing(
      round,
      player,
      { strokes: circleStrokes() },
      T0 + 4_500,
      fakeClassifier(hit('circle')),
    );

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.already).toBe(false);
      expect(res.reason).toBe('button');
      expect(res.matched).toBe(true);
      expect(res.seconds).toBe(5); // làm tròn LÊN
      expect(res.score).toBe(SOLVE_BASE_SCORE - 5);
    }
    expect(player.score).toBe(145);
    expect(player.draw.solved).toBe(true);
    expect(player.draw.committed).toBe(true);
    expect(player.draw.commitReason).toBe('button');
    expect(player.draw.committedAt).toBe(T0 + 4_500);
    expect(player.draw.solvedAt).toBe(T0 + 4_500);
    expect(player.finished).toBe(true);
  });

  it('nộp càng sớm điểm càng cao', async () => {
    const a = setup('circle');
    const fast = await commitDrawing(a.round, a.player, { strokes: circleStrokes() }, T0 + 1_000, fakeClassifier(hit('circle')));

    const b = setup('circle');
    const slow = await commitDrawing(b.round, b.player, { strokes: circleStrokes() }, T0 + 12_000, fakeClassifier(hit('circle')));

    expect(fast.ok && slow.ok).toBe(true);
    if (fast.ok && slow.ok) expect(fast.score).toBeGreaterThan(slow.score);
  });

  it('nộp bài sai → 0 điểm nhưng VẪN tính là đã nộp xong', async () => {
    const { round, player } = setup('circle');
    const res = await commitDrawing(
      round,
      player,
      { strokes: circleStrokes() },
      T0 + 2_000,
      fakeClassifier(miss()),
    );

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.matched).toBe(false);
      expect(res.score).toBe(0);
    }
    // Điểm 0 nhưng lượt của người này đã xong: canvas phải khoá, không cho nộp lại.
    expect(player.score).toBe(0);
    expect(player.draw.solved).toBe(false);
    expect(player.draw.committed).toBe(true);
    expect(player.finished).toBe(true);
  });

  it('nộp mà KHÔNG gửi nét → chấm bằng nét server đã nhận được', async () => {
    const { round, player } = setup('circle');
    // Người chơi đã vẽ và client đã gửi frame, nhưng rồi điện thoại treo tab —
    // không còn request nào tới nữa.
    await previewFrame(round, player, { seq: 1, strokes: circleStrokes() }, T0 + 2_000, fakeClassifier(miss()));

    const res = await commitDrawing(round, player, {}, T0 + 3_000, fakeClassifier(hit('circle')));
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.matched).toBe(true);
      expect(res.score).toBe(SOLVE_BASE_SCORE - 3);
    }
  });

  it('nét trong request được ưu tiên hơn nét cũ server đang giữ', async () => {
    const { round, player } = setup('circle');
    await previewFrame(round, player, { seq: 1, strokes: circleStrokes() }, T0 + 2_000, fakeClassifier(hit('circle')));

    // Người chơi xoá sạch rồi vẽ lại thành hình khác, và NỘP hình mới đó.
    const res = await commitDrawing(
      round,
      player,
      { strokes: zigzagStrokes() },
      T0 + 3_000,
      fakeClassifier(miss()),
    );
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.matched).toBe(false);
    expect(player.score).toBe(0);
  });

  it('nộp lần hai → trả lại kết quả cũ, KHÔNG chấm lại', async () => {
    const { round, player } = setup('circle');
    const counter = countingClassifier(hit('circle'));

    const first = await commitDrawing(round, player, { strokes: circleStrokes() }, T0 + 3_000, counter.fn);
    expect(first.ok).toBe(true);

    // Lần hai cố tình gửi nét khác và ở mốc thời gian muộn hơn: nếu server chấm
    // lại thì điểm sẽ tụt (hoặc bị đổi) — nó phải giữ nguyên.
    const second = await commitDrawing(round, player, { strokes: zigzagStrokes() }, T0 + 9_000, counter.fn);

    expect(second.ok).toBe(true);
    if (second.ok) {
      expect(second.already).toBe(true);
      expect(second.score).toBe(SOLVE_BASE_SCORE - 3);
      expect(second.seconds).toBe(3); // vẫn là mốc nộp đầu tiên
    }
    expect(player.score).toBe(SOLVE_BASE_SCORE - 3);
    expect(counter.calls()).toBe(1); // ⬅ không tốn thêm lần inference nào
  });

  it('bấm đúp cùng lúc → chấm đúng MỘT lần, hai bên nhận cùng kết quả', async () => {
    const { round, player } = setup('circle');
    const counter = countingClassifier(hit('circle'));

    const [a, b] = await Promise.all([
      commitDrawing(round, player, { strokes: circleStrokes() }, T0 + 4_000, counter.fn),
      commitDrawing(round, player, { strokes: circleStrokes() }, T0 + 4_000, counter.fn),
    ]);

    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) {
      expect(a.score).toBe(b.score);
      expect(a.already).toBe(false);
    }
    expect(counter.calls()).toBe(1); // ⬅ chỉ tốn đúng một lần inference
    expect(player.score).toBe(SOLVE_BASE_SCORE - 4);
  });

  it('cả 5 người nộp xong → lượt kết thúc luôn, không chờ hết 15 giây', async () => {
    const { round, player } = setup('circle');
    for (let i = 0; i < 4; i++) {
      const p = addPlayer(round, `P${i}`, T0);
      await commitDrawing(round, p, { strokes: circleStrokes() }, T0 + 3_000, fakeClassifier(hit('circle')));
    }
    // 4/5 người nộp rồi thì lượt PHẢI còn đang chơi — nếu nó kết thúc sớm ở đây
    // thì người thứ 5 bị tước mất lượt.
    expect(round.status).toBe('playing');
    expect(player.finished).toBe(false);

    await commitDrawing(round, player, { strokes: circleStrokes() }, T0 + 3_000, fakeClassifier(hit('circle')));
    expect(round.status).toBe('done');
  });
});

describe('draw-session — TỰ NỘP khi hết giờ', () => {
  beforeEach(() => resetAll());

  it('không bấm nút → server tự nộp bằng nét cuối, điểm tính theo mốc hết giờ', async () => {
    const { round, player } = setup('circle');
    await previewFrame(round, player, { seq: 1, strokes: circleStrokes() }, T0 + 14_000, fakeClassifier(hit('circle')));

    const graded = await finalizeStragglers(
      round,
      T0 + DURATION + 300,
      fakeClassifier(hit('circle')),
    );

    expect(graded).toBe(1);
    expect(player.draw.committed).toBe(true);
    expect(player.draw.commitReason).toBe('timeout');
    expect(player.draw.solved).toBe(true);
    // ceil(15.3 giây) = 16 → KẸP ở 15 giây của lượt.
    expect(player.score).toBe(SOLVE_BASE_SCORE - 15);
  });

  it('tự nộp KHÔNG chấm lại người đã bấm nút, và vẫn chấm người còn lại', async () => {
    const { round, player } = setup('circle');
    const other = addPlayer(round, 'Bình', T0);

    await commitDrawing(round, player, { strokes: circleStrokes() }, T0 + 4_000, fakeClassifier(hit('circle')));
    await previewFrame(round, other, { seq: 1, strokes: circleStrokes() }, T0 + 5_000, fakeClassifier(miss()));

    const graded = await finalizeStragglers(
      round,
      T0 + DURATION + 300,
      fakeClassifier(hit('circle')),
    );

    expect(graded).toBe(1); // chỉ Bình
    expect(player.score).toBe(SOLVE_BASE_SCORE - 4);
    expect(player.draw.commitReason).toBe('button'); // ⬅ không bị đổi thành 'timeout'
    expect(other.score).toBe(SOLVE_BASE_SCORE - 15);
    expect(other.draw.commitReason).toBe('timeout');
  });

  it('chưa gửi được nét nào → tự nộp 0 điểm, không tốn inference', async () => {
    const { round, player } = setup('circle');
    const counter = countingClassifier(hit('circle'));

    const graded = await finalizeStragglers(round, T0 + DURATION + 300, counter.fn);

    expect(graded).toBe(1);
    expect(player.draw.committed).toBe(true);
    expect(player.score).toBe(0);
    expect(player.draw.commitReason).toBe('timeout');
    expect(counter.calls()).toBe(0); // canvas trống thì không chạy model
  });

  it('tự nộp vẫn chấm được khi đã QUÁ quãng ân hạn', async () => {
    // Đường tự nộp chạy SAU khi quãng ân hạn hết (đó là mục đích của quãng đó):
    // hook hẹn giờ ở endsAt + 2500ms + 50ms, rồi mới gọi vào đây. Nếu chốt thời
    // gian vẫn áp cho nó thì không ai được tự nộp cả — đúng lỗi đã mắc một lần.
    const { round, player } = setup('circle');
    await previewFrame(round, player, { seq: 1, strokes: circleStrokes() }, T0 + 14_000, fakeClassifier(hit('circle')));

    const graded = await finalizeStragglers(
      round,
      T0 + DURATION + SUBMIT_GRACE_MS + 500,
      fakeClassifier(hit('circle')),
    );

    expect(graded).toBe(1);
    expect(player.draw.committed).toBe(true);
    expect(player.score).toBe(SOLVE_BASE_SCORE - 15);
  });

  it('người đã nộp gọi lại vẫn nhận kết quả cũ, không phải mã lỗi', async () => {
    const { round, player } = setup('circle');
    await commitDrawing(round, player, { strokes: circleStrokes() }, T0 + 2_000, fakeClassifier(hit('circle')));

    const again = await commitDrawing(round, player, {}, T0 + DURATION + 100, fakeClassifier(miss()));
    expect(again.ok).toBe(true);
    if (again.ok) {
      expect(again.already).toBe(true);
      expect(again.score).toBe(SOLVE_BASE_SCORE - 2);
      expect(again.matched).toBe(true);
    }
  });
});

describe('draw-session — CHỐNG GIAN LẬN', () => {
  beforeEach(() => resetAll());

  it('nộp QUÁ quãng ân hạn → từ chối, không cộng điểm', async () => {
    const { round, player } = setup('circle');
    const res = await commitDrawing(
      round,
      player,
      { strokes: circleStrokes() },
      T0 + DURATION + SUBMIT_GRACE_MS + 1,
      fakeClassifier(hit('circle')),
    );

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('TIME_UP');
    expect(player.score).toBe(0);
    expect(player.draw.committed).toBe(false);
  });

  it('nộp trong quãng ân hạn → nhận, nhưng số giây KẸP ở độ dài lượt', async () => {
    const { round, player } = setup('circle');
    const res = await commitDrawing(
      round,
      player,
      { strokes: circleStrokes() },
      T0 + DURATION + 500,
      fakeClassifier(hit('circle')),
    );

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.reason).toBe('timeout');
      expect(res.seconds).toBe(15); // ⬅ không phải 16, càng không phải 0
      expect(res.score).toBe(SOLVE_BASE_SCORE - 15);
    }
  });

  it('nộp muộn KHÔNG bao giờ được điểm cao hơn nộp sớm', async () => {
    const early = setup('circle');
    const e = await commitDrawing(early.round, early.player, { strokes: circleStrokes() }, T0 + 13_000, fakeClassifier(hit('circle')));

    const late = setup('circle');
    const l = await commitDrawing(late.round, late.player, { strokes: circleStrokes() }, T0 + DURATION + 900, fakeClassifier(hit('circle')));

    expect(e.ok && l.ok).toBe(true);
    if (e.ok && l.ok) expect(l.score).toBeLessThanOrEqual(e.score);
  });

  it('HẾT GIỜ: frame sau mốc kết thúc bị từ chối', async () => {
    const { round, player } = setup('circle');
    const res = await previewFrame(
      round,
      player,
      { seq: 1, strokes: circleStrokes() },
      T0 + DURATION + 1,
      fakeClassifier(hit('circle')),
    );

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('TIME_UP');
    expect(player.score).toBe(0);
    expect(player.finished).toBe(true);
  });

  it('gửi frame đúng tại mốc hết giờ thì VẪN được nhận', async () => {
    const { round, player } = setup('circle');
    const res = await previewFrame(
      round,
      player,
      { seq: 1, strokes: circleStrokes() },
      T0 + DURATION,
      fakeClassifier(hit('circle')),
    );
    expect(res.ok).toBe(true);
  });

  it('SPAM: 2 frame cách nhau 200ms → chặn, nhưng KHÔNG đánh cờ gian lận', async () => {
    const { round, player } = setup('circle');
    const first = await previewFrame(round, player, { seq: 1, strokes: circleStrokes() }, T0 + 1_000, fakeClassifier(miss()));
    expect(first.ok).toBe(true);

    const second = await previewFrame(round, player, { seq: 2, strokes: circleStrokes() }, T0 + 1_200, fakeClassifier(hit('circle')));
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.code).toBe('TOO_FAST');
    expect(player.score).toBe(0);
    // Frame không sinh điểm nên gửi dày chẳng lợi gì; mà khoảng cách đo theo giờ
    // NHẬN, nên wifi giật là hai frame đúng nhịp vẫn tới sát nhau. Đánh cờ ở đây
    // chỉ bêu người chơi thật vì mạng của họ chập.
    expect(player.flagged).toBe(false);
  });

  it('cách nhau đúng ngưỡng 1 giây thì hợp lệ', async () => {
    const { round, player } = setup('circle');
    await previewFrame(round, player, { seq: 1, strokes: circleStrokes() }, T0 + 1_000, fakeClassifier(miss()));
    const res = await previewFrame(
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
    await previewFrame(round, player, { seq: 1, strokes: circleStrokes() }, T0 + 1_000, fakeClassifier(miss()));
    const again = await previewFrame(round, player, { seq: 1, strokes: circleStrokes() }, T0 + 2_000, fakeClassifier(hit('circle')));

    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.code).toBe('SEQUENCE');
  });

  it('KHÔNG cho seq lùi về trước', async () => {
    const { round, player } = setup('circle');
    await previewFrame(round, player, { seq: 5, strokes: circleStrokes() }, T0 + 1_000, fakeClassifier(miss()));
    const back = await previewFrame(round, player, { seq: 2, strokes: circleStrokes() }, T0 + 2_000, fakeClassifier(hit('circle')));

    expect(back.ok).toBe(false);
    if (!back.ok) expect(back.code).toBe('SEQUENCE');
  });

  it('2 frame gửi CHỒNG NHAU → chỉ một cái được xử lý', async () => {
    const { round, player } = setup('circle');
    const counter = countingClassifier(hit('circle'));

    // Gọi cùng lúc, cùng mốc thời gian. Phần kiểm tra chạy đồng bộ trước `await
    // classify`, nên cái thứ hai phải bị chốt tần suất chặn.
    const [a, b] = await Promise.all([
      previewFrame(round, player, { seq: 1, strokes: circleStrokes() }, T0 + 2_000, counter.fn),
      previewFrame(round, player, { seq: 2, strokes: circleStrokes() }, T0 + 2_000, counter.fn),
    ]);

    expect(a.ok).toBe(true);
    expect(b.ok).toBe(false);
    if (!b.ok) expect(b.code).toBe('TOO_FAST');
    expect(counter.calls()).toBe(1); // ⬅ chỉ tốn đúng một lần inference
  });

  it('nộp xong rồi thì không gửi frame thêm được', async () => {
    const { round, player } = setup('circle');
    await commitDrawing(round, player, { strokes: circleStrokes() }, T0 + 2_000, fakeClassifier(hit('circle')));

    const again = await previewFrame(round, player, { seq: 2, strokes: circleStrokes() }, T0 + 4_000, fakeClassifier(hit('circle')));
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.code).toBe('NOT_PLAYING');
    expect(player.score).toBe(SOLVE_BASE_SCORE - 2); // ⬅ điểm không bị ghi đè
  });

  it('lượt chưa bắt đầu / đã kết thúc thì từ chối', async () => {
    const lobby = setup('circle');
    lobby.round.status = 'lobby';
    const r1 = await previewFrame(lobby.round, lobby.player, { seq: 1, strokes: circleStrokes() }, T0 + 1_000, fakeClassifier(hit('circle')));
    expect(r1.ok).toBe(false);
    if (!r1.ok) expect(r1.code).toBe('NOT_PLAYING');

    const done = setup('circle');
    done.round.status = 'done';
    const r2 = await previewFrame(done.round, done.player, { seq: 1, strokes: circleStrokes() }, T0 + 1_000, fakeClassifier(hit('circle')));
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.code).toBe('NOT_PLAYING');
  });

  it('lượt chưa có từ khoá thì từ chối, không crash', async () => {
    const { round, player } = setup('circle');
    round.draw.target = null;

    const p = await previewFrame(round, player, { seq: 1, strokes: circleStrokes() }, T0 + 1_000, fakeClassifier(hit('circle')));
    expect(p.ok).toBe(false);
    if (!p.ok) expect(p.code).toBe('NO_TARGET');

    const c = await commitDrawing(round, player, { strokes: circleStrokes() }, T0 + 1_000, fakeClassifier(hit('circle')));
    expect(c.ok).toBe(false);
    if (!c.ok) expect(c.code).toBe('NO_TARGET');
  });
});

describe('draw-session — canvas trống', () => {
  beforeEach(() => resetAll());

  it('không có nét nào → hint false, KHÔNG crash, KHÔNG tốn inference', async () => {
    const { round, player } = setup('circle');
    const counter = countingClassifier(hit('circle'));

    const res = await previewFrame(round, player, { seq: 1, strokes: [] }, T0 + 2_000, counter.fn);

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.hint).toBe(false);
      expect(res.top).toEqual([]);
    }
    expect(counter.calls()).toBe(0); // ⬅ không chạy model cho ảnh đen thui
    expect(player.score).toBe(0);
  });

  it('nét toàn toạ độ rác cũng tính là canvas trống', async () => {
    const { round, player } = setup('circle');
    const counter = countingClassifier(hit('circle'));

    const res = await previewFrame(
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
    await previewFrame(round, player, { seq: 1, strokes: circleStrokes() }, T0 + 1_000, fakeClassifier(miss()));
    expect(player.draw.lastGuess?.label).toBe('washing machine');

    await previewFrame(round, player, { seq: 2, strokes: [] }, T0 + 3_000, fakeClassifier(hit('circle')));
    expect(player.draw.lastGuess?.label).toBe('washing machine'); // ⬅ giữ nguyên
  });

  it('XOÁ HẾT rồi nộp → 0 điểm, không hồi sinh hình cũ', async () => {
    const { round, player } = setup('circle');
    await previewFrame(round, player, { seq: 1, strokes: circleStrokes() }, T0 + 1_000, fakeClassifier(hit('circle')));
    await previewFrame(round, player, { seq: 2, strokes: [] }, T0 + 3_000, fakeClassifier(hit('circle')));

    const res = await commitDrawing(round, player, {}, T0 + 3_500, fakeClassifier(hit('circle')));
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.matched).toBe(false);
    expect(player.score).toBe(0);
  });
});

describe('draw-session — gọi model thật', () => {
  beforeEach(() => resetAll());

  it('model lỗi thì ném ra ngoài để route trả 503, không âm thầm cho điểm', async () => {
    const { round, player } = setup('circle');
    const boom: ClassifyFn = () => Promise.reject(new Error('MODEL_NOT_LOADED'));

    await expect(
      commitDrawing(round, player, { strokes: circleStrokes() }, T0 + 2_000, boom),
    ).rejects.toThrow('MODEL_NOT_LOADED');

    expect(player.score).toBe(0);
    expect(player.draw.solved).toBe(false);
    expect(player.draw.committed).toBe(false); // ⬅ chưa chấm được thì vẫn còn quyền nộp
  });

  it('model được gọi đúng một lần cho mỗi frame hợp lệ', async () => {
    const { round, player } = setup('circle');
    const spy = vi.fn(fakeClassifier(miss()));

    await previewFrame(round, player, { seq: 1, strokes: circleStrokes() }, T0 + 1_000, spy);
    await previewFrame(round, player, { seq: 2, strokes: circleStrokes() }, T0 + 2_000, spy);

    expect(spy).toHaveBeenCalledTimes(2);
    // Ảnh đưa vào model phải là 784 byte (28×28).
    expect(spy.mock.calls[0]?.[0]).toBeInstanceOf(Uint8Array);
    expect((spy.mock.calls[0]?.[0] as Uint8Array).length).toBe(784);
  });
});
