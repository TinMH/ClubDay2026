import { beforeEach, describe, expect, it } from 'vitest';
import { currentSequence, submitReplay } from './memory-session.js';
import { generateSequence } from './memory-gen.js';
import { addPlayer, createRound, resetAll } from '../store/store.js';
import { MEMORY_STEP_MS, MIN_REPLAY_GAP_MS, type Player, type Round } from '../store/types.js';

const T0 = 1_000_000;
const DURATION = 60_000;

function setup(length = 12): { round: Round; player: Player } {
  const round = createRound('memory', T0);
  const player = addPlayer(round, 'An', T0);
  round.sequence = generateSequence(42, length);
  round.startedAt = T0;
  round.endsAt = T0 + DURATION;
  round.status = 'playing';
  player.levelSentAt = T0;
  return { round, player };
}

/** Chuỗi đúng của cấp hiện tại — theo server, không theo client. */
const truth = (round: Round, level: number): number[] => (round.sequence ?? []).slice(0, level);

/** Thời điểm sớm nhất được phép nộp cấp `level` (đã xem hết chuỗi). */
const watched = (sentAt: number, level: number): number => sentAt + level * MEMORY_STEP_MS;

describe('memory-session — chấm điểm', () => {
  beforeEach(() => resetAll());

  it('lặp đúng → lên cấp, điểm = cấp vừa vượt', () => {
    const { round, player } = setup();
    const res = submitReplay(round, player, 1, truth(round, 1), watched(T0, 1));
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.correct).toBe(true);
      expect(res.level).toBe(2);
      expect(res.sequence).toEqual(truth(round, 2));
    }
    expect(player.score).toBe(1);
    expect(player.correct).toBe(1);
  });

  it('lặp sai → về cấp 1 nhưng GIỮ kỷ lục cũ', () => {
    const { round, player } = setup();
    let now = T0;
    // Vượt 3 cấp cho có kỷ lục.
    for (let level = 1; level <= 3; level++) {
      now = watched(player.levelSentAt, level);
      expect(submitReplay(round, player, level, truth(round, level), now).ok).toBe(true);
    }
    expect(player.score).toBe(3);
    expect(player.level).toBe(4);

    // Bấm sai một ô ở cấp 4.
    const wrong = truth(round, 4);
    wrong[0] = (wrong[0]! + 1) % 4;
    now = watched(player.levelSentAt, 4);
    const res = submitReplay(round, player, 4, wrong, now);

    expect(res.ok).toBe(true);
    if (res.ok) expect(res.correct).toBe(false);
    expect(player.level).toBe(1); // làm lại từ đầu
    expect(player.score).toBe(3); // kỷ lục còn nguyên
    expect(player.wrong).toBe(1);
  });

  it('cấp n là n ô ĐẦU của cấp n+1 — lên cấp chỉ nối thêm một ô', () => {
    const { round } = setup();
    expect(truth(round, 5).slice(0, 4)).toEqual(truth(round, 4));
  });
});

describe('memory-session — chống gian lận', () => {
  beforeEach(() => resetAll());

  it('hết giờ thì KHÔNG cộng điểm dù lặp đúng', () => {
    const { round, player } = setup();
    const res = submitReplay(round, player, 1, truth(round, 1), T0 + DURATION + 1);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('TIME_UP');
    expect(player.score).toBe(0);
    expect(player.finished).toBe(true);
  });

  it('nộp trước khi kịp XEM hết chuỗi → bị chặn và gắn cờ', () => {
    const { round, player } = setup();
    // Bot nhận chuỗi xong bấm lại ngay: đúng từng ô nhưng chưa hề xem.
    const res = submitReplay(round, player, 1, truth(round, 1), T0 + 50);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('TOO_FAST');
    expect(player.flagged).toBe(true);
    expect(player.score).toBe(0);
  });

  it('càng lên cấp cao thì thời gian xem bắt buộc càng dài', () => {
    const { round, player } = setup();
    player.level = 8;
    player.levelSentAt = T0;
    // Quãng đủ cho cấp 1 nhưng còn xa mới đủ cho cấp 8.
    const res = submitReplay(round, player, 8, truth(round, 8), watched(T0, 1));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('TOO_FAST');
  });

  it('hai lượt nộp sát nhau dưới 250ms → bị chặn', () => {
    const { round, player } = setup();
    const first = watched(T0, 1);
    expect(submitReplay(round, player, 1, truth(round, 1), first).ok).toBe(true);

    // Cấp 2 đã đủ thời gian xem, nhưng cách lượt trước chưa tới 250ms.
    player.levelSentAt = first - 2 * MEMORY_STEP_MS;
    const res = submitReplay(round, player, 2, truth(round, 2), first + MIN_REPLAY_GAP_MS - 1);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('TOO_FAST');
    expect(player.flagged).toBe(true);
  });

  it('không cho nhảy cấp', () => {
    const { round, player } = setup();
    const res = submitReplay(round, player, 9, truth(round, 9), watched(T0, 9));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('BAD_LEVEL');
    expect(player.score).toBe(0);
  });

  it('không cho nộp lại cấp vừa vượt', () => {
    const { round, player } = setup();
    const first = watched(T0, 1);
    expect(submitReplay(round, player, 1, truth(round, 1), first).ok).toBe(true);

    const again = submitReplay(round, player, 1, truth(round, 1), first + 5_000);
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.code).toBe('BAD_LEVEL');
    expect(player.score).toBe(1); // không cộng dồn
  });

  it('số ô bấm không khớp độ dài cấp → từ chối', () => {
    const { round, player } = setup();
    player.level = 3;
    player.levelSentAt = T0;
    const res = submitReplay(round, player, 3, truth(round, 2), watched(T0, 3));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('BAD_LEVEL');
  });

  it('chưa từng nhận chuỗi mà đã nộp → từ chối', () => {
    const { round, player } = setup();
    player.levelSentAt = 0;
    const res = submitReplay(round, player, 1, truth(round, 1), T0 + 10_000);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('BAD_LEVEL');
  });

  it('lượt chưa bắt đầu thì không chấm', () => {
    const { round, player } = setup();
    round.status = 'lobby';
    const res = submitReplay(round, player, 1, truth(round, 1), watched(T0, 1));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('NOT_PLAYING');
  });
});

describe('memory-session — chuỗi gửi ra client', () => {
  beforeEach(() => resetAll());

  it('chỉ gửi ĐÚNG cấp đang chơi, không lộ phần còn lại', () => {
    const { round, player } = setup();
    player.level = 3;
    const seq = currentSequence(round, player, T0 + 1_000);
    expect(seq).toEqual(truth(round, 3));
    expect(seq).toHaveLength(3); // không phải cả 12 ô
  });

  it('gửi chuỗi là đóng dấu thời gian — mốc của chốt chống bot', () => {
    const { round, player } = setup();
    player.levelSentAt = 0;
    currentSequence(round, player, T0 + 2_000);
    expect(player.levelSentAt).toBe(T0 + 2_000);
  });

  it('tải lại trang giữa chừng vẫn nhận đúng chuỗi của cấp mình', () => {
    const { round, player } = setup();
    expect(submitReplay(round, player, 1, truth(round, 1), watched(T0, 1)).ok).toBe(true);
    expect(currentSequence(round, player, watched(T0, 1) + 100)).toEqual(truth(round, 2));
  });
});
