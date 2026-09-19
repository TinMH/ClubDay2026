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

  it('ghi mốc thời gian cho bảng hạng', () => {
    const { round, player } = setup();
    submitPick(round, player, 1, oddOf(round, player), T0 + STEP);
    expect(player.lastAnswerAt).toBe(T0 + STEP);
  });
});
