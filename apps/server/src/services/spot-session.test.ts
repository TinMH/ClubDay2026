import { beforeEach, describe, expect, it } from 'vitest';
import { currentBoard, submitPick } from './spot-session.js';
import { addPlayer, createRound, resetAll } from '../store/store.js';
import { MIN_SPOT_GAP_MS, type Player, type Round } from '../store/types.js';

const T0 = 1_000_000;
const DURATION = 45_000;
/** Cách nhau đủ xa để không dính chốt chống spam. */
const STEP = 1_000;

function setup(): { round: Round; player: Player } {
  const round = createRound('spot', T0);
  const player = addPlayer(round, 'An', T0);
  round.startedAt = T0;
  round.endsAt = T0 + DURATION;
  round.status = 'playing';
  return { round, player };
}

/** Chữ ký của một bàn — đủ để biết hai bàn có giống hệt nhau không. */
const sig = (round: Round, player: Player): string => {
  const b = currentBoard(round, player);
  return `${b.size}:${b.oddIndex}:${b.base}:${b.odd}`;
};

/** Ô đúng của cấp người chơi đang ở — theo SERVER. */
const oddOf = (round: Round, player: Player): number => currentBoard(round, player).oddIndex;

/** Một ô bất kỳ KHÁC ô đúng. */
function wrongOf(round: Round, player: Player): number {
  const board = currentBoard(round, player);
  return (board.oddIndex + 1) % (board.size * board.size);
}

describe('spot-session — chấm điểm', () => {
  beforeEach(() => resetAll());

  it('chạm trúng → lên cấp, điểm = cấp vừa vượt', () => {
    const { round, player } = setup();
    const res = submitPick(round, player, 1, oddOf(round, player), T0 + STEP);

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.correct).toBe(true);
      expect(res.level).toBe(2);
      // Bàn trả về là bàn của cấp MỚI, để client vẽ tiếp không phải hỏi lại.
      expect(res.board).toEqual(currentBoard(round, player));
    }
    expect(player.score).toBe(1);
    expect(player.correct).toBe(1);
  });

  it('chạm trượt → về cấp 1 nhưng GIỮ kỷ lục cũ', () => {
    const { round, player } = setup();
    let now = T0;

    for (let level = 1; level <= 3; level++) {
      now += STEP;
      expect(submitPick(round, player, level, oddOf(round, player), now).ok).toBe(true);
    }
    expect(player.score).toBe(3);
    expect(player.level).toBe(4);

    now += STEP;
    const res = submitPick(round, player, 4, wrongOf(round, player), now);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.correct).toBe(false);

    expect(player.level).toBe(1); // làm lại từ đầu
    expect(player.score).toBe(3); // kỷ lục không bị lấy đi
    expect(player.wrong).toBe(1);
  });

  it('chấm theo bàn của SERVER, không theo thứ client gửi lên', () => {
    const { round, player } = setup();
    // Client "khai" một ô khác ô đúng → phải bị tính là sai, dù nó có gửi kèm gì.
    const res = submitPick(round, player, 1, wrongOf(round, player), T0 + STEP);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.correct).toBe(false);
    expect(player.score).toBe(0);
  });

  it('nhảy cấp hoặc nộp lại cấp cũ đều bị từ chối', () => {
    const { round, player } = setup();
    const ahead = submitPick(round, player, 5, 0, T0 + STEP);
    expect(ahead.ok).toBe(false);
    if (!ahead.ok) expect(ahead.code).toBe('BAD_LEVEL');

    expect(submitPick(round, player, 1, oddOf(round, player), T0 + STEP).ok).toBe(true);

    const stale = submitPick(round, player, 1, 0, T0 + 2 * STEP);
    expect(stale.ok).toBe(false);
    if (!stale.ok) expect(stale.code).toBe('BAD_LEVEL');
  });

  it('ô nằm ngoài lưới bị từ chối', () => {
    const { round, player } = setup();
    const board = currentBoard(round, player);
    const res = submitPick(round, player, 1, board.size * board.size, T0 + STEP);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('BAD_LEVEL');
  });

  it('chạm nhanh hơn ngưỡng người thật → bị gắn cờ và KHÔNG được tính', () => {
    const { round, player } = setup();
    expect(submitPick(round, player, 1, oddOf(round, player), T0 + STEP).ok).toBe(true);

    const res = submitPick(round, player, 2, oddOf(round, player), T0 + STEP + MIN_SPOT_GAP_MS - 1);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('TOO_FAST');
    expect(player.flagged).toBe(true);
    expect(player.score).toBe(1); // cú chạm đó không cộng gì
  });

  it('hết giờ thì KHÔNG cộng điểm dù chạm trúng, và người chơi bị đóng lại', () => {
    const { round, player } = setup();
    const res = submitPick(round, player, 1, oddOf(round, player), T0 + DURATION + 1);

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('TIME_UP');
    expect(player.score).toBe(0);
    expect(player.finished).toBe(true);
  });

  it('lượt chưa bắt đầu thì không chấm', () => {
    const { round, player } = setup();
    round.status = 'lobby';
    const res = submitPick(round, player, 1, 0, T0 + STEP);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('NOT_PLAYING');
  });

  it('trượt rồi về cấp 1 thì gặp bàn MỚI, không phải bàn cấp 1 lúc đầu', () => {
    // Nếu bàn chỉ phụ thuộc (mã lượt, cấp) thì ô lệch nằm nguyên chỗ cũ, và người
    // vừa trượt ở cấp cao bấm lại mấy cấp đầu từ trí nhớ chứ không phải nhìn.
    const { round, player } = setup();
    const first = sig(round, player);

    let now = T0 + STEP;
    expect(submitPick(round, player, 1, oddOf(round, player), now).ok).toBe(true);
    now += STEP;
    expect(submitPick(round, player, 2, wrongOf(round, player), now).ok).toBe(true);

    expect(player.level).toBe(1);
    expect(sig(round, player)).not.toBe(first);
  });

  it('mỗi lần qua cùng một cấp lại là một bàn khác', () => {
    const { round, player } = setup();
    const seen = new Set<string>();
    let now = T0;

    // Qua cấp 1 rồi trượt ở cấp 2 → lại về cấp 1. Lặp vài vòng.
    for (let i = 0; i < 4; i++) {
      seen.add(sig(round, player));
      now += STEP;
      submitPick(round, player, 1, oddOf(round, player), now);
      now += STEP;
      submitPick(round, player, 2, wrongOf(round, player), now);
    }
    expect(seen.size).toBe(4);
  });

  it('cùng lượt, cùng cấp, mỗi người một vị trí (liếc màn hình bên cạnh vô ích)', () => {
    // Đặt ở cấp 5 (lưới 4×4) chứ không phải cấp 1: lưới cấp 1 chỉ có 4 ô nên hai
    // người trùng vị trí là chuyện thường, test sẽ chập chờn chứ không sai thật.
    const { round, player } = setup();
    const players = [player, ...['Bình', 'Chi', 'Dũng', 'Em'].map((n) => addPlayer(round, n, T0))];
    for (const p of players) p.level = 5;

    const boards = players.map((p) => currentBoard(round, p));
    // Khó thì phải y như nhau — chỉ chỗ đặt mới được khác.
    expect(new Set(boards.map((b) => b.size)).size).toBe(1);
    expect(new Set(boards.map((b) => b.oddIndex)).size).toBeGreaterThan(1);
  });

  it('MÀU cũng đổi mỗi lần chơi lại — không học thuộc được tông màu', () => {
    // Vị trí đổi mà màu giữ nguyên thì chơi vài lượt là người ta quen mắt với
    // đúng một cặp màu, và "tìm ô lệch" biến thành "nhớ xem lệch trông thế nào".
    const { round, player } = setup();
    const bases = new Set<string>();
    let now = T0;

    for (let i = 0; i < 6; i++) {
      bases.add(currentBoard(round, player).base);
      now += STEP;
      submitPick(round, player, 1, oddOf(round, player), now);
      now += STEP;
      submitPick(round, player, 2, wrongOf(round, player), now); // trượt → về cấp 1
    }
    // Không đòi cả 6 khác nhau: tông màu bốc trong 360 độ nên trùng một lần là
    // chuyện bình thường, đòi tuyệt đối thì test chập chờn chứ không chặt hơn.
    expect(bases.size).toBeGreaterThanOrEqual(5);
  });

  it('hai người chơi cùng cấp cũng không cùng tông màu', () => {
    const { round, player } = setup();
    const others = ['Bình', 'Chi', 'Dũng', 'Em'].map((n) => addPlayer(round, n, T0));
    const bases = [player, ...others].map((p) => currentBoard(round, p).base);
    expect(new Set(bases).size).toBeGreaterThan(1);
  });

  it('tải lại trang giữa cấp KHÔNG đổi bàn — không có chuyện bốc lại đề', () => {
    const { round, player } = setup();
    expect(sig(round, player)).toBe(sig(round, player));
  });

  it('ghi mốc thời gian cho bảng hạng', () => {
    const { round, player } = setup();
    submitPick(round, player, 1, oddOf(round, player), T0 + STEP);
    expect(player.lastAnswerAt).toBe(T0 + STEP);
  });
});
